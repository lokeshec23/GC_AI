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
        """Call Gemini API with better error handling"""
        headers = {
            "Content-Type": "application/json"
        }
        
        # ✅ Use higher max tokens for Gemini (includes thinking tokens)
        effective_max_tokens = max(self.max_tokens, 8192)
        
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
                "maxOutputTokens": effective_max_tokens,  # ✅ Increased
                "topP": self.top_p,
            }
        }
        
        if self.stop_sequences:
            payload["generationConfig"]["stopSequences"] = self.stop_sequences
        
        try:
            print(f"📤 Calling Gemini API: {self.model}")
            print(f"   Max output tokens: {effective_max_tokens}")
            
            response = requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=120
            )
            
            print(f"📥 Response status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ HTTP Error {response.status_code}")
                print(f"Response body: {response.text}")
                raise Exception(f"Gemini API HTTP {response.status_code}: {response.text}")
            
            result = response.json()
            
            print(f"📊 Response keys: {list(result.keys())}")
            
            # ✅ Handle response
            if "candidates" in result and len(result["candidates"]) > 0:
                candidate = result["candidates"][0]
                
                # ✅ Check finish reason
                finish_reason = candidate.get("finishReason", "UNKNOWN")
                print(f"   Finish reason: {finish_reason}")
                
                # ✅ Handle MAX_TOKENS error
                if finish_reason == "MAX_TOKENS":
                    usage = result.get("usageMetadata", {})
                    print(f"   ⚠️ Response truncated - hit max tokens limit")
                    print(f"   Prompt tokens: {usage.get('promptTokenCount', 'unknown')}")
                    print(f"   Total tokens: {usage.get('totalTokenCount', 'unknown')}")
                    print(f"   Thoughts tokens: {usage.get('thoughtsTokenCount', 'unknown')}")
                    
                    # Check if there's partial content
                    if "content" in candidate and "parts" in candidate["content"]:
                        parts = candidate["content"]["parts"]
                        if len(parts) > 0 and "text" in parts[0]:
                            partial_text = parts[0]["text"]
                            print(f"   ✅ Got partial response: {len(partial_text)} characters")
                            print(f"   ⚠️ WARNING: Response may be incomplete!")
                            return partial_text
                    
                    # No content at all
                    raise Exception(
                        f"Response exceeded maximum token limit ({effective_max_tokens} tokens). "
                        f"Try reducing chunk size or simplifying the prompt. "
                        f"Prompt used {usage.get('promptTokenCount', 'unknown')} tokens."
                    )
                
                # ✅ Handle SAFETY blocks
                if finish_reason == "SAFETY":
                    print(f"   ⚠️ Content blocked by safety filters")
                    if "safetyRatings" in candidate:
                        print(f"   Safety ratings: {candidate['safetyRatings']}")
                    raise Exception("Content was blocked by safety filters. Try rephrasing the prompt.")
                
                # ✅ Extract text from successful response
                if "content" in candidate:
                    content = candidate["content"]
                    
                    if "parts" in content and len(content["parts"]) > 0:
                        parts = content["parts"]
                        if "text" in parts[0]:
                            text_response = parts[0]["text"]
                            print(f"   ✅ Got response: {len(text_response)} characters")
                            return text_response
                        else:
                            print(f"   ❌ No 'text' in parts: {parts}")
                    else:
                        print(f"   ❌ No 'parts' in content: {content}")
                        print(f"   Content keys: {list(content.keys())}")
                else:
                    print(f"   ❌ No 'content' in candidate")
            
            # Check for error in response
            if "error" in result:
                error_msg = result["error"].get("message", "Unknown error")
                print(f"❌ API Error: {error_msg}")
                raise Exception(f"Gemini API Error: {error_msg}")
            
            # If we get here, unexpected format
            print(f"❌ Unexpected response format")
            print(f"Full response: {json.dumps(result, indent=2)}")
            raise ValueError(f"Unexpected Gemini API response format. Check logs for details.")
            
        except requests.exceptions.Timeout:
            raise Exception("Gemini API request timed out. Try with a smaller chunk.")
        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed: {str(e)}")
            raise Exception(f"Gemini API request failed: {str(e)}")
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse JSON response: {str(e)}")
            print(f"Raw response: {response.text[:500]}")
            raise Exception(f"Failed to parse Gemini response as JSON: {str(e)}")