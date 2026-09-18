import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 高度受限的直向捲動容器，子項不准被 flex 壓扁。
 *
 * 這種容器的子項預設 `flex-shrink: 1`，內容超出時子項先被壓扁、容器不會捲動。
 * 關鍵在子項能被壓到多小：`min-height: auto` 通常由內容最小尺寸兜底
 * （單行按鈕壓不到比一行字矮），但**子項自己是捲動容器時（`overflow` 不是
 * visible），自動最小尺寸是 0**——可以被壓到任意矮，還會把超出的部分自己裁掉。
 *
 * GoalsPanel 的根節點正是 `overflow-hidden`，於是玩家回報「手機看不見冒險摘要」：
 * 摘要排在便條紙最下面，手機抽屜比桌機欄矮，只有手機裁到。實測 390×664 直式
 * 手機上卡片被壓到 172px 而內容需要 265px，摘要整段落在可見範圍外。
 *
 * 解法是 `.scroll-col > * { flex-shrink: 0 }`（見 index.css）。這支測試擋的是
 * 「之後有人新增一個這類容器卻忘了掛 class」——那種漏掉不會報錯，只會讓某個
 * 帶 `overflow-hidden` 的 widget 下半截在某些螢幕尺寸悄悄消失。
 */
const read = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');

describe('直向捲動容器', () => {
  it('index.css 有 flex-shrink: 0 的規則', () => {
    expect(read('index.css')).toMatch(/\.scroll-col\s*>\s*\*\s*\{[^}]*flex-shrink:\s*0/);
  });

  it('App.tsx 裡每個直向捲動容器都掛了 scroll-col', () => {
    const app = read('App.tsx');
    // 取出所有 className 字串字面值
    const classNames = [...app.matchAll(/className="([^"]*)"/g)].map(m => m[1]);
    const verticalScrollColumns = classNames.filter(c =>
      c.includes('overflow-y-auto') && c.includes('flex-col')
    );

    // 至少要涵蓋桌機左右欄、手機左右抽屜與快速選項五處，
    // 避免比對式失效後這測試變成空轉
    expect(verticalScrollColumns.length).toBeGreaterThanOrEqual(5);

    const missing = verticalScrollColumns.filter(c => !c.includes('scroll-col'));
    expect(missing).toEqual([]);
  });
});
