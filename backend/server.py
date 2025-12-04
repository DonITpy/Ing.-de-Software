from flask import Flask, request, jsonify 
from flask_cors import CORS
import os
from werkzeug.utils import secure_filename
from PyPDF2 import PdfReader
import re

# Importar extractores
from Ing_Soft_P2 import extraer_info_recibo_cfe, extraer_info_recibo_japam, extraer_info_recibo_gas

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"pdf"}

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --------------------------
# DETECTAR TIPO DE SERVICIO MEJORADO
# --------------------------
def detect_service_type(text):
    text_upper = text.upper()
    
    # Detección más robusta
    if 'CFE' in text_upper or 'COMISIÓN FEDERAL DE ELECTRICIDAD' in text_upper:
        return "cfe"
    elif 'ELECTRICIDAD' in text_upper or 'ELECTRICA' in text_upper:
        return "cfe"
    elif 'KWH' in text_upper or 'KILOWATT' in text_upper:
        return "cfe"
    elif 'SUMINISTRO ELÉCTRICO' in text_upper:
        return "cfe"
    
    # JAPAM - Agua
    elif 'JAPAM' in text_upper or 'JUNTA DE AGUA' in text_upper:
        return "japam"
    elif 'AGUA POTABLE' in text_upper or 'SERVICIO DE AGUA' in text_upper:
        return "japam"
    elif 'M3' in text_upper and 'AGUA' in text_upper:
        return "japam"
    elif 'METROS CÚBICOS' in text_upper and 'CONSUMO' in text_upper:
        return "japam"
    
    # Gas
    elif 'GAS' in text_upper and ('NATURAL' in text_upper or 'LP' in text_upper or 'PROPANO' in text_upper):
        return "gas"
    elif 'ENGIE' in text_upper:
        return "gas"
    elif 'TRACTEBEL' in text_upper:
        return "gas"
    elif 'COMBUSTIBLE' in text_upper:
        return "gas"
    
    # Si no se detecta claramente, buscar por patrones específicos
    lines = text_upper.split('\n')
    for line in lines:
        if 'CFE' in line:
            return "cfe"
        elif 'JAPAM' in line:
            return "japam"
        elif 'GAS' in line:
            return "gas"
    
    # Último recurso: buscar palabras clave en todo el texto
    cfe_keywords = ['CFE', 'ELECTRICIDAD', 'KWH', 'TARIFA', 'MEDIDOR']
    japam_keywords = ['JAPAM', 'AGUA', 'M3', 'CAUDAL', 'HIDRANTE']
    gas_keywords = ['GAS', 'ENGIE', 'PROPANO', 'BUTANO', 'COMBUSTIBLE']
    
    cfe_count = sum(1 for keyword in cfe_keywords if keyword in text_upper)
    japam_count = sum(1 for keyword in japam_keywords if keyword in text_upper)
    gas_count = sum(1 for keyword in gas_keywords if keyword in text_upper)
    
    if cfe_count > japam_count and cfe_count > gas_count:
        return "cfe"
    elif japam_count > cfe_count and japam_count > gas_count:
        return "japam"
    elif gas_count > cfe_count and gas_count > japam_count:
        return "gas"
    
    return "unknown"

