# ingest/processor.py
import os
import json
import tempfile
from typing import Optional
from utils.ocr import AzureOCR
from utils.chunking import split_text_into_chunks
from utils.llm_provider import LLMProvider
from utils.text_to_excel import parse_any_format_to_excel  # ✅ NEW
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

        # STEP 3: LLM Processing (35% → 85%)
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
        
        # ✅ Process chunks and combine raw responses
        all_responses = []
        for idx, chunk in enumerate(chunks):
            print(f"Processing chunk {idx+1}/{num_chunks}...")
            full_prompt = f"{custom_prompt}\n\n### TEXT TO PROCESS\n{chunk}"
            
            response = llm.generate(full_prompt)
            all_responses.append(response)
            
            progress_pct = 45 + int((idx + 1) / num_chunks * 40)
            update_progress(session_id, progress_pct, f"Processed {idx+1}/{num_chunks} chunks")
        
        # Combine all responses
        combined_response = "\n\n".join(all_responses)
        
        update_progress(session_id, 85, "✅ LLM processing complete")
        print(f"✅ Extraction completed\n")
        print(f"📊 Combined response length: {len(combined_response)} chars")

        # STEP 4: Convert to Excel (85% → 95%)
        update_progress(session_id, 87, "Converting to Excel format...")
        
        # Create temporary Excel file
        excel_path = tempfile.NamedTemporaryFile(
            delete=False, 
            suffix=".xlsx",
            prefix=f"extraction_{session_id[:8]}_"
        ).name
        
        # ✅ Use new universal parser
        parse_any_format_to_excel(combined_response, excel_path)
        
        file_size = os.path.getsize(excel_path)
        update_progress(session_id, 95, f"✅ Excel generated ({file_size:,} bytes)")

        # STEP 5: Complete (95% → 100%)
        update_progress(session_id, 100, "✅ Processing complete!")
        
        print(f"{'='*60}")
        print(f"✅ PROCESSING COMPLETE")
        print(f"📊 Excel file: {excel_path}")
        print(f"📊 File size: {file_size:,} bytes")
        print(f"{'='*60}\n")
        
        # ✅ Store results
        from utils.progress import progress_store, progress_lock
        
        # Parse for preview (re-parse the combined response)
        from utils.text_to_excel import parse_content
        preview_data = parse_content(combined_response)
        
        with progress_lock:
            if session_id not in progress_store:
                progress_store[session_id] = {}
            
            progress_store[session_id].update({
                "excel_path": excel_path,
                "preview_data": preview_data,
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