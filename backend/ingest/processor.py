# ingest/processor.py
import os
import json
import tempfile
import threading
from typing import List, Dict

# Local utilities
from utils.ocr import AzureOCR
from utils.llm_provider import LLMProvider
from utils.json_to_excel import validate_and_convert_to_excel
from utils.progress import update_progress
# from utils.cancellation import remove_cancel_event # (Assuming stop button is removed)

def process_guideline_background(
    session_id: str,
    pdf_path: str,
    filename: str,
    user_settings: dict,
    model_provider: str,
    model_name: str,
    custom_prompt: str
):
    """Background task for processing PDF with page-based chunking."""
    excel_path = None
    
    try:
        pages_per_chunk = user_settings.get("pages_per_chunk", 1)

        print(f"\n{'='*60}")
        print(f"🔄 Processing started for session: {session_id[:8]}")
        print(f"📄 File: {filename}")
        print(f"🤖 Model: {model_provider}/{model_name}")
        print(f"⚙️ Chunking Strategy: {pages_per_chunk} page(s) per chunk")
        print(f"{'='*60}\n")

        # STEP 1: OCR Extraction with Page-Based Chunking
        update_progress(session_id, 5, f"Extracting text ({pages_per_chunk} page(s) per chunk)...")
        ocr_client = AzureOCR()
        
        # ✅ The OCR process now returns a list of text chunks, one for each page group
        text_chunks = ocr_client.analyze_doc_page_by_page(pdf_path, pages_per_chunk=pages_per_chunk)
        
        num_chunks = len(text_chunks)
        update_progress(session_id, 35, f"✅ OCR complete. Created {num_chunks} text chunks.")
        print(f"✅ OCR complete. Created {num_chunks} text chunks.\n")
        
        # ✅ The 'text_chunks' variable is now ready to be used directly.
        # No more text splitting is needed here.

        # STEP 2: LLM Processing (was step 3)
        update_progress(session_id, 40, f"Initializing {model_provider} LLM...")
        
        if model_provider == "openai":
            api_key = user_settings.get("openai_api_key")
            endpoint = user_settings.get("openai_endpoint")
            deployment = user_settings.get("openai_deployment")
            
            if not api_key or not endpoint or not deployment:
                raise ValueError("OpenAI credentials not fully configured in Settings.")
            
            llm = LLMProvider(
                provider="openai", api_key=api_key, model=model_name,
                temperature=user_settings.get("temperature", 0.7),
                max_tokens=user_settings.get("max_output_tokens", 8192),
                top_p=user_settings.get("top_p", 1.0),
                stop_sequences=user_settings.get("stop_sequences", []),
                azure_endpoint=endpoint, azure_deployment=deployment
            )
        elif model_provider == "gemini":
            api_key = user_settings.get("gemini_api_key")
            if not api_key:
                raise ValueError("Gemini API key not configured in Settings.")
            
            llm = LLMProvider(
                provider="gemini", api_key=api_key, model=model_name,
                temperature=user_settings.get("temperature", 0.7),
                max_tokens=user_settings.get("max_output_tokens", 8192),
                top_p=user_settings.get("top_p", 1.0),
                stop_sequences=user_settings.get("stop_sequences", [])
            )
        else:
            raise ValueError(f"Unsupported provider: {model_provider}")
        
        update_progress(session_id, 45, f"Processing {num_chunks} text chunks with LLM...")
        
        all_json_data = []
        for idx, chunk in enumerate(text_chunks):
            print(f"\n{'─'*50}")
            print(f"Processing chunk {idx+1}/{num_chunks}...")
            
            full_prompt = f"{custom_prompt}\n\n### TEXT TO PROCESS\n{chunk}"
            
            try:
                response = llm.generate(full_prompt)
                chunk_data = parse_and_validate_json(response, idx + 1)
                
                if chunk_data:
                    all_json_data.extend(chunk_data)
                    print(f"   ✅ Extracted {len(chunk_data)} items from chunk {idx+1}")
            except Exception as e:
                print(f"   ❌ Error processing chunk {idx+1}: {str(e)}")
                continue
            
            progress_pct = 45 + int((idx + 1) / num_chunks * 35) # Adjusted progress
            update_progress(session_id, progress_pct, f"Processed {idx+1}/{num_chunks} chunks")
        
        print(f"\n{'─'*50}")
        update_progress(session_id, 80, "✅ LLM processing complete")
        print(f"✅ Extraction completed - Total rows: {len(all_json_data)}\n")

        # STEP 3: Clean and Validate Data
        update_progress(session_id, 85, "Validating and cleaning JSON data...")
        cleaned_data = clean_and_validate_data(all_json_data)
        
        print(f"📊 Cleaned data: {len(cleaned_data)} rows")
        update_progress(session_id, 90, f"✅ Validated {len(cleaned_data)} rows")

        # STEP 4: Convert to Excel
        update_progress(session_id, 92, "Converting JSON to Excel...")
        
        excel_path = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx", prefix=f"extraction_{session_id[:8]}_").name
        validate_and_convert_to_excel(cleaned_data, excel_path)
        
        file_size = os.path.getsize(excel_path)
        update_progress(session_id, 95, f"✅ Excel generated ({file_size:,} bytes)")

        # STEP 5: Complete
        update_progress(session_id, 100, "✅ Processing complete!")
        
        print(f"{'='*60}")
        print(f"✅ PROCESSING COMPLETE")
        print(f"📊 Excel file: {excel_path}")
        print(f"{'='*60}\n")
        
        from utils.progress import progress_store, progress_lock
        
        with progress_lock:
            if session_id in progress_store:
                progress_store[session_id].update({
                    "excel_path": excel_path,
                    "preview_data": cleaned_data,
                    "filename": f"extraction_{filename.replace('.pdf', '.xlsx')}",
                    "status": "completed",
                    "progress": 100,
                    "message": "✅ Processing complete!"
                })
                print(f"✅ Stored results in progress_store")

    except Exception as e:
        import traceback
        error_msg = str(e)
        print(f"\n{'='*60}")
        print(f"❌ ERROR: {error_msg}")
        traceback.print_exc()
        print(f"{'='*60}\n")
        
        update_progress(session_id, 0, f"❌ Error: {error_msg}")
        
        from utils.progress import progress_store, progress_lock
        with progress_lock:
            if session_id in progress_store:
                progress_store[session_id]["status"] = "failed"
                progress_store[session_id]["error"] = error_msg
    finally:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
            print("🧹 Temporary PDF cleaned up\n")
        # remove_cancel_event(session_id) # (Assuming stop button is removed)

