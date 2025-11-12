# backend/utils/llm_provider.py

import time
import requests
from typing import List, Optional
from openai import AzureOpenAI
from config import get_model_config, GEMINI_API_BASE_URL


class LLMProvider:
    """Unified LLM client for Azure OpenAI and Gemini with clean concurrency and minimal logs."""

    _gemini_session = None  # shared session for connection reuse

    def __init__(
        self,
        provider: str,
        api_key: str,
        model: str,
        temperature: float = 0.5,
        max_tokens: int = 8192,
        top_p: float = 1.0,
        stop_sequences: Optional[List[str]] = None,
        azure_endpoint: Optional[str] = None,
        azure_deployment: Optional[str] = None,
        max_retries: int = 3,
        backoff_base: float = 2.0,
    ):
        self.provider = provider.lower()
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_p = top_p
        self.stop_sequences = stop_sequences or []
        self.max_retries = max_retries
        self.backoff_base = backoff_base

        if self.provider == "openai":
            if not all([azure_endpoint, azure_deployment, api_key]):
                raise ValueError("Azure OpenAI requires API key, endpoint, and deployment name.")
            self.client = AzureOpenAI(
                api_key=self.api_key,
                api_version="2024-02-01",
                azure_endpoint=azure_endpoint,
            )
            self.deployment = azure_deployment
            print(f"[INIT] Azure OpenAI ready (deployment: {self.deployment})")

        elif self.provider == "gemini":
            if not api_key:
                raise ValueError("Gemini requires an API key.")
            if not LLMProvider._gemini_session:
                LLMProvider._gemini_session = requests.Session()
            print(f"[INIT] Gemini ready (model: {self.model})")

        else:
            raise ValueError(f"Unsupported LLM provider: '{self.provider}'")

    # ---------------------- Public API ----------------------
    def generate(self, prompt: str) -> str:
        if self.provider == "openai":
            return self._generate_azure_openai(prompt)
        if self.provider == "gemini":
            return self._generate_gemini(prompt)
        raise NotImplementedError(f"Provider '{self.provider}' not implemented.")

    # ---------------------- OpenAI ----------------------
    def _generate_azure_openai(self, prompt: str) -> str:
        for attempt in range(1, self.max_retries + 1):
            try:
                response = self.client.chat.completions.create(
                    model=self.deployment,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=self.temperature,
                    max_tokens=self.max_tokens,
                    top_p=self.top_p,
                    stop=self.stop_sequences or None,
                )
                content = response.choices[0].message.content
                print(f"[OpenAI] Response OK ({len(content)} chars)")
                return content
            except Exception as e:
                print(f"[OpenAI] Attempt {attempt} failed: {e}")
                if attempt < self.max_retries:
                    time.sleep(self.backoff_base ** attempt)
                    continue
                # Fallback to gpt-4o if available
                if "gpt-4o" not in self.deployment:
                    try:
                        print("[OpenAI] Switching to fallback model: gpt-4o")
                        self.deployment = "gpt-4o"
                        response = self.client.chat.completions.create(
                            model=self.deployment,
                            messages=[{"role": "user", "content": prompt}],
                            temperature=self.temperature,
                            max_tokens=self.max_tokens,
                            top_p=self.top_p,
                        )
                        content = response.choices[0].message.content
                        print(f"[OpenAI] Fallback succeeded ({len(content)} chars)")
                        return content
                    except Exception as e2:
                        print(f"[OpenAI] Fallback failed: {e2}")
                raise Exception(f"Azure OpenAI failed after {self.max_retries} attempts: {e}")

    # ---------------------- Gemini ----------------------
    def _generate_gemini(self, prompt: str) -> str:
        model_config = get_model_config(self.model)
        api_url = f"{GEMINI_API_BASE_URL}/{self.model}:generateContent?key={self.api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": self.temperature,
                "maxOutputTokens": model_config.get("max_output", 8192),
                "topP": self.top_p,
                "stopSequences": self.stop_sequences,
            },
        }
        headers = {"Content-Type": "application/json"}
        session = LLMProvider._gemini_session or requests.Session()

        for attempt in range(1, self.max_retries + 1):
            try:
                response = session.post(api_url, headers=headers, json=payload, timeout=180)
                if response.status_code == 503:
                    print(f"[Gemini] 503 overload (attempt {attempt}), retrying...")
                    time.sleep(self.backoff_base ** attempt)
                    continue
                response.raise_for_status()

                result = response.json()
                candidates = result.get("candidates", [])
                if not candidates:
                    reason = result.get("promptFeedback", {}).get("blockReason", "Unknown")
                    raise ValueError(f"Gemini blocked request: {reason}")

                parts = candidates[0].get("content", {}).get("parts", [])
                text = "".join(p.get("text", "") for p in parts)
                print(f"[Gemini] Response OK ({len(text)} chars)")
                return text

            except Exception as e:
                print(f"[Gemini] Attempt {attempt} failed: {e}")
                if attempt < self.max_retries:
                    time.sleep(self.backoff_base ** attempt)
                    continue

                if self.model == "gemini-2.5-pro":
                    print("[Gemini] Switching to fallback model: gemini-2.5-flash")
                    self.model = "gemini-2.5-flash"
                    return self._generate_gemini(prompt)

                raise Exception(f"Gemini failed after {self.max_retries} attempts: {e}")
