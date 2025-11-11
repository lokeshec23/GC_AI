# backend/utils/llm_provider.py

import json
import re
import requests
from typing import List, Optional
from openai import AzureOpenAI
from config import get_model_config, GEMINI_API_BASE_URL

class LLMProvider:
    """
    A unified and robust provider for communicating with different LLM APIs.
    """
    
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
    ):
        self.provider = provider.lower()
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_p = top_p
        self.stop_sequences = stop_sequences or []
        
        # ✅ CORRECTED: Save the api_key to the instance
        self.api_key = api_key
        
        if self.provider == "openai":
            if not azure_endpoint or not azure_deployment or not api_key:
                raise ValueError("Azure OpenAI requires API key, endpoint, and deployment name.")
            
            self.client = AzureOpenAI(
                api_key=self.api_key, # Use self.api_key for consistency
                api_version="2024-02-01",
                azure_endpoint=azure_endpoint
            )
            self.deployment = azure_deployment
            print(f"✅ Azure OpenAI client initialized for deployment: '{self.deployment}'")
            
        elif self.provider == "gemini":
            if not self.api_key:
                raise ValueError("Gemini requires an API key.")
            # The URL will be constructed in the generate method
            print(f"✅ Gemini API client configured for model: '{self.model}'")
        else:
            raise ValueError(f"Unsupported LLM provider: '{self.provider}'")

    def generate(self, prompt: str) -> str:
        """Dispatches the generation request to the appropriate provider."""
        if self.provider == "openai":
            return self._generate_azure_openai(prompt)
        elif self.provider == "gemini":
            return self._generate_gemini(prompt)
        raise NotImplementedError(f"Generation for provider '{self.provider}' is not implemented.")

    def _generate_azure_openai(self, prompt: str) -> str:
        """Sends a request to the Azure OpenAI API."""
        print(f"📤 Calling Azure OpenAI deployment: '{self.deployment}'")
        try:
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=[{"role": "user", "content": prompt}],
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                top_p=self.top_p,
                stop=self.stop_sequences if self.stop_sequences else None,
            )
            content = response.choices[0].message.content
            print(f"   ✅ Azure OpenAI response received ({len(content)} chars).")
            return content
        except Exception as e:
            print(f"   ❌ Azure OpenAI API Error: {e}")
            raise Exception(f"Azure OpenAI API call failed: {e}")

    def _generate_gemini(self, prompt: str) -> str:
        """Sends a request to the Google Gemini API."""
        
        api_url = f"{GEMINI_API_BASE_URL}/{self.model}:generateContent?key={self.api_key}"
        
        print(f"📤 Calling Gemini API endpoint: '{api_url.split('?')[0]}'")
        
        model_config = get_model_config(self.model)
        effective_max_tokens = model_config.get("max_output", 8192)
        
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": self.temperature,
                "maxOutputTokens": effective_max_tokens,
                "topP": self.top_p,
                "stopSequences": self.stop_sequences,
            }
        }
        
        try:
            response = requests.post(api_url, headers=headers, json=payload, timeout=180)
            response.raise_for_status()
            
            result = response.json()
            
            if not result.get("candidates"):
                finish_details = result.get("promptFeedback", {})
                raise ValueError(f"Request blocked or failed. Reason: {finish_details.get('blockReason', 'Unknown')}")

            candidate = result["candidates"][0]
            finish_reason = candidate.get("finishReason", "UNKNOWN")

            if finish_reason == "MAX_TOKENS":
                print("   ⚠️ WARNING: Response was truncated due to max token limit.")
            elif finish_reason == "SAFETY":
                 raise ValueError("Response blocked due to safety settings.")
            
            if "content" in candidate and "parts" in candidate["content"]:
                text_response = "".join(part["text"] for part in candidate["content"]["parts"] if "text" in part)
                print(f"   ✅ Gemini response received ({len(text_response)} chars).")
                return text_response

            raise ValueError("Unexpected Gemini response format: No text content found.")
        except requests.exceptions.HTTPError as e:
            print(f"   ❌ Gemini API HTTP Error: {e.response.status_code} - {e.response.text}")
            raise Exception(f"Gemini API call failed with status {e.response.status_code}.")
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Gemini API request failed: {e}")
            raise Exception(f"Network error while calling Gemini API: {e}")
        except Exception as e:
            print(f"   ❌ An error occurred during Gemini call: {e}")
            raise