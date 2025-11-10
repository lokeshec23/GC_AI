# backend/compare/processor.py

import os
import json
import tempfile
from typing import List, Dict

# Local utilities
from utils.excel_reader import read_excel_to_text
from utils.llm_provider import LLMProvider
from utils.json_to_excel import dynamic_json_to_excel
from utils.progress import update_progress
from ingest.processor import initialize_llm_provider, parse_and_clean_llm_response

def process_comparison_background(
    session_id: str,
    file1_path: str,
    file2_path: str,
    file1_name: str,
    file2_name: str,
    user_settings: dict,
    model_provider: str,
    model_name: str,
    custom_prompt: str
):
    """The main background task for comparing two Excel files."""
    excel_path = None
    
    try:
        print(f"\n{'='*60}")
        print(f"🔄 Comparison Process Started for Session: {session_id[:8]}")
        print(f"📄 File 1 (Base): {file1_name}")
        print(f"📄 File 2 (New): {file2_name}")
        print(f"🤖 Model Provider: {model_provider}/{model_name}")
        print(f"{'='*60}\n")

        # --- STEP 1: Read Excel Files and Convert to Text ---
        update_progress(session_id, 10, "Reading Excel files...")
        text1 = read_excel_to_text(file1_path, "Guideline 1 (Base)")
        text2 = read_excel_to_text(file2_path, "Guideline 2 (New)")
        
        combined_context = f"### Guideline 1 (Base) ###\n{text1}\n\n### Guideline 2 (New) ###\n{text2}"
        update_progress(session_id, 30, "✅ Excel files read and prepared.")

        # --- STEP 2: LLM Comparison ---
        update_progress(session_id, 40, f"Initializing {model_provider} LLM...")
        llm = initialize_llm_provider(user_settings, model_provider, model_name)
        
        update_progress(session_id, 50, "Sending data to LLM for comparison...")
        
        full_prompt = f"{custom_prompt}\n\n### DATA TO COMPARE ###\n{combined_context}"
        
        response = llm.generate(full_prompt)
        
        update_progress(session_id, 80, "✅ LLM comparison complete. Parsing results...")
        
        # --- STEP 3: Parse Response and Generate Excel ---
        comparison_results = parse_and_clean_llm_response(response, chunk_num=1)
        
        if not comparison_results:
            raise ValueError("LLM did not return any structured data for comparison.")
            
        print(f"✅ Parsed {len(comparison_results)} comparison items from LLM response.")
        update_progress(session_id, 90, "✅ Parsed LLM response.")

        excel_path = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx", prefix=f"comparison_{session_id[:8]}_").name
        dynamic_json_to_excel(comparison_results, excel_path)
        
        update_progress(session_id, 95, "✅ Comparison Excel file generated.")

        # --- STEP 4: Finalize ---
        update_progress(session_id, 100, "✅ Comparison complete!")
        print(f"{'='*60}\n✅ COMPARISON COMPLETE\n{'='*60}")
        
        from utils.progress import progress_store, progress_lock
        with progress_lock:
            if session_id in progress_store:
                progress_store[session_id].update({
                    "excel_path": excel_path,
                    "preview_data": comparison_results,
                    "filename": f"comparison_{os.path.basename(file1_name).split('.')[0]}_vs_{os.path.basename(file2_name).split('.')[0]}.xlsx",
                    "status": "completed",
                })
    
    except Exception as e:
        import traceback
        error_msg = str(e)
        print(f"\n{'='*60}\n❌ A critical error occurred during comparison: {error_msg}\n")
        traceback.print_exc()
        print(f"{'='*60}\n")
        update_progress(session_id, -1, f"Error: {error_msg}")
        
        from utils.progress import progress_store, progress_lock
        with progress_lock:
            if session_id in progress_store:
                progress_store[session_id].update({"status": "failed", "error": error_msg})
                
    finally:
        # Cleanup temporary files
        for path in [file1_path, file2_path]:
            if path and os.path.exists(path):
                os.remove(path)
        print("🧹 Temporary comparison files cleaned up.")