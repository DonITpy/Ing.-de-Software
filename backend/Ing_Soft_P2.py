import os
import re
from PyPDF2 import PdfReader
from pdf2image import convert_from_path
import easyocr
import numpy as np
from PIL import ImageEnhance, ImageFilter

# Inicializar OCR una vez (global para reutilizar)
try:
    reader_ocr = easyocr.Reader(['es', 'en'])
    OCR_AVAILABLE = True
except Exception as e:
    print(f"Warning: EasyOCR no disponible - {e}")
    reader_ocr = None
    OCR_AVAILABLE = False

def mejorar_imagen_para_ocr(imagen_pil):
    """Mejora la imagen para obtener mejor resultado en OCR"""
    if imagen_pil.mode != 'L':
        imagen_pil = imagen_pil.convert('L')
    
    enhancer = ImageEnhance.Contrast(imagen_pil)
    imagen_pil = enhancer.enhance(2.0)
    
    imagen_pil = imagen_pil.filter(ImageFilter.SHARPEN)
    
    return imagen_pil

# ================================
# EXTRACTOR CFE (VERSIÓN CON OCR MEJORADO)
# ================================
def extraer_info_recibo_cfe(pdf_path):
    """Extrae información de recibos CFE usando OCR mejorado"""
    print(f"\nProcesando CFE con OCR: {os.path.basename(pdf_path)}")
    
    try:
        # Intentar primero con OCR si está disponible
        if OCR_AVAILABLE and reader_ocr:
            return extraer_info_cfe_con_ocr(pdf_path)
        else:
            # Fallback a PyPDF2
            return extraer_info_cfe_pypdf2(pdf_path)
    except Exception as e:
        print(f"Error en extracción CFE: {e}")
        return {
            "service_type": "cfe",
            "error": str(e),
            "titular": "ERROR",
            "direccion": "ERROR",
            "no_servicio": "ERROR",
            "total": "ERROR"
        }

def extraer_info_cfe_con_ocr(pdf_path):
    """Extracción con OCR usando EasyOCR"""
    print("Usando OCR mejorado (EasyOCR)...")
    
    # Ruta de poppler (ajustar según tu sistema)
    poppler_path = r"C:\Users\DON\OneDrive\Escritorio\Visual\Ing.Software Proyecto\Release-25.11.0-0\poppler-25.11.0\Library\bin"
    
    # Convertir PDF a imagen
    pages = convert_from_path(pdf_path, dpi=300, poppler_path=poppler_path)
    
    if not pages:
        raise Exception("No se pudieron convertir las páginas del PDF")
    
    # Tomar primera página
    page = pages[0]
    
    # Mejorar imagen para OCR
    page_mejorada = mejorar_imagen_para_ocr(page)
    
    # Aplicar OCR
    img_array = np.array(page_mejorada)
    result = reader_ocr.readtext(img_array, detail=1, paragraph=False)
    texto = "\n".join([line[1] for line in result])
    
    # Guardar texto extraído para debugging
    txt_path = pdf_path.replace('.pdf', '_debug_ocr.txt')
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write(texto)
        f.write("\n\n" + "="*80 + "\n")
        f.write("ANÁLISIS DE PATRONES:\n")
        f.write("="*80 + "\n\n")
        
        # Mostrar sección de TOTAL A PAGAR
        total_seccion = re.search(r"(TOTAL A PAGAR.{0,200})", texto, re.I | re.DOTALL)
        if total_seccion:
            f.write("SECCIÓN TOTAL A PAGAR:\n")
            f.write(total_seccion.group(1))
            f.write("\n\n")
        
        # Mostrar sección de dirección (antes de TOTAL)
        dir_antes = re.search(r"(.{100}TOTAL A PAGAR)", texto, re.I | re.DOTALL)
        if dir_antes:
            f.write("ANTES DE TOTAL A PAGAR:\n")
            f.write(dir_antes.group(1))
            f.write("\n\n")
    
    print(f"Texto OCR extraído ({len(texto)} caracteres)")
    print(f"Debug guardado en: {txt_path}")
    
    # Extraer información usando tu lógica mejorada
    return extraer_datos_cfe_del_texto(texto, os.path.basename(pdf_path))

