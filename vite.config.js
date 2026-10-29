import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // فصل مكتبات ثابتة في ملفات منفصلة: الكاش بتاع المتصفح بيفضل شغال بعد كل نشر
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/firebase/') || id.includes('@firebase')) return 'vendor-firebase';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react';
        }
      }
    }
  }
})