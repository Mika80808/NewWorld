import { describe, it, expect } from 'vitest';
import { describeAIError } from '../aiProviders';

/**
 * 玩家換到 DeepSeek 之後回報「連接失敗」，但畫面上只有一句
 * 「API 呼叫失敗，請檢查設定或網路連線」——金鑰錯、型號打錯、那家不讓瀏覽器
 * 直連，三件完全不同的事長得一模一樣，沒有任何線索可循。
 */
describe('describeAIError', () => {
  it('HTTP 狀態碼翻成該檢查什麼，並保留供應商的原文', () => {
    expect(describeAIError(new Error('HTTP 401 Incorrect API key'))).toContain('API Key 無效');
    expect(describeAIError(new Error('HTTP 401 Incorrect API key'))).toContain('Incorrect API key');
    expect(describeAIError(new Error('HTTP 404 model not found'))).toContain('型號');
    expect(describeAIError(new Error('HTTP 429 rate limit'))).toContain('額度');
    expect(describeAIError(new Error('HTTP 400 bad param'))).toContain('型號 id');
    expect(describeAIError(new Error('HTTP 503 upstream'))).toContain('供應商那端');
  });

  it('沒對應到的狀態碼也照實說，不要吞掉', () => {
    expect(describeAIError(new Error('HTTP 418 teapot'))).toContain('418');
    expect(describeAIError(new Error('HTTP 418 teapot'))).toContain('teapot');
  });

  it('fetch 完全失敗時點名 CORS 與端點網址，並指向主控台', () => {
    // 瀏覽器對 CORS 失敗只給一個沒有細節的 TypeError，規格上不讓 JS 讀到原因
    const text = describeAIError(new TypeError('Failed to fetch'));
    expect(text).toContain('CORS');
    expect(text).toContain('端點');
    expect(text).toContain('主控台');
  });

  it('Safari 與 Firefox 的措辭不同，一樣要認得', () => {
    expect(describeAIError(new TypeError('Load failed'))).toContain('CORS');
    expect(describeAIError(new TypeError('NetworkError when attempting to fetch resource.'))).toContain('CORS');
  });

  it('逾時與取消各自有自己的說法', () => {
    expect(describeAIError(new Error('REQUEST_TIMEOUT'))).toBe('請求超時');
    expect(describeAIError(new DOMException('Aborted', 'AbortError'))).toBe('已取消');
  });

  it('不是 Error 的東西不會讓畫面爆掉', () => {
    expect(describeAIError('字串')).toBe('未知錯誤');
    expect(describeAIError(undefined)).toBe('未知錯誤');
  });
});
