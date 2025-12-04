// upload.js - Gestor de subida de archivos SIN base de datos - CON DASHBOARD
class UploadManager {
    constructor() {
        this.files = [];
        this.processingResults = [];
        this.isProcessing = false;
        this.initializeUpload();
    }

    initializeUpload() {
        // Elementos del DOM
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.selectFilesBtn = document.getElementById('selectFiles');
        this.processFilesBtn = document.getElementById('processFiles');
        this.clearFilesBtn = document.getElementById('clearFiles');
        this.fileItems = document.getElementById('fileItems');
        this.fileList = document.getElementById('fileList');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.resultsContainer = document.getElementById('resultsContainer');
        this.resultsGrid = document.getElementById('resultsGrid');
        this.exportCSVBtn = document.getElementById('exportCSV');

        // Event listeners
        this.selectFilesBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Drag and drop
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.style.background = '#ecfffa';
        });
        
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.style.background = '';
        });
        
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.style.background = '';
            this.handleFileDrop(e);
        });

        // Botones principales
        this.processFilesBtn.addEventListener('click', () => this.processFiles());
        this.clearFilesBtn.addEventListener('click', () => this.clearFiles());
        
        // Botón de exportar CSV
        if (this.exportCSVBtn) {
            this.exportCSVBtn.addEventListener('click', () => this.exportResults());
        }
    }

    handleFileSelect(event) {
        const files = Array.from(event.target.files);
        this.addFiles(files);
    }

    handleFileDrop(event) {
        const files = Array.from(event.dataTransfer.files);
        this.addFiles(files);
    }

    addFiles(newFiles) {
        // Filtrar solo PDFs
        const pdfFiles = newFiles.filter(file => 
            file.type === 'application/pdf' && 
            file.name.toLowerCase().endsWith('.pdf')
        );

        if (pdfFiles.length === 0) {
            app.showNotification('error', 'Solo se aceptan archivos PDF');
            return;
        }

        // Limitar cantidad
        if (this.files.length + pdfFiles.length > CONFIG.MAX_FILES) {
            app.showNotification('error', `Máximo ${CONFIG.MAX_FILES} archivos permitidos`);
            return;
        }

        // Agregar archivos
        this.files.push(...pdfFiles);
        this.updateFileList();
        this.updateProcessButton();

        app.showNotification('success', `Se agregaron ${pdfFiles.length} archivo(s)`);
    }

    updateFileList() {
        if (this.files.length === 0) {
            this.fileList.style.display = 'none';
            return;
        }

        this.fileList.style.display = 'block';
        this.fileItems.innerHTML = this.files.map((file, index) => `
            <div class="file-item">
                <div style="flex: 1;">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${this.formatFileSize(file.size)} • ${this.getServiceTypeFromFilename(file.name)}</div>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <span style="background: ${this.getServiceColor(file.name)}20; color: ${this.getServiceColor(file.name)}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                        ${this.getServiceTypeFromFilename(file.name)}
                    </span>
                    <button onclick="window.uploadManager.removeFile(${index})" style="background: #e74c3c; color: white; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    getServiceTypeFromFilename(filename) {
        const name = filename.toUpperCase();
        if (name.includes('CFE') || name.includes('LUZ') || name.includes('ELECTRICIDAD')) return 'CFE';
        if (name.includes('JAPAM') || name.includes('AGUA')) return 'JAPAM';
        if (name.includes('GAS') || name.includes('ENGIE')) return 'GAS';
        return 'Desconocido';
    }

    getServiceColor(filename) {
        const service = this.getServiceTypeFromFilename(filename);
        switch(service) {
            case 'CFE': return '#f59e0b';
            case 'JAPAM': return '#3b82f6';
            case 'GAS': return '#ef4444';
            default: return '#6c757d';
        }
    }

    removeFile(index) {
        this.files.splice(index, 1);
        this.updateFileList();
        this.updateProcessButton();
        app.showNotification('info', 'Archivo eliminado');
    }

    clearFiles() {
        if (this.files.length === 0) {
            app.showNotification('info', 'No hay archivos para limpiar');
            return;
        }
        
        if (confirm(`¿Estás seguro de eliminar ${this.files.length} archivo(s)?`)) {
            this.files = [];
            this.processingResults = [];
            this.updateFileList();
            this.updateProcessButton();
            this.resultsContainer.style.display = 'none';
            this.fileInput.value = '';
            app.showNotification('success', 'Lista de archivos limpiada');
        }
    }

    updateProcessButton() {
        this.processFilesBtn.disabled = this.files.length === 0;
        this.processFilesBtn.textContent = this.files.length > 0 ? 
            `Procesar Lote (${this.files.length} archivos)` : 'Procesar Lote';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async processFiles() {
        if (this.files.length === 0 || this.isProcessing) return;

        this.isProcessing = true;
        this.processFilesBtn.disabled = true;
        this.processFilesBtn.textContent = 'Procesando...';
        this.processFilesBtn.style.background = '#6c757d';
        
        // Mostrar progreso
        this.progressContainer.style.display = 'block';
        this.progressFill.style.width = '0%';
        this.progressFill.style.background = 'linear-gradient(90deg, #1abc9c, #3498db)';
        
        // Mostrar modal de carga
        app.showModal('loadingModal');
        
        // Actualizar mensaje de carga
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) {
            loadingMessage.textContent = `Procesando ${this.files.length} archivo(s)...`;
        }

        const results = [];
        const totalFiles = this.files.length;

        for (let i = 0; i < totalFiles; i++) {
            const file = this.files[i];
            
            try {
                // Actualizar progreso
                const progress = ((i + 1) / totalFiles) * 100;
                this.progressFill.style.width = `${progress}%`;
                this.progressText.textContent = `${i + 1}/${totalFiles} - ${file.name}`;
                this.progressText.style.fontWeight = '600';

                // Crear FormData y enviar
                const formData = new FormData();
                formData.append('file', file);

                console.log(`📤 Enviando archivo: ${file.name}`);
                const response = await fetch(`${CONFIG.API_BASE}/upload`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`Error HTTP ${response.status}`);
                }

                const data = await response.json();
                
                // Agregar nombre de archivo y mejorar datos
                const enhancedData = {
                    ...data,
                    filename: file.name,
                    upload_date: new Date().toISOString(),
                    file_size: this.formatFileSize(file.size),
                    service_detected: this.getServiceTypeFromFilename(file.name)
                };
                
                results.push(enhancedData);

                console.log(`✅ Procesado: ${file.name}`, enhancedData);

                // Actualizar UI parcialmente
                this.updateResultsPreview(results, i + 1, totalFiles);

            } catch (error) {
                console.error(`❌ Error procesando ${file.name}:`, error);
                results.push({
                    filename: file.name,
                    error: error.message,
                    service_type: 'error',
                    titular: 'ERROR',
                    total: 'ERROR',
                    upload_date: new Date().toISOString(),
                    file_size: this.formatFileSize(file.size)
                });
                
                app.showNotification('warning', `Error en ${file.name}: ${error.message}`);
            }
        }

        // Finalizar
        this.isProcessing = false;
        this.processFilesBtn.disabled = false;
        this.processFilesBtn.textContent = 'Procesar Lote';
        this.processFilesBtn.style.background = '';
        this.progressContainer.style.display = 'none';
        app.hideModal('loadingModal');

        // Guardar resultados
        this.processingResults = results;
        
        // Actualizar dashboard automáticamente
        if (window.app && window.app.updateDashboardMetrics) {
            setTimeout(() => {
                window.app.updateDashboardMetrics();
                app.showNotification('info', 'Dashboard actualizado con nuevos datos');
            }, 500);
        }
        
        // Mostrar resultados editables
        this.showEditableResults(results);
        
        // Mostrar resumen
        const successCount = results.filter(r => !r.error).length;
        const errorCount = results.filter(r => r.error).length;
        
        app.showNotification('success', 
            `Procesamiento completado: ${successCount} exitosos, ${errorCount} con errores`
        );
        
        // Auto-exportar resultados si hay más de 5 archivos
        if (results.length > 5 && successCount > 0) {
            setTimeout(() => {
                if (confirm(`¿Deseas exportar los ${successCount} resultados a CSV?`)) {
                    this.exportResults();
                }
            }, 1000);
        }
    }

    updateResultsPreview(results, current, total) {
        // Actualizar contador durante el procesamiento
        const previewCount = document.getElementById('previewCount');
        if (previewCount) {
            previewCount.textContent = `Procesados: ${current}/${total}`;
        }
        
        // Actualizar modal de carga
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) {
            const successCount = results.filter(r => !r.error).length;
            const errorCount = results.filter(r => r.error).length;
            loadingMessage.textContent = 
                `Procesando... ${current}/${total} archivos\n` +
                `✓ ${successCount} exitosos • ✗ ${errorCount} errores`;
        }
    }

    showEditableResults(results) {
        // Mostrar contenedor de resultados
        this.resultsContainer.style.display = 'block';
        
        // Scroll suave a resultados
        setTimeout(() => {
            this.resultsContainer.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        }, 300);
        
        // Agregar botón de exportar si no existe
        if (!this.resultsContainer.querySelector('.export-btn-container')) {
            const exportContainer = document.createElement('div');
            exportContainer.className = 'export-btn-container';
            exportContainer.style.margin = '20px 0';
            exportContainer.innerHTML = `
                <button class="btn" id="exportResultsBtn" style="background: #10b981;">
                    <i class="fas fa-download"></i> Exportar a CSV
                </button>
                <button class="btn" id="clearResultsBtn" style="background: #f59e0b; margin-left: 10px;">
                    <i class="fas fa-trash"></i> Limpiar Resultados
                </button>
                <button class="btn" id="viewDashboardBtn" style="background: #3498db; margin-left: 10px;">
                    <i class="fas fa-tachometer-alt"></i> Ver Dashboard
                </button>
            `;
            this.resultsContainer.insertBefore(exportContainer, this.resultsContainer.querySelector('.table-container'));
            
            // Agregar event listeners a los nuevos botones
            document.getElementById('exportResultsBtn').addEventListener('click', () => this.exportResults());
            document.getElementById('clearResultsBtn').addEventListener('click', () => this.clearResults());
            document.getElementById('viewDashboardBtn').addEventListener('click', () => this.goToDashboard());
        }
        
        // Usar la función de app.js para mostrar resultados editables
        if (window.app && window.app.displayEditableResults) {
            window.app.displayEditableResults(results);
        }
    }

    goToDashboard() {
        // Navegar al dashboard
        const dashboardLink = document.querySelector('a[href="#dashboard"]');
        if (dashboardLink) {
            dashboardLink.click();
        }
        
        // Actualizar dashboard
        setTimeout(() => {
            if (window.app && window.app.updateDashboardMetrics) {
                window.app.updateDashboardMetrics();
            }
        }, 500);
    }

    // Exportar resultados a CSV
    exportResults() {
        if (!this.processingResults || this.processingResults.length === 0) {
            app.showNotification('info', 'No hay resultados para exportar');
            return;
        }

        // Si estamos usando resultados editables, usar esos
        const resultsToExport = window.app?.editableResults || this.processingResults;
        
        try {
            const csv = this.convertResultsToCSV(resultsToExport);
            this.downloadCSV(csv, `recibos_homirent_${new Date().toISOString().split('T')[0]}.csv`);
            app.showNotification('success', 'CSV exportado correctamente');
        } catch (error) {
            app.showNotification('error', 'Error al exportar CSV: ' + error.message);
        }
    }

    convertResultsToCSV(results) {
        const headers = [
            'Archivo', 'Servicio', 'Titular', 'N° Servicio', 'Dirección', 
            'Cuenta', 'N° Medidor', 'Período', 'Total', 'Consumo',
            'Tarifa', 'Fecha Pago', 'Fecha Corte', 'RMU', 'Calidad',
            'Fecha Subida', 'Tamaño Archivo', 'Estado'
        ];
        
        const csvRows = [
            headers.join(','),
            ...results.map(result => {
                const serviceName = CONFIG.SERVICE_TYPES[result.service_type]?.name || result.service_type || '';
                const consumo = result.consumo || result.consumo_kwh || result.consumo_m3 || '';
                const calidad = result.calidad || result.tipo_lectura || 'BÁSICO';
                const estado = result.error ? 'ERROR' : 'PROCESADO';
                
                return [
                    `"${result.filename || ''}"`,
                    `"${serviceName}"`,
                    `"${result.titular || ''}"`,
                    `"${result.no_servicio || ''}"`,
                    `"${result.direccion || ''}"`,
                    `"${result.cuenta || ''}"`,
                    `"${result.no_medidor || ''}"`,
                    `"${result.periodo || ''}"`,
                    `"${result.total || ''}"`,
                    `"${consumo}"`,
                    `"${result.tarifa || ''}"`,
                    `"${result.fecha_pago || ''}"`,
                    `"${result.fecha_corte || ''}"`,
                    `"${result.rmu || ''}"`,
                    `"${calidad}"`,
                    `"${result.upload_date || new Date().toISOString()}"`,
                    `"${result.file_size || ''}"`,
                    `"${estado}"`
                ].join(',');
            })
        ];

        return csvRows.join('\n');
    }

    downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Limpiar resultados
    clearResults() {
        if (!this.processingResults || this.processingResults.length === 0) {
            app.showNotification('info', 'No hay resultados para limpiar');
            return;
        }
        
        if (confirm(`¿Estás seguro de limpiar ${this.processingResults.length} resultados?`)) {
            this.processingResults = [];
            this.resultsContainer.style.display = 'none';
            const resultsGrid = document.getElementById('resultsGrid');
            if (resultsGrid) resultsGrid.innerHTML = '';
            
            // Limpiar también resultados editables en app
            if (window.app && window.app.editableResults) {
                window.app.editableResults = [];
            }
            
            app.showNotification('info', 'Resultados limpiados');
        }
    }

    // Función para obtener estadísticas rápidas
    getQuickStats() {
        const results = this.processingResults || [];
        const total = results.length;
        const success = results.filter(r => !r.error).length;
        const errors = results.filter(r => r.error).length;
        
        const byService = {
            cfe: results.filter(r => r.service_type === 'cfe').length,
            japam: results.filter(r => r.service_type === 'japam').length,
            gas: results.filter(r => r.service_type === 'gas').length,
            unknown: results.filter(r => !r.service_type || r.service_type === 'unknown').length
        };
        
        return {
            total,
            success,
            errors,
            byService,
            successRate: total > 0 ? ((success / total) * 100).toFixed(1) : 0
        };
    }

    // Función para filtrar resultados por servicio
    filterByService(serviceType) {
        if (!this.processingResults || this.processingResults.length === 0) {
            return [];
        }
        
        if (serviceType === 'all') {
            return this.processingResults;
        }
        
        return this.processingResults.filter(result => 
            result.service_type === serviceType
        );
    }

    // Función para buscar en resultados
    searchInResults(query) {
        if (!this.processingResults || this.processingResults.length === 0) {
            return [];
        }
        
        if (!query || query.trim() === '') {
            return this.processingResults;
        }
        
        const searchTerm = query.toLowerCase().trim();
        return this.processingResults.filter(result => {
            return Object.values(result).some(value => 
                String(value).toLowerCase().includes(searchTerm)
            );
        });
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.uploadManager = new UploadManager();
    
    // Añadir soporte para teclas rápidas
    document.addEventListener('keydown', (e) => {
        // Ctrl + S para procesar archivos
        if (e.ctrlKey && e.key === 'p') {
            e.preventDefault();
            if (window.uploadManager && !window.uploadManager.isProcessing) {
                window.uploadManager.processFiles();
            }
        }
        
        // Ctrl + E para exportar
        if (e.ctrlKey && e.key === 'e') {
            e.preventDefault();
            if (window.uploadManager) {
                window.uploadManager.exportResults();
            }
        }
        
        // Ctrl + L para limpiar
        if (e.ctrlKey && e.key === 'l') {
            e.preventDefault();
            if (window.uploadManager) {
                window.uploadManager.clearFiles();
            }
        }
        
        // Ctrl + D para ir al dashboard
        if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            const dashboardLink = document.querySelector('a[href="#dashboard"]');
            if (dashboardLink) {
                dashboardLink.click();
            }
        }
    });
    
    // Mostrar atajos de teclado
    setTimeout(() => {
        console.log('🎮 Atajos de teclado disponibles:');
        console.log('  Ctrl + P → Procesar archivos');
        console.log('  Ctrl + E → Exportar CSV');
        console.log('  Ctrl + L → Limpiar lista');
        console.log('  Ctrl + D → Ir al Dashboard');
    }, 2000);
});