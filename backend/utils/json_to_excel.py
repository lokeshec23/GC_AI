# utils/json_to_excel.py
from typing import List, Dict
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

def validate_and_convert_to_excel(json_data: List[Dict], output_path: str) -> str:
    """
    Convert validated JSON array to Excel with proper formatting.
    
    Args:
        json_data: List of dicts with keys: major_section, subsection, summary
        output_path: Path to save Excel file
    
    Returns:
        Path to created Excel file
    """
    
    print(f"📊 Converting {len(json_data)} rows to Excel...")
    
    # Create workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Extracted Guidelines"
    
    # Define styles
    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=12)
    section_fill = PatternFill(start_color="E8F4F8", end_color="E8F4F8", fill_type="solid")
    section_font = Font(bold=True, size=11, color="1F4E78")
    
    border_thin = Border(
        left=Side(style='thin', color='CCCCCC'),
        right=Side(style='thin', color='CCCCCC'),
        top=Side(style='thin', color='CCCCCC'),
        bottom=Side(style='thin', color='CCCCCC')
    )
    
    # Write headers
    headers = ["Major Section Title", "Subsection Title", "Summary / Key Requirements"]
    for col_num, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_num)
        cell.value = header
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border = border_thin
    
    # Write data rows
    current_row = 2
    for item in json_data:
        major_section = item.get("major_section", "")
        subsection = item.get("subsection", "")
        summary = item.get("summary", "")
        
        # Write cells
        ws.cell(row=current_row, column=1).value = major_section
        ws.cell(row=current_row, column=2).value = subsection
        ws.cell(row=current_row, column=3).value = summary
        
        # Apply styling
        for col_num in range(1, 4):
            cell = ws.cell(row=current_row, column=col_num)
            cell.border = border_thin
            cell.alignment = Alignment(wrap_text=True, vertical='top')
            
            # Highlight section headers (rows where subsection is empty)
            if major_section and not subsection:
                cell.fill = section_fill
                if col_num == 1:
                    cell.font = section_font
        
        current_row += 1
    
    # Set column widths
    ws.column_dimensions['A'].width = 35
    ws.column_dimensions['B'].width = 35
    ws.column_dimensions['C'].width = 70
    
    # Freeze header row
    ws.freeze_panes = 'A2'
    
    # Save workbook
    wb.save(output_path)
    print(f"✅ Excel file created: {output_path}")
    
    return output_path