def parse_and_validate_json(response: str, chunk_num: int) -> List[Dict]:
    """Parse JSON from LLM response and validate structure."""
    import re
    
    cleaned = response.strip()
    cleaned = re.sub(r'^```json\s*', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'^```\s*', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'\s*```$', '', cleaned, flags=re.MULTILINE)
    cleaned = cleaned.strip()
    
    array_match = re.search(r'\[.*\]', cleaned, re.DOTALL)
    if array_match:
        cleaned = array_match.group(0)
    
    try:
        data = json.loads(cleaned)
        
        if isinstance(data, dict):
            data = [data]
        elif not isinstance(data, list):
            return []
        
        return data
    except json.JSONDecodeError as e:
        print(f"   ❌ JSON parse error in chunk {chunk_num}: {e}")
        return []

def clean_and_validate_data(data: List[Dict]) -> List[Dict]:
    """Clean and validate the extracted JSON data."""
    cleaned = []
    seen = set()
    
    for item in data:
        if not isinstance(item, dict):
            continue
        
        cleaned_item = {
            "major_section": str(item.get("major_section", "")).strip(),
            "subsection": str(item.get("subsection", "")).strip(),
            "summary": str(item.get("summary", "")).strip(),
        }
        
        if not cleaned_item["major_section"] and not cleaned_item["summary"]:
            continue
        
        item_hash = f"{cleaned_item['major_section']}|{cleaned_item['subsection']}"
        if item_hash in seen:
            continue
        
        seen.add(item_hash)
        cleaned.append(cleaned_item)
    
    return cleaned