import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

/**
 * `col-span-2` 在 `grid-cols-1` 的容器裡是一個會毀掉整列的陷阱。
 *
 * 玩家回報：手機版設定集的「地點」欄位歪掉——卡片變成一個字一行。
 *
 * `grid-cols-1` 只有一條 `minmax(0,1fr)`。子元素寫 `grid-column: span 2` 時
 * 瀏覽器會**生出一條隱式欄**（`grid-auto-columns: auto`）。auto 那條依內容吃掉
 * 幾乎整個寬度，`1fr` 只剩 min-content——中文就是一個字的 18px。同列的卡片因此
 * 變成一直條文字，高度還跟著鄰居撐到 593px。以下是 headless Chromium 實測：
 *
 *   grid-cols-1 + col-span-2    → gridTemplateColumns: "18px 314px"，卡片 w=26 h=593
 *   grid-cols-1 + col-span-full → gridTemplateColumns: "344px"，卡片 w=344 h=68
 *
 * 正解是 `col-span-full`（`grid-column: 1 / -1`）：跨滿**所有顯式欄**，
 * 一欄兩欄都對，也不會生出隱式欄。
 *
 * 這個 bug 在桌機（`sm:grid-cols-2` 生效、真的有兩欄）完全看不出來，
 * 只有窄螢幕才會炸——與 group-hover 那個坑同一種「開發機上永遠正常」的病。
 */
const SRC = resolve(__dirname, '../../');

const tsxFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : tsxFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });

describe('grid 跨欄寫法', () => {
  it('會出現單欄版面的檔案不得使用 col-span-<數字>，一律 col-span-full', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const src = readFileSync(file, 'utf8');
      // 只檢查真的會變成單欄的容器所在的檔案；固定 grid-cols-3 之類的跨欄是合法的
      if (!src.includes('grid-cols-1')) continue;
      // 只看 className 的內容——註解裡提到 col-span-2（例如上面這段說明）不算違規
      for (const m of src.matchAll(/className="([^"]*)"/g)) {
        if (/\bcol-span-\d/.test(m[1])) {
          offenders.push(`src/${relative(SRC, file)}: ${m[1]}`);
        }
      }
    }
    expect(offenders, `改用 col-span-full：\n${offenders.join('\n')}`).toEqual([]);
  });
});
