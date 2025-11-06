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
        provider: str,
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
            self.api_url = f"{GEMINI_API_BASE_URL}/{model}:generateContent?key={api_key}"
        else:
            raise ValueError(f"Unsupported provider: {provider}")
    
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
        """Call Gemini API - Fixed version with better error handling"""
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
        
        # Add stop sequences if provided
        if self.stop_sequences:
            payload["generationConfig"]["stopSequences"] = self.stop_sequences
        
        try:
            print(f"📤 Calling Gemini API: {self.model}")
            
            response = requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=120
            )
            
            print(f"📥 Response status: {response.status_code}")
            
            # Check for HTTP errors
            if response.status_code != 200:
                print(f"❌ HTTP Error {response.status_code}")
                print(f"Response body: {response.text}")
                raise Exception(f"Gemini API HTTP {response.status_code}: {response.text}")
            
            result = response.json()
            
            # Debug: Print response structure
            print(f"📊 Response keys: {list(result.keys())}")
            
            # Handle different response formats
            if "candidates" in result and len(result["candidates"]) > 0:
                candidate = result["candidates"][0]
                
                # Check for safety blocks
                if "finishReason" in candidate:
                    finish_reason = candidate["finishReason"]
                    if finish_reason != "STOP":
                        print(f"⚠️ Unexpected finish reason: {finish_reason}")
                        if "safetyRatings" in candidate:
                            print(f"Safety ratings: {candidate['safetyRatings']}")
                
                # Extract text
                if "content" in candidate and "parts" in candidate["content"]:
                    parts = candidate["content"]["parts"]
                    if len(parts) > 0 and "text" in parts[0]:
                        text_response = parts[0]["text"]
                        print(f"✅ Got response: {len(text_response)} characters")
                        return text_response
                    else:
                        print(f"❌ No text in parts: {parts}")
                else:
                    print(f"❌ No content/parts in candidate: {candidate.keys()}")
            
            # Check for error in response
            if "error" in result:
                error_msg = result["error"].get("message", "Unknown error")
                print(f"❌ API Error: {error_msg}")
                raise Exception(f"Gemini API Error: {error_msg}")
            
            # If we get here, response format is unexpected
            print(f"❌ Unexpected response format")
            print(f"Full response: {json.dumps(result, indent=2)}")
            raise ValueError(f"Unexpected Gemini API response format. Response: {result}")
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed: {str(e)}")
            raise Exception(f"Gemini API request failed: {str(e)}")
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse JSON response: {str(e)}")
            print(f"Raw response: {response.text}")
            raise Exception(f"Failed to parse Gemini response as JSON: {str(e)}")