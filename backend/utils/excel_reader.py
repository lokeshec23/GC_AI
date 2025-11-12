# backend/utils/excel_reader.py

import pandas as pd
from typing import List, Dict

def read_excel_to_json(file_path: str, file_label: str = "") -> List[Dict]:
    """
    Reads an Excel file from the given path and converts its first sheet
    into a list of dictionaries, where each dictionary represents a row.

    This function is robust and handles common issues like empty cells (NaN).

    Args:
        file_path: The full path to the .xlsx or .xls file.
        file_label: An optional label to identify the source file in logs.

    Returns:
        A list of dictionaries. Returns an empty list if the file is empty or an error occurs.
    """
    try:
        if not file_path:
            raise ValueError("File path cannot be empty.")
            
        print(f"📖 Reading Excel file: {file_label or file_path}")
        
        # Use pandas to read the Excel file, which is robust and fast.
        # `engine='openpyxl'` is specified for modern .xlsx files.
        df = pd.read_excel(file_path, engine='openpyxl')
        
        # Replace any pandas-specific NaN (Not a Number) values with empty strings
        # for clean JSON conversion and to prevent errors.
        df = df.fillna('')
        
        print(f"   - Found {len(df.columns)} columns and {len(df)} rows.")
        
        # Convert the DataFrame to a list of dictionaries ('records' format).
        # This is the most common and useful format for JSON.
        data = df.to_dict('records')
        
        # Final cleanup: ensure all values are strings to prevent type issues.
        # This is important as some cells might be read as numbers or dates.
        cleaned_data = []
        for row in data:
            cleaned_row = {str(key).strip(): str(value).strip() for key, value in row.items()}
            cleaned_data.append(cleaned_row)
        
        print(f"   ✅ Successfully processed {len(cleaned_data)} rows.")
        return cleaned_data
        
    except FileNotFoundError:
        print(f"   ❌ Error: File not found at path: {file_path}")
        raise
    except Exception as e:
        print(f"   ❌ An unexpected error occurred while reading Excel file '{file_label}': {e}")
        # Re-raise the exception so the calling process can handle it.
        raise