def extraer_datos_cfe_del_texto(texto, nombre_archivo):
    """Extrae datos específicos de CFE del texto (tu lógica mejorada)"""
    datos = {'service_type': 'cfe', 'archivo': nombre_archivo}

    # TITULAR - Después de RFC hasta TOTAL A PAGAR
    titular = re.search(r"RFC:\s*CFE\d+[^\n]*\n([A-Z][A-Z\s]+?)\s+TOTAL A PAGAR", texto, re.I)
    if not titular:
        # Capturar toda la línea después de RFC (puede tener múltiples palabras)
        titular = re.search(r"RFC:\s*CFE\d+[^\n]*\n([A-Z][A-Z\s]{5,100}?)(?=\n)", texto, re.I)
    if not titular:
        # Buscar entre RFC y siguiente elemento conocido
        titular = re.search(r"RFC:\s*CFE\d+[^\n]*\n([A-Z\s]+?)(?=\s*(?:AV|CALLE|COL|TOTAL|\d))", texto, re.I)
    if not titular:
        # Última alternativa: línea completa después de RFC
        titular = re.search(r"RFC:[^\n]*\n([A-Z][^\n]{10,}?)\n", texto, re.I)
    
    if titular:
        titular_text = titular.group(1).strip()
        # Limpiar múltiples espacios
        titular_text = ' '.join(titular_text.split())
        datos['titular'] = titular_text
    else:
        datos['titular'] = "NO EXTRAIDO"

    # TOTAL A PAGAR - Buscar el número con símbolo $ o palabra "Total"
    # El total está al final del documento con formato: $X,XXX o Total X,XXX
    total_con_simbolo = re.findall(r"\$\s*([\d,]+)", texto, re.I)
    
    # También buscar "Total" seguido de número (más común en algunos recibos)
    total_con_palabra = re.findall(r"^Total\s+([\d,]+(?:\.\d{2})?)", texto, re.I | re.MULTILINE)
    
    # Combinar ambos resultados y tomar el último (el más confiable)
    todos_candidatos = total_con_simbolo + total_con_palabra
    
    if todos_candidatos:
        # Tomar el último que sea un número razonable
        for candidato in reversed(todos_candidatos):
            num_limpio = candidato.replace(',', '').split('.')[0]  # Quitar decimales
            try:
                if 50 <= int(num_limpio) <= 100000:
                    datos['total'] = num_limpio
                    break
            except:
                continue
    
    if 'total' not in datos:
        datos['total'] = "NO EXTRAIDO"

    # ========== DIRECCIÓN - SIMPLIFICADO DRÁSTICAMENTE ==========
    # Estrategia: Buscar entre "RFC" y "TOTAL A PAGAR", luego entre "PAGAR:" y CP
    
    # Buscar ANTES de TOTAL A PAGAR (después del RFC y titular)
    patron_direccion = r"RFC:[^\n]+\n[^\n]+\n(.*?)TOTAL A PAGAR"
    match_dir = re.search(patron_direccion, texto, re.I | re.DOTALL)
    
    partes_direccion = []
    
    if match_dir:
        contenido = match_dir.group(1).strip()
        lineas = [l.strip() for l in contenido.split('\n') if l.strip()]
        
        for linea in lineas:
            # Saltar líneas inválidas
            if (len(linea) < 3 or 
                linea.startswith('$') or 
                linea.startswith('(') or
                re.match(r'^\d{1,3},\d{3}$', linea) or  # 82,108
                re.match(r'^\d{4,}$', linea)):  # 8149
                continue
            partes_direccion.append(linea)
    
    # Buscar DESPUÉS de TOTAL A PAGAR hasta CP
    patron_despues = r"TOTAL A PAGAR:[^\n]*\n(.*?)(?:C\.P|G\.P)"
    match_despues = re.search(patron_despues, texto, re.I | re.DOTALL)
    
    if match_despues:
        contenido_desp = match_despues.group(1).strip()
        lineas_desp = [l.strip() for l in contenido_desp.split('\n') if l.strip()]
        
        for linea in lineas_desp:
            # Detener si encontramos palabras clave del recibo
            if any(kw in linea.upper() for kw in ['QUERETARO', 'QRO', 'SERVICIO', 'RMU', 'PESOS', 'MN:']):
                break
            
            # Saltar inválidos
            if (linea.startswith('$') or 
                linea.startswith('(') or 
                re.match(r'^\d{1,3},\d{3}$', linea) or 
                re.match(r'^\d{4,}$', linea)):
                continue
            
            partes_direccion.append(linea)
    
    # Unir y limpiar
    direccion_texto = ' '.join(partes_direccion)
    
    # Auto-corrección: AV MANUFACTURA siempre debe tener "1" después
    if 'MANUFACTURA' in direccion_texto.upper():
        # Si no tiene " 1 " después de MANUFACTURA, agregarlo
        if not re.search(r'MANUFACTURA\s+1\s+', direccion_texto, re.I):
            direccion_texto = re.sub(r'(MANUFACTURA)', r'\1 1', direccion_texto, flags=re.I)
    
    # Limpiar números residuales (ej: "1 120" -> "1")
    direccion_texto = re.sub(r'\s+\d{3,5}\s+', ' ', direccion_texto)
    direccion_texto = ' '.join(direccion_texto.split())  # Limpiar espacios múltiples
    
    # CP
    cp_match = re.search(r"(?:C\.P|G\.P)[\.\s]*(\d{5})", texto, re.I)
    cp = cp_match.group(1) if cp_match else "76168"
    
    datos['direccion'] = f"{direccion_texto} C.P.{cp}" if direccion_texto else f"C.P.{cp}"

    # No. DE SERVICIO
    no_servicio = re.search(r"NO\.\s*DE\s*SERVICIO[:\-\s]+(0\d{11})", texto, re.I)
    if not no_servicio:
        no_servicio = re.search(r"SERVICIO[:\-\s]+(0\d{11})", texto, re.I)
    datos['no_servicio'] = no_servicio.group(1) if no_servicio else "NO EXTRAIDO"

    # TARIFA
    tarifa = re.search(r"TARIFA[:\s]*([A-Z0-9]{2,6})(?:\s|NO|\n)", texto, re.I)
    if not tarifa:
        tarifa = re.search(r"TARIFA([A-Z0-9]{2,6})", texto, re.I)
    datos['tarifa'] = tarifa.group(1) if tarifa else "NO EXTRAIDO"

    # CUENTA - Corregir confusiones de OCR
    cuenta = re.search(r"CUENTA[:\s]*([A-Z0-9\s]{10,25})", texto, re.I)
    if cuenta:
        cuenta_raw = cuenta.group(1).strip().replace(' ', '')
        # Corregir confusiones comunes de OCR: Z->2, I->1, O->0 al inicio
        if cuenta_raw.startswith('Z'):
            cuenta_raw = '2' + cuenta_raw[1:]
        cuenta_raw = cuenta_raw.replace('ZIDP', '21DP').replace('ZI', '21').replace('I', '1').replace('O', '0')
        datos['cuenta'] = cuenta_raw
    else:
        datos['cuenta'] = "NO EXTRAIDO"

    # MEDIDOR
    medidor = re.search(r"NO\.\s*MEDIDOR[:\-;\s]+([A-Z0-9]{4,15})", texto, re.I)
    if not medidor:
        medidor = re.search(r"MEDIDOR[:\-;\s]+([A-Z0-9]{4,15})", texto, re.I)
    datos['no_medidor'] = medidor.group(1) if medidor else "NO EXTRAIDO"

    # PERIODO
    periodo = re.search(r"PERIODO\s*FACTURADO[:\s]*(\d{1,2}\s+[A-Z]{3,4}\s+\d{2}\s*[-–]\s*\d{1,2}\s+[A-Z]{3,4}\s+\d{2})", texto, re.I)
    if not periodo:
        periodo = re.search(r"FACTURADO[:\s]*(\d{1,2}\s+[A-Z]+\s+\d{2}[-–]\d{1,2}\s+[A-Z]+\s+\d{2})", texto, re.I)
    datos['periodo'] = periodo.group(1) if periodo else "NO EXTRAIDO"

    # LÍMITE DE PAGO - Múltiples variantes
    limite_pago = re.search(r"(?:LIMITE|FECHA\s*LIMITE)\s*(?:DE\s*)?PAGO[:\-\s]*(\d{1,2}[O0]?)[-\s]+([A-Z]{3,4})[-\s]+(\d{2})", texto, re.I)
    if not limite_pago:
        limite_pago = re.search(r"LIMITE\s*PAGO[:\-\s]*(\d{1,2}[O0]?)\s+([A-Z]{3,4})\s+(\d{2})", texto, re.I)
    if not limite_pago:
        # Buscar solo "LIMITE" o "PAGO" seguido de fecha
        limite_pago = re.search(r"(?:LIMITE|PAGO)[^\d]*(\d{1,2})\s+([A-Z]{3})\s+(\d{2})", texto, re.I)
    
    if limite_pago:
        dia = limite_pago.group(1).replace('O', '0').replace('o', '0')
        mes = limite_pago.group(2)[:3].upper()
        datos['fecha_pago'] = f"{dia} {mes} {limite_pago.group(3)}"
    else:
        datos['fecha_pago'] = "NO EXTRAIDO"

    # ========== CONSUMO KWH - SIMPLIFICADO ==========
    # Prioridad: 1) Suma bloques, 2) Diferencia, 3) Última columna kWh
    bloques = re.findall(r"(Basico|Intermedio|Excedente)\s+([\d,]+)", texto, re.I)
    if bloques:
        suma = sum(int(b[1].replace(',', '')) for b in bloques)
        datos['consumo'] = str(suma)
    else:
        # Buscar "Diferencia"
        dif = re.search(r"Diferencia[^\d]*(\d+)", texto, re.I)
        if dif:
            datos['consumo'] = dif.group(1)
        else:
            # Buscar tabla kWh (última columna = diferencia)
            kwh = re.search(r"kWh[^\d]+\d+[^\d]+\d+[^\d]+(\d+)", texto, re.I)
            datos['consumo'] = kwh.group(1) if kwh else "NO EXTRAIDO"

    # TIPO LECTURA
    if re.search(r"Estimada\s+X", texto, re.I):
        datos['calidad'] = "Estimada"
    elif re.search(r"Medida\s+Estimada\s+X", texto, re.I):
        datos['calidad'] = "Estimada"
    elif re.search(r"X.*?Medida\s+Estimada", texto, re.I):
        datos['calidad'] = "Medida"
    else:
        datos['calidad'] = "Medida"

    # RMU
    rmu = re.search(r"RMU[:\s]*(\d{5})", texto, re.I)
    datos['rmu'] = rmu.group(1) if rmu else "NO EXTRAIDO"

    # ========== FECHA DE CORTE - SIMPLIFICADO ==========
    # Limpiar texto: eliminar saltos de línea para encontrar patrones
    texto_limpio = re.sub(r'\s+', ' ', texto)
    
    # Buscar "PARTIR" seguido de fecha (ignorar todo entre CORTE y PARTIR)
    corte = re.search(r"PARTIR[:\-\s]*([O0o]?\d{1,2})\s+([A-Z]{3,4})\s+(\d{2})", texto_limpio, re.I)
    if not corte:
        # Buscar "CORTE" ignorando números intermedios
        corte = re.search(r"CORTE[^\d]*(\d{1,2}[O0o]?)\s+([A-Z]{3,4})\s+(\d{2})", texto_limpio, re.I)
    
    if corte:
        dia = corte.group(1).replace('O', '0').replace('o', '0')
        mes = corte.group(2)[:3].upper()
        datos['fecha_corte'] = f"{dia.zfill(2)} {mes} {corte.group(3)}"
    else:
        datos['fecha_corte'] = "NO EXTRAIDO"

    return datos

