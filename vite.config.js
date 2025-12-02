import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: '/', // Use '/' for root domain or '/subfolder/' for subdirectory
    server: {
        port: 3000,
        open: true,
        proxy: {
            // Proxy Rista API requests to avoid CORS issues
            '/rista-api': {
                target: 'https://api.ristaapps.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/rista-api/, '/v1'),
                secure: true
            }
        }
    },
    build: {
        outDir: 'dist',
        sourcemap: false, // Disable for production
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom'],
                    charts: ['chart.js', 'react-chartjs-2'],
                    utils: ['flatpickr', 'react-select']
                }
            }
        }
    }
})
