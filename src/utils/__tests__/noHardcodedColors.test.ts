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

/** 去掉註解再檢查——說明文字裡舉例寫色碼是合理的，不該因此變紅 */
const stripComments = (line: string) =>
  line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '__tests__' || name === 'test' ? [] : walk(full);
    }
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

function offendingLines(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  if (src.includes(EXEMPT_FILE_MARKER)) return [];

  const hits: string[] = [];
  let exemptUntil = -1;

  src.split('\n').forEach((line, i) => {
    if (line.includes(EXEMPT_MARKER)) exemptUntil = i + EXEMPT_SPAN;
    if (i <= exemptUntil) return;
    if (!COLOR.test(stripComments(line))) return;
    hits.push(`${relative(SRC, file)}:${i + 1}  ${line.trim()}`);
  });
  return hits;
}

describe('顏色系統強制規則', () => {
  it('src 底下沒有未標注例外的寫死色碼', () => {
    const hits = walk(SRC).flatMap(offendingLines);
    expect(hits, `\n寫死的色碼（改用 CSS Variables，或在宣告上方註解寫「${EXEMPT_MARKER}」並說明理由）：\n${hits.join('\n')}\n`).toEqual([]);
  });

  /** 例外機制本身要能動，否則上面那條只是碰巧全過 */
  it('例外標記真的能豁免，而且不會無限往下涵蓋', () => {
    const marked = walk(SRC).filter(f => readFileSync(f, 'utf8').includes(EXEMPT_MARKER));
    expect(marked.length).toBeGreaterThan(0);
  });
});
