# utils/llm_provider.py
import json
import re
import requests
from typing import List, Dict, Any
from openai import OpenAI
from config import GEMINI_API_BASE_URL

class LLMProvider:
    """Unified LLM provider supporting OpenAI and Gemini"""
    
    def __init__(
        self,
        provider: str,  # "openai" or "gemini"
        api_key: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        top_p: float = 1.0,
        stop_sequences: List[str] = None
    ):
        self.provider = provider.lower()
        self.model = model
        self.api_key = api_key
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_p = top_p
        self.stop_sequences = stop_sequences or []
        
        if self.provider == "openai":
            self.client = OpenAI(api_key=api_key)
        elif self.provider == "gemini":
            # Gemini uses direct HTTP API
            self.api_url = f"{GEMINI_API_BASE_URL}/{model}:generateContent?key={api_key}"
        else:
            raise ValueError(f"Unsupported provider: {provider}")
    
    def _clean_json_response(self, content: str) -> str:
        """Remove markdown fences and clean JSON response"""
        if not content:
            return "{}"
        
        cleaned = content.strip()
        cleaned = re.sub(r'^```json\s*', '', cleaned)
        cleaned = re.sub(r'^```\s*', '', cleaned)
        cleaned = re.sub(r'\s*```$', '', cleaned)
        return cleaned.strip()
    
    def generate(self, prompt: str) -> str:
        """Generate response from LLM"""
        if self.provider == "openai":
            return self._generate_openai(prompt)
        elif self.provider == "gemini":
            return self._generate_gemini(prompt)
    
    def _generate_openai(self, prompt: str) -> str:
        """Call OpenAI API"""
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            top_p=self.top_p,
            stop=self.stop_sequences if self.stop_sequences else None
        )
        return response.choices[0].message.content
    
    def _generate_gemini(self, prompt: str) -> str:
        """Call Gemini API using direct HTTP request"""
        headers = {
            "Content-Type": "application/json"
        }
        
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": prompt
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": self.temperature,
                "maxOutputTokens": self.max_tokens,
                "topP": self.top_p,
            }
        }
        
        if self.stop_sequences:
            payload["generationConfig"]["stopSequences"] = self.stop_sequences
        
        try:
            response = requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=120
            )
            response.raise_for_status()
            
            result = response.json()
            
            # Extract text from Gemini response format
            if "candidates" in result and len(result["candidates"]) > 0:
                candidate = result["candidates"][0]
                if "content" in candidate and "parts" in candidate["content"]:
                    parts = candidate["content"]["parts"]
                    if len(parts) > 0 and "text" in parts[0]:
                        return parts[0]["text"]
            
            raise ValueError("Unexpected Gemini API response format")
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"Gemini API request failed: {str(e)}")
    
    def process_chunks(self, chunks: List[str], user_prompt: str) -> dict:
        """
        Process multiple chunks with user's custom prompt and merge results.
        """
        final_result = {}
        
        for idx, chunk in enumerate(chunks):
            print(f"Processing chunk {idx+1}/{len(chunks)}...")
            
            # Format the prompt with the chunk
            full_prompt = f"{user_prompt}\n\n### TEXT TO PROCESS\n{chunk}"
            
            # Generate response
            response_content = self.generate(full_prompt)
            
            # Parse JSON response
            try:
                chunk_result = json.loads(response_content)
            except json.JSONDecodeError:
                cleaned = self._clean_json_response(response_content)
                try:
                    chunk_result = json.loads(cleaned)
                except json.JSONDecodeError:
                    print(f"⚠️ Failed to parse JSON for chunk {idx+1}, skipping...")
                    continue
            
            # Merge results (same logic as your old code)
            for key, value in chunk_result.items():
                if key not in final_result:
                    final_result[key] = value
                else:
                    if isinstance(value, dict) and isinstance(final_result[key], dict):
                        final_result[key].update(value)
                    elif isinstance(value, list) and isinstance(final_result[key], list):
                        final_result[key].extend(value)
                    else:
                        final_result[key] = value
        
        return final_result