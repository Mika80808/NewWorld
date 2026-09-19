import { describe, it, expect } from 'vitest';
import {
  PROVIDERS, buildChatRequest, dataLinesOf, extractErrorMessage, extractStreamDelta,
  extractText, isProviderId, modelsForEndpoint, normalizeBaseUrl, openAITokenField,
  providerMeta, requiresApiKey, splitSSEEvents,
} from '../aiProviders';

const base = {
  apiKey: ' sk-test ', model: 'gpt-5', prompt: '嗨', maxTokens: 512, stream: false,
};

describe('供應商清單', () => {
  it('每家都有預設型號，且預設型號在自己的捷徑清單裡或可自訂', () => {
    for (const p of PROVIDERS) {
      expect(p.defaultModel).not.toBe('');
      expect(p.presets.length).toBeGreaterThan(0);
    }
  });

  it('認不得的 provider 退回第一家，不會回 undefined', () => {
    expect(providerMeta('nope').id).toBe(PROVIDERS[0].id);
    expect(isProviderId('openai')).toBe(true);
    expect(isProviderId('nope')).toBe(false);
  });

  it('端點決定型號捷徑清單', () => {
    const openrouter = modelsForEndpoint('openai', 'https://openrouter.ai/api/v1/');
    expect(openrouter.some(m => m.value.startsWith('anthropic/'))).toBe(true);
    const openai = modelsForEndpoint('openai', 'https://api.openai.com/v1');
    expect(openai.some(m => m.value.startsWith('anthropic/'))).toBe(false);
  });
});

describe('normalizeBaseUrl', () => {
  it('去掉尾端斜線與空白，讓端點比對不會因為多打一槓就失準', () => {
    expect(normalizeBaseUrl('  https://api.openai.com/v1//  ')).toBe('https://api.openai.com/v1');
  });
});

describe('buildChatRequest：OpenAI 相容', () => {
  it('組出 /chat/completions 與 Bearer 標頭，金鑰前後空白會被去掉', () => {
    const req = buildChatRequest({ ...base, provider: 'openai', baseUrl: 'https://api.openai.com/v1/' });
    expect(req.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(req.headers.Authorization).toBe('Bearer sk-test');
    expect(req.body.messages).toEqual([{ role: 'user', content: '嗨' }]);
  });

  it('baseUrl 留空時退回該供應商的預設端點，不會組出相對路徑', () => {
    const req = buildChatRequest({ ...base, provider: 'openai', baseUrl: '' });
    expect(req.url.startsWith('https://')).toBe(true);
  });

  it('GPT-5／o 系列改用 max_completion_tokens，其餘仍是 max_tokens', () => {
    expect(openAITokenField('gpt-5-mini')).toBe('max_completion_tokens');
    expect(openAITokenField('o3')).toBe('max_completion_tokens');
    expect(openAITokenField('deepseek-chat')).toBe('max_tokens');
    expect(openAITokenField('anthropic/claude-sonnet-4.5')).toBe('max_tokens');

    const legacy = buildChatRequest({ ...base, provider: 'openai', baseUrl: '', model: 'deepseek-chat' });
    expect(legacy.body.max_tokens).toBe(512);
    expect(legacy.body.max_completion_tokens).toBeUndefined();
  });

  it('responseJson 會同時給 response_format 與一段含 JSON 字樣的 system 訊息', () => {
    // OpenAI 的 json_object 模式要求訊息裡出現 "json"，少了會直接 400
    const req = buildChatRequest({ ...base, provider: 'openai', baseUrl: '', responseJson: true });
    expect(req.body.response_format).toEqual({ type: 'json_object' });
    const messages = req.body.messages as { role: string; content: string }[];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content.toLowerCase()).toContain('json');
  });

  it('非串流時不帶 stream 參數', () => {
    const req = buildChatRequest({ ...base, provider: 'openai', baseUrl: '' });
    expect(req.body.stream).toBeUndefined();
    const streamed = buildChatRequest({ ...base, provider: 'openai', baseUrl: '', stream: true });
    expect(streamed.body.stream).toBe(true);
  });
});

