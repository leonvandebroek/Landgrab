import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-signalr': ['@microsoft/signalr'],
          'vendor-leaflet': ['leaflet'],
          'vendor-i18n': ['i18next', 'react-i18next'],
          'vendor-zustand': ['zustand'],
        },
      },
    },
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true
      },
      '/hub': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        ws: true
      }
    }
  }
});
