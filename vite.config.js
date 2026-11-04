import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // 📊 عدّاد القراءات: أي import لـ 'firebase/firestore' بيعدّي على الغلاف (شوف src/firebase/firestoreMetered.js)
    alias: [{ find: /^firebase\/firestore$/, replacement: fileURLToPath(new URL('./src/firebase/firestoreMetered.js', import.meta.url)) }],
  },
  build: {
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // فصل مكتبات ثابتة في ملفات منفصلة: الكاش بتاع المتصفح بيفضل شغال بعد كل نشر
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // مكتبة الذكاء الاصطناعي بتتحمّل عند أول استخدام بس (ملف لوحدها)
          if (id.includes('@firebase/ai') || id.includes('/firebase/ai')) return 'vendor-firebase-ai';
          if (id.includes('/firebase/') || id.includes('@firebase')) return 'vendor-firebase';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react';
        }
      }
    }
  }
})