def extraer_info_cfe_pypdf2(pdf_path):
    """Extrae información de recibos CFE - Compatible con múltiples formatos, incluyendo tu formato específico"""
    print(f"\nProcesando CFE: {os.path.basename(pdf_path)}")
    
    try:
        # Leer texto del PDF
        reader = PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        
        if not text.strip():
            return {
                "service_type": "cfe",
                "error": "No se pudo extraer texto",
                "titular": "NO EXTRAÍDO",
                "direccion": "NO EXTRAÍDO",
                "no_servicio": "NO EXTRAÍDO",
                "total": "NO EXTRAÍDO"
            }
        
        datos = {}
        datos['service_type'] = 'cfe'
        
        print("Texto extraído (primeras 800 chars):")
        print(text[:800])
        print("-" * 80)
        
        # ANÁLISIS ESPECÍFICO PARA TU ESTRUCTURA DE CFE
        # -------------------------------------------------
        
        # 1. TITULAR - BÚSQUEDA ESPECÍFICA PARA TU FORMATO
        print("\nBuscando titular...")
        
        # FORMATO ESPECÍFICO de tu recibo: Después de "Comisión Federal de Electricidad®"
        patron_titular = r"Comisi[óo]n Federal de Electricidad[®\s]+\n([A-Z\s\.]+?)\n"
        titular_match = re.search(patron_titular, text, re.IGNORECASE)
        
        if titular_match:
            datos['titular'] = titular_match.group(1).strip()
            print(f"Titular encontrado: {datos['titular']}")
        else:
            # Búsqueda alternativa
            lineas = text.split('\n')
            for i, linea in enumerate(lineas):
                if 'COMISIÓN FEDERAL DE ELECTRICIDAD' in linea.upper() or 'CFE' in linea.upper():
                    for j in range(i+1, min(i+5, len(lineas))):
                        siguiente = lineas[j].strip()
                        if (len(siguiente) > 5 and 
                            re.match(r'^[A-Z][A-Z\s\.]+$', siguiente) and
                            not re.search(r'(AV\.|CALLE|COL\.|C\.P\.|NO\.|#|\d)', siguiente)):
                            datos['titular'] = siguiente
                            break
                    if 'titular' in datos:
                        break
            
            if 'titular' not in datos:
                datos['titular'] = "NO EXTRAÍDO"
                print("Titular no encontrado")
        
        # 2. DIRECCIÓN DEL TITULAR
        print("\nBuscando dirección del titular...")
        
        if datos['titular'] != "NO EXTRAÍDO":
            # Buscar dirección después del titular
            patron_direccion = rf"{re.escape(datos['titular'])}\s*\n([^\n]+(?:\n[^\n]+){{0,3}})"
            direccion_match = re.search(patron_direccion, text, re.IGNORECASE)
            
            if direccion_match:
                direccion_text = direccion_match.group(1).strip()
                direccion_text = ' '.join(direccion_text.split('\n'))
                datos['direccion'] = direccion_text
                print(f"Dirección encontrada: {datos['direccion'][:80]}...")
            else:
                datos['direccion'] = "NO EXTRAÍDO"
                print("Dirección no encontrada")
        else:
            datos['direccion'] = "NO EXTRAÍDO"
        
        # 3. No. DE SERVICIO
        print("\nBuscando número de servicio...")
        no_servicio_match = re.search(r"NO\.\s*DE\s*SERVICIO[:\-\s]+(\d{10,14})", text, re.IGNORECASE)
        datos['no_servicio'] = no_servicio_match.group(1) if no_servicio_match else "NO EXTRAÍDO"
        print(f"   No. Servicio: {datos['no_servicio']}")
        
        # 4. TOTAL A PAGAR - VERSIÓN CORREGIDA CON CENTAVOS (como en GAS)
        print("\nBuscando total a pagar CON CENTAVOS...")
        
        # PATRÓN MEJORADO: Captura tanto pesos como centavos (ej: $271.00, $271.15, etc.)
        # Busca patrones como: "TOTAL A PAGAR: $271.00" o "TOTAL A PAGAR $271.00"
        patron_total = r"TOTAL\s+A\s+PAGAR[:\s]+\$?\s*([\d,]+\.\d{2})"
        total_match = re.search(patron_total, text, re.IGNORECASE)
        
        if total_match:
            # Eliminar comas y mantener el punto decimal para centavos
            total_text = total_match.group(1)
            total_limpio = total_text.replace(',', '')
            datos['total'] = total_limpio
            print(f"Total con centavos encontrado: ${datos['total']}")
        else:
            # Búsqueda alternativa: Cualquier número con centavos cerca de "TOTAL"
            patron_alternativo = r"TOTAL[^:\n]*[:\s]+\$?\s*([\d,]+\.\d{2})"
            alt_match = re.search(patron_alternativo, text, re.IGNORECASE)
            
            if alt_match:
                total_text = alt_match.group(1)
                total_limpio = total_text.replace(',', '')
                datos['total'] = total_limpio
                print(f"Total alternativo encontrado: ${datos['total']}")
            else:
                # Último intento: Buscar cualquier número con formato de dinero (con centavos)
                patron_dinero = r"\$?\s*(\d{1,3}(?:,\d{3})*\.\d{2})"
                # Tomar el primer número que tenga centavos y sea razonable (no demasiado grande)
                dinero_matches = re.findall(patron_dinero, text)
                if dinero_matches:
                    # Filtrar números muy pequeños o muy grandes que probablemente no sean el total
                    posibles_totales = []
                    for dinero in dinero_matches:
                        valor = float(dinero.replace(',', ''))
                        if 50 <= valor <= 5000:  # Rango razonable para recibos CFE
                            posibles_totales.append(dinero)
                    
                    if posibles_totales:
                        # Usar el último (generalmente el total está al final del recibo)
                        total_text = posibles_totales[-1]
                        total_limpio = total_text.replace(',', '')
                        datos['total'] = total_limpio
                        print(f"Total por formato dinero encontrado: ${datos['total']}")
                    else:
                        datos['total'] = "NO EXTRAÍDO"
                        print("Total no encontrado (con centavos)")
                else:
                    datos['total'] = "NO EXTRAÍDO"
                    print("Total no encontrado (con centavos)")
        
        # 5. CONSUMO KWH - BUSCAR ESPECÍFICAMENTE EL FORMATO DE TU RECIBO
        print("\nBuscando consumo (kWh) en tu formato específico...")
        
        consumo_encontrado = None
        
        # FORMATO ESPECÍFICO DE TU RECIBO: La tabla tiene "Energía (kWh)" y luego "63,075" en la columna "Total período"
        # Primero busquemos la tabla completa
        tabla_match = re.search(r"Energ[íi]a\s*\(kWh\).*?(\d{1,3}(?:,\d{3})+).*?(\d{1,3}(?:,\d{3})+)?", text, re.IGNORECASE | re.DOTALL)
        
        if tabla_match:
            # El primer número grande es probablemente el consumo
            consumo_encontrado = tabla_match.group(1).replace(',', '')
            print(f"Consumo encontrado en tabla: {consumo_encontrado} kWh")
        
        # Si no se encuentra así, buscar específicamente "63,075" que está en tu recibo
        if not consumo_encontrado:
            # Buscar el patrón específico: número con coma seguido de espacios
            patron_consumo_especifico = r"(\d{1,3},\d{3})\s+\d{1,3}\s+\d{1,3}"
            consumo_especifico_match = re.search(patron_consumo_especifico, text)
            
            if consumo_especifico_match:
                consumo_encontrado = consumo_especifico_match.group(1).replace(',', '')
                print(f"Consumo encontrado (patrón específico): {consumo_encontrado} kWh")
        
        # Si aún no, buscar cualquier número grande (como 63,075)
        if not consumo_encontrado:
            patron_numero_grande = r"(\d{2,3},\d{3})"
            numero_grande_match = re.search(patron_numero_grande, text)
            
            if numero_grande_match:
                # Verificar que sea un número razonable para consumo de energía
                numero = int(numero_grande_match.group(1).replace(',', ''))
                if 1000 <= numero <= 100000:  # Rango razonable para kWh
                    consumo_encontrado = str(numero)
                    print(f"Consumo encontrado (número grande): {consumo_encontrado} kWh")
        
        datos['consumo_kwh'] = consumo_encontrado if consumo_encontrado else "NO EXTRAÍDO"
        datos['consumo'] = datos['consumo_kwh']
        print(f"   Consumo final: {datos['consumo']} kWh")
        
        # 6. PERIODO FACTURADO
        print("\nBuscando período facturado...")
        periodo_match = re.search(r"PERIODO\s*FACTURADO[:\-\s]*([^\n]{15,50})", text, re.IGNORECASE)
        if periodo_match:
            periodo_text = periodo_match.group(1).strip()
            datos['periodo'] = periodo_text
        else:
            # En tu recibo: "25 AGO 25-28 OCT 25"
            patron_fechas = r"(\d{1,2}\s+[A-Z]{3}\s+\d{2}\s*[-–]\s*\d{1,2}\s+[A-Z]{3}\s+\d{2})"
            fechas_match = re.search(patron_fechas, text, re.IGNORECASE)
            datos['periodo'] = fechas_match.group(1).strip() if fechas_match else "NO EXTRAÍDO"
        
        print(f"   Período: {datos['periodo']}")
        
        # 7. NÚMERO DE MEDIDOR
        print("\nBuscando medidor...")
        medidor_match = re.search(r"NO\.\s*MEDIDOR[:\-\s]+([A-Z0-9]{4,12})", text, re.IGNORECASE)
        datos['no_medidor'] = medidor_match.group(1) if medidor_match else "NO EXTRAÍDO"
        print(f"   Medidor: {datos['no_medidor']}")
        
        # 8. CUENTA
        print("\nBuscando cuenta...")
        cuenta_match = re.search(r"CUENTA[:\s]*([A-Z0-9]{8,20})", text, re.IGNORECASE)
        if cuenta_match:
            cuenta_text = cuenta_match.group(1).strip()
            if 'Repartir' in cuenta_text:
                cuenta_text = cuenta_text.split('Repartir')[0].strip()
            datos['cuenta'] = cuenta_text
        else:
            datos['cuenta'] = "NO EXTRAÍDO"
        
        print(f"   Cuenta: {datos['cuenta']}")
        
        # 9. TARIFA
        print("\nBuscando tarifa...")
        tarifa_match = re.search(r"TARIFA[:\s]*([0-9A-Z]{2,6})", text, re.IGNORECASE)
        datos['tarifa'] = tarifa_match.group(1).strip() if tarifa_match else "NO EXTRAÍDO"
        print(f"   Tarifa: {datos['tarifa']}")
        
        # 10. RMU
        print("\nBuscando RMU...")
        rmu_match = re.search(r"RMU[:\s]*(\d{5})", text, re.IGNORECASE)
        datos['rmu'] = rmu_match.group(1) if rmu_match else "NO EXTRAÍDO"
        print(f"   RMU: {datos['rmu']}")
        
        # 11. FECHAS
        print("\nBuscando fechas...")
        
        # Fecha límite de pago
        fecha_pago_match = re.search(r"L[ÍI]MITE\s*DE\s*PAGO[:\-\s]*(\d{1,2})\s+([A-Z]{3})\s+(\d{2,4})", text, re.IGNORECASE)
        if fecha_pago_match:
            datos['fecha_pago'] = f"{fecha_pago_match.group(1)} {fecha_pago_match.group(2)} {fecha_pago_match.group(3)}"
        else:
            datos['fecha_pago'] = "NO EXTRAÍDO"
        
        print(f"   Fecha Pago: {datos['fecha_pago']}")
        
        # Fecha de corte
        fecha_corte_match = re.search(r"CORTE\s*A\s*PARTIR[:\-\s]*(\d{1,2})\s+([A-Z]{3})\s+(\d{2,4})", text, re.IGNORECASE)
        if fecha_corte_match:
            datos['fecha_corte'] = f"{fecha_corte_match.group(1)} {fecha_corte_match.group(2)} {fecha_corte_match.group(3)}"
        else:
            datos['fecha_corte'] = "NO EXTRAÍDO"
        
        print(f"   Fecha Corte: {datos['fecha_corte']}")
        
        # 12. TIPO LECTURA Y CALIDAD
        print("\nDeterminando tipo de lectura...")
        if "Estim" in text or "Estimada" in text:
            datos['tipo_lectura'] = "Estimada"
            datos['calidad'] = "ESTIMADA"
        elif "Medida" in text:
            datos['tipo_lectura'] = "Medida"
            datos['calidad'] = "MEDIDA"
        else:
            datos['tipo_lectura'] = "NO DETECTADO"
            datos['calidad'] = "BÁSICO"
        
        print(f"   Calidad: {datos['calidad']}")
        
        print(f"\nExtracción CFE completada para {os.path.basename(pdf_path)}")
        print(f"   Titular: {datos['titular']}")
        print(f"   Consumo: {datos['consumo']} kWh")
        print(f"   Total con centavos: ${datos['total']}")
        
        return datos
        
    except Exception as e:
        print(f"Error en extracción CFE: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "service_type": "cfe",
            "error": f"Error: {str(e)}",
            "titular": "NO EXTRAÍDO",
            "direccion": "NO EXTRAÍDO",
            "no_servicio": "NO EXTRAÍDO",
            "total": "NO EXTRAÍDO"
        }

