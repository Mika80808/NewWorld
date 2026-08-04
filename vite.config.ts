import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// defineConfig 取自 vitest/config（而非 vite）：它是 vite 版的再匯出，額外帶上
// `test` 欄位的型別，否則 `tsc --noEmit` 會說 vite 的 UserConfig 沒有 test
import {defineConfig} from 'vitest/config';

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
            // @google/genai 由 useAIRequest 動態 import（首屏用不到）。這裡必須回傳
            // undefined 讓 Rollup 自行切出 async chunk——一旦歸進 vendor，動態
            // import 就失去意義。此套件不依賴 React，不會踩上面的初始化順序坑。
            if (id.includes('@google/genai') || id.includes('web-streams-polyfill')) {
              return undefined;
            }
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
    test: {
      // 預設環境維持 node：純函數層（src/utils、saveDataMapper）不需要 DOM，
      // 建一個 jsdom 環境每檔要多花數百 ms。需要 DOM 的組件／hook 測試改在
      // 檔案頂端用 `// @vitest-environment jsdom` 逐檔切換，並 import
      // `src/test/setupDom.ts` 取得 jest-dom matcher 與 RTL 的 cleanup。
      // （不要改用全域 setupFiles：那會讓純函數測試也載入 RTL。）
      environment: 'node',
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
