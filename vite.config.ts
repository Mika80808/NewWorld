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
          // 所有 node_modules 合為單一 vendor chunk，與遊戲程式碼分開快取。
          // ⚠️ 不要把 react 與依賴它的套件（lucide/motion 等）拆到不同 chunk：
          // 會造成模組初始化順序錯亂（React.forwardRef undefined → 整頁空白）
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            // AI SDK 不依賴 react，拆成獨立 chunk 配合動態 import 按需載入
            // （只有玩家選用該供應商才下載）
            if (id.includes('@anthropic-ai/sdk')) return 'sdk-anthropic';
            if (id.includes('node_modules/openai/')) return 'sdk-openai';
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
      // 允許遠端預覽代理的主機名（雲端環境透過代理網域存取 dev server）
      allowedHosts: true,
    },
  };
});
