/**
 * AI 供應商抽象層（純函數）。
 *
 * 先前整個遊戲寫死 Google Gemini：`callAI` 直接 `new GoogleGenAI(...)`，
 * 設定畫面的模型清單也只有 Gemini 型號。玩家想換一家（文風、價格、可用性都是理由）
 * 就只能改程式重新部署。
 *
 * 這一層把「怎麼發請求、怎麼讀回應」抽成純資料與純函數，`useAIRequest` 只負責
 * timeout／abort／retry 的流程控制。新增一家供應商＝在這裡多一個分支，不動 hook。
 *
 * ⚠️ Gemini 仍走官方 SDK（既有行為不動），其餘走 fetch。
 */

export type ProviderId = 'gemini' | 'openai' | 'anthropic';

export interface ProviderModel {
  value: string;
  label: string;
}

/** 端點預設：OpenAI 相容協定被很多家共用，端點不同、協定相同 */
export interface EndpointPreset {
  label: string;
  baseUrl: string;
  keyUrl: string;
  models: ProviderModel[];
}

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  /** 一句話說明這個選項實際涵蓋哪些服務 */
  hint: string;
  /** 玩家可否改端點（Gemini 走官方 SDK，沒有這個欄位） */
  editableBaseUrl: boolean;
  defaultBaseUrl: string;
  defaultModel: string;
  keyUrl: string;
  keyPlaceholder: string;
  /** 端點預設清單；只有 OpenAI 相容那一類有多筆 */
  presets: EndpointPreset[];
}

/**
 * Gemini 的預設型號。**唯一準據**——`PROVIDERS` 與 `gmConfig` 的兩組預設值都讀這裡。
 *
 * ⚠️ 先前這個字串在三個地方各寫一份（`PROVIDERS.defaultModel`、`MAIN_GM_DEFAULTS`、
 * `SUB_GM_DEFAULTS`）。Google 把 2.5 家族鎖成「只有既有用戶能用」之後，新裝的人
 * 一選 Gemini 就是 404，而要修得記得改三個地方。
 */
export const GEMINI_DEFAULT_MODEL = 'gemini-3-flash-preview';

/**
 * ⚠️ 2.5／2.0 家族 Google 已鎖成「只有既有用戶能用」，新帳號呼叫直接 404：
 *
 *   This model models/gemini-2.5-pro is no longer available to new users.
 *   Please update your code to use models/gemini-3.1-pro-preview
 *
 * 刻意**不從清單移除**：還在用的既有帳號照樣叫得到，而且官方停用日是 2026/10/16，
 * 之前都還能跑。改成在標籤上講清楚，讓玩家自己判斷——照 CLAUDE.md 的規則，
 * 淘汰型號是從清單拿掉或標註，**絕不在讀取路徑上把 A 改寫成 B**
 * （那條規則正是 `gemini-2.0-flash` 被靜默改寫的那個 bug 留下的）。
 */