describe('buildChatRequest：Anthropic', () => {
  it('組出 /v1/messages，並帶上瀏覽器直連必需的 header', () => {
    const req = buildChatRequest({ ...base, provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5' });
    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers['x-api-key']).toBe('sk-test');
    expect(req.headers['anthropic-version']).toBe('2023-06-01');
    // 沒有後端，少了這個 header Anthropic 端會直接擋掉
    expect(req.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(req.body.max_tokens).toBe(512);
  });

  it('responseJson 改用 system 指示，不送 OpenAI 那套 response_format', () => {
    const req = buildChatRequest({ ...base, provider: 'anthropic', baseUrl: '', responseJson: true });
    expect(req.body.response_format).toBeUndefined();
    expect(String(req.body.system).toLowerCase()).toContain('json');
  });
});

describe('回應解析', () => {
  it('OpenAI 非串流取 choices[0].message.content', () => {
    expect(extractText('openai', { choices: [{ message: { content: '故事' } }] })).toBe('故事');
    expect(extractText('openai', {})).toBe('');
    expect(extractText('openai', null)).toBe('');
  });

  it('Anthropic 非串流串接所有 text 區塊，忽略非文字區塊', () => {
    const json = { content: [{ type: 'text', text: '前' }, { type: 'thinking', thinking: 'x' }, { type: 'text', text: '後' }] };
    expect(extractText('anthropic', json)).toBe('前後');
  });

  it('串流 delta：兩家格式不同，[DONE] 與壞掉的 JSON 一律回空字串', () => {
    expect(extractStreamDelta('openai', '{"choices":[{"delta":{"content":"啊"}}]}')).toBe('啊');
    expect(extractStreamDelta('openai', '[DONE]')).toBe('');
    expect(extractStreamDelta('openai', '{壞掉')).toBe('');
    expect(extractStreamDelta('anthropic', '{"type":"content_block_delta","delta":{"type":"text_delta","text":"啊"}}')).toBe('啊');
    // ping / message_start 這類事件沒有文字，不能當成內容
    expect(extractStreamDelta('anthropic', '{"type":"message_start"}')).toBe('');
  });
});

describe('SSE 切分', () => {
  it('保留未完成的尾段，分塊邊界切在半行 JSON 上也不會吃掉文字', () => {
    const first = splitSSEEvents('data: {"a":1}\n\ndata: {"b":');
    expect(first.events).toEqual(['data: {"a":1}']);
    expect(first.rest).toBe('data: {"b":');

    const second = splitSSEEvents(first.rest + '2}\n\n');
    expect(second.events).toEqual(['data: {"b":2}']);
    expect(second.rest).toBe('');
  });

  it('一個事件裡只取 data: 行，event:/id: 等欄位略過', () => {
    expect(dataLinesOf('event: content_block_delta\ndata: {"x":1}\nid: 3')).toEqual([' {"x":1}']);
  });

  it('CRLF 換行也要吃得下（部分代理會改寫換行）', () => {
    const { events } = splitSSEEvents('data: {"a":1}\r\n\r\n');
    expect(dataLinesOf(events[0])).toEqual([' {"a":1}']);
  });
});

describe('錯誤訊息', () => {
  it('取 error.message，取不到就回原文', () => {
    expect(extractErrorMessage('{"error":{"message":"金鑰無效"}}')).toBe('金鑰無效');
    expect(extractErrorMessage('502 Bad Gateway')).toBe('502 Bad Gateway');
  });
});

describe('requiresApiKey', () => {
  it('本機模型不需要金鑰，否則整個遊戲會靜默不發請求', () => {
    expect(requiresApiKey('openai', 'http://localhost:11434/v1')).toBe(false);
    expect(requiresApiKey('openai', 'http://127.0.0.1:1234/v1')).toBe(false);
    expect(requiresApiKey('openai', 'https://api.openai.com/v1')).toBe(true);
    expect(requiresApiKey('gemini', '')).toBe(true);
  });
});