# --------------------------
# UPLOAD ENDPOINT
# --------------------------
@app.route('/api/upload', methods=['POST'])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No se encontró archivo"}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "Archivo inválido"}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        try:
            # Leer texto básico para detección de servicio
            print(f"\nSubiendo archivo: {filename}")
            reader = PdfReader(filepath)
            text = ""
            for page in reader.pages:
                text += page.extract_text() or ""

            service_type = detect_service_type(text)
            print(f"Servicio detectado: {service_type}")

            # Si no se detecta, intentar con nombre de archivo
            if service_type == "unknown":
                filename_upper = filename.upper()
                if 'CFE' in filename_upper or 'LUZ' in filename_upper or 'ELECTRICIDAD' in filename_upper:
                    service_type = "cfe"
                elif 'JAPAM' in filename_upper or 'AGUA' in filename_upper:
                    service_type = "japam"
                elif 'GAS' in filename_upper or 'ENGIE' in filename_upper:
                    service_type = "gas"
                print(f"Servicio detectado por nombre de archivo: {service_type}")

            if service_type == "cfe":
                print("Usando extractor de CFE...")
                datos = extraer_info_recibo_cfe(filepath)
                datos["service_type"] = "cfe"
            elif service_type == "japam":
                print("Usando extractor de JAPAM...")
                datos = extraer_info_recibo_japam(filepath)
            elif service_type == "gas":
                print("Usando extractor de GAS...")
                datos = extraer_info_recibo_gas(filepath)
            else:
                # Intentar con CFE como fallback
                print("Servicio desconocido, intentando con CFE...")
                try:
                    datos = extraer_info_recibo_cfe(filepath)
                    datos["service_type"] = "cfe"
                except:
                    datos = {
                        "service_type": "unknown", 
                        "error": "No se pudo identificar el servicio", 
                        "filename": filename,
                        "texto_preview": text[:500]
                    }
                print(f"Servicio desconocido: {filename}")

            # Asegurar que todos los campos necesarios estén presentes
            required_fields = [
                'service_type', 'titular', 'direccion', 'no_servicio', 
                'cuenta', 'no_medidor', 'periodo', 'total', 'consumo',
                'tarifa', 'fecha_pago', 'fecha_corte', 'rmu', 'calidad'
            ]
            
            for field in required_fields:
                if field not in datos:
                    datos[field] = "NO EXTRAÍDO"
            
            datos['filename'] = filename

            os.remove(filepath)
            print(f"Archivo procesado: {filename}")
            return jsonify(datos)

        except Exception as e:
            print(f"Error procesando {filename}: {str(e)}")
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({
                "error": f"Error procesando archivo: {str(e)}",
                "service_type": "error",
                "filename": filename,
                "titular": "ERROR",
                "total": "ERROR"
            }), 500

    return jsonify({"error": "Formato inválido. Solo PDF"}), 400

# --------------------------
# HEALTH CHECK
# --------------------------
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        "status": "OK", 
        "message": "Backend funcionando",
        "service": "MultiServicio API",
        "version": "2.1",
        "features": ["upload", "extract_cfe", "extract_japam", "extract_gas"],
        "extractors": {
            "cfe": "Mejorado - Extrae titular, dirección, consumo, etc.",
            "japam": "Mejorado - Extrae datos de agua",
            "gas": "Mejorado - Extrae datos de gas natural/LP"
        }
    })

# --------------------------
# BATCH UPLOAD ENDPOINT (opcional)
# --------------------------
@app.route('/api/batch_upload', methods=['POST'])
def batch_upload():
    if "files" not in request.files:
        return jsonify({"error": "No se encontraron archivos"}), 400
    
    files = request.files.getlist("files")
    if not files or files[0].filename == "":
        return jsonify({"error": "Archivos inválidos"}), 400
    
    results = []
    for file in files:
        if file and allowed_file(file.filename):
            # Crear una solicitud individual simualda
            req = type('Obj', (object,), {'files': {'file': file}})()
            try:
                response = upload_file(req)
                if hasattr(response, 'json'):
                    results.append(response.json)
            except:
                results.append({
                    "filename": file.filename,
                    "error": "Error procesando archivo",
                    "service_type": "error"
                })
    
    return jsonify({
        "total": len(results),
        "processed": len([r for r in results if 'error' not in r]),
        "errors": len([r for r in results if 'error' in r]),
        "results": results
    })

if __name__ == '__main__':
    print("\n" + "="*60)
    print("Servidor backend MultiServicio - VERSIÓN MEJORADA")
    print("URL: http://localhost:8280/api")
    print("Endpoints disponibles:")
    print("   GET  /api/health       - Estado del servidor")
    print("   POST /api/upload       - Subir y extraer PDF individual")
    print("   POST /api/batch_upload - Subir múltiples PDFs")
    print("="*60 + "\n")
    
    app.run(debug=True, host="0.0.0.0", port=8280)