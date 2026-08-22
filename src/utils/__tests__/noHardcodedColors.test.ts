import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * CLAUDE.md 的「顏色系統強制規則」原本只是文件，沒有任何東西擋著。
 * 結果是全站累積了 60 幾處寫死的色碼——大多是 `rgba(255,255,255,0.05)`
 * 這種「疊一層微亮」的手法，**綁死深色主題**：白色疊在淺色紙面上等於
 * 什麼都沒發生，羊皮紙主題底下卡片、按鈕、分隔線會整片消失。
 *
 * 這條測試把規則變成會紅的東西。要疊一層請用 `--tint-*`，
 * 要投影請用 `--shadow-*`，要遮罩請用 `--bg-overlay`。
 *
 * 真的需要獨立調色盤（地圖、便條紙、勢力色、天空、品牌色）時，
 * 在宣告處上方的註解寫 `色碼例外` 並說明理由即可豁免——
 * 目的是逼人寫下理由，不是禁止例外。整份檔案都是調色盤的（例如手繪地圖）
 * 則在檔案開頭寫 `色碼例外：整份檔案`。
 */

const SRC = join(__dirname, '..', '..');
const EXEMPT_MARKER = '色碼例外';
const EXEMPT_FILE_MARKER = '色碼例外：整份檔案';
/** 例外註解往下涵蓋的行數：夠一個調色盤物件，但不足以蓋掉整個檔案 */
const EXEMPT_SPAN = 30;

const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/;

/**
 * CSS 檔的 `--foo: <色碼>` 是**變數定義本身**，也就是調色盤，當然可以寫色碼；
 * 要擋的是把色碼直接寫進一般屬性值（`background: rgba(...)`）。
 *
 * 這個區分是有代價換來的：`.rpg-vignette` 疊了兩層，第一層走 --fx-vignette、
 * 第二層卻寫死 `linear-gradient(rgba(0,0,0,.12), rgba(0,0,0,.34))`。羊皮紙
 * 主題把 --fx-vignette 設成 transparent 之後，第二層仍然把整張紙由上而下
 * 染成灰的，紙色只剩最頂端看得出來——而當時這條測試只掃 .ts/.tsx，看不到它。
 */
const isCssVarDeclaration = (line: string) => /^\s*--[\w-]+\s*:/.test(line);

/**
 * 去掉註解再檢查——說明文字裡舉例寫色碼是合理的，不該因此變紅。
 *
 * 要逐行處理而不是先整份 replace，是為了保住行號（報錯要指得出位置）；
 * 又必須記住「現在在不在區塊註解裡」，因為 CSS 的 `/* … *\/` 常常跨好幾行
 * ——這份檔案裡解釋「原本寫死 rgba(...)」的註解就是這樣，
 * 不記狀態的話那些說明文字會全部被誤判成違規。
 */
function makeCommentStripper() {
  let inBlock = false;
  return (line: string): string => {
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', i);
        if (end === -1) return out;
        inBlock = false;
        i = end + 2;
        continue;
      }
      const block = line.indexOf('/*', i);
      const lineComment = line.indexOf('//', i);
      if (block !== -1 && (lineComment === -1 || block < lineComment)) {
        out += line.slice(i, block);
        inBlock = true;
        i = block + 2;
        continue;
      }
      if (lineComment !== -1) return out + line.slice(i, lineComment);
      return out + line.slice(i);
    }
    return out;
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '__tests__' || name === 'test' ? [] : walk(full);
    }
    return /\.(tsx?|css)$/.test(name) ? [full] : [];
  });
}

function offendingLines(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  if (src.includes(EXEMPT_FILE_MARKER)) return [];

  const hits: string[] = [];
  let exemptUntil = -1;
  const strip = makeCommentStripper();

  src.split('\n').forEach((line, i) => {
    const code = strip(line);
    if (line.includes(EXEMPT_MARKER)) exemptUntil = i + EXEMPT_SPAN;
    if (i <= exemptUntil) return;
    if (isCssVarDeclaration(line)) return;
    if (!COLOR.test(code)) return;
    hits.push(`${relative(SRC, file)}:${i + 1}  ${line.trim()}`);
  });
  return hits;
}

describe('顏色系統強制規則', () => {
  it('src 底下沒有未標注例外的寫死色碼（含 .css）', () => {
    const hits = walk(SRC).flatMap(offendingLines);
    expect(hits, `\n寫死的色碼（改用 CSS Variables，或在宣告上方註解寫「${EXEMPT_MARKER}」並說明理由）：\n${hits.join('\n')}\n`).toEqual([]);
  });

  /** 例外機制本身要能動，否則上面那條只是碰巧全過 */
  it('例外標記真的能豁免，而且不會無限往下涵蓋', () => {
    const marked = walk(SRC).filter(f => readFileSync(f, 'utf8').includes(EXEMPT_MARKER));
    expect(marked.length).toBeGreaterThan(0);
  });
});
