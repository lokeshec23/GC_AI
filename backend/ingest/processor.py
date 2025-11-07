# ingest/processor.py
import os
import json
import tempfile
from utils.ocr import AzureOCR
from utils.smart_chunking import split_text_smart, validate_chunk_fits, get_token_count
from utils.llm_provider import LLMProvider
from utils.json_to_excel import validate_and_convert_to_excel
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

        # STEP 1: OCR Extraction (0% → 30%) - Fast 30-page chunks
        update_progress(session_id, 2, "Starting OCR extraction...")
        ocr_client = AzureOCR()
        
        update_progress(session_id, 5, "Reading PDF pages (30 pages per chunk)...")
        
        # ✅ Fast OCR with 30 pages per chunk
        extracted_text = ocr_client.analyze_doc(pdf_path, pages_per_chunk=30)
        
        text_length = len(extracted_text)
        text_tokens = get_token_count(extracted_text, model_name)
        
        update_progress(session_id, 30, f"✅ OCR completed - {text_length:,} characters ({text_tokens:,} tokens)")
        print(f"✅ OCR completed: {text_length:,} characters, {text_tokens:,} tokens\n")

        # STEP 2: Smart Text Chunking (30% → 35%) - Token-aware
        update_progress(session_id, 32, "Splitting text into optimal chunks...")
        
        # ✅ Get user's chunk size preference or use smart calculation
        user_chunk_size = user_settings.get("chunk_size")
        
        if user_chunk_size and user_chunk_size > 0:
            print(f"📊 Using user-defined chunk size: {user_chunk_size} tokens")
            # Use user's setting with smart splitting
            chunks = split_text_smart(
                text=extracted_text,
                model_name=model_name,
                prompt_template=custom_prompt,
                max_chunk_tokens=user_chunk_size,
                overlap_tokens=user_settings.get("chunk_overlap", 200)
            )
        else:
            print(f"📊 Calculating optimal chunk size for {model_name}...")
            # Auto-calculate based on model
            chunks = split_text_smart(
                text=extracted_text,
                model_name=model_name,
                prompt_template=custom_prompt,
                overlap_tokens=user_settings.get("chunk_overlap", 200)
            )
        
        num_chunks = len(chunks)
        update_progress(session_id, 35, f"✅ Created {num_chunks} chunks for processing")
        print(f"✅ Text chunked: {num_chunks} chunks\n")

        # STEP 3: LLM Processing (35% → 70%)
        update_progress(session_id, 40, f"Initializing {model_provider} LLM...")
        
        # Get API key
        api_key = user_settings.get(f"{model_provider}_api_key")
        if not api_key:
            raise ValueError(f"No API key found for {model_provider}")
        
        # Initialize LLM
        llm = LLMProvider(
            provider=model_provider,
            api_key=api_key,
            model=model_name,
            temperature=user_settings.get("temperature", 0.7),
            max_tokens=user_settings.get("max_output_tokens", 8192),
            top_p=user_settings.get("top_p", 1.0),
            stop_sequences=user_settings.get("stop_sequences", [])
        )
        
        update_progress(session_id, 45, f"Processing {num_chunks} chunks with LLM...")
        
        # Process chunks
        all_json_data = []
        for idx, chunk in enumerate(chunks):
            print(f"\n{'─'*50}")
            print(f"Processing chunk {idx+1}/{num_chunks}...")
            
            full_prompt = f"{custom_prompt}\n\n### TEXT TO PROCESS\n{chunk}"
            
            # ✅ Validate before sending
            chunk_tokens = get_token_count(chunk, model_name)
            prompt_tokens = get_token_count(full_prompt, model_name)
            
            print(f"   Chunk tokens: {chunk_tokens:,}")
            print(f"   Full prompt tokens: {prompt_tokens:,}")
            
            if not validate_chunk_fits(chunk, full_prompt, model_name):
                print(f"   ⚠️ WARNING: Chunk may be too large, but attempting anyway...")
            
            try:
                response = llm.generate(full_prompt)
                
                # Parse JSON
                chunk_data = parse_and_validate_json(response, idx + 1)
                
                if chunk_data:
                    all_json_data.extend(chunk_data)
                    print(f"   ✅ Extracted {len(chunk_data)} items from chunk {idx+1}")
                
            except Exception as e:
                print(f"   ❌ Error processing chunk {idx+1}: {str(e)}")
                # Continue with next chunk instead of failing completely
                continue
            
            progress_pct = 45 + int((idx + 1) / num_chunks * 25)
            update_progress(session_id, progress_pct, f"Processed {idx+1}/{num_chunks} chunks")
        
        print(f"\n{'─'*50}")
        update_progress(session_id, 70, "✅ LLM processing complete")
        print(f"✅ Extraction completed - Total rows: {len(all_json_data)}\n")

        # STEP 4: Clean and Validate (70% → 80%)
        update_progress(session_id, 72, "Validating and cleaning JSON data...")
        
        cleaned_data = clean_and_validate_data(all_json_data)
        
        print(f"📊 Cleaned data: {len(cleaned_data)} rows")
        update_progress(session_id, 80, f"✅ Validated {len(cleaned_data)} rows")

        # STEP 5: Convert to Excel (80% → 95%)
        update_progress(session_id, 82, "Converting JSON to Excel...")
        
        excel_path = tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".xlsx",
            prefix=f"extraction_{session_id[:8]}_"
        ).name
        
        validate_and_convert_to_excel(cleaned_data, excel_path)
        
        file_size = os.path.getsize(excel_path)
        update_progress(session_id, 95, f"✅ Excel generated ({file_size:,} bytes)")

        # STEP 6: Complete (95% → 100%)
        update_progress(session_id, 100, "✅ Processing complete!")
        
        print(f"{'='*60}")
        print(f"✅ PROCESSING COMPLETE")
        print(f"📊 Excel file: {excel_path}")
        print(f"📊 Total rows: {len(cleaned_data)}")
        print(f"📊 Chunks processed: {num_chunks}")
        print(f"{'='*60}\n")
        
        # Store results
        from utils.progress import progress_store, progress_lock
        
        with progress_lock:
            if session_id not in progress_store:
                progress_store[session_id] = {}
            
            progress_store[session_id].update({
                "excel_path": excel_path,
                "preview_data": cleaned_data,
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
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
            print("🧹 Temporary PDF cleaned up\n")


def parse_and_validate_json(response: str, chunk_num: int):
    """Parse and validate JSON from LLM response"""
    import re
    
    # Clean response
    cleaned = response.strip()
    cleaned = re.sub(r'^```json\s*', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'^```\s*', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'\s*```$', '', cleaned, flags=re.MULTILINE)
    cleaned = cleaned.strip()
    
    # Extract JSON array
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
        print(f"   ❌ JSON parse error: {e}")
        return []


def clean_and_validate_data(data):
    """Clean and validate extracted data"""
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