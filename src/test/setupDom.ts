// 組件／hook 測試的共用前置。**在需要 DOM 的測試檔頂端 import 這支**，
// 並在同一個檔案第一行寫 `// @vitest-environment jsdom`。
//
// 刻意不掛在 vite.config 的 setupFiles：那是全域的，會讓純函數層那 8 個檔案
// 也載入 React 與 RTL，白白拖慢預設 node 環境的測試。
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL 的自動 cleanup 只在有全域 afterEach 時才生效（本專案沒開 globals），
// 所以手動註冊。少了它，前一個 test 掛在 document 上的 DOM 會留到下一個 test，
// getByRole 之類的查詢就會撞到「找到多個」而失敗。
afterEach(cleanup);
