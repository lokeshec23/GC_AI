# backend/ingest/processor.py

import os
import json
import tempfile
import threading
from typing import List, Dict

# Local utilities
from utils.ocr import AzureOCR
from utils.llm_provider import LLMProvider
from utils.json_to_excel import dynamic_json_to_excel
from utils.progress import update_progress

def process_guideline_background(
    session_id: str,
    pdf_path: str,
    filename: str,
    user_settings: dict,
    model_provider: str,
    model_name: str,
    custom_prompt: str
):
    """
    The main background task for ingesting and processing a PDF guideline.
    """
    excel_path = None
    
    try:
        pages_per_chunk = user_settings.get("pages_per_chunk", 1)

        print(f"\n{'='*60}")
        print(f"🔄 Ingestion Process Started for Session: {session_id[:8]}")
        print(f"📄 File: {filename}")
        print(f"🤖 Model Provider: {model_provider}/{model_name}")
        print(f"⚙️ Chunking Strategy: {pages_per_chunk} page(s) per chunk")
        print(f"{'='*60}\n")

        # --- STEP 1: OCR & Page-Based Chunking ---
        update_progress(session_id, 5, f"Extracting text ({pages_per_chunk} page(s) per chunk)...")
        ocr_client = AzureOCR()
        text_chunks = ocr_client.analyze_doc_page_by_page(pdf_path, pages_per_chunk=pages_per_chunk)
        
        num_chunks = len(text_chunks)
        if num_chunks == 0:
            raise ValueError("OCR process failed to extract any text from the document.")
            
        update_progress(session_id, 35, f"✅ OCR complete. Created {num_chunks} text chunk(s).")

        # --- STEP 2: LLM Processing ---
        update_progress(session_id, 40, f"Initializing {model_provider} LLM...")
        
        llm = initialize_llm_provider(user_settings, model_provider, model_name)
        
        update_progress(session_id, 45, f"Processing {num_chunks} text chunk(s) with LLM...")
        
        all_extracted_items = []
        for idx, chunk_text in enumerate(text_chunks):
            print(f"\n{'─'*50}\nProcessing chunk {idx+1}/{num_chunks}...")
            
            full_prompt = f"{custom_prompt}\n\n### TEXT TO PROCESS\n{chunk_text}"
            
            try:
                response = llm.generate(full_prompt)
                parsed_items = parse_and_clean_llm_response(response, idx + 1)
                
                if parsed_items:
                    all_extracted_items.extend(parsed_items)
                    print(f"   ✅ Extracted {len(parsed_items)} items from this chunk.")
            except Exception as e:
                print(f"   ❌ Error processing chunk {idx+1}: {str(e)}")
                continue
            
            progress_pct = 45 + int(((idx + 1) / num_chunks) * 45)
            update_progress(session_id, progress_pct, f"Processed {idx+1}/{num_chunks} chunk(s)")
        
        print(f"\n{'─'*50}")
        update_progress(session_id, 90, "✅ LLM processing complete.")
        print(f"✅ Total items extracted: {len(all_extracted_items)}\n")

        # --- STEP 3: Convert to Excel ---
        update_progress(session_id, 92, "Converting results to Excel...")
        
        excel_path = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx", prefix=f"extraction_{session_id[:8]}_").name
        dynamic_json_to_excel(all_extracted_items, excel_path)
        
        update_progress(session_id, 95, f"✅ Excel file generated.")

        # --- STEP 4: Finalize ---
        update_progress(session_id, 100, "✅ Processing complete!")
        print(f"{'='*60}\n✅ PROCESSING COMPLETE\n{'='*60}")
        
        from utils.progress import progress_store, progress_lock
        with progress_lock:
            if session_id in progress_store:
                progress_store[session_id].update({
                    "excel_path": excel_path,
                    "preview_data": all_extracted_items,
                    "filename": f"extraction_{os.path.basename(filename).split('.')[0]}.xlsx",
                    "status": "completed",
                })
    
    except Exception as e:
        import traceback
        error_msg = str(e)
        print(f"\n{'='*60}\n❌ A critical error occurred during processing: {error_msg}\n")
        traceback.print_exc()
        print(f"{'='*60}\n")
        update_progress(session_id, -1, f"Error: {error_msg}")
        
        from utils.progress import progress_store, progress_lock
        with progress_lock:
            if session_id in progress_store:
                progress_store[session_id].update({"status": "failed", "error": error_msg})
                
    finally:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
            print("🧹 Temporary PDF file cleaned up.")

def initialize_llm_provider(user_settings: dict, provider: str, model: str) -> LLMProvider:
    """
    Helper function to initialize the correct LLM provider with only the
    relevant settings.
    """
    # ✅ CORRECTED: Selectively pick arguments for LLMProvider
    llm_params = {
        "temperature": user_settings.get("temperature", 0.5),
        "max_tokens": user_settings.get("max_output_tokens", 8192),
        "top_p": user_settings.get("top_p", 1.0),
        "stop_sequences": user_settings.get("stop_sequences", []),
    }

    if provider == "openai":
        api_key = user_settings.get("openai_api_key")
        endpoint = user_settings.get("openai_endpoint")
        deployment = user_settings.get("openai_deployment")
        if not all([api_key, endpoint, deployment]):
            raise ValueError("Azure OpenAI credentials (key, endpoint, deployment) are not fully configured.")
        return LLMProvider(
            provider=provider, 
            api_key=api_key, 
            model=model, 
            azure_endpoint=endpoint, 
            azure_deployment=deployment, 
            **llm_params  # ✅ Pass only relevant params
        )

    elif provider == "gemini":
        api_key = user_settings.get("gemini_api_key")
        if not api_key:
            raise ValueError("Gemini API key is not configured.")
        return LLMProvider(
            provider=provider, 
            api_key=api_key, 
            model=model, 
            **llm_params  # ✅ Pass only relevant params
        )
        
    else:
        raise ValueError(f"Unsupported provider: {provider}")

def parse_and_clean_llm_response(response: str, chunk_num: int) -> List[Dict]:
    """Generic, robust parser for LLM JSON responses."""
    import re
    
    print(f"   📥 Parsing response from chunk {chunk_num}...")
    
    cleaned = response.strip()
    
    json_match = re.search(r'(\[.*\]|\{.*\})', cleaned, re.DOTALL)
    if not json_match:
        print(f"   ⚠️ No JSON array or object found in chunk {chunk_num}.")
        return []
        
    json_str = json_match.group(0)
    
    try:
        data = json.loads(json_str)
        
        if isinstance(data, dict):
            return [data]
        
        if isinstance(data, list) and all(isinstance(item, dict) for item in data):
            return data
            
        print(f"   ⚠️ Parsed data is not a list of dictionaries in chunk {chunk_num}.")
        return []
    except json.JSONDecodeError as e:
        print(f"   ❌ JSON parse error in chunk {chunk_num}: {e}")
        return []