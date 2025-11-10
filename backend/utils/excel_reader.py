# backend/utils/excel_reader.py

import pandas as pd
from typing import List, Dict

def read_excel_to_text(file_path: str, file_label: str) -> str:
    """
    Reads an Excel file and converts its content into a structured text format
    that is easy for an LLM to understand.

    Args:
        file_path: The path to the Excel file.
        file_label: A label for this file (e.g., "Guideline 1").

    Returns:
        A string containing the formatted text representation of the Excel data.
    """
    try:
        print(f"📖 Reading Excel file for comparison: {file_path}")
        
        df = pd.read_excel(file_path, engine='openpyxl')
        df = df.fillna('')  # Replace NaN with empty strings for clean output

        # Convert dataframe to a markdown-like string format
        text_representation = f"--- {file_label} ---\n\n"
        
        for index, row in df.iterrows():
            text_representation += f"Item {index + 1}:\n"
            for col in df.columns:
                cell_value = str(row[col]).strip()
                if cell_value:  # Only include non-empty cells
                    text_representation += f"- {col}: {cell_value}\n"
            text_representation += "\n"

        print(f"✅ Converted {file_label} to text ({len(df)} rows).")
        return text_representation

    except Exception as e:
        print(f"❌ Error reading Excel file '{file_label}': {e}")
        raise ValueError(f"Could not process Excel file: {file_label}")