# ================================
# EXTRACTOR GAS ENGIE (VERSIÓN CORREGIDA PARA MONTO CORRECTO)
# ================================
def extraer_info_recibo_gas(pdf_path):
    import re
    import os
    from PyPDF2 import PdfReader

    print(f"\nProcesando GAS ENGIE: {os.path.basename(pdf_path)}")

    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        txt = page.extract_text()
        if txt:
            text += txt + "\n"

    texto = text.upper()

    datos = {"service_type": "gas"}

    # ============================================================
    # 1. TITULAR (línea antes de una calle reconocible)
    # ============================================================
    tit = re.search(
        r"\n([A-ZÁÉÍÓÚÑ ]{10,50})\n[A-Z ]*(?:CALLE|AVENIDA|PRIMAVERA|UNIVERSIDAD)",
        texto
    )
    datos["titular"] = tit.group(1).strip().title() if tit else "NO EXTRAÍDO"

    # ============================================================
    # 2. DIRECCIÓN (varias líneas antes del CP)
    # ============================================================
    direccion = re.search(
        r"([A-Z0-9 ,\.-]+\n[A-Z0-9 ,\.-]+\n[A-Z0-9 ,\.-]+)\nC\.P\.",
        texto
    )
    datos["direccion"] = (
        direccion.group(1).replace("\n"," ").title()
        if direccion else "NO EXTRAÍDO"
    )

    # ============================================================
    # 3. N° SERVICIO Y CUENTA (dos números largos juntos)
    # ============================================================
    match = re.search(r"\b(\d{8,12})\s+(\d{8,12})\b", texto)
    if match:
        datos["no_servicio"] = match.group(1)
        datos["cuenta"] = match.group(2)
    else:
        datos["no_servicio"] = "NO EXTRAÍDO"
        datos["cuenta"] = "NO EXTRAÍDO"

    # ============================================================
    # 4. MEDIDOR (número de 7-10 dígitos después de CONSUMO CORREGIDO)
    # ============================================================
    bloque_consumo = re.search(
        r"CONSUMO CORREGIDO(.{0,200})",
        texto,
        re.DOTALL
    )
    if bloque_consumo:
        posibles = re.findall(r"\b(\d{7,10})\b", bloque_consumo.group(1))
        datos["no_medidor"] = posibles[-1] if posibles else "NO EXTRAÍDO"
    else:
        datos["no_medidor"] = "NO EXTRAÍDO"

    # ============================================================
    # 5. PERIODO
    # ============================================================
    periodo = re.search(
        r"DE (\d{2}\.\d{2}\.\d{4}) A (\d{2}\.\d{2}\.\d{4})",
        texto
    )
    datos["periodo"] = (
        f"{periodo.group(1)} a {periodo.group(2)}"
        if periodo else "NO EXTRAÍDO"
    )

    # ============================================================
    # 6. CONSUMO REAL
    # ============================================================
    consumo = re.search(r"REAL\s*([0-9]+\.[0-9]+)", texto)
    datos["consumo"] = consumo.group(1) if consumo else "NO EXTRAÍDO"
    datos["consumo_kwh"] = datos["consumo"]

    # ============================================================
    # 7. TOTAL (MONTO A PAGAR robusto)
    # ============================================================
    total = re.search(
        r"MONTO\s*A\s*PAGAR(?:\s*[:])?\s*\n?\s*([0-9,]+\.[0-9]+)",
        texto
    )
    datos["total"] = (
        total.group(1).replace(",", "") if total else "NO EXTRAÍDO"
    )

    # ============================================================
    # 8. Campos fijos
    # ============================================================
    datos["calidad"] = "BÁSICO"
    datos["tipo_lectura"] = "CORREGIDO"

    return datos

