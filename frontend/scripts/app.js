// app.js - Versión simplificada SIN base de datos - CON DASHBOARD FUNCIONAL
const CONFIG = {
    API_BASE: 'http://localhost:8280/api',
    MAX_FILES: 50,
    ALLOWED_TYPES: ['application/pdf'],
    SERVICE_TYPES: {
        'cfe': { name: 'CFE (Luz)', icon: 'bolt', color: '#f59e0b' },
        'japam': { name: 'JAPAM (Agua)', icon: 'tint', color: '#3b82f6' },
        'gas': { name: 'Gas', icon: 'fire', color: '#ef4444' }
    }
};

class MultiServiceFrontend {
    constructor() {
        // Estado
        this.currentFiles = [];
        this.processingResults = [];
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.selectedService = 'all';
        this.editableResults = []; // Para resultados editables
        
        // Dashboard
        this.dashboardData = {
            totalFiles: 0,
            totalServices: 0,
            estimatedReadings: 0,
            measuredReadings: 0,
            servicesByType: { cfe: 0, japam: 0, gas: 0 },
            monthlyConsumption: [],
            totalAmounts: { cfe: 0, japam: 0, gas: 0 },
            recentFiles: []
        };

        // Inicialización
        document.addEventListener('DOMContentLoaded', () => {
            this.initializeApp();
        });
    }

    // -------------------------------------------------
    // Inicializadores
    // -------------------------------------------------
    initializeApp() {
        this.initializeNavigation();
        this.initializeServiceSelector();
        this.initializeEventListeners();
        this.initializeDashboard();
        this.checkServerHealth();
    }

