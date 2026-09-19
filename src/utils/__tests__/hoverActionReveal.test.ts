import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * 「滑過才出現」的操作按鈕在觸控裝置上會整組消失。
 *
 * Tailwind v4 把 `group-hover:` 編譯進 `@media (hover: hover)`——建置產物長這樣：
 *
 *   @media(hover:hover){ .group-hover\:opacity-100:is(:where(.group):hover *){opacity:1} }
 *
 * 觸控裝置（`hover: none`）那條規則永遠不生效，寫了 `opacity-0` 的按鈕就固定停在
 * 全透明。按鈕還在、還點得到，但玩家完全看不見——玩家回報過兩次：
 * 一次是對話泡泡的操作列，一次是角色記憶的編輯 icon。
 *
 * 解法是 `.hover-actions-host` / `.hover-action` 這一對（見 index.css），
 * 基準狀態可見，只有在 `@media (hover: hover)` 裡才藏起來。
 *
 * 這支測試擋的是「之後有人又寫回 Tailwind 那組 class」——那種寫法在桌機開發時
 * 看起來完全正常，只有真的拿手機開才會發現按鈕不見了。
 */
const SRC = resolve(__dirname, '../../');

const tsxFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : tsxFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });

describe('滑過才出現的操作按鈕', () => {
  it('index.css 的 .hover-action 基準狀態是可見的', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8');
    // 基準規則（不在任何 media query 內）必須是 opacity: 1
    expect(css).toMatch(/^\.hover-action\s*\{[^}]*opacity:\s*1/m);
    // 藏起來只能發生在 hover: hover 裡
    expect(css).toMatch(/@media \(hover: hover\)[\s\S]*?\.hover-action\s*\{[^}]*opacity:\s*0/);
  });

  it('沒有任何按鈕改回 opacity-0 + group-hover:opacity-100', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/className="([^"]*)"/g)) {
        const cls = m[1];
        // 只抓「藏起來再完全顯露」的互動控制項寫法。
        // 裝飾性的 group-hover/npc:opacity-40 之類不在此限——那種看不見沒有損失。
        if (cls.includes('opacity-0') && cls.includes('group-hover') && cls.includes('opacity-100')) {
          offenders.push(`${file.replace(SRC, 'src/')}: ${cls}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