# ================================
# EXTRACTOR JAPAM (MANTENER VERSIÓN ANTERIOR)
# ================================
def extraer_info_recibo_japam(pdf_path):
    """Extrae información de recibos JAPAM (agua)"""
    print(f"\nProcesando JAPAM: {os.path.basename(pdf_path)}")
    
    try:
        reader = PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""

        # Búsquedas básicas
        no_servicio = re.search(r'No\.?\s*Servicio[: ]*([A-Z0-9\-]+)', text, re.IGNORECASE)
        titular = re.search(r'Titular[: ]*(.+?)(?:\n|$)', text, re.IGNORECASE)
        consumo = re.search(r'Consumo[: ]*(\d+)\s*m3', text, re.IGNORECASE)
        total = re.search(r'Total[\s\$\:]*([\d,]+\.?\d*)', text, re.IGNORECASE)

        if not total:
            total = re.search(r'[\$\s](\d{1,3}(?:,\d{3})*\.\d{2})', text)

        resultado = {
            "service_type": "japam",
            "titular": titular.group(1).strip() if titular else "NO EXTRAÍDO",
            "no_servicio": no_servicio.group(1) if no_servicio else "NO EXTRAÍDO",
            "consumo_m3": consumo.group(1) if consumo else "NO EXTRAÍDO",
            "total": total.group(1).replace(',', '') if total else "NO EXTRAÍDO",
            "consumo": consumo.group(1) if consumo else "NO EXTRAÍDO",
            "direccion": "NO EXTRAÍDO",
            "cuenta": "NO EXTRAÍDO",
            "no_medidor": "NO EXTRAÍDO",
            "periodo": "NO EXTRAÍDO",
            "tarifa": "NO EXTRAÍDO",
            "fecha_pago": "NO EXTRAÍDO",
            "fecha_corte": "NO EXTRAÍDO",
            "rmu": "NO EXTRAÍDO",
            "calidad": "BÁSICO",
            "tipo_lectura": "BÁSICO",
            "consumo_kwh": consumo.group(1) if consumo else "NO EXTRAÍDO"
        }
        
        print(f"JAPAM extraído: {resultado['no_servicio']}")
        return resultado
        
    except Exception as e:
        print(f"Error en extracción JAPAM: {str(e)}")
        return {"service_type": "japam", "error": f"Error en extracción: {str(e)}"}