    initializeNavigation() {
        const links = document.querySelectorAll('.nav-link');
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                links.forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                // Mostrar sección correspondiente
                const href = link.getAttribute('href') || '#upload';
                const targetId = href.replace('#', '');
                document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
                const target = document.getElementById(targetId);
                if (target) target.classList.add('active');
                
                // Si es dashboard, actualizar métricas
                if (targetId === 'dashboard') {
                    setTimeout(() => this.updateDashboardMetrics(), 300);
                }
            });
        });
    }

    initializeServiceSelector() {
        const serviceOptions = document.querySelectorAll('.service-option');
        serviceOptions.forEach(option => {
            option.addEventListener('click', () => {
                serviceOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                this.selectedService = option.dataset.service;
                if (window.uploadManager) window.uploadManager.updateFileList?.();
            });
        });
    }

    initializeEventListeners() {
        // Modal close
        const closeDetail = document.getElementById('closeDetailModal');
        if (closeDetail) closeDetail.addEventListener('click', () => this.hideModal('detailModal'));

        // Simple keyboard handler to close modals with ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
            }
        });
    }

    initializeDashboard() {
        // Inicializar controles del dashboard
        setTimeout(() => {
            this.setupDashboardEventListeners();
            this.updateDashboardMetrics();
        }, 1000);
    }

    setupDashboardEventListeners() {
        // Botón para actualizar estadísticas
        const updateStatsBtn = document.getElementById('updateStats');
        if (updateStatsBtn) {
            updateStatsBtn.addEventListener('click', () => this.updateDashboardMetrics());
        }

        // Botón para filtrar por fecha
        const filterDateBtn = document.getElementById('filterDateBtn');
        if (filterDateBtn) {
            filterDateBtn.addEventListener('click', () => this.filterByDate());
        }

        // Selector de período
        const periodSelect = document.getElementById('periodSelect');
        if (periodSelect) {
            periodSelect.addEventListener('change', (e) => this.changePeriod(e.target.value));
        }
        
        // Botón de exportar dashboard
        const exportDashboardBtn = document.getElementById('exportDashboardBtn');
        if (exportDashboardBtn) {
            exportDashboardBtn.addEventListener('click', () => this.exportDashboardToCSV());
        }
    }

    // -------------------------------------------------
    // Utilidades UI: modales, notificaciones
    // -------------------------------------------------
    showModal(id) {
        const m = document.getElementById(id);
        if (!m) return;
        m.classList.add('open');
        m.style.display = 'flex';
    }

    hideModal(id) {
        const m = document.getElementById(id);
        if (!m) return;
        m.classList.remove('open');
        m.style.display = 'none';
    }

    showNotification(type='info', message='') {
        // tipo: success, error, info
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.position = 'fixed';
        toast.style.right = '20px';
        toast.style.bottom = '20px';
        toast.style.padding = '12px 16px';
        toast.style.borderRadius = '8px';
        toast.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
        toast.style.zIndex = 9999;
        toast.style.background = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#2563eb';
        toast.style.color = '#fff';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'opacity 300ms';
            toast.style.opacity = '0';
            setTimeout(()=> toast.remove(), 350);
        }, 2500);
    }

    // -------------------------------------------------
    // Server health
    // -------------------------------------------------
    async checkServerHealth() {
        try {
            const res = await fetch(`${CONFIG.API_BASE}/health`);
            if (!res.ok) throw new Error('No health');
            const j = await res.json();
            console.log('Servidor OK', j);
        } catch (e) {
            console.warn('Backend no disponible:', e);
            this.showNotification('error', 'Backend no disponible en ' + CONFIG.API_BASE);
        }
    }

    // -------------------------------------------------
    // DASHBOARD FUNCIONAL
    // -------------------------------------------------
    updateDashboardMetrics() {
        console.log("📊 Actualizando métricas del dashboard...");
        
        // Usar resultados editables si existen, de lo contrario usar processingResults
        const results = this.editableResults || this.processingResults || [];
        
        // Calcular métricas
        this.calculateDashboardMetrics(results);
        
        // Actualizar UI
        this.updateDashboardUI();
        
        // Actualizar gráficos
        this.updateCharts();
        
        this.showNotification('success', 'Dashboard actualizado');
    }

    calculateDashboardMetrics(results) {
        // Resetear datos
        this.dashboardData = {
            totalFiles: results.length,
            totalServices: 0,
            estimatedReadings: 0,
            measuredReadings: 0,
            servicesByType: { cfe: 0, japam: 0, gas: 0 },
            monthlyConsumption: [],
            totalAmounts: { cfe: 0, japam: 0, gas: 0 },
            recentFiles: []
        };
        
        if (results.length === 0) return;
        
        // Procesar cada resultado
        results.forEach(result => {
            // Contar servicios por tipo
            const serviceType = result.service_type || 'unknown';
            if (serviceType in this.dashboardData.servicesByType) {
                this.dashboardData.servicesByType[serviceType]++;
                this.dashboardData.totalServices++;
            }
            
            // Contar tipos de lectura
            const lectura = (result.tipo_lectura || result.calidad || '').toUpperCase();
            if (lectura.includes('ESTIMADA') || lectura.includes('ESTIMADO')) {
                this.dashboardData.estimatedReadings++;
            } else if (lectura.includes('MEDIDA') || lectura.includes('MEDIDO')) {
                this.dashboardData.measuredReadings++;
            }
            
            // Acumular montos totales
            if (result.total && result.total !== 'NO EXTRAÍDO' && result.total !== 'ERROR') {
                try {
                    const amount = parseFloat(result.total);
                    if (!isNaN(amount) && serviceType in this.dashboardData.totalAmounts) {
                        this.dashboardData.totalAmounts[serviceType] += amount;
                    }
                } catch (e) {
                    console.warn(`Error parsing total: ${result.total}`);
                }
            }
            
            // Extraer mes del período para consumo mensual
            if (result.periodo && result.periodo !== 'NO EXTRAÍDO') {
                const monthMatch = result.periodo.match(/(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)/i);
                if (monthMatch) {
                    const month = monthMatch[0].toUpperCase();
                    const consumo = result.consumo || result.consumo_kwh || result.consumo_m3 || '0';
                    
                    try {
                        const consumoNum = parseFloat(consumo);
                        if (!isNaN(consumoNum)) {
                            this.dashboardData.monthlyConsumption.push({
                                month: month,
                                service: serviceType,
                                consumption: consumoNum,
                                amount: parseFloat(result.total) || 0
                            });
                        }
                    } catch (e) {
                        // Ignorar errores de conversión
                    }
                }
            }
            
            // Archivos recientes (últimos 5)
            if (result.filename) {
                this.dashboardData.recentFiles.push({
                    name: result.filename,
                    service: CONFIG.SERVICE_TYPES[serviceType]?.name || serviceType,
                    date: new Date().toLocaleDateString(),
                    amount: result.total || '0',
                    serviceType: serviceType
                });
            }
        });
        
        // Limitar archivos recientes a 5
        this.dashboardData.recentFiles = this.dashboardData.recentFiles.slice(-5).reverse();
        
        console.log("📈 Métricas calculadas:", this.dashboardData);
    }

    updateDashboardUI() {
        // Actualizar contadores principales
        const updateMetric = (id, value) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
                // Animación simple
                element.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    element.style.transform = 'scale(1)';
                }, 300);
            }
        };
        
        updateMetric('totalProperties', this.dashboardData.totalFiles);
        updateMetric('totalServices', this.dashboardData.totalServices);
        updateMetric('pendingPayments', this.dashboardData.estimatedReadings);
        updateMetric('estimatedReadings', this.dashboardData.measuredReadings);
        
        // Actualizar distribución de servicios
        const servicesDistribution = document.getElementById('servicesDistribution');
        if (servicesDistribution) {
            const totalServices = this.dashboardData.totalServices;
            const html = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-top: 1rem;">
                    ${Object.entries(this.dashboardData.servicesByType).map(([type, count]) => {
                        const percentage = totalServices > 0 ? Math.round((count / totalServices) * 100) : 0;
                        return `
                            <div style="background: white; padding: 1rem; border-radius: 8px; text-align: center; border-left: 4px solid ${CONFIG.SERVICE_TYPES[type]?.color || '#ccc'}; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                                <div style="font-size: 1.8rem; font-weight: 700; color: ${CONFIG.SERVICE_TYPES[type]?.color || '#ccc'}; margin-bottom: 0.25rem;">${count}</div>
                                <div style="color: #6c757d; font-size: 0.9rem; margin-bottom: 0.25rem;">${CONFIG.SERVICE_TYPES[type]?.name || type}</div>
                                <div style="font-size: 0.8rem; color: #999; font-weight: 500;">${percentage}%</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
            servicesDistribution.innerHTML = html;
        }
        
        // Actualizar montos totales
        const totalAmountsEl = document.getElementById('totalAmounts');
        if (totalAmountsEl) {
            const totalGeneral = Object.values(this.dashboardData.totalAmounts).reduce((a, b) => a + b, 0);
            const html = `
                <div style="margin-top: 1rem;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                        ${Object.entries(this.dashboardData.totalAmounts).map(([type, amount]) => `
                            <div style="background: white; padding: 1rem; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border: 1px solid ${CONFIG.SERVICE_TYPES[type]?.color || '#ccc'}20;">
                                <div style="font-weight: 600; color: #34495e; margin-bottom: 0.5rem;">
                                    <i class="fas ${CONFIG.SERVICE_TYPES[type]?.icon || 'fa-question'}"></i> ${CONFIG.SERVICE_TYPES[type]?.name || type}
                                </div>
                                <div style="color: ${CONFIG.SERVICE_TYPES[type]?.color || '#10b981'}; font-weight: 700; font-size: 1.3rem;">$${amount.toFixed(2)}</div>
                            </div>
                        `).join('')}
                        <div style="background: linear-gradient(135deg, #1abc9c, #16a085); padding: 1rem; border-radius: 8px; text-align: center; box-shadow: 0 4px 12px rgba(26, 188, 156, 0.3);">
                            <div style="font-weight: 600; color: white; margin-bottom: 0.5rem;">
                                <i class="fas fa-chart-line"></i> TOTAL GENERAL
                            </div>
                            <div style="color: white; font-weight: 700; font-size: 1.5rem;">$${totalGeneral.toFixed(2)}</div>
                            <div style="color: rgba(255,255,255,0.8); font-size: 0.8rem; margin-top: 0.5rem;">${this.dashboardData.totalFiles} archivos</div>
                        </div>
                    </div>
                </div>
            `;
            totalAmountsEl.innerHTML = html;
        }
        
        // Actualizar tabla de archivos recientes
        const recentFilesTable = document.getElementById('recentFilesTable');
        if (recentFilesTable) {
            const html = `
                <div style="overflow-x: auto; margin-top: 1rem;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8f9fa;">
                                <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: #34495e; border-bottom: 2px solid #e2e2e2;">Archivo</th>
                                <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: #34495e; border-bottom: 2px solid #e2e2e2;">Servicio</th>
                                <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: #34495e; border-bottom: 2px solid #e2e2e2;">Fecha</th>
                                <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: #34495e; border-bottom: 2px solid #e2e2e2;">Monto</th>
                                <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: #34495e; border-bottom: 2px solid #e2e2e2;">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.dashboardData.recentFiles.map(file => {
                                const serviceColor = CONFIG.SERVICE_TYPES[file.serviceType]?.color || '#ccc';
                                return `
                                    <tr style="border-bottom: 1px solid #eee; transition: background 0.2s;">
                                        <td style="padding: 0.75rem;">
                                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                <i class="fas fa-file-pdf" style="color: #e74c3c;"></i>
                                                <span style="font-weight: 500; font-size: 0.9rem;" title="${file.name}">
                                                    ${file.name.length > 25 ? file.name.substring(0, 25) + '...' : file.name}
                                                </span>
                                            </div>
                                        </td>
                                        <td style="padding: 0.75rem;">
                                            <span style="padding: 0.25rem 0.75rem; background: ${serviceColor}20; color: ${serviceColor}; border-radius: 20px; font-size: 0.8rem; font-weight: 600; border: 1px solid ${serviceColor}40;">
                                                ${file.service}
                                            </span>
                                        </td>
                                        <td style="padding: 0.75rem; color: #6c757d; font-size: 0.9rem;">${file.date}</td>
                                        <td style="padding: 0.75rem; font-weight: 700; color: #10b981;">$${file.amount}</td>
                                        <td style="padding: 0.75rem;">
                                            <span style="padding: 0.25rem 0.5rem; background: #d1fae5; color: #059669; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">
                                                <i class="fas fa-check"></i> Procesado
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                            ${this.dashboardData.recentFiles.length === 0 ? `
                                <tr>
                                    <td colspan="5" style="padding: 3rem; text-align: center; color: #6c757d;">
                                        <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 1rem; display: block; color: #ddd;"></i>
                                        No hay archivos procesados recientemente
                                        <div style="margin-top: 1rem; font-size: 0.9rem;">
                                            Sube archivos PDF en la sección "Cargar Recibos"
                                        </div>
                                    </td>
                                </tr>
                            ` : ''}
                        </tbody>
                    </table>
                </div>
            `;
            recentFilesTable.innerHTML = html;
        }
    }

    updateCharts() {
        const chartContainer = document.getElementById('chartsContainer');
        if (!chartContainer) return;
        
        const servicesData = this.dashboardData.servicesByType;
        const totalServices = Object.values(servicesData).reduce((a, b) => a + b, 0);
        
        if (totalServices === 0) {
            chartContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #6c757d; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                    <i class="fas fa-chart-pie" style="font-size: 3rem; margin-bottom: 1rem; color: #ddd;"></i>
                    <div>No hay datos suficientes para mostrar gráficos</div>
                </div>
            `;
            return;
        }
        
        // Gráfico de distribución de servicios (barras)
        let chartHTML = `
            <div style="background: white; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <h4 style="color: #34495e; margin-bottom: 1rem;">
                    <i class="fas fa-chart-bar"></i> Distribución por Servicio
                </h4>
                <div style="display: flex; align-items: end; gap: 1rem; height: 200px; margin-bottom: 1rem; padding: 0 1rem;">
        `;
        
        // Calcular altura máxima para normalizar
        const maxValue = Math.max(...Object.values(servicesData));
        
        Object.entries(servicesData).forEach(([type, count]) => {
            if (maxValue > 0) {
                const percentage = (count / maxValue) * 100;
                const height = (percentage / 100) * 150; // 150px max height
                const serviceInfo = CONFIG.SERVICE_TYPES[type] || { name: type, color: '#ccc' };
                
                chartHTML += `
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                        <div style="position: relative; width: 50px;">
                            <div style="width: 100%; height: ${height}px; background: linear-gradient(to top, ${serviceInfo.color}, ${serviceInfo.color}dd); border-radius: 6px 6px 0 0; position: relative;">
                                <div style="position: absolute; top: -25px; left: 0; width: 100%; text-align: center; font-weight: 700; color: ${serviceInfo.color}; font-size: 1.2rem;">
                                    ${count}
                                </div>
                            </div>
                        </div>
                        <div style="margin-top: 0.75rem; font-weight: 600; color: #34495e; font-size: 0.9rem;">${serviceInfo.name}</div>
                        <div style="font-size: 0.8rem; color: #6c757d; margin-top: 0.25rem;">
                            ${totalServices > 0 ? Math.round((count / totalServices) * 100) : 0}%
                        </div>
                    </div>
                `;
            }
        });
        
        chartHTML += `
                </div>
            </div>
            
            <div style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <h4 style="color: #34495e; margin-bottom: 1rem;">
                    <i class="fas fa-tachometer-alt"></i> Resumen de Actividad
                </h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                    <div style="text-align: center; padding: 1.5rem; background: linear-gradient(135deg, #1abc9c20, #1abc9c10); border-radius: 10px; border: 2px solid #1abc9c30;">
                        <div style="font-size: 2.5rem; color: #1abc9c; font-weight: 700; margin-bottom: 0.5rem;">${this.dashboardData.totalFiles}</div>
                        <div style="color: #6c757d; font-size: 0.9rem; font-weight: 500;">
                            <i class="fas fa-file-pdf"></i> Archivos Totales
                        </div>
                    </div>
                    <div style="text-align: center; padding: 1.5rem; background: linear-gradient(135deg, #3498db20, #3498db10); border-radius: 10px; border: 2px solid #3498db30;">
                        <div style="font-size: 2.5rem; color: #3498db; font-weight: 700; margin-bottom: 0.5rem;">${this.dashboardData.totalServices}</div>
                        <div style="color: #6c757d; font-size: 0.9rem; font-weight: 500;">
                            <i class="fas fa-bolt"></i> Servicios
                        </div>
                    </div>
                    <div style="text-align: center; padding: 1.5rem; background: linear-gradient(135deg, #f59e0b20, #f59e0b10); border-radius: 10px; border: 2px solid #f59e0b30;">
                        <div style="font-size: 2.5rem; color: #f59e0b; font-weight: 700; margin-bottom: 0.5rem;">${this.dashboardData.estimatedReadings}</div>
                        <div style="color: #6c757d; font-size: 0.9rem; font-weight: 500;">
                            <i class="fas fa-clock"></i> Estimadas
                        </div>
                    </div>
                    <div style="text-align: center; padding: 1.5rem; background: linear-gradient(135deg, #10b98120, #10b98110); border-radius: 10px; border: 2px solid #10b98130;">
                        <div style="font-size: 2.5rem; color: #10b981; font-weight: 700; margin-bottom: 0.5rem;">${this.dashboardData.measuredReadings}</div>
                        <div style="color: #6c757d; font-size: 0.9rem; font-weight: 500;">
                            <i class="fas fa-ruler"></i> Medidas
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        chartContainer.innerHTML = chartHTML;
    }

    filterByDate() {
        const startDate = document.getElementById('startDate')?.value;
        const endDate = document.getElementById('endDate')?.value;
        
        if (!startDate || !endDate) {
            this.showNotification('error', 'Selecciona ambas fechas');
            return;
        }
        
        const results = this.editableResults || this.processingResults || [];
        
        // Filtrar por período si hay datos de fecha en los resultados
        const filtered = results.filter(result => {
            // Aquí podrías implementar lógica de filtrado por fecha basada en result.periodo
            // Por ahora, mostrar todos
            return true;
        });
        
        this.calculateDashboardMetrics(filtered);
        this.updateDashboardUI();
        this.showNotification('info', `Mostrando ${filtered.length} registros`);
    }

    changePeriod(period) {
        console.log(`Cambiando período a: ${period}`);
        // Implementar lógica de cambio de período
        this.updateDashboardMetrics();
    }

    exportDashboardToCSV() {
        if (!this.dashboardData || this.dashboardData.totalFiles === 0) {
            this.showNotification('info', 'No hay datos para exportar');
            return;
        }
        
        try {
            const data = [];
            
            // Encabezados
            const headers = [
                'Métrica', 'Valor', 'Detalles', 'Porcentaje'
            ];
            
            // Calcular porcentajes
            const totalServices = this.dashboardData.totalServices;
            const totalAmount = Object.values(this.dashboardData.totalAmounts).reduce((a, b) => a + b, 0);
            
            // Datos del dashboard
            const rows = [
                ['Archivos Procesados', this.dashboardData.totalFiles, 'Total de archivos PDF procesados', '100%'],
                ['Servicios Extraídos', this.dashboardData.totalServices, 'Total de servicios identificados', '100%'],
                ['Lecturas Estimadas', this.dashboardData.estimatedReadings, 'Lecturas estimadas', totalServices > 0 ? `${Math.round((this.dashboardData.estimatedReadings / totalServices) * 100)}%` : '0%'],
                ['Lecturas Medidas', this.dashboardData.measuredReadings, 'Lecturas medidas', totalServices > 0 ? `${Math.round((this.dashboardData.measuredReadings / totalServices) * 100)}%` : '0%'],
                ['', '', '', ''],
                ['CFE (Luz)', this.dashboardData.servicesByType.cfe, `$${this.dashboardData.totalAmounts.cfe.toFixed(2)}`, totalServices > 0 ? `${Math.round((this.dashboardData.servicesByType.cfe / totalServices) * 100)}%` : '0%'],
                ['JAPAM (Agua)', this.dashboardData.servicesByType.japam, `$${this.dashboardData.totalAmounts.japam.toFixed(2)}`, totalServices > 0 ? `${Math.round((this.dashboardData.servicesByType.japam / totalServices) * 100)}%` : '0%'],
                ['Gas', this.dashboardData.servicesByType.gas, `$${this.dashboardData.totalAmounts.gas.toFixed(2)}`, totalServices > 0 ? `${Math.round((this.dashboardData.servicesByType.gas / totalServices) * 100)}%` : '0%'],
                ['', '', '', ''],
                ['TOTAL GENERAL', '', `$${totalAmount.toFixed(2)}`, '100%']
            ];
            
            // Convertir a CSV
            const csvContent = [
                'Reporte del Dashboard - HomiRent',
                `Fecha de generación: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
                '',
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\n');
            
            // Descargar
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', `dashboard_homirent_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.showNotification('success', 'Dashboard exportado a CSV');
            
        } catch (error) {
            this.showNotification('error', 'Error exportando dashboard: ' + error.message);
        }
    }

    // -------------------------------------------------
    // FUNCIONALIDADES PRINCIPALES
    // -------------------------------------------------

    // Función para exportar a CSV
    exportToCSV() {
        if (!this.editableResults || this.editableResults.length === 0) {
            this.showNotification('info', 'No hay resultados para exportar');
            return;
        }

        try {
            const csv = this.convertToCSV(this.editableResults);
            this.downloadCSV(csv, `recibos_${new Date().toISOString().split('T')[0]}.csv`);
            this.showNotification('success', 'CSV exportado correctamente');
        } catch (error) {
            this.showNotification('error', 'Error al exportar CSV: ' + error.message);
        }
    }

    convertToCSV(results) {
        const headers = [
            'Archivo', 'Servicio', 'Titular', 'N° Servicio', 'Dirección', 
            'Cuenta', 'N° Medidor', 'Período', 'Total', 'Consumo',
            'Tarifa', 'Fecha Pago', 'Fecha Corte', 'RMU', 'Calidad'
        ];
        
        const csvRows = [
            headers.join(','),
            ...results.map(result => {
                const serviceName = CONFIG.SERVICE_TYPES[result.service_type]?.name || result.service_type || '';
                const consumo = result.consumo || result.consumo_kwh || result.consumo_m3 || '';
                const calidad = result.calidad || result.tipo_lectura || 'BÁSICO';
                
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
                    `"${calidad}"`
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

    // Función para mostrar resultados en tabla editable
    displayEditableResults(results) {
        this.editableResults = results;
        const resultsGrid = document.getElementById('resultsGrid');
        
        if (!resultsGrid) return;
        
        resultsGrid.innerHTML = results.map((result, index) => {
            const serviceName = CONFIG.SERVICE_TYPES[result.service_type]?.name || result.service_type || 'Desconocido';
            const consumo = result.consumo || result.consumo_kwh || result.consumo_m3 || '';
            const calidad = result.calidad || result.tipo_lectura || 'BÁSICO';
            
            return `
                <tr data-index="${index}">
                    <td><input type="text" value="${result.titular || ''}" class="editable-cell" data-field="titular"></td>
                    <td>
                        <select class="editable-cell" data-field="service_type" style="width: 100%; padding: 5px;">
                            <option value="cfe" ${result.service_type === 'cfe' ? 'selected' : ''}>CFE (Luz)</option>
                            <option value="japam" ${result.service_type === 'japam' ? 'selected' : ''}>JAPAM (Agua)</option>
                            <option value="gas" ${result.service_type === 'gas' ? 'selected' : ''}>Gas</option>
                        </select>
                    </td>
                    <td><input type="text" value="${consumo}" class="editable-cell" data-field="consumo"></td>
                    <td><input type="text" value="${result.total || ''}" class="editable-cell" data-field="total"></td>
                    <td><input type="text" value="${calidad}" class="editable-cell" data-field="calidad"></td>
                    <td><textarea class="editable-cell" data-field="direccion" rows="2" style="width: 100%;">${result.direccion || ''}</textarea></td>
                    <td><input type="text" value="${result.no_servicio || ''}" class="editable-cell" data-field="no_servicio"></td>
                    <td><input type="text" value="${result.cuenta || ''}" class="editable-cell" data-field="cuenta"></td>
                    <td><input type="text" value="${result.no_medidor || ''}" class="editable-cell" data-field="no_medidor"></td>
                    <td><input type="text" value="${result.periodo || ''}" class="editable-cell" data-field="periodo"></td>
                </tr>
            `;
        }).join('');
        
        // Agregar event listeners para edición
        setTimeout(() => {
            this.attachCellEditors();
        }, 100);
    }

    // Función para adjuntar editores a las celdas
    attachCellEditors() {
        const editableCells = document.querySelectorAll('.editable-cell');
        editableCells.forEach(cell => {
            cell.addEventListener('change', (e) => {
                const rowIndex = e.target.closest('tr').dataset.index;
                const field = e.target.dataset.field;
                const value = e.target.value;
                
                if (this.editableResults[rowIndex]) {
                    this.editableResults[rowIndex][field] = value;
                    console.log(`Editado: [${rowIndex}][${field}] = ${value}`);
                }
            });
            
            cell.addEventListener('blur', (e) => {
                const rowIndex = e.target.closest('tr').dataset.index;
                const field = e.target.dataset.field;
                const value = e.target.value;
                
                if (this.editableResults[rowIndex]) {
                    this.editableResults[rowIndex][field] = value;
                }
            });
        });
    }

    // Función para mostrar detalles (modal)
    showReceiptDetails(jsonEncoded) {
        try {
            const obj = JSON.parse(decodeURIComponent(jsonEncoded));
            const body = document.getElementById('detailModalBody');
            if (!body) return;
            
            const serviceName = CONFIG.SERVICE_TYPES[obj.service_type]?.name || obj.service_type || 'Desconocido';
            const consumo = obj.consumo || obj.consumo_kwh || obj.consumo_m3 || 'N/A';
            const calidad = obj.calidad || obj.tipo_lectura || 'BÁSICO';
            
            const formattedHTML = `
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                    <h4 style="color: #34495e; margin-bottom: 15px;">
                        <i class="fas ${CONFIG.SERVICE_TYPES[obj.service_type]?.icon || 'fa-file'}"></i>
                        Detalles del Recibo - ${serviceName}
                    </h4>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px;">
                        ${this.createDetailCard('Titular', obj.titular)}
                        ${this.createDetailCard('Dirección', obj.direccion)}
                        ${this.createDetailCard('N° Servicio', obj.no_servicio)}
                        ${this.createDetailCard('Cuenta', obj.cuenta)}
                        ${this.createDetailCard('N° Medidor', obj.no_medidor)}
                        ${this.createDetailCard('Período', obj.periodo)}
                        ${this.createDetailCard('Total', `$${obj.total}`)}
                        ${this.createDetailCard('Consumo', `${consumo} ${obj.service_type === 'cfe' ? 'kWh' : obj.service_type === 'japam' ? 'm³' : ''}`)}
                        ${this.createDetailCard('Tarifa', obj.tarifa)}
                        ${this.createDetailCard('Fecha Pago', obj.fecha_pago)}
                        ${this.createDetailCard('Fecha Corte', obj.fecha_corte)}
                        ${this.createDetailCard('RMU', obj.rmu)}
                        ${this.createDetailCard('Calidad/Lectura', calidad)}
                    </div>
                </div>
            `;
            
            body.innerHTML = formattedHTML;
            this.showModal('detailModal');
        } catch(e){
            console.error('Error mostrando detalles:', e);
            this.showNotification('error', 'Error mostrando detalles');
        }
    }

    createDetailCard(title, content) {
        if (!content || content === 'NO EXTRAÍDO' || content === 'N/A') {
            return `
                <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #e74c3c; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <strong style="color: #34495e; font-size: 12px; display: block; margin-bottom: 8px;">
                        <i class="fas fa-exclamation-circle"></i> ${title}
                    </strong>
                    <div style="color: #e74c3c; word-break: break-word; font-size: 14px; line-height: 1.4;">
                        ${content || 'NO EXTRAÍDO'}
                    </div>
                </div>
            `;
        }
        
        return `
            <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #1abc9c; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <strong style="color: #34495e; font-size: 12px; display: block; margin-bottom: 8px;">
                    <i class="fas fa-check-circle"></i> ${title}
                </strong>
                <div style="color: #555; word-break: break-word; font-size: 14px; line-height: 1.4;">
                    ${content}
                </div>
            </div>
        `;
    }

    // -------------------------------------------------
    // Helpers
    // -------------------------------------------------
    async ping() {
        try {
            const r = await fetch(`${CONFIG.API_BASE}/health`);
            return r.ok;
        } catch {
            return false;
        }
    }
}

// Crear instancia global
const app = new MultiServiceFrontend();
window.app = app;

// Cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal').forEach(m => {
        m.style.display = m.classList.contains('open') ? 'flex' : 'none';
        m.style.alignItems = 'center';
        m.style.justifyContent = 'center';
    });
    
    // Auto-actualizar dashboard cada 30 segundos cuando esté activo
    setInterval(() => {
        const dashboardSection = document.getElementById('dashboard');
        if (dashboardSection && dashboardSection.classList.contains('active')) {
            if (window.app && window.app.updateDashboardMetrics) {
                window.app.updateDashboardMetrics();
            }
        }
    }, 30000);
});