class DashboardManager {
    constructor() {
        this.initializeDashboard();
    }

    initializeDashboard() {
        this.initializeExportButton();
        this.initializeSaveButton();
    }

    initializeExportButton() {
        document.getElementById('exportCSV').addEventListener('click', () => this.exportToCSV());
    }

    initializeSaveButton() {
        document.getElementById('saveToDB').addEventListener('click', () => this.saveToDatabase());
    }

    async exportToCSV() {
        try {
            const response = await fetch(`${CONFIG.API_BASE}/records`);
            if (!response.ok) throw new Error('Error al obtener datos para exportar');
            
            const records = await response.json();
            const csv = this.convertToCSV(records);
            this.downloadCSV(csv, 'recibos_cfe.csv');
            
            app.showNotification('success', 'CSV exportado correctamente');
        } catch (error) {
            app.showNotification('error', 'Error al exportar CSV: ' + error.message);
        }
    }

    convertToCSV(records) {
        const headers = ['Titular', 'N° Servicio', 'Dirección', 'Cuenta', 'N° Medidor', 'Período', 'Total', 'Fecha Pago', 'Fecha Corte', 'RMU', 'Tarifa', 'Consumo (kWh)'];
        
        const csvRows = [
            headers.join(','),
            ...records.map(record => [
                `"${record.titular || ''}"`,
                record.no_servicio || '',
                `"${record.direccion || ''}"`,
                record.cuenta || '',
                record.no_medidor || '',
                `"${record.periodo || ''}"`,
                record.total || '',
                record.fecha_pago || '',
                record.fecha_corte || '',
                record.rmu || '',
                record.tarifa || '',
                record.consumo || ''
            ].join(','))
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

    async saveToDatabase() {
        // Implementar guardado de resultados procesados
        app.showNotification('info', 'Funcionalidad de guardado en desarrollo');
    }
}

// Inicializar el dashboard cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardManager = new DashboardManager();
});