const GEMINI_MODELS: ProviderModel[] = [
  { value: 'gemini-3.1-pro-preview',        label: 'Gemini 3.1 Pro Preview（最強推理）' },
  { value: 'gemini-3-flash-preview',        label: 'Gemini 3 Flash Preview（快速／均衡・預設）' },
  { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview（最省費）' },
  { value: 'gemini-2.5-pro',                label: 'Gemini 2.5 Pro（新帳號不可用・10/16 停用）' },
  { value: 'gemini-2.5-flash',              label: 'Gemini 2.5 Flash（新帳號不可用・10/16 停用）' },
  { value: 'gemini-2.5-flash-lite',         label: 'Gemini 2.5 Flash Lite（新帳號不可用・10/16 停用）' },
  { value: 'gemini-2.0-flash',              label: 'Gemini 2.0 Flash（舊版・新帳號多半不可用）' },
  { value: 'gemini-2.0-flash-lite',         label: 'Gemini 2.0 Flash Lite（舊版・新帳號多半不可用）' },
  { value: 'gemma-4-31b-it',                label: 'Gemma 4 31B（開源模型）' },
];

const OPENAI_PRESETS: EndpointPreset[] = [
  {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { value: 'gpt-5.1',      label: 'GPT-5.1（最強）' },
      { value: 'gpt-5',        label: 'GPT-5' },
      { value: 'gpt-5-mini',   label: 'GPT-5 mini（省費）' },
      { value: 'gpt-4.1',      label: 'GPT-4.1' },
      { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
      { value: 'gpt-4o',       label: 'GPT-4o' },
    ],
  },
  {
    label: 'OpenRouter（一把 Key 通吃各家）',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    models: [
      { value: 'anthropic/claude-sonnet-4.5',            label: 'Claude Sonnet 4.5（敘事細膩）' },
      { value: 'deepseek/deepseek-chat',                 label: 'DeepSeek Chat（便宜中文好）' },
      { value: 'x-ai/grok-4',                            label: 'Grok 4' },
      { value: 'meta-llama/llama-3.3-70b-instruct',      label: 'Llama 3.3 70B' },
      { value: 'mistralai/mistral-large',                label: 'Mistral Large' },
    ],
  },
  {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { value: 'deepseek-chat',     label: 'DeepSeek Chat' },
      { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner（推理）' },
    ],
  },
  {
    label: '本機（Ollama / LM Studio）',
    baseUrl: 'http://localhost:11434/v1',
    keyUrl: '',
    models: [],
  },
];

const ANTHROPIC_MODELS: ProviderModel[] = [
  { value: 'claude-opus-5',    label: 'Claude Opus 5（最強）' },
  { value: 'claude-sonnet-5',  label: 'Claude Sonnet 5（均衡）' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5（快速省費）' },
];

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    hint: '官方 SDK，免費額度最寬鬆',
    editableBaseUrl: false,
    defaultBaseUrl: '',
    defaultModel: GEMINI_DEFAULT_MODEL,
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: '貼上 Gemini API Key...',
    presets: [{ label: 'Google', baseUrl: '', keyUrl: 'https://aistudio.google.com/app/apikey', models: GEMINI_MODELS }],
  },
  {
    id: 'openai',
    label: 'OpenAI 相容',
    hint: 'OpenAI／OpenRouter／DeepSeek／本機模型都走這條，只差端點',
    editableBaseUrl: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: '貼上 API Key（本機模型可留任意字元）...',
    presets: OPENAI_PRESETS,
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    hint: '原生 API，敘事風格與 Gemini 差異最大',
    editableBaseUrl: true,
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: '貼上 Anthropic API Key（sk-ant-...）...',
    presets: [{ label: 'Anthropic', baseUrl: 'https://api.anthropic.com', keyUrl: 'https://console.anthropic.com/settings/keys', models: ANTHROPIC_MODELS }],
  },
];

export const DEFAULT_PROVIDER: ProviderId = 'gemini';

export function providerMeta(id: string): ProviderMeta {
  return PROVIDERS.find(p => p.id === id) ?? PROVIDERS[0];
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && PROVIDERS.some(p => p.id === value);
}

/**
 * 依端點挑出模型捷徑清單。
 *
 * ⚠️ 清單只是捷徑，設定畫面一律允許自由輸入 model id——
 * 寫死的清單跟不上各家改版，這是 `ModelPicker` 早就學到的一課。
 */
export function modelsForEndpoint(provider: string, baseUrl: string): ProviderModel[] {
  const meta = providerMeta(provider);
  const normalized = normalizeBaseUrl(baseUrl);
  const hit = meta.presets.find(p => normalizeBaseUrl(p.baseUrl) === normalized);
  return (hit ?? meta.presets[0])?.models ?? [];
}

/** 去掉尾端斜線；端點比對與組路徑都以這個形式為準 */
export function normalizeBaseUrl(url: string): string {
  return (url || '').trim().replace(/\/+$/, '');
}

// ─── 請求組裝 ────────────────────────────────────────────────────────────────

export interface BuildRequestOptions {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens: number;
  stream: boolean;
  responseJson?: boolean;
}

export interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/**
 * GPT-5／o 系列改用 `max_completion_tokens`，舊欄位直接回 400。
 * 其餘 OpenAI 相容服務（OpenRouter／DeepSeek／Ollama）仍只認 `max_tokens`，
 * 所以不能一律改，只能依 model id 判。
 */
export function openAITokenField(model: string): 'max_tokens' | 'max_completion_tokens' {
  return /^(gpt-5|o[134])/.test(model.trim()) ? 'max_completion_tokens' : 'max_tokens';
}

/** 只輸出 JSON 的指示。OpenAI 的 json_object 模式要求訊息裡出現 "json" 字樣，這句同時滿足兩件事 */
const JSON_SYSTEM = 'Respond with raw JSON only. No markdown fences, no explanation.';

export function buildChatRequest(o: BuildRequestOptions): BuiltRequest {
  const base = normalizeBaseUrl(o.baseUrl) || providerMeta(o.provider).defaultBaseUrl;
  const key = o.apiKey.trim();
  const model = o.model.trim();

  if (o.provider === 'anthropic') {
    return {
      url: `${base}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        // 瀏覽器直連需要這個 header，否則 Anthropic 端直接擋掉（這個遊戲沒有後端）
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model,
        max_tokens: o.maxTokens,
        messages: [{ role: 'user', content: o.prompt }],
        ...(o.stream ? { stream: true } : {}),
        ...(o.responseJson ? { system: JSON_SYSTEM } : {}),
      },
    };
  }

  // OpenAI 相容
  const messages: { role: string; content: string }[] = [];
  if (o.responseJson) messages.push({ role: 'system', content: JSON_SYSTEM });
  messages.push({ role: 'user', content: o.prompt });

  return {
    url: `${base}/chat/completions`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: {
      model,
      messages,
      [openAITokenField(model)]: o.maxTokens,
      ...(o.stream ? { stream: true } : {}),
      ...(o.responseJson ? { response_format: { type: 'json_object' } } : {}),
    },
  };
}

// ─── 回應解析 ────────────────────────────────────────────────────────────────

/** 非串流回應取出文字 */
export function extractText(provider: string, json: unknown): string {
  if (!json || typeof json !== 'object') return '';
  const data = json as Record<string, any>;
  if (provider === 'anthropic') {
    const blocks = Array.isArray(data.content) ? data.content : [];
    return blocks.filter((b: any) => b?.type === 'text').map((b: any) => b.text ?? '').join('');
  }
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * 串流事件取出這一段新增的文字。
 * 傳入的是 SSE `data:` 後面那段字串；`[DONE]` 與解析不了的雜訊一律回空字串。
 */
export function extractStreamDelta(provider: string, data: string): string {
  const trimmed = data.trim();
  if (!trimmed || trimmed === '[DONE]') return '';
  let json: any;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return '';
  }
  if (provider === 'anthropic') {
    if (json?.type === 'content_block_delta' && json?.delta?.type === 'text_delta') {
      return json.delta.text ?? '';
    }
    return '';
  }
  return json?.choices?.[0]?.delta?.content ?? '';
}

/**
 * 從 SSE 緩衝區切出完整事件。
 *
 * ⚠️ 必須留下未完成的尾段。分塊邊界會切在任何位置，直接對整個緩衝區 split
 * 會把半行 JSON 當成完整事件丟給 parse，那一段文字就靜默消失。
 */
export function splitSSEEvents(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? '';
  return { events: parts.filter(p => p.trim()), rest };
}

/** 一個 SSE 事件可能有多行，只取 `data:` 那些行 */
export function dataLinesOf(event: string): string[] {
  return event
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5));
}

/** 錯誤回應裡的訊息，各家都塞在 error.message，取不到就回原文 */
export function extractErrorMessage(raw: string): string {
  try {
    const json = JSON.parse(raw);
    return json?.error?.message ?? json?.message ?? raw;
  } catch {
    return raw;
  }
}

/**
 * 這個端點需不需要 API Key。
 *
 * 本機跑的 Ollama／LM Studio 沒有金鑰概念，`callAI` 原本的
 * `if (!key.trim()) return ''` 會讓整個遊戲在本機模型下完全不發請求，
 * 而且沒有任何錯誤訊息——玩家只看到 AI 不回話。
 */
export function requiresApiKey(provider: string, baseUrl: string): boolean {
  if (provider === 'gemini') return true;
  return !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(normalizeBaseUrl(baseUrl));
}

/**
 * 把 AI 呼叫的錯誤翻成玩家看得懂、而且**指得出下一步**的一句話。
 *
 * 先前 `handleSendMessage` 一律丟「API 呼叫失敗，請檢查設定或網路連線」，
 * 真正的訊息只進 `console.error`。玩家換了供應商連不上時完全無從判斷是金鑰錯、
 * 型號打錯、還是那家根本不讓瀏覽器直連——只能回報「連接失敗」。
 *
 * ⚠️ 瀏覽器對 CORS 失敗只會給一個沒有細節的 `TypeError: Failed to fetch`：
 * 規格上不讓 JS 讀到原因，避免拿來探測內網。所以這裡只能講「可能是」，
 * 並指向 DevTools Console——那裡才有瀏覽器自己印的那行 CORS 說明。
 */
/**
 * 把供應商包了好幾層的錯誤攤平。
 *
 * Gemini SDK 丟出來的 `Error.message` 是一整串 JSON，而且**裡面還包一層 JSON 字串**：
 *
 *   {"error":{"message":"{\n \"error\": {\n \"code\": 404, \"message\": \"This model
 *   models/gemini-2.5-pro is no longer available to new users...\"}}","code":404}}
 *
 * 直接顯示就是一整面括號與跳脫字元，玩家讀不出「原來是型號被下架了」。
 * 而最內層那句話是 Google 自己寫的、還指名了該換哪個型號——正是我們要給玩家的下一步。
 */
export function unwrapProviderError(raw: string): { code?: number; text: string } {
  let text = raw.trim();
  let code: number | undefined;

  // 巢狀最多剝三層就停：來源是外部字串，沒有上限的話畸形輸入可以讓它一直繞
  for (let depth = 0; depth < 3; depth++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      break;
    }
    const node = (parsed && typeof parsed === 'object' && 'error' in parsed
      ? (parsed as Record<string, any>).error
      : parsed) as Record<string, any> | null;
    if (!node || typeof node !== 'object') break;

    if (typeof node.code === 'number') code = node.code;
    if (typeof node.message !== 'string' || !node.message.trim()) break;
    text = node.message.trim();
  }

  return { code, text };
}

/**
 * 把 AI 呼叫的錯誤翻成玩家看得懂、而且**指得出下一步**的一句話。
 *
 * 先前 `handleSendMessage` 一律丟「API 呼叫失敗，請檢查設定或網路連線」，
 * 真正的訊息只進 `console.error`。玩家換了供應商連不上時完全無從判斷是金鑰錯、
 * 型號打錯、還是那家根本不讓瀏覽器直連——只能回報「連接失敗」。
 *
 * ⚠️ 瀏覽器對 CORS 失敗只會給一個沒有細節的 `TypeError: Failed to fetch`：
 * 規格上不讓 JS 讀到原因，避免拿來探測內網。所以這裡只能講「可能是」，
 * 並指向 DevTools Console——那裡才有瀏覽器自己印的那行 CORS 說明。
 */
export function describeAIError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return '已取消';
  if (!(error instanceof Error)) return '未知錯誤';

  const message = error.message;
  if (message === 'REQUEST_TIMEOUT') return '請求超時';

  // 兩條路：fetch 那側自己組成 `HTTP 429 ...`；Gemini SDK 丟的是巢狀 JSON
  const httpPrefix = message.match(/^HTTP (\d{3})/)?.[1];
  const unwrapped = unwrapProviderError(message);
  const status = httpPrefix ?? (unwrapped.code != null ? String(unwrapped.code) : undefined);
  const detail = (httpPrefix ? message.replace(/^HTTP \d{3}\s*/, '') : unwrapped.text).trim();
  const withDetail = (text: string) => (detail ? `${text}（${detail}）` : text);

  switch (status) {
    case '400': return withDetail('請求被拒絕，多半是型號 id 打錯或該端點不支援某個參數');
    case '401': return withDetail('API Key 無效');
    case '403': return withDetail('這把 Key 沒有權限，或該地區／來源被擋');
    case '404': return withDetail('型號或端點不存在——型號可能已下架，換一個再試');
    // 402 是「錢的問題」不是「設定的問題」。Google 的預付額度用完就回這個，
    // 訊息裡帶著儲值頁的網址——玩家最需要的正是那個連結
    case '402': return withDetail('帳戶額度用完了，要去供應商後台儲值，或改用其他供應商');
    case '413': return withDetail('送出的內容太長');
    case '429': return withDetail('請求太頻繁，或免費額度的速率上限到了');
    case '500': case '502': case '503': case '504':
      return withDetail('供應商那端出錯，稍後再試');
  }
  if (status) return withDetail(`HTTP ${status}`);

  // fetch 連 HTTP 狀態都拿不到：CORS、網址打錯、DNS、離線都長這樣
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return '連不上端點。可能是端點網址錯了，或該服務不允許從瀏覽器直接呼叫（CORS）；開瀏覽器主控台看那行紅字可以確認';
  }
  return detail || message;
}
