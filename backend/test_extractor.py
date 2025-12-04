import sys
import os

# Agregar la ruta actual al path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from Ing_Soft_P2 import extraer_info_recibo_cfe, extraer_info_recibo_gas

def test_extractor(pdf_path):
    """Prueba específica para ver qué está extrayendo"""
    print(f"\n{'='*60}")
    print(f"TESTEANDO: {os.path.basename(pdf_path)}")
    print('='*60)
    
    # Leer texto crudo primero
    from PyPDF2 import PdfReader
    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""
    
    print("\nTEXTO EXTRAÍDO (primeras 1000 caracteres):")
    print('-'*60)
    print(text[:1000])
    print('-'*60)
    
    # Detectar tipo
    if 'CFE' in text.upper() or 'ELECTRICIDAD' in text.upper():
        print("\nDETECTADO: CFE")
        resultado = extraer_info_recibo_cfe(pdf_path)
    elif 'ENGIE' in text.upper() or 'TRACTEBEL' in text.upper() or 'GAS' in text.upper():
        print("\nDETECTADO: GAS")
        resultado = extraer_info_recibo_gas(pdf_path)
    else:
        print("\nNO SE PUDO DETECTAR")
        return
    
    print("\nRESULTADOS DE EXTRACCIÓN:")
    print('-'*60)
    for key, value in resultado.items():
        print(f"{key:20}: {str(value)[:80]}")
    print('='*60)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        pdf_path = sys.argv[1]
    else:
        # Usar archivos de ejemplo
        pdf_path = input("Introduce la ruta al PDF: ").strip()
    
    if os.path.exists(pdf_path):
        test_extractor(pdf_path)
    else:
        print(f"Archivo no encontrado: {pdf_path}")