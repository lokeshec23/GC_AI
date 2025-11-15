# backend/compare/processor.py

import os
import json
import tempfile
import asyncio
import traceback
from typing import List, Dict, Tuple
from utils.excel_reader import read_excel_to_json
from utils.llm_provider import LLMProvider
from utils.json_to_excel import dynamic_json_to_excel
from utils.progress import update_progress


async def process_comparison_background(
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
    Async background task for comparing two Excel files using parallel LLM processing.
    Matches the ingestion architecture with full parallelization.
    """
    excel_path = None
    try:
        print(f"\n{'='*60}")
        print(f"Parallel comparison started for session {session_id[:8]}")
        print(f"File 1: {file1_name}")
        print(f"File 2: {file2_name}")
        print(f"Model: {model_provider}/{model_name}")
        print(f"{'='*60}\n")

        # Step 1: Read and Align Excel Data
        update_progress(session_id, 10, "Reading and aligning guideline data...")
        data1 = await asyncio.to_thread(read_excel_to_json, file1_path, "Guideline 1")
        data2 = await asyncio.to_thread(read_excel_to_json, file2_path, "Guideline 2")
        
        aligned_data = align_guideline_data(data1, data2)
        print(f"Aligned {len(aligned_data)} rule pairs for comparison.")
        
        # Step 2: Create Comparison Chunks
        # Adjust chunk size based on model capacity
        chunk_size = user_settings.get("comparison_chunk_size", 10)
        comparison_chunks = create_comparison_chunks(aligned_data, chunk_size=chunk_size)
        num_chunks = len(comparison_chunks)
        
        if num_chunks == 0:
            raise ValueError("No data available for comparison after alignment.")
            
        update_progress(session_id, 30, f"Prepared {num_chunks} comparison chunks.")

        # Step 3: Initialize LLM Provider
        update_progress(session_id, 40, f"Initializing {model_provider} LLM...")
        llm = initialize_llm_provider_for_compare(user_settings, model_provider, model_name)
        
        # Step 4: Parallel LLM Comparison
        update_progress(session_id, 45, f"Running {num_chunks} chunks in full parallel with {model_name}...")
        
        # System prompt for comparison task
        system_prompt = create_comparison_system_prompt()
        full_custom_prompt = f"{system_prompt}\n\n{custom_prompt}"
        
        results, failed = await run_parallel_comparison(
            llm, comparison_chunks, full_custom_prompt, session_id, num_chunks
        )
        
        # Step 5: Generate Excel Output
        update_progress(session_id, 90, "Converting comparison results to Excel...")
        excel_path = tempfile.NamedTemporaryFile(
            delete=False, 
            suffix=".xlsx", 
            prefix=f"comparison_{session_id[:8]}_"
        ).name
        dynamic_json_to_excel(results, excel_path)
        
        update_progress(session_id, 100, "Processing complete.")
        print(f"{'='*60}\nPARALLEL COMPARISON COMPLETE\n{'='*60}")
        
        # Update progress store with results
        from utils.progress import progress_store, progress_lock
        with progress_lock:
            progress_store[session_id].update({
                "excel_path": excel_path,
                "preview_data": results,
                "filename": f"comparison_{os.path.basename(file1_name).split('.')[0]}_vs_{os.path.basename(file2_name).split('.')[0]}.xlsx",
                "status": "completed",
                "total_chunks": num_chunks,
                "failed_chunks": failed,
            })
    
    except Exception as e:
        error_msg = str(e)
        print(f"\nCritical error: {error_msg}\n")
        traceback.print_exc()
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
                print("Temporary comparison files cleaned up.")


async def run_parallel_comparison(
    llm: LLMProvider,
    comparison_chunks: List[List[Dict]],
    custom_prompt: str,
    session_id: str,
    total_chunks: int
) -> Tuple[List[Dict], int]:
    """
    Processes all comparison chunks in parallel using asyncio.gather.
    Returns aggregated results and failed count.
    """
    results = []
    failed_count = 0
    completed = 0
    lock = asyncio.Lock()
    
    async def handle_chunk(idx: int, chunk: List[Dict]):
        nonlocal results, failed_count, completed
        chunk_text = format_chunk_for_prompt(chunk)
        prompt = f"{custom_prompt}\n\n### COMPARISON DATA CHUNK ###\n{chunk_text}"
        
        try:
            # Run LLM generation in thread pool to avoid blocking
            response = await asyncio.to_thread(llm.generate, prompt)
            parsed = parse_comparison_response(response, idx + 1)
            if parsed:
                async with lock:
                    results.extend(parsed)
        except Exception as e:
            failed_count += 1
            print(f"Chunk {idx+1} failed: {e}")
        finally:
            completed += 1
            progress = 45 + int((completed / total_chunks) * 45)
            update_progress(session_id, progress, f"Processed {completed}/{total_chunks} chunk(s)")
    
    # Launch all comparison tasks at once (full parallelization)
    await asyncio.gather(*(handle_chunk(i, chunk) for i, chunk in enumerate(comparison_chunks)))
    
    return results, failed_count


def initialize_llm_provider_for_compare(user_settings: dict, provider: str, model: str) -> LLMProvider:
    """
    Initializes LLM provider with settings optimized for comparison tasks.
    """
    llm_params = {
        "temperature": user_settings.get("temperature", 0.3),  # Lower temperature for consistency
        "max_tokens": user_settings.get("max_output_tokens", 8192),
        "top_p": user_settings.get("top_p", 0.95),
        "stop_sequences": user_settings.get("stop_sequences", []),
    }

    if provider == "openai":
        api_key = user_settings.get("openai_api_key")
        endpoint = user_settings.get("openai_endpoint")
        deployment = user_settings.get("openai_deployment")
        if not all([api_key, endpoint, deployment]):
            raise ValueError("Azure OpenAI credentials are not fully configured.")
        return LLMProvider(
            provider=provider, 
            api_key=api_key, 
            model=model, 
            azure_endpoint=endpoint, 
            azure_deployment=deployment, 
            **llm_params
        )

    elif provider == "gemini":
        api_key = user_settings.get("gemini_api_key")
        if not api_key:
            raise ValueError("Gemini API key is not configured.")
        return LLMProvider(
            provider=provider, 
            api_key=api_key, 
            model=model, 
            **llm_params
        )
        
    else:
        raise ValueError(f"Unsupported provider specified: {provider}")


def create_comparison_system_prompt() -> str:
    """
    Creates a structured system prompt for guideline comparison tasks.
    """
    return """You are an expert mortgage guideline analyst specializing in comparing policy documents.
Your task is to analyze pairs of guidelines and identify:
1. Changes in requirements or thresholds
2. New additions or removals
3. Modified conditions or criteria
4. Impact assessment of changes

For each comparison, provide:
- Category and Attribute identification
- Clear summary of both guidelines
- Specific changes detected
- Business impact assessment

Output must be a valid JSON array of objects with consistent structure.
Be precise, factual, and highlight material differences."""


def parse_comparison_response(response: str, chunk_num: int) -> List[Dict]:
    """
    Parses and validates LLM response for comparison data.
    """
    import re
    cleaned = response.strip()
    
    # Find JSON array in response
    match = re.search(r"(\[.*\])", cleaned, re.DOTALL)
    if not match:
        print(f"No JSON array found in chunk {chunk_num} response")
        return []
    
    try:
        data = json.loads(match.group(0))
        if isinstance(data, list) and all(isinstance(item, dict) for item in data):
            return data
        print(f"Invalid data structure in chunk {chunk_num}")
        return []
    except json.JSONDecodeError as e:
        print(f"JSON parse error in chunk {chunk_num}: {e}")
        return []


def align_guideline_data(data1: List[Dict], data2: List[Dict]) -> List[Dict]:
    """
    Aligns two guideline datasets based on Category and Attribute matching.
    """
    aligned = []
    
    # Create lookup map for second dataset (case-insensitive)
    map2 = {}
    for item in data2:
        key = (
            item.get('Category', '').strip().lower(), 
            item.get('Attribute', '').strip().lower()
        )
        map2[key] = item

    # Process first dataset and find matches
    for item1 in data1:
        key = (
            item1.get('Category', '').strip().lower(), 
            item1.get('Attribute', '').strip().lower()
        )
        item2 = map2.pop(key, None)
        aligned.append({
            "guideline1": item1, 
            "guideline2": item2
        })
        
    # Add remaining items from guideline 2 (new additions)
    for item2 in map2.values():
        aligned.append({
            "guideline1": None, 
            "guideline2": item2
        })
        
    return aligned


def create_comparison_chunks(aligned_data: List[Dict], chunk_size: int = 10) -> List[List[Dict]]:
    """
    Splits aligned data into optimally sized chunks for parallel processing.
    """
    if chunk_size <= 0:
        chunk_size = 10  # Default fallback
        
    chunks = []
    for i in range(0, len(aligned_data), chunk_size):
        chunk = aligned_data[i:i + chunk_size]
        if chunk:  # Only add non-empty chunks
            chunks.append(chunk)
    
    return chunks


def format_chunk_for_prompt(chunk: List[Dict]) -> str:
    """
    Formats comparison chunk data for LLM processing with full context.
    """
    comparison_pairs = []
    
    for idx, pair in enumerate(chunk, 1):
        item1 = pair.get("guideline1")
        item2 = pair.get("guideline2")
        
        # Structure data for clear comparison
        comparison_entry = {
            "comparison_id": idx,
            "guideline_1": item1 if item1 else {"status": "Not present in Guideline 1"},
            "guideline_2": item2 if item2 else {"status": "Not present in Guideline 2"}
        }
        comparison_pairs.append(comparison_entry)
        
    return json.dumps(comparison_pairs, indent=2)