# utils/llm_provider.py
import json
import re
import requests
from typing import List
from openai import AzureOpenAI
from config import GEMINI_API_BASE_URL, get_model_config

class LLMProvider:
    """Unified LLM provider supporting Azure OpenAI and Gemini"""
    
    def __init__(
        self,
        provider: str,
        api_key: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        top_p: float = 1.0,
        stop_sequences: List[str] = None,
        azure_endpoint: str = None,
        azure_deployment: str = None,
    ):
        self.provider = provider.lower()
        self.model = model
        self.api_key = api_key
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_p = top_p
        self.stop_sequences = stop_sequences or []
        
        if self.provider == "openai":
            if not azure_endpoint or not azure_deployment:
                raise ValueError("Azure OpenAI requires endpoint and deployment name")
            
            self.client = AzureOpenAI(
                api_key=api_key,
                api_version="2024-08-01-preview",
                azure_endpoint=azure_endpoint
            )
            self.deployment = azure_deployment
            print(f"✅ Azure OpenAI initialized - Deployment: {azure_deployment}")
            
        elif self.provider == "gemini":
            self.api_url = f"{GEMINI_API_BASE_URL}/{model}:generateContent?key={api_key}"
            print(f"✅ Gemini initialized - Model: {model}")
        else:
            raise ValueError(f"Unsupported provider: {provider}")
    
    def generate(self, prompt: str) -> str:
        """Generate response from LLM"""
        if self.provider == "openai":
            return self._generate_azure_openai(prompt)
        elif self.provider == "gemini":
            return self._generate_gemini(prompt)
    
    def _generate_azure_openai(self, prompt: str) -> str:
        """Call Azure OpenAI API"""
        try:
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=[{"role": "user", "content": prompt}],
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                top_p=self.top_p,
                stop=self.stop_sequences if self.stop_sequences else None
            )
            content = response.choices[0].message.content
            print(f"✅ Azure OpenAI response: {len(content)} characters")
            return content
        except Exception as e:
            print(f"❌ Azure OpenAI error: {str(e)}")
            raise Exception(f"Azure OpenAI API failed: {str(e)}")
    
    def _generate_gemini(self, prompt: str) -> str:
        """Call Gemini API"""
        model_config = get_model_config(self.model)
        effective_max_tokens = model_config["max_output"]
        
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": self.temperature,
                "maxOutputTokens": effective_max_tokens,
                "topP": self.top_p,
            }
        }
        
        if self.stop_sequences:
            payload["generationConfig"]["stopSequences"] = self.stop_sequences
        
        try:
            response = requests.post(self.api_url, headers=headers, json=payload, timeout=120)
            
            if response.status_code != 200:
                raise Exception(f"Gemini API HTTP {response.status_code}: {response.text}")
            
            result = response.json()
            
            if "candidates" in result and len(result["candidates"]) > 0:
                candidate = result["candidates"][0]
                finish_reason = candidate.get("finishReason", "UNKNOWN")
                
                if finish_reason == "MAX_TOKENS":
                    raise Exception("Response exceeded maximum token limit. Try reducing chunk size.")
                
                if finish_reason == "SAFETY":
                    raise Exception("Content was blocked by safety filters.")
                
                if "content" in candidate and "parts" in candidate["content"]:
                    parts = candidate["content"]["parts"]
                    if len(parts) > 0 and "text" in parts[0]:
                        text_response = parts[0]["text"]
                        print(f"✅ Gemini response: {len(text_response)} characters")
                        return text_response
            
            if "error" in result:
                error_msg = result["error"].get("message", "Unknown error")
                raise Exception(f"Gemini API Error: {error_msg}")
            
            raise ValueError("Unexpected Gemini API response format")
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"Gemini API request failed: {str(e)}")