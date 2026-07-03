import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const base = process.env.BASE_PATH || '/';

  return {
    base,
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // 依套件拆 vendor chunk：與遊戲程式碼分開快取，改版時玩家只需重新下載變動的部分
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@google/genai')) return 'genai';
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('node_modules/motion') || id.includes('framer-motion')) return 'motion';
            if (id.includes('react-dom') || id.includes('node_modules/react/')) return 'react';
            return 'vendor';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
