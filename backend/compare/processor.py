# backend/compare/processor.py

import os
import json
import tempfile
import re
from typing import List, Dict

# Local utilities
from utils.excel_reader import read_excel_to_json
from utils.llm_provider import LLMProvider
from utils.json_to_excel import dynamic_json_to_excel
from utils.progress import update_progress

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
    """
    The main background task for comparing two Excel files using a map-reduce strategy
    to handle large documents and avoid token limits.
    """
    excel_path = None
    
    try:
        print(f"\n{'='*60}")
        print(f"🔄 Comparison Process Started for Session: {session_id[:8]}")
        print(f"📄 File 1 (Base): {file1_name}")
        print(f"📄 File 2 (New): {file2_name}")
        print(f"🤖 Model Provider: {model_provider}/{model_name}")
        print(f"{'='*60}\n")

        # --- STEP 1: Read and Align Excel Data ---
        update_progress(session_id, 10, "Reading and aligning guideline data...")
        data1 = read_excel_to_json(file1_path, file_label="Guideline 1")
        data2 = read_excel_to_json(file2_path, file_label="Guideline 2")
        
        aligned_data = align_guideline_data(data1, data2)
        print(f"✅ Aligned {len(aligned_data)} rule pairs for comparison.")
        
        # --- STEP 2: Chunk the Aligned Data ---
        comparison_chunks = create_comparison_chunks(aligned_data, chunk_size=15) # Process 15 rule pairs at a time
        num_chunks = len(comparison_chunks)
        print(f"✅ Created {num_chunks} chunks for LLM processing.")
        update_progress(session_id, 30, f"Prepared {num_chunks} comparison chunks.")

        # --- STEP 3: LLM Comparison (Map Step) ---
        update_progress(session_id, 40, f"Initializing {model_provider} LLM...")
        llm = initialize_llm_provider_for_compare(user_settings, model_provider, model_name)
        
        update_progress(session_id, 45, f"Comparing {num_chunks} chunk(s) with LLM...")
        
        all_comparison_results = []
        for idx, chunk in enumerate(comparison_chunks):
            print(f"\n{'─'*50}\nProcessing comparison chunk {idx+1}/{num_chunks}...")
            
            chunk_text = format_chunk_for_prompt(chunk)
            full_prompt = f"{custom_prompt}\n\n### DATA CHUNK TO COMPARE ###\n{chunk_text}"
            
            try:
                response = llm.generate(full_prompt)
                parsed_items = parse_llm_json_response_for_compare(response)
                if parsed_items:
                    all_comparison_results.extend(parsed_items)
            except Exception as e:
                print(f"   ❌ Error processing comparison chunk {idx+1}: {str(e)}")
                continue

            progress_pct = 45 + int(((idx + 1) / num_chunks) * 45)
            update_progress(session_id, progress_pct, f"Compared {idx+1}/{num_chunks} chunk(s)")

        # --- STEP 4: Generate Excel (Reduce Step) ---
        update_progress(session_id, 92, "Generating final comparison report...")
        
        excel_path = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx", prefix=f"comparison_{session_id[:8]}_").name
        # The keys from the LLM's JSON will match the desired Excel columns
        dynamic_json_to_excel(all_comparison_results, excel_path)
        
        update_progress(session_id, 95, "✅ Comparison Excel file generated.")

        # --- STEP 5: Finalize ---
        update_progress(session_id, 100, "✅ Comparison complete!")
        print(f"{'='*60}\n✅ COMPARISON COMPLETE\n{'='*60}")
        
        from utils.progress import progress_store, progress_lock
        with progress_lock:
            if session_id in progress_store:
                progress_store[session_id].update({
                    "excel_path": excel_path,
                    "preview_data": all_comparison_results,
                    "filename": f"comparison_results.xlsx",
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


def initialize_llm_provider_for_compare(user_settings: dict, provider: str, model: str) -> LLMProvider:
    """
    Helper function to initialize the LLM provider for the compare feature.
    This function is now guaranteed to return an LLMProvider instance or raise an error.
    """
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
            raise ValueError("Azure OpenAI credentials are not fully configured.")
        return LLMProvider(provider=provider, api_key=api_key, model=model, azure_endpoint=endpoint, azure_deployment=deployment, **llm_params)

    elif provider == "gemini":
        api_key = user_settings.get("gemini_api_key")
        if not api_key:
            raise ValueError("Gemini API key is not configured.")
        return LLMProvider(provider=provider, api_key=api_key, model=model, **llm_params)
        
    else:
        raise ValueError(f"Unsupported provider specified: {provider}")


def parse_llm_json_response_for_compare(response: str) -> List[Dict]:
    """Robustly parses a JSON response from an LLM for the compare feature."""
    print(f"   📥 Parsing LLM comparison response (length: {len(response)} chars)...")
    
    json_start_pos = response.find('[')
    if json_start_pos == -1:
        print("   ⚠️ No JSON array start character ('[') found.")
        return []

    json_str_candidate = response[json_start_pos:]

    try:
        decoder = json.JSONDecoder()
        data, _ = decoder.raw_decode(json_str_candidate)
        
        if isinstance(data, list) and all(isinstance(item, dict) for item in data):
            print(f"   ✅ Successfully decoded {len(data)} items.")
            return data
        
        print("   ⚠️ Parsed data is not a list of dictionaries.")
        return []
    except json.JSONDecodeError:
        print("   ❌ JSON parse error during comparison.")
        return []


def align_guideline_data(data1: List[Dict], data2: List[Dict]) -> List[Dict]:
    """Aligns two lists of guideline data based on 'Attribute' and 'Category'."""
    aligned = []
    # Use a case-insensitive key for matching
    map2 = { (item.get('Category', '').strip().lower(), item.get('Attribute', '').strip().lower()): item for item in data2 }

    for item1 in data1:
        key = (item1.get('Category', '').strip().lower(), item1.get('Attribute', '').strip().lower())
        item2 = map2.pop(key, None)
        aligned.append({"guideline1": item1, "guideline2": item2})
        
    # Add any remaining items from guideline 2 (newly added rules)
    for item2 in map2.values():
        aligned.append({"guideline1": None, "guideline2": item2})
        
    return aligned


def create_comparison_chunks(aligned_data: List[Dict], chunk_size: int = 15) -> List[List[Dict]]:
    """Splits the list of aligned data pairs into smaller chunks."""
    return [aligned_data[i:i + chunk_size] for i in range(0, len(aligned_data), chunk_size)]


def format_chunk_for_prompt(chunk: List[Dict]) -> str:
    """
    Formats a small chunk of aligned data into a rich JSON string for the LLM,
    passing all original data for maximum context.
    """
    comparison_pairs = []
    for pair in chunk:
        item1 = pair["guideline1"]
        item2 = pair["guideline2"]
        
        # Pass the full, original row data to the LLM
        comparison_pairs.append({
            "guideline_1_data": item1 if item1 else "Not present",
            "guideline_2_data": item2 if item2 else "Not present"
        })
        
    return json.dumps(comparison_pairs, indent=2)