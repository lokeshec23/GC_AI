# ingest/processor.py
import os
import json
import tempfile
from typing import Optional, List, Dict
from utils.ocr import AzureOCR
from utils.chunking import split_text_into_chunks
from utils.llm_provider import LLMProvider
from utils.json_to_excel import validate_and_convert_to_excel  # ✅ NEW
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
    """Background task for processing PDF guideline extraction"""
    excel_path = None
    
    try:
        print(f"\n{'='*60}")
        print(f"🔄 Processing started for session: {session_id[:8]}")
        print(f"📄 File: {filename}")
        print(f"🤖 Model: {model_provider}/{model_name}")
        print(f"{'='*60}\n")

        # STEP 1: OCR Extraction (0% → 30%)
        update_progress(session_id, 2, "Starting OCR extraction...")
        ocr_client = AzureOCR()
        
        update_progress(session_id, 5, "Reading PDF pages...")
        extracted_text = ocr_client.analyze_doc(pdf_path)
        
        text_length = len(extracted_text)
        update_progress(session_id, 30, f"✅ OCR completed - {text_length:,} characters")
        print(f"✅ OCR completed: {text_length:,} characters\n")

        # STEP 2: Text Chunking (30% → 35%)
        update_progress(session_id, 32, "Splitting text into chunks...")
        
        chunks = split_text_into_chunks(
            extracted_text,
            max_tokens=user_settings.get("chunk_size", 7000),
            overlap_tokens=user_settings.get("chunk_overlap", 200),
            model=model_name
        )
        
        num_chunks = len(chunks)
        update_progress(session_id, 35, f"✅ Created {num_chunks} chunks")
        print(f"✅ Text chunked: {num_chunks} chunks\n")

        # STEP 3: LLM Processing (35% → 70%)
        update_progress(session_id, 40, f"Initializing {model_provider} LLM...")
        
        # Get API key
        api_key = user_settings.get(f"{model_provider}_api_key")
        if not api_key:
            raise ValueError(f"No API key found for {model_provider}")
        
        # Initialize LLM provider
        llm = LLMProvider(
            provider=model_provider,
            api_key=api_key,
            model=model_name,
            temperature=user_settings.get("temperature", 0.7),
            max_tokens=user_settings.get("max_output_tokens", 4096),
            top_p=user_settings.get("top_p", 1.0),
            stop_sequences=user_settings.get("stop_sequences", [])
        )
        
        update_progress(session_id, 45, f"Processing {num_chunks} chunks...")
        
        # ✅ Process chunks and collect JSON responses
        all_json_data = []
        for idx, chunk in enumerate(chunks):
            print(f"Processing chunk {idx+1}/{num_chunks}...")
            full_prompt = f"{custom_prompt}\n\n### TEXT TO PROCESS\n{chunk}"
            
            response = llm.generate(full_prompt)
            
            # Parse and validate JSON from this chunk
            chunk_data = parse_and_validate_json(response, idx + 1)
            
            if chunk_data:
                all_json_data.extend(chunk_data)
            
            progress_pct = 45 + int((idx + 1) / num_chunks * 25)
            update_progress(session_id, progress_pct, f"Processed {idx+1}/{num_chunks} chunks")
        
        update_progress(session_id, 70, "✅ LLM processing complete")
        print(f"✅ Extraction completed - Total rows: {len(all_json_data)}\n")

        # STEP 4: Clean and Validate JSON (70% → 80%)
        update_progress(session_id, 72, "Validating and cleaning JSON data...")
        
        cleaned_data = clean_and_validate_data(all_json_data)
        
        print(f"📊 Cleaned data: {len(cleaned_data)} rows")
        update_progress(session_id, 80, f"✅ Validated {len(cleaned_data)} rows")

        # STEP 5: Convert to Excel (80% → 95%)
        update_progress(session_id, 82, "Converting JSON to Excel...")
        
        # Create temporary Excel file
        excel_path = tempfile.NamedTemporaryFile(
            delete=False, 
            suffix=".xlsx",
            prefix=f"extraction_{session_id[:8]}_"
        ).name
        
        # ✅ Convert clean JSON to Excel
        validate_and_convert_to_excel(cleaned_data, excel_path)
        
        file_size = os.path.getsize(excel_path)
        update_progress(session_id, 95, f"✅ Excel generated ({file_size:,} bytes)")

        # STEP 6: Complete (95% → 100%)
        update_progress(session_id, 100, "✅ Processing complete!")
        
        print(f"{'='*60}")
        print(f"✅ PROCESSING COMPLETE")
        print(f"📊 Excel file: {excel_path}")
        print(f"📊 Total rows: {len(cleaned_data)}")
        print(f"📊 File size: {file_size:,} bytes")
        print(f"{'='*60}\n")
        
        # ✅ Store results (use cleaned_data for preview)
        from utils.progress import progress_store, progress_lock
        
        with progress_lock:
            if session_id not in progress_store:
                progress_store[session_id] = {}
            
            progress_store[session_id].update({
                "excel_path": excel_path,
                "preview_data": cleaned_data,  # ✅ Store clean JSON array
                "filename": f"extraction_{filename.replace('.pdf', '.xlsx')}",
                "status": "completed",
                "progress": 100,
                "message": "✅ Processing complete!"
            })
            
            print(f"✅ Stored in progress_store")

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
        # Cleanup uploaded PDF
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
            print("🧹 Temporary PDF cleaned up\n")


def parse_and_validate_json(response: str, chunk_num: int) -> List[Dict]:
    """
    Parse JSON from LLM response and validate structure.
    Handles various response formats and cleans them.
    """
    import re
    
    print(f"   📥 Raw response length: {len(response)} chars")
    
    # Clean response
    cleaned = response.strip()
    
    # Remove markdown code blocks
    cleaned = re.sub(r'^```json\s*', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'^```\s*', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'\s*```$', '', cleaned, flags=re.MULTILINE)
    cleaned = cleaned.strip()
    
    # Try to find JSON array or object
    # Look for [ ... ] or { ... }
    array_match = re.search(r'\[.*\]', cleaned, re.DOTALL)
    if array_match:
        cleaned = array_match.group(0)
    else:
        object_match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if object_match:
            cleaned = f"[{object_match.group(0)}]"  # Wrap in array
    
    try:
        data = json.loads(cleaned)
        
        # Ensure it's a list
        if isinstance(data, dict):
            data = [data]
        elif not isinstance(data, list):
            print(f"   ⚠️ Unexpected data type: {type(data)}")
            return []
        
        print(f"   ✅ Parsed {len(data)} items from chunk {chunk_num}")
        return data
        
    except json.JSONDecodeError as e:
        print(f"   ❌ JSON parse error in chunk {chunk_num}: {e}")
        print(f"   Cleaned content preview: {cleaned[:200]}...")
        return []


def clean_and_validate_data(data: List[Dict]) -> List[Dict]:
    """
    Clean and validate the extracted JSON data.
    Ensures all required fields exist and removes duplicates.
    """
    cleaned = []
    seen = set()
    
    for idx, item in enumerate(data):
        # Validate required fields
        if not isinstance(item, dict):
            print(f"   ⚠️ Skipping non-dict item at index {idx}")
            continue
        
        # Ensure all required fields exist
        cleaned_item = {
            "major_section": str(item.get("major_section", "")).strip(),
            "subsection": str(item.get("subsection", "")).strip(),
            "summary": str(item.get("summary", "")).strip(),
        }
        
        # Skip if major_section is empty
        if not cleaned_item["major_section"] and not cleaned_item["summary"]:
            continue
        
        # Create hash for duplicate detection
        item_hash = f"{cleaned_item['major_section']}|{cleaned_item['subsection']}"
        
        # Skip duplicates (keep first occurrence)
        if item_hash in seen:
            continue
        
        seen.add(item_hash)
        cleaned.append(cleaned_item)
    
    print(f"   ✅ Cleaned: {len(cleaned)} unique rows from {len(data)} total")
    return cleaned