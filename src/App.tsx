import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Settings, Send, RefreshCw, MoreVertical, Book, BookOpen, User, Package, Beaker, Users, Heart, MapPin, Zap, Coins, Calendar, Shield, CheckSquare, ChevronDown, ChevronRight, Map as MapIcon, Cloud, Sun, CloudRain, Snowflake, Moon, Wind, Sparkles, Brain, ScrollText, History, X, Edit2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { DiaryModal } from './components/DiaryModal';
import { LorebookModal } from './components/LorebookModal';
import { Npc, LorebookEntry, MemoryEntry, Message, NpcMemory, EquipmentItem, ItemEntry, GMConfig, SubGMConfig } from './types';
import { NpcModal, affectionColor } from './components/NpcModal';
import { QuestModal } from './components/QuestModal';
import { ProfileModal } from './components/ProfileModal';
import { SystemPromptModal } from './components/SystemPromptModal';
import { SettingsModal } from './components/SettingsModal';
import { MapModal } from './components/MapModal';
import { MessageCard } from './components/MessageCard';
import { MONTHS_DATA } from './constants';
import { useGameStore, SAVE_KEY } from './hooks/useGameStore';
import { useCommandParser } from './hooks/useCommandParser';
import { getTotalDaysFromTimeState, getQuestRemainingDays } from './utils/timeUtils';
import { performanceMonitor } from './utils/performanceMonitor';
import { debounce } from './utils/debounce';

// ─── Markdown Parser ─────────────────────────────────────────────────────────

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;
  let keyIdx = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('`')) {
      parts.push(<span key={`${keyPrefix}-c${keyIdx++}`} className="font-medium" style={{ color: 'var(--color-rose)' }}>{token.slice(1, -1)}</span>);
    } else if (token.startsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-b${keyIdx++}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={`${keyPrefix}-i${keyIdx++}`} style={{ color: 'var(--text-dialog-muted)' }}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

const FONT_CLASS_MAP: Record<string, string> = {
  sans:  'font-game-sans',
  serif: 'font-game-serif',
  spell: 'font-game-spell',
};

function renderLines(text: string): React.ReactNode {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // 引用區塊：連續 > 開頭行合併
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      const startI = i;
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      result.push(
        <div key={`bq-${startI}`} className="border-l-2 pl-3 my-2 rounded-r-[8px] py-2 space-y-1" style={{ borderColor: 'var(--border-default)' }}>
          {quoteLines.map((ql, qi) => (
            <p key={qi} className="leading-relaxed text-sm" style={{ color: 'var(--text-body)' }}>{renderInline(ql, `bq-${startI}-${qi}`)}</p>
          ))}
        </div>
      );
      continue;
    }
    // 分隔線
    if (line.trim() === '---') {
      result.push(<hr key={`hr-${i}`} className="my-3" style={{ borderColor: 'var(--bg-elevated)', opacity: 0.6 }} />);
      i++; continue;
    }
    // 空行 → 間距
    if (line.trim() === '') {
      result.push(<div key={`sp-${i}`} className="h-2" />);
      i++; continue;
    }
    // 普通段落
    result.push(<p key={`p-${i}`} className="leading-relaxed">{renderInline(line, `p-${i}`)}</p>);
    i++;
  }
  return <>{result}</>;
}

function renderMarkdown(text: string): React.ReactNode {
  // 切分 [FONT:xxx]...[/FONT] 區塊
  const fontRegex = /\[FONT:(sans|serif|spell)\]([\s\S]*?)\[\/FONT\]/g;
  const segments: { text: string; font?: string }[] = [];
  let lastIndex = 0;
  let match;
  while ((match = fontRegex.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ text: text.slice(lastIndex, match.index) });
    segments.push({ text: match[2], font: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex) });
  if (segments.length === 0) segments.push({ text });

  return (
    <>
      {segments.map((seg, si) => {
        const fontClass = seg.font ? (FONT_CLASS_MAP[seg.font] ?? '') : '';
        const content = renderLines(seg.text);
        return fontClass
          ? <div key={si} className={fontClass}>{content}</div>
          : <React.Fragment key={si}>{content}</React.Fragment>;
      })}
    </>
  );
}

// ─── 顯示時清理殘留指令（AI 有時不包在 COMMANDS 區塊內）─────────────────────
const BARE_CMD_PATTERN = /^(?:<<)?(?:HP:[+-]\d+|MP:[+-]\d+|GOLD:[+-]\d+|AFFINITY:.+:[+-]?\d+|LOCATION:.+|TIME:\+\d+[hm]|ITEM_ADD:.+|ITEM_REMOVE:.+:\d+|ITEM_USE:.+|NPC_NEW:.+|NPC_HOME:[^:]+:.+|NPC_LOCATION:[^:]+:.+|NPC_THOUGHT:[^:]+:.+|NPC_RELATIONSHIP:[^:]+:.+|QUEST_ADD:.+|QUEST_GOAL_MET:.+|QUEST_COMPLETE:.+|MEMORY_ADD:.+|LOCATION_DISCOVER:.+)(?:>>)?$/;

function stripBareCommands(text: string): string {
  return text.split('\n').filter(line => !BARE_CMD_PATTERN.test(line.trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  // ─── UI 狀態（Modal / 輸入 / 載入）──────────────────────────────────────────
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isDiaryModalOpen, setIsDiaryModalOpen] = useState(false);
  const [isLorebookModalOpen, setIsLorebookModalOpen] = useState(false);
  const [isSystemPromptModalOpen, setIsSystemPromptModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isConsumablesOpen, setIsConsumablesOpen] = useState(false);
  const inventoryBtnRef = useRef<HTMLButtonElement>(null);
  const consumablesBtnRef = useRef<HTMLButtonElement>(null);
  const inventoryPanelRef = useRef<HTMLDivElement>(null);
  const consumablesPanelRef = useRef<HTMLDivElement>(null);
  const [inventoryPanelPos, setInventoryPanelPos] = useState({ top: 0, left: 0 });
  const [consumablesPanelPos, setConsumablesPanelPos] = useState({ top: 0, left: 0 });
  const [isUpdatingLog, setIsUpdatingLog] = useState(false);
  const [hasNewDiary, setHasNewDiary] = useState(false);
  // Sub GM 節流：每 3 回合最多觸發一次（不存檔，session 內計數）
  const subGMRoundsRef = useRef(0);

  // 背景處理：整理冒險日誌與目標（使用 callAI 封裝層，不綁定特定 API）
  const updateAdventureState = async (history: Message[], newItems: string[] = [], hasKeyEvent = false) => {
    if (history.length < 2) return;

    // 節流：每 3 回合最多觸發一次；關鍵事件（任務/移動/世界記憶）可跳過冷卻
    subGMRoundsRef.current += 1;
    if (subGMRoundsRef.current < 3 && !hasKeyEvent) return;
    subGMRoundsRef.current = 0;

    setIsUpdatingLog(true);
    try {
      const lastMessages = history.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
      const itemClassifySection = newItems.length > 0
        ? `\n\n另外，請判斷以下新增道具各屬於「裝備」（武器、防具、飾品等穿戴型）還是「道具」（消耗品、材料、卷軸等使用型）。
請在 JSON 中加入 "item_types" 欄位，key 為道具名，value 為 "equipment" 或 "item"。
新增道具：${newItems.join('、')}`
        : '';

      // ── 階段一：生成本輪摘要 ──────────────────────────────────────────────
      const prompt = `你是 RPG 後台資料整理員，不負責說故事。
根據以下最新一則對話，輸出固定 JSON，只輸出 JSON，不要任何說明：
{
  "summary": "以第三人稱過去式記錄：主角做了什麼、結果如何、對冒險有何影響。若本輪純屬日常閒聊或無實質進展，輸出 null",
  "goals": ["短期目標1", "短期目標2"]${newItems.length > 0 ? `,\n  "item_types": { "道具名": "equipment 或 item" }` : ''}
}
${itemClassifySection}

對話內容：
${lastMessages}`;

      const text = await callAI(prompt);
      if (!text) return;
      const clean = text.replace(/```json|```/g, '').trim();
      const data = JSON.parse(clean);

      // 更新短期目標
      if (data.goals) {
        setCurrentGoals(data.goals);
      }

      // 道具分類
      if (data.item_types && typeof data.item_types === 'object') {
        const toEquip: string[] = Object.entries(data.item_types)
          .filter(([, v]) => v === 'equipment')
          .map(([k]) => k);
        if (toEquip.length > 0) {
          const moving = items.filter(i => toEquip.includes(i.name));
          const remainingItems = items.filter(i => !toEquip.includes(i.name));
          const newEquipment = [...equipment];
          moving.forEach(item => {
            if (!newEquipment.some(e => e.name === item.name)) {
              newEquipment.push({ id: item.id, name: item.name, description: item.description, isEquipped: false });
            }
          });
          setItems(remainingItems);
          setEquipment(newEquipment);
        }
      }

      // 摘要加入暫存池（null 表示本輪無實質進展，略過）
      if (data.summary && typeof data.summary === 'string') {
        // 左欄只顯示最新一則
        setAdventureLog([data.summary]);

        // 加入暫存池，達 10 則觸發壓縮
        const newPool = [...summaryPool, data.summary];
        if (newPool.length >= 10) {
          // ── 階段二：壓縮摘要（靜默背景）──────────────────────────────────
          const compressPrompt = `你是 RPG 後台資料整理員。
以下是最近 ${newPool.length} 則冒險摘要，請整理成一段連貫的事件紀錄：

規則：
- 保留所有具意義的行動、事件、NPC 互動、地點變化
- 合併重複或相似的內容
- 瑣事（純移動、日常對話、無結果的閒逛）可省略
- 第三人稱過去式，100 字以內
- 直接輸出文字，不要任何說明或標題

摘要列表：
${newPool.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

          const compressed = await callAI(compressPrompt);
          if (compressed) {
            const newCompressCount = compressCount + 1;
            setSummaryPool([compressed.trim()]);
            setCompressCount(newCompressCount);

            // ── 階段三：壓縮 3 次後自動生成日記（靜默）────────────────────
            if (newCompressCount >= 3) {
              setCompressCount(0);
              // 取出目前暫存池（含剛壓縮的這段）作為日記素材
              handleGenerateDiaryFromPool([compressed.trim()]);
            }
          } else {
            // 壓縮失敗時保留原池，避免資料遺失
            setSummaryPool(newPool);
          }
        } else {
          setSummaryPool(newPool);
        }
      }
    } catch (error) {
      console.error("Failed to update adventure state:", error);
    } finally {
      setIsUpdatingLog(false);
    }
  };
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<number | null>(null);
  const [selectedConsumableItem, setSelectedConsumableItem] = useState<number | null>(null);
  const [selectedNpc, setSelectedNpc] = useState<Npc | null>(null);
  const [toastQueue, setToastQueue] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(() => {
    const saved = localStorage.getItem('rpworld_last_saved');
    return saved ? new Date(saved) : null;
  });
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editMessageText, setEditMessageText] = useState('');
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryContent, setEditingMemoryContent] = useState('');
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingQuickOptions, setIsLoadingQuickOptions] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);

  // ─── API 設定（不屬於遊戲存檔，獨立存於 localStorage）───────────────────────
  const [mainGMConfig, setMainGMConfig] = useState<GMConfig>(() => {
    // 一次性 migrate：舊 gemini_api_key → mainGM_config
    const oldKey = localStorage.getItem('gemini_api_key');
    if (oldKey && !localStorage.getItem('mainGM_config')) {
      const cfg: GMConfig = {
        provider: 'gemini', apiKey: oldKey, model: 'gemini-2.5-flash',
        maxTokens: 2048, lastSaved: new Date().toISOString(),
      };
      localStorage.setItem('mainGM_config', JSON.stringify(cfg));
      localStorage.removeItem('gemini_api_key');
      localStorage.removeItem('gemini_max_tokens');
      return cfg;
    }
    try {
      const raw = localStorage.getItem('mainGM_config');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.model === 'gemini-2.0-flash') parsed.model = 'gemini-2.5-flash';
        return { provider: 'gemini', model: 'gemini-2.5-flash', maxTokens: 2048, apiKey: '', lastSaved: '', ...parsed };
      }
    } catch { /* ignore */ }
    return { provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash', maxTokens: 2048, lastSaved: '' };
  });

  const [subGMConfig, setSubGMConfig] = useState<SubGMConfig>(() => {
    try {
      const raw = localStorage.getItem('subGM_config');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.model === 'gemini-2.0-flash') parsed.model = 'gemini-2.5-flash';
        return { provider: 'gemini', model: 'gemini-2.5-flash', maxTokens: 512, apiKey: '', useSameKey: true, lastSaved: '', ...parsed };
      }
    } catch { /* ignore */ }
    return { provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash', maxTokens: 512, useSameKey: true, lastSaved: '' };
  });

  // ─── 遊戲狀態（useGameStore）────────────────────────────────────────────────
  const store = useGameStore();
  const {
    timeState, setTimeState,
    profile, setProfile,
    systemPrompt, setSystemPrompt,
    npcs, setNpcs,
    appearingNpcs, setAppearingNpcs,
    currentLocation, setCurrentLocation,
    memories, setMemories,
    stickyCounters, setStickyCounters,
    cooldownCounters, setCooldownCounters,
    quests, setQuests,
    diaryEntries, setDiaryEntries,
    lorebookEntries, setLorebookEntries,
    equipment, setEquipment,
    items, setItems,
    messages, setMessages,
    quickOptions, setQuickOptions,
    adventureLog, setAdventureLog,
    currentGoals, setCurrentGoals,
    summaryPool, setSummaryPool,
    compressCount, setCompressCount,
    saveToStorage,
    loadFromData,
  } = store;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const INITIAL_VISIBLE_MESSAGES = 10;
  const VISIBLE_MESSAGES_STEP = 10;
  const [visibleMessageCount, setVisibleMessageCount] = useState<number>(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const isAutoLoadingRef = useRef(false);
  const visibleMessages = visibleMessageCount > 0 ? messages.slice(-visibleMessageCount) : [];
  const hiddenMessageCount = Math.max(messages.length - visibleMessages.length, 0);

  // ─── Phase 2: Debounced load-more handler ──────────────────────────────────────
  const handleLoadMore = useMemo(
    () => debounce(() => {
      if (hiddenMessageCount > 0 && !isAutoLoadingRef.current) {
        isAutoLoadingRef.current = true;
        setVisibleMessageCount(prev => Math.min(messages.length, prev + VISIBLE_MESSAGES_STEP));
      }
    }, 150),
    [hiddenMessageCount, messages.length]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
      if (visibleMessageCount !== 0) setVisibleMessageCount(0);
      return;
    }
    setVisibleMessageCount(prev => {
      if (prev === 0) return Math.min(messages.length, INITIAL_VISIBLE_MESSAGES);
      if (prev >= messages.length - 1) return messages.length;
      return prev;
    });
  }, [messages.length]);

  useEffect(() => {
    if (!isAutoLoadingRef.current) return;
    const el = chatScrollRef.current;
    if (!el) { isAutoLoadingRef.current = false; return; }
    requestAnimationFrame(() => {
      el.scrollTop = 8;
      isAutoLoadingRef.current = false;
    });
  }, [visibleMessageCount]);

  // ─── Phase 1: Expose Performance Monitor for Development ──────────────────────
  useEffect(() => {
    (window as any).__performanceMonitor = {
      getScrollMetrics: () => performanceMonitor.getScrollMetrics(),
      getRenderMetrics: () => performanceMonitor.getRenderMetrics(),
      getReport: () => console.log(performanceMonitor.generateReport()),
      clear: () => performanceMonitor.clear(),
    };
  }, []);

  // ─── 時間工具 ────────────────────────────────────────────────────────────────
  const getTimeOfDay = (hour: number) => {
    if (hour >= 5 && hour < 9) return '清晨';
    if (hour >= 9 && hour < 16) return '白天';
    if (hour >= 16 && hour < 19) return '黃昏';
    return '夜晚';
  };
  const timeOfDay = getTimeOfDay(timeState.hour);
  const currentMonthData = MONTHS_DATA.find(m => m.id === timeState.month) || MONTHS_DATA[0];

  const getWeatherIcon = () => {
    switch (timeState.weather) {
      case '晴朗': return <Sun className="w-3.5 h-3.5 mr-1.5" style={{ color: 'var(--color-amber)' }} />;
      case '陰天': return <Cloud className="w-3.5 h-3.5 mr-1.5 text-[var(--text-muted)]" />;
      case '下雨': return <CloudRain className="w-3.5 h-3.5 mr-1.5" style={{ color: 'var(--color-blue)' }} />;
      case '下雪': return <Snowflake className="w-3.5 h-3.5 mr-1.5" style={{ color: 'var(--color-sky)' }} />;
      case '起霧': return <Wind className="w-3.5 h-3.5 mr-1.5" style={{ color: 'var(--text-body)' }} />;
      default: return <Sun className="w-3.5 h-3.5 mr-1.5" style={{ color: 'var(--color-amber)' }} />;
    }
  };
  const getSkyGradient = (hour: number, weather: string): string => {
    let top: string, btm: string;
    if (hour < 5)       { top = '#010409'; btm = '#0a0d14'; }
    else if (hour < 7)  { top = '#0d0d2b'; btm = '#1a0a2e'; }
    else if (hour < 9)  { top = '#2d1b4e'; btm = '#c2703a'; }
    else if (hour < 17) { top = '#1a3a5c'; btm = '#2e5f8a'; }
    else if (hour < 19) { top = '#6b2d3e'; btm = '#c4602a'; }
    else if (hour < 21) { top = '#1a1535'; btm = '#2a1f4a'; }
    else                { top = '#05070f'; btm = '#0e1220'; }
    const base = `linear-gradient(to bottom, ${top}, ${btm})`;
    const overlayMap: Record<string, string> = {
      '陰天': 'rgba(80,80,80,0.25)',
      '下雨': 'rgba(30,50,80,0.35)',
      '下雪': 'rgba(200,220,240,0.15)',
      '起霧': 'rgba(150,150,150,0.30)',
    };
    const overlay = overlayMap[weather];
    return overlay ? `linear-gradient(to bottom, ${overlay}, ${overlay}), ${base}` : base;
  };

  const getCelestialIcon = () => {
    if (timeState.month === 4) {
      return (
        <div className="flex items-center mr-1.5 relative w-5 h-4">
          <Moon className="w-3.5 h-3.5 absolute left-0" style={{ color: 'var(--text-body)' }} />
          <Moon className="w-3.5 h-3.5 absolute right-0 top-0.5 opacity-80" style={{ color: 'var(--color-violet)' }} />
        </div>
      );
    }
    if (timeOfDay === '夜晚' || timeOfDay === '清晨') {
      return <Moon className="w-3.5 h-3.5 mr-1.5" style={{ color: 'var(--text-body)' }} />;
    }
    return <Sun className="w-3.5 h-3.5 mr-1.5 opacity-50" style={{ color: 'var(--color-amber)' }} />;
  };

  // ─── Toast（notifyCommandResult）────────────────────────────────────────────
  // 自適應間隔：佇列長度 ≤ 3 → 700ms，4–6 → 500ms，7+ → 350ms
  const getToastInterval = (queueLen: number) => {
    if (queueLen <= 3) return 700;
    if (queueLen <= 6) return 500;
    return 350;
  };

  const drainToastQueue = useCallback((queue: string[]) => {
    if (queue.length === 0) return;
    const interval = getToastInterval(queue.length);
    let i = 0;
    const next = () => {
      if (i >= queue.length) {
        toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
        return;
      }
      setToastMessage(queue[i]);
      i++;
      toastTimerRef.current = setTimeout(next, i < queue.length ? interval : 3000);
    };
    next();
  }, []);

  // showToast：單則立即顯示（散落在 App.tsx 各處的直接呼叫維持不變）
  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // notifyCommandResult：接收 parser 回傳的批次訊息，自適應排程
  const notifyCommandResult = useCallback((messages: string[]) => {
    if (messages.length === 0) return;
    if (messages.length === 1) { showToast(messages[0]); return; }
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastQueue(messages);
    drainToastQueue(messages);
  }, [showToast, drainToastQueue]);

  // ─── AI 呼叫封裝（API 無關層）────────────────────────────────────────────────
  // 所有 AI 呼叫統一走此函數，未來換 provider 只需改這裡
  // role='main' → 使用主 GM 設定；role='sub'（預設）→ 使用助理 GM 設定
  // onChunk → 走 streaming，無 onChunk → 走一次性 generateContent
  const callAI = useCallback(async (
    prompt: string,
    options?: { role?: 'main' | 'sub'; maxTokens?: number; onChunk?: (chunk: string) => void }
  ): Promise<string> => {
    const { role = 'sub' } = options || {};
    const cfg = role === 'main' ? mainGMConfig : subGMConfig;
    const key = (role === 'sub' && subGMConfig.useSameKey) ? mainGMConfig.apiKey : cfg.apiKey;
    if (!key.trim()) return '';
    const model = cfg.model || 'gemini-2.5-flash';
    const tokens = options?.maxTokens ?? cfg.maxTokens;
    try {
      const ai = new GoogleGenAI({ apiKey: key.trim() });
      if (options?.onChunk) {
        const response = await ai.models.generateContentStream({
          model, contents: prompt, config: { maxOutputTokens: tokens },
        });
        let fullText = '';
        for await (const chunk of response) {
          if (chunk.text) { fullText += chunk.text; options.onChunk(chunk.text); }
        }
        return fullText;
      } else {
        const response = await ai.models.generateContent({
          model, contents: prompt, config: { maxOutputTokens: tokens },
        });
        return response.text?.trim() || '';
      }
    } catch (err) { throw err; }
  }, [mainGMConfig, subGMConfig]);

  // ─── 指令解析器（useCommandParser）─────────────────────────────────────────
  const { parseAndExecuteCommands, useItem, scanKeywords, isMemoryTriggered, tickMemoryCounters } =
    useCommandParser({
      timeState, currentLocation, quests, memories, items,
      stickyCounters, cooldownCounters, messages, lorebookEntries,
      setTimeState, setProfile, setCurrentLocation, setQuests,
      setMemories, setEquipment, setItems, setNpcs,
      setLorebookEntries, setQuickOptions,
      setStickyCounters, setCooldownCounters,
      notifyCommandResult,
      showToast,
      onNewQuest: () => setIsQuestModalOpen(true),
      callAI,
    });

  // ─── 地圖旅行 ────────────────────────────────────────────────────────────────
  const handleTravel = (destName: string, byCarriage: boolean) => {
    // Deduct carriage fare if applicable
    if (byCarriage) {
      const destEntry = lorebookEntries.find(e => e.category === '地點' && e.title === destName);
      const fare = destEntry?.cartFare ?? 0;
      if (fare > 0) {
        if (profile.gold < fare) {
          showToast(`💸 銅幣不足，搭馬車需要 ${fare} 銅`);
          return;
        }
        setProfile(prev => ({ ...prev, gold: prev.gold - fare }));
        showToast(`支付馬車費 ${fare} 銅`);
      }
    }
    // Update location
    setCurrentLocation(destName);
    // Mark destination as 'known' in lorebookEntries
    setLorebookEntries(prev => prev.map(e =>
      e.category === '地點' && e.title === destName
        ? { ...e, mapStatus: 'known' as const }
        : e
    ));
    // Send message to AI
    const msg = byCarriage
      ? `搭馬車前往${destName}。`
      : `徒步前往${destName}。`;
    setIsMapOpen(false);
    handleSendMessage(msg, undefined, destName);
  };

  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    if (activeMenuId !== null) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeMenuId]);

  useEffect(() => {
    if (!isInventoryOpen && !isConsumablesOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        inventoryBtnRef.current?.contains(target) ||
        inventoryPanelRef.current?.contains(target) ||
        consumablesBtnRef.current?.contains(target) ||
        consumablesPanelRef.current?.contains(target)
      ) return;
      setIsInventoryOpen(false);
      setIsConsumablesOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isInventoryOpen, isConsumablesOpen]);

  const handleAddDiary = () => {
    const newId = Date.now();
    setDiaryEntries([{ id: newId, title: '', text: '', isActive: true, keywords: [] }, ...diaryEntries]);
    return newId;
  };

  const handleDiaryTitleChange = (id: number, title: string) => {
    setDiaryEntries(prev => prev.map(e => e.id === id ? { ...e, title } : e));
  };

  const handleDiaryKeywordAdd = (id: number, keyword: string) => {
    const kw = keyword.trim();
    if (!kw) return;
    setDiaryEntries(prev => prev.map(e =>
      e.id === id
        ? { ...e, keywords: [...(e.keywords || []).filter((k: string) => k !== kw), kw] }
        : e
    ));
  };

  const handleDiaryKeywordRemove = (id: number, keyword: string) => {
    setDiaryEntries(prev => prev.map(e =>
      e.id === id
        ? { ...e, keywords: (e.keywords || []).filter((k: string) => k !== keyword) }
        : e
    ));
  };

  const handleDeleteDiary = (id: number) => {
    setDiaryEntries(diaryEntries.filter(entry => entry.id !== id));
  };

  const handleToggleDiary = (id: number) => {
    setDiaryEntries(diaryEntries.map(entry => 
      entry.id === id ? { ...entry, isActive: !entry.isActive } : entry
    ));
  };

  // ─── 🔮 魔法日記：AI 自動生成（手動觸發，吃最近 20 則對話）─────────────────
  const handleGenerateDiary = async (silent = false) => {
    if (!mainGMConfig.apiKey.trim()) { if (!silent) showToast('❌ 請先設定 API Key'); return; }
    try {
      const recentChat = messages.slice(-20).map(m =>
        `${m.role === 'user' ? 'Player' : 'DM'}: ${m.text}`
      ).join('\n');

      const prompt = `你是一個故事日記助手。根據以下最近的20則對話紀錄，生成一則第三人稱的日記條目，格式如下：


## 必須寫進日記的要點
* 角色層面 - 主角變化、角色關係進展、重要新角色登場
* 情節層面 - 推動主線的重大事件、重要伏筆和線索
* 世界觀層面 - 新設定、關鍵道具、地點
* 情感層面 - 情感轉折點、重要互動細節

## 寫作要求
- 簡潔明瞭，重點突出
- 使用「引號」標記重要對話和專有名詞
- 禁止使用**粗體**
- 使用繁體中文
- 500字以內

格式如下：

[日記標題]

日記內容：
    - 按時間順序詳述事件發展，包含重要對話、行動、心理活動。
    - 兩句話描述可能會發生的事：1. (故事主線相關)。2. (故事支線相關)


---
最近對話：
${recentChat}

請直接輸出日記內容，不要加任何前綴說明。`;

      const text = await callAI(prompt, { role: 'main' });
      if (!text) { if (!silent) showToast('❌ 生成失敗，請稍後再試'); return; }
      _applyDiaryText(text, silent);
    } catch (e) {
      if (!silent) showToast('❌ 生成失敗，請稍後再試');
    }
  };

  // ─── 🔮 魔法日記：自動觸發（吃暫存壓縮摘要，靜默）──────────────────────────
  const handleGenerateDiaryFromPool = async (pool: string[]) => {
    if (!mainGMConfig.apiKey.trim()) return;
    try {
      const poolText = pool.map((p, i) => `[紀錄 ${i + 1}]\n${p}`).join('\n\n');
      const prompt = `你是一個故事日記助手。根據以下冒險紀錄，生成一則第三人稱日記條目。

## 寫作要點
- 角色層面：主角變化、關係進展、重要新角色
- 情節層面：推動主線的重大事件、重要伏筆
- 世界觀層面：新設定、關鍵道具、地點
- 情感層面：情感轉折點、重要互動細節

## 寫作規則
- 使用「引號」標記重要對話和專有名詞
- 禁止使用**粗體**
- 繁體中文，500 字以內
- 結尾兩句預測：1.（主線相關）2.（支線相關）

格式：
[日記標題]

日記內容：...

---
冒險紀錄：
${poolText}

請直接輸出，不要加任何前綴說明。`;

      const text = await callAI(prompt, { role: 'main' });
      if (!text) return;
      _applyDiaryText(text, true);
    } catch (e) {
      console.error('Failed to generate diary from pool:', e);
    }
  };

  // ─── 日記文字解析與寫入（共用）──────────────────────────────────────────────
  const _applyDiaryText = (text: string, silent: boolean) => {
    const newId = Date.now();
    const lines = text.trim().split('\n');
    const firstLine = lines[0].trim();
    const parsedTitle = firstLine.startsWith('## ')
      ? firstLine.slice(3).trim()
      : firstLine.startsWith('[') && firstLine.endsWith(']')
      ? firstLine.slice(1, -1).trim()
      : '';
    const bodyText = parsedTitle
      ? lines.slice(1).join('\n').replace(/^\n+/, '').trim()
      : text.trim();
    setDiaryEntries(prev => [{
      id: newId,
      title: parsedTitle,
      text: bodyText,
      isActive: false,
      keywords: [],
      source: 'ai_generated',
    }, ...prev]);
    if (silent) {
      setHasNewDiary(true);
    } else {
      showToast('🔮 魔法日記已生成');
    }
  };

  // ─── 💫 融合日記：合併多條日記 ─────────────────────────────────────────────
  const handleMergeDiary = async (selectedIds: number[]) => {
    if (selectedIds.length < 2) { showToast('請勾選至少 2 條日記'); return; }
    if (!mainGMConfig.apiKey.trim()) { showToast('❌ 請先設定 API Key'); return; }
    const selected = diaryEntries.filter(e => selectedIds.includes(e.id));
    const combined = selected.map((e, i) => `[日記 ${i + 1}]\n${e.title ? `## ${e.title}\n` : ''}${e.text}`).join('\n\n---\n\n');
    try {
      const prompt = `請將以下多則日記合併成一則，保留所有關鍵資訊，讓日記脈絡合理，去除重複內容，使用繁體中文，第三人稱，標題前加上 💫。輸出格式：第一行為 ## 標題，之後換行接內容。\n\n${combined}`;
      const text = await callAI(prompt, { role: 'main' });
      if (!text) { showToast('❌ 融合失敗，請稍後再試'); return; }
      const newId = Date.now();
      const sourceIds = selectedIds.slice();
      // 解析融合後的標題
      const mLines = text.trim().split('\n');
      const mFirst = mLines[0].trim();
      const mTitle = mFirst.startsWith('## ') ? mFirst.slice(3).trim() : '';
      const mBody = mTitle ? mLines.slice(1).join('\n').replace(/^\n+/, '').trim() : text.trim();
      setDiaryEntries(prev => [
        {
          id: newId,
          title: mTitle,
          text: mBody,
          isActive: false,
          keywords: [],
          source: 'merged',
          mergedFrom: sourceIds,
        },
        ...prev.map(e =>
          sourceIds.includes(e.id)
            ? { ...e, isActive: false, isMerged: true }
            : e
        )
      ]);
      showToast('💫 融合日記已生成');
    } catch (e) {
      showToast('❌ 融合失敗，請稍後再試');
    }
  };

  const handleDiaryChange = (id: number, text: string) => {
    setDiaryEntries(diaryEntries.map(entry => 
      entry.id === id ? { ...entry, text } : entry
    ));
  };

  const handleAddLorebook = (category: string) => {
    const newId = Date.now();
    setLorebookEntries([{ id: newId, title: '新設定', content: '', category, isActive: true, insertionOrder: 100, selective: false, secondaryKeys: [] }, ...lorebookEntries]);
    return newId;
  };

  const handleAddNpc = () => {
    const newId = Date.now();
    const newNpc = {
      id: newId, name: '新角色', job: '', affection: 0, affectionLabel: '陌生人',
      appearance: '', personality: '', gender: '', race: '',
      backstory: '', other: '', relationship: '',
      location: '', lastSeenLocation: '',
      category: 'NPC', isActive: true, isPinned: false, memories: [], thoughts: [],
    };
    const newLore = {
      id: newId + 1, title: '新角色', category: 'NPC', content: '',
      isActive: true, insertionOrder: 100, selective: false, secondaryKeys: [], keywords: [],
      gender: '', race: '', age: '', job: '', appearance: '', personality: '', backstory: '', other: '',
      homeLocation: '', roamLocations: [],
    };
    setNpcs(prev => [newNpc, ...prev]);
    setLorebookEntries(prev => [newLore, ...prev]);
    setSelectedNpc(newNpc);
  };

  const handleUpdateLorebook = (id: number, updates: Partial<LorebookEntry>) => {
    setLorebookEntries(prev => prev.map(entry => 
      entry.id === id ? { ...entry, ...updates } : entry
    ));
  };

  const handleDeleteLorebook = (id: number) => {
    setLorebookEntries(prev => prev.filter(entry => entry.id !== id));
  };

  const handleLorebookKeywordAdd = (id: number, field: 'keywords'|'secondaryKeys', kw: string) => {
    const k = kw.trim();
    if (!k) return;
    setLorebookEntries(prev => prev.map(e =>
      e.id === id ? { ...e, [field]: [...(e[field] || []).filter((x: string) => x !== k), k] } : e
    ));
  };

  const handleLorebookKeywordRemove = (id: number, field: 'keywords'|'secondaryKeys', kw: string) => {
    setLorebookEntries(prev => prev.map(e =>
      e.id === id ? { ...e, [field]: (e[field] || []).filter((x: string) => x !== kw) } : e
    ));
  };

  // ─── 每次 AI 回應結束後自動存檔 ─────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading && !isUpdatingLog && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant') {
      saveToStorage();
      const now = new Date();
      localStorage.setItem('rpworld_last_saved', now.toISOString());
      setLastSavedAt(now);
    }
  }, [isLoading, isUpdatingLog]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 存檔匯出 ────────────────────────────────────────────────────────────────
  const handleExportSave = async () => {
    const saveData = {
      profile, systemPrompt, diaryEntries, lorebookEntries, npcs, appearingNpcs,
      equipment, items, currentLocation, messages, memories, quickOptions,
      timeState, quests, adventureLog, currentGoals,
    };
    const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
    
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const hr = String(now.getHours()).padStart(2,'0');
    const mi = String(now.getMinutes()).padStart(2,'0');
    const safeName = (profile.name || '玩家').replace(/[\\/:*?"<>|]/g, '_');
    const defaultFilename = `RPworld-${safeName}-${date}-${hr}-${mi}.json`;

    // 直接使用傳統下載模式（避免 showSaveFilePicker 與 fallback 雙重觸發）
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('存檔已匯出');
  };

  // ─── 存檔匯入 ────────────────────────────────────────────────────────────────
  const handleImportSave = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        loadFromData(JSON.parse(content));
        showToast('存檔已匯入');
        setIsSettingsModalOpen(false);
      } catch {
        showToast('存檔格式錯誤');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── 重置遊戲 ────────────────────────────────────────────────────────────────
  const handleResetGame = () => {
    if (window.confirm('確定要重置遊戲嗎？所有未匯出的進度將會遺失。')) {
      localStorage.removeItem(SAVE_KEY);
      window.location.reload();
    }
  };

  const handleAddNpcMemory = (npcId: number, text: string, importance: 'core' | 'normal' = 'normal') => {
    if (!text.trim()) return;
    const newMem: NpcMemory = {
      id: `nmem_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      text: text.trim(),
      createdAt: `${timeState.month}/${timeState.day}`,
      source: 'manual',
      importance,
      isMerged: false,
    };
    setNpcs(prev => prev.map(n => {
      if (n.id !== npcId) return n;
      const updatedNpc = { ...n, memories: [...(n.memories || []), newMem] };
      if (selectedNpc?.id === npcId) setSelectedNpc(updatedNpc);
      return updatedNpc;
    }));
  };

  const handleRemoveNpcMemory = (npcId: number, memId: string) => {
    setNpcs(prev => prev.map(n => {
      if (n.id !== npcId) return n;
      const updatedNpc = { ...n, memories: n.memories.filter(m => m.id !== memId) };
      if (selectedNpc?.id === npcId) setSelectedNpc(updatedNpc);
      return updatedNpc;
    }));
  };

  const handleUpdateNpcMemory = (npcId: number, memId: string, updates: Partial<NpcMemory>) => {
    setNpcs(prev => prev.map(n => {
      if (n.id !== npcId) return n;
      const updatedNpc = {
        ...n,
        memories: n.memories.map(m => m.id === memId ? { ...m, ...updates } : m),
      };
      if (selectedNpc?.id === npcId) setSelectedNpc(updatedNpc);
      return updatedNpc;
    }));
  };

  const handleClearNewMemories = (npcId: number) => {
    setNpcs(prev => prev.map(n => {
      if (n.id !== npcId) return n;
      const updatedNpc = { ...n, memories: n.memories.map(m => m.isNew ? { ...m, isNew: false } : m) };
      if (selectedNpc?.id === npcId) setSelectedNpc(updatedNpc);
      return updatedNpc;
    }));
  };

  const handleUpdateNpcName = (npcId: number, name: string) => {
    setNpcs(prev => prev.map(n => n.id === npcId ? { ...n, name } : n));
    setSelectedNpc(prev => prev?.id === npcId ? { ...prev, name } : prev);
  };

  const handleDeleteNpc = (npcId: number, lorebookId?: number) => {
    setNpcs(prev => prev.filter(n => n.id !== npcId));
    if (lorebookId !== undefined) {
      setLorebookEntries(prev => prev.filter(e => e.id !== lorebookId));
    }
    setSelectedNpc(null);
    showToast('角色已刪除');
  };

  const handleTogglePinNpc = (npcId: number) => {
    setNpcs(prevNpcs => {
      return prevNpcs.map(n => {
        if (n.id === npcId) {
          return { ...n, isPinned: !n.isPinned };
        }
        return n;
      });
    });

    setSelectedNpc(prev => {
      if (prev && prev.id === npcId) {
        return { ...prev, isPinned: !prev.isPinned };
      }
      return prev;
    });

    const npc = npcs.find(n => n.id === npcId);
    if (npc) {
      showToast(npc.isPinned ? `已取消釘選 ${npc.name}` : `已釘選 ${npc.name}`);
    }
  };

  const handleRecordNpc = (npc: Npc) => {
    const exists = lorebookEntries.some(e => e.category === 'NPC' && e.title === npc.name);
    if (exists) {
      showToast('此人物已在設定集中');
      return;
    }

    const newId = lorebookEntries.length > 0 ? Math.max(...lorebookEntries.map(e => e.id)) + 1 : 1;
    const newEntry = {
      id: newId,
      title: npc.name,
      gender: npc.gender,
      race: npc.race,
      backstory: npc.backstory,
      job: npc.job,
      appearance: npc.appearance,
      personality: npc.personality,
      other: npc.other,
      category: 'NPC',
      isActive: true,
      content: ''
    };
    
    setLorebookEntries([newEntry, ...lorebookEntries]);
    showToast(`已將 ${npc.name} 記下並加入設定集`);
  };

  // ─── Prompt 組裝 ─────────────────────────────────────────────────────────────
  const buildPrompt = (userInput: string, currentMessages: Message[], locationOverride?: string): string => {
    const loc = locationOverride ?? currentLocation;
    const SLIDING_WINDOW = 20;

    const lorebookScanText = currentMessages.slice(-5).map(m => m.text).join(' ') + ' ' + userInput;

    const lorebookHitsKeywords = (e: any): boolean => {
      const keys: string[] = e.keywords || [];
      const secKeys: string[] = e.secondaryKeys || [];
      const selective: boolean = e.selective ?? false;
      const text = lorebookScanText.toLowerCase();

      const primaryHit = keys.length === 0 || keys.some(k => text.includes(k.toLowerCase()));
      if (!primaryHit) return false;
      if (selective && secKeys.length > 0) {
        return secKeys.some(k => text.includes(k.toLowerCase()));
      }
      return true;
    };

    // Phase 1：依地點篩選候選 NPC（輕量名單）
    // 城鎮類（locationType === 'town'）上限 8，野外 / 建築 / 未設定 上限 3
    const currentLocEntry = lorebookEntries.find(
      e => e.category === '地點' && e.title === loc
    );
    const candidateLimit = currentLocEntry?.locationType === 'town' ? 8 : 3;

    const npcCandidates = lorebookEntries
      .filter(e => e.category === 'NPC' && e.isActive && (
        e.homeLocation === loc ||
        (e.roamLocations || []).includes(loc)
      ))
      .sort((a, b) => {
        const score = (e: LorebookEntry) => {
          if (e.homeLocation === loc) return 0;
          if (npcs.some(n => n.name === e.title && n.isPinned)) return 1;
          return 2;
        };
        return score(a) - score(b);
      })
      .slice(0, candidateLimit);

    // 相鄰地點清單（讓 AI 知道玩家可以去哪裡）
    const adjacentLocTitles = new Set(currentLocEntry?.adjacentTo ?? []);

    const relevantLorebook = lorebookEntries
      .filter(e => {
        if (!e.isActive) return false;
        if (e.category === 'NPC') {
          // Phase 2：出場 NPC、釘選 NPC、或「候選名單內」好感度 ≥ 60 的核心 NPC → 完整注入
          // 注意：高好感條件限定在 npcCandidates（當前場景）內，避免全體 NPC 掃描造成 prompt 膨脹
          const isInCandidates = npcCandidates.some(c => c.title === e.title);
          const npcData = isInCandidates ? npcs.find(n => n.name === e.title) : undefined;
          const isHighAffectionCandidate = isInCandidates && (npcData?.affection ?? 0) >= 60;

          const inScene =
            appearingNpcs.some(n => e.title.includes(n) || n.includes(e.title)) ||
            npcs.some(n => n.isPinned && n.name === e.title) ||
            isHighAffectionCandidate;
          if (!inScene) return false;
          return lorebookHitsKeywords(e);
        }
        if (e.category === '地點') {
          // 當前地點：強制注入（不受關鍵字限制，AI 必須知道所在位置的完整資料）
          if (e.title === loc) return true;
          // 相鄰地點：強制注入（讓 AI 知道玩家可以前往哪裡）
          if (adjacentLocTitles.has(e.title)) return true;
          // 其他地點：不注入（避免 prompt 膨脹）
          return false;
        }
        return lorebookHitsKeywords(e);
      })
      .sort((a, b) => (a.insertionOrder ?? 100) - (b.insertionOrder ?? 100));

    const triggeredMemories = memories.filter(m => isMemoryTriggered(m, userInput, loc));

    // 依重要度截斷；normal/flavor 按最新優先（id 含時間戳）
    const sortByNewest = (mems: MemoryEntry[]) =>
      [...mems].sort((a, b) => parseInt(b.id.split('_')[1] || '0') - parseInt(a.id.split('_')[1] || '0'));

    const filterByImportance = (mems: MemoryEntry[], maxNormal: number, maxFlavor: number) => {
      const critical = mems.filter(m => m.importance === 'critical');
      const normal = sortByNewest(mems.filter(m => m.importance === 'normal')).slice(0, maxNormal);
      const flavor = sortByNewest(mems.filter(m => m.importance === 'flavor')).slice(0, maxFlavor);
      return [...critical, ...normal, ...flavor];
    };

    const worldMems  = filterByImportance(triggeredMemories.filter(m => m.type === 'world'), 8, 3);
    const regionMems = filterByImportance(triggeredMemories.filter(m => m.type === 'region'), 5, 2);
    const sceneMems  = filterByImportance(triggeredMemories.filter(m => m.type === 'scene'), 5, 2);
    const relevantLorebookNpcTitles = new Set(
      relevantLorebook.filter(e => e.category === 'NPC').map(e => e.title)
    );
    const pinnedNpcs = npcs.filter(
      n => n.isPinned && !relevantLorebookNpcTitles.has(n.name)
    );

    // 出場 NPC：全量（依重要度截斷）
    const appearingNpcMems = filterByImportance(
      triggeredMemories.filter(m => {
        if (m.type !== 'npc') return false;
        return (m.tags?.npcs || []).some(n => appearingNpcs.includes(n));
      }), 5, 2
    );
    // 未出場但 pinned/高好感 NPC：只保留 critical，最多 2 條
    const specialNpcMems = triggeredMemories.filter(m => {
      if (m.type !== 'npc') return false;
      if ((m.tags?.npcs || []).some(n => appearingNpcs.includes(n))) return false;
      return (m.tags?.npcs || []).some(n =>
        npcs.some(npc => npc.name === n && (npc.isPinned || npc.affection >= 60))
      );
    }).filter(m => m.importance === 'critical').slice(0, 2);
    const npcMems = [...appearingNpcMems, ...specialNpcMems];

    // 降級策略：記憶總數超過 20 時，只保留 critical
    const totalMemCount = worldMems.length + regionMems.length + sceneMems.length + npcMems.length;
    const [finalWorldMems, finalRegionMems, finalSceneMems, finalNpcMems] =
      totalMemCount > 20
        ? [worldMems, regionMems, sceneMems, npcMems].map(arr => arr.filter(m => m.importance === 'critical'))
        : [worldMems, regionMems, sceneMems, npcMems];

    const recentMessages = currentMessages.slice(-SLIDING_WINDOW);

    return `[System Context]
World Premise: ${systemPrompt.worldPremise}
Roleplay Rules: ${systemPrompt.roleplayRules}
Writing Style: ${systemPrompt.writingStyle}

---
[Player]
Name: ${profile.name} | Job: ${profile.job}
Appearance: ${profile.appearance}
Personality: ${profile.personality}
${profile.other ? `Other: ${profile.other}` : ''}

[Current State]
Location: ${loc}
Time: ${timeState.year}年${timeState.month}月${timeState.day}日 ${String(timeState.hour).padStart(2,'0')}:${String(timeState.minute).padStart(2,'0')} | Weather: ${timeState.weather}
HP: ${profile.hp} | MP: ${profile.mp} | Gold: ${profile.gold}

[Inventory]
${equipment.length > 0 ? equipment.map(e => `- [裝備] ${e.name}${e.isEquipped ? '（裝備中）' : ''}: ${e.description}`).join('\n') : '（無裝備）'}
${(() => {
  if (items.length === 0) return '';
  const hasEffect = (desc: string) => /HP|MP|回復|治療|效果|使用後|傷害|攻擊|防禦|強化|解毒|能量/i.test(desc);
  // 超過 15 件時，只有最近新增的 5 件才保留完整說明
  const recentIds = [...items].sort((a, b) => b.id - a.id).slice(0, 5).map(i => i.id);
  const overLimit = items.length > 15;
  return items.map(i => {
    const showFull = (i.quantity > 1 || hasEffect(i.description)) && (!overLimit || recentIds.includes(i.id));
    return showFull ? `- ${i.name} x${i.quantity}: ${i.description}` : `- ${i.name} x${i.quantity}`;
  }).join('\n');
})()}

[進行中任務]
${(() => {
  const active = quests.filter(q => q.status === 'active');
  if (active.length === 0) return '（無）';
  const currentTotalDays = getTotalDaysFromTimeState(timeState);
  return active.map(q => {
    const remainingDays = getQuestRemainingDays(q, currentTotalDays);
    const remaining = remainingDays != null ? `剩 ${remainingDays} 天` : '無期限';
    if (q.isGoalMet) {
      return `${q.title}（委託：${q.giver}，目標已達成，待玩家回報）`;
    }
    return `${q.title}（委託：${q.giver}，${remaining}）`;
  }).join('\n');
})()}

---
[🌍 World Memory]
${finalWorldMems.length > 0 ? finalWorldMems.map(m => `- ${m.content}${m.tags?.factions?.length ? ' ['+m.tags.factions.join(',')+']' : ''}`).join('\n') : '（無）'}

[🗺️ Region Memory]
${finalRegionMems.length > 0 ? finalRegionMems.map(m => `- ${m.content}${m.tags?.locations?.length ? ' ['+m.tags.locations.join(',')+']' : ''}`).join('\n') : '（無）'}

[🏠 Scene Memory: ${loc}]
${finalSceneMems.length > 0 ? finalSceneMems.map(m => `- ${m.content}`).join('\n') : '（無）'}

[👤 NPC Memory]
${finalNpcMems.length > 0 ? finalNpcMems.map(m => `- ${m.content}${m.tags?.npcs?.length ? ' ['+m.tags.npcs.join(',')+']' : ''}`).join('\n') : '（無）'}

---
[當前場景可能出現的角色]
${npcCandidates.length > 0
  ? npcCandidates.map(e => `${e.title}（${e.job || ''}）`).join('、') + '\n以上為可能在場的角色，非必須出場。若故事需要新角色請自由創造。'
  : '無已知角色在附近。若故事需要新角色請自由創造。'}

---
[Scene Lorebook]
${relevantLorebook.map(e => {
  if (e.category === 'NPC') {
    const npcData = npcs.find(n => n.name === e.title);
    const thoughtsText = npcData?.thoughts && npcData.thoughts.length > 0
      ? `｜[近期想法] ${npcData.thoughts.map((t, i) => `${i + 1}.${t.text}`).join(' / ')}`
      : '';
    let memoriesText = '';
    if (npcData && npcData.affection >= 60 && npcData.memories && npcData.memories.length > 0) {
      const activeMemories = npcData.memories.filter(m => !m.isMerged);
      const toInject = [
        ...activeMemories.filter(m => m.importance === 'core'),
        ...activeMemories.filter(m => m.importance === 'normal' && m.source !== 'merged').slice(-5),
        ...activeMemories.filter(m => m.source === 'merged').slice(-2),
      ];
      if (toInject.length > 0) {
        memoriesText = `｜[記憶庫] ${toInject.map(m => `(${m.createdAt})${m.text}`).join(' / ')}`;
      }
    }
    const raceText = e.race ? `｜種族：${e.race}` : (e.other ? `｜備註：${e.other}` : '');
    const ageText = e.age ? `｜年齡：${e.age}` : '';
    const backstoryText = (npcData?.affection ?? 0) >= 20 && e.backstory ? `｜背景：${e.backstory}` : '';
    return `[NPC] ${e.title}｜性別：${e.gender || ''}${raceText}${ageText}｜職業：${e.job || ''}｜外貌：${e.appearance || ''}｜個性：${e.personality || ''}${backstoryText}${thoughtsText}${memoriesText}`;
  }
  return `[${e.category}] ${e.title}：${e.content}`;
}).join('\n') || '（無）'}

[Pinned NPCs]
${pinnedNpcs.length > 0 ? pinnedNpcs.map(n => {
  const thoughtsText = n.thoughts && n.thoughts.length > 0
    ? `｜[近期想法] ${n.thoughts.map((t, i) => `${i + 1}.${t.text}`).join(' / ')}`
    : '';
  return (() => {
    const lorePinned = lorebookEntries.find(e => e.category === 'NPC' && e.title === n.name);
    const genderPinned = lorePinned?.gender ? `${lorePinned.gender}・` : '';
    const racePinned = lorePinned?.race ? `種族：${lorePinned.race}｜` : '';
    const agePinned = lorePinned?.age ? `年齡：${lorePinned.age}｜` : '';
    const jobPinned = lorePinned?.job ?? n.job ?? '';
    const backstoryPinned = n.affection >= 20 && lorePinned?.backstory ? `｜背景：${lorePinned.backstory}` : '';
    const lines: string[] = [`- ${n.name}（${genderPinned}${jobPinned}）${racePinned}${agePinned}好感度:${n.affection}${backstoryPinned}${thoughtsText}`];
    // 好感度 ≥ 60 且有記憶才注入
    if (n.affection >= 60 && n.memories && n.memories.length > 0) {
      const MAX_NORMAL = 5;
      const MAX_MERGED = 2;
      const MAX_CHARS = 300;

      const activeMemories = n.memories.filter(m => !m.isMerged);
      const coreMemories = activeMemories.filter(m => m.importance === 'core');
      let normalMemories = activeMemories
        .filter(m => m.importance === 'normal' && m.source !== 'merged')
        .slice(-MAX_NORMAL);
      const mergedMemories = activeMemories
        .filter(m => m.source === 'merged')
        .slice(-MAX_MERGED);

      // 超出 300 字時縮減 normal 到 3 則
      const baseText = [...coreMemories, ...normalMemories, ...mergedMemories]
        .map(m => m.text).join('');
      if (baseText.length > MAX_CHARS) {
        normalMemories = normalMemories.slice(-3);
      }

      const allToInject = [...coreMemories, ...normalMemories, ...mergedMemories];
      if (allToInject.length > 0) {
        lines.push('  [記憶庫]');
        allToInject.forEach(m => {
          const tag = m.importance === 'core' ? ' [★]' : m.source === 'merged' ? ' [摘要]' : '';
          lines.push(`  - (${m.createdAt}) ${m.text}${tag}`);
        });
      }
    }
    return lines.join('\n');
  })();

}).join('\n') : '（無）'}

---
[Active Diary]
${(() => {
  const triggered = diaryEntries.filter(e => {
    if (!e.isActive) return false;
    return scanKeywords(e.keywords || []);
  });
  return triggered.length > 0
    ? triggered.map(e => {
        const kwLabel = e.keywords?.length > 0 ? ` [觸發詞: ${e.keywords.join(',')}]` : '';
        return `- ${e.text}${kwLabel}`;
      }).join('\n')
    : '（無）';
})()}

---
[Recent Chat (最近${Math.min(SLIDING_WINDOW, recentMessages.length)}則)]
${recentMessages.map(m => `${m.role === 'user' ? 'Player' : 'DM'}: ${m.text}`).join('\n')}
Player: ${userInput}

---
[COMMAND FORMAT]
數值或狀態有變化時，在回應最前面輸出指令區塊：
<<COMMANDS>>
HP:-15
GOLD:+200
AFFINITY:角色名:+10
LOCATION:新地點名稱
TIME:+1h
ITEM_ADD:道具名:數量:說明（外觀與效果）
ITEM_REMOVE:道具名:數量
ITEM_USE:道具名
QUEST_ADD:任務名:委託人:目標描述:獎勵金幣:獎勵道具(逗號分隔可留空):期限天數(可留空)
QUEST_GOAL_MET:任務名
QUEST_COMPLETE:任務名
NPC_NEW:姓名:種族:性別:年齡:職業:外貌:個性:背景(選填)
NPC_HOME:姓名:地點
NPC_LOCATION:姓名:地點
NPC_THOUGHT:角色名:第一人稱內心想法
NPC_RELATIONSHIP:角色名:關係描述
LOCATION_DISCOVER:地點名稱:x:y
MEMORY_ADD:region:normal:迷霧森林昨日大火:locations=迷霧森林:factions=黑牙氏族:keywords=大火,火災:sticky=3
MEMORY_ADD:scene:normal:酒館因打架暫時關閉:locations=酒館
MEMORY_ADD:npc:normal:芬里爾透露停火協議內容:npcs=芬里爾:keywords=停火,協議
MEMORY_ADD:world:critical:魔王宣布向月湖鎮宣戰:keywords=魔王,宣戰
<</COMMANDS>>

敘事開頭輸出出場標記（非 COMMANDS 區塊，每回應必須）：
[出場:姓名1,姓名2]（從候選名單選誰實際在場；無人可輸出 [出場:]；可加候選外新角色）

【各指令觸發時機】
- ITEM_ADD：玩家獲得道具時。說明需詳細描述外觀與效果（玩家使用時 AI 依此生成劇情）。
- ITEM_USE：玩家主動使用道具時（前端扣數量）。ITEM_REMOVE：道具消耗/丟失。
- QUEST_ADD：NPC 正式委託或玩家接布告欄任務時。後四欄可留空。
- QUEST_GOAL_MET：玩家已完成目標但未回報時靜默輸出（前端標記「待回報」）。
- QUEST_COMPLETE：玩家向委託人回報結案時。名稱需與 QUEST_ADD 完全一致。
- NPC_NEW：新角色首次出場時建檔（一次性）。NPC_HOME 同步輸出其主場地點。
- NPC_LOCATION：NPC 出現於非主場地點時記錄足跡。
- NPC_THOUGHT：NPC 有明顯情緒變化、做出重要決定、或對玩家產生新看法時，第一人稱。
- NPC_RELATIONSHIP：玩家與 NPC 初次確立明確關係，或關係發生重大轉變時輸出。
- LOCATION_DISCOVER：玩家路過/聽說未知地點時（heard 狀態加入地圖）。x/y 為整數，月湖鎮=0,0。

【MEMORY_ADD 觸發情境（以下情況必須輸出）】
1. world/critical：影響整個世界的重大事件（魔王宣戰、天象異變）
2. region/normal：特定區域動態（森林大火、城鎮慶典）。回應中出現 [ ] 格式布告欄必定觸發。
3. scene/normal：當前地點物理或狀態改變（酒館被砸毀、橋樑斷裂）
4. npc/normal：NPC 透露的關鍵秘密、身世或重要決定
5. world/region/npc：玩家重大成就、關鍵選擇、NPC 關係重大突破

【字體標記（可選）】
[FONT:serif]...[/FONT] 信件/公告/正式文書（明朝體）
[FONT:spell]...[/FONT] 咒語/古文/神諭（書法體）

指令區塊在敘事之前。無數值變化則省略指令區塊。

Please respond as the DM.`;
  };

  // ─── ⚡ 快捷行動生成（按需觸發）─────────────────────────────────────────────
  const handleGenerateQuickOptions = async () => {
    if (isLoadingQuickOptions || isUpdatingLog) return;
    setIsLoadingQuickOptions(true);
    setShowQuickMenu(false);
    try {
      const recentContext = messages.slice(-6).map(m => `${m.role === 'user' ? '玩家' : 'GM'}: ${m.text}`).join('\n');
      const prompt = `你是一個文字冒險遊戲的 GM 助理。根據以下最近的對話脈絡，為玩家生成 3 個當下合理、有趣的行動選項。

[當前位置] ${currentLocation}
[最近對話]
${recentContext}

請直接輸出 3 個行動選項，每行一個，不要編號、不要任何說明或前綴，每個選項 10 字以內，繁體中文。`;

      const result = await callAI(prompt, { role: 'sub' });
      if (result) {
        const opts = result.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.length <= 20).slice(0, 3);
        if (opts.length > 0) {
          setQuickOptions(opts);
          setShowQuickMenu(true);
        }
      }
    } catch (e) {
      showToast('⚡ 行動生成失敗');
    } finally {
      setIsLoadingQuickOptions(false);
    }
  };

  const handleSendMessage = async (textToUse?: string | React.MouseEvent | React.KeyboardEvent, historyToUse?: any[], locationOverride?: string) => {
    const text = typeof textToUse === 'string' ? textToUse : inputText;
    if (!text.trim() || isLoading) return;

    const userMessage = { id: Date.now(), role: 'user', text: text };
    const newMessages = historyToUse ? [...historyToUse, userMessage] : [...messages, userMessage];
    setMessages(newMessages);
    saveToStorage({ messages: newMessages });
    if (typeof textToUse !== 'string') setInputText('');
    setIsLoading(true);

    let aiMessageId: number | null = null;
    try {
      if (!mainGMConfig.apiKey.trim()) {
        showToast('❌ 請先在系統設定輸入 API Key');
        setIsLoading(false);
        return;
      }
      const prompt = buildPrompt(text, historyToUse || messages, locationOverride);

      aiMessageId = Date.now() + 1;
      setMessages(prev => [...prev, { id: aiMessageId!, role: 'assistant', text: '' }]);

      // 使用 streaming（避免長回應 timeout），背景累積不即時顯示，避免 <<COMMANDS>> 閃現
      const fullText = await callAI(prompt, { role: 'main', onChunk: () => {} });
      if (!fullText) {
        showToast('❌ AI 沒有回應，請檢查 API Key 或網路連線');
        if (aiMessageId !== null) setMessages(prev => prev.filter(m => m.id !== aiMessageId));
        setIsLoading(false);
        return;
      }

      const { narrative: parsedNarrative, newItems } = await parseAndExecuteCommands(fullText);
      const rawNarrative = parsedNarrative;

      // ── 助理 GM 接口：有新增道具時才觸發分類──────────
      // newItems 為本回合新增的道具名稱清單，updateAdventureState 會請助理 GM 分類
      // 解析所有 [出場:] 標記

      // 解析所有 [出場:] 標記（matchAll），合併去重後更新 appearingNpcs
      // 防呆：AI 若重複輸出同一角色的 [出場:] 標記，前端只計一次
      const allAppearMatches = [...rawNarrative.matchAll(/\[出場:([^\]]*)\]/g)];
      if (allAppearMatches.length > 0) {
        const allNames = allAppearMatches
          .flatMap(m => m[1].split(',').map((n: string) => n.trim()))
          .filter(Boolean);
        const uniqueNames = [...new Set(allNames)];
        if (uniqueNames.length > 0) {
          setAppearingNpcs(uniqueNames);
          setNpcs(prev => prev.map(npc =>
            uniqueNames.some((n: string) => npc.name.includes(n) || n.includes(npc.name))
              ? { ...npc, location: currentLocation, lastSeenLocation: currentLocation, lastSeenDate: `${timeState.month}/${timeState.day}` }
              : npc
          ));
        }
      }
      const narrative = rawNarrative.replace(/\[出場:[^\]]*\]/g, '').trim();

      setMessages(prev => prev.map(m =>
        m.id === aiMessageId ? { ...m, text: narrative } : m
      ));

      setNpcs(prev => prev.map(npc => {
        if (narrative.includes(npc.name)) {
          return {
            ...npc,
            lastSeenLocation: currentLocation,
            lastSeenDate: `${timeState.month}/${timeState.day}`
          };
        }
        return npc;
      }));

      const triggeredIds = memories
        .filter(m => isMemoryTriggered(m, text, currentLocation))
        .map(m => m.id);
      tickMemoryCounters(triggeredIds);

      // 觸發背景整理（Sub GM）
      // 關鍵事件：任務新增、地點移動、世界記憶寫入 → 強制跳過節流
      const hasKeyEvent =
        fullText.includes('QUEST_ADD:') ||
        /\nLOCATION:[^\n]+/.test(fullText) ||
        fullText.includes('MEMORY_ADD:world');
      updateAdventureState(
        [...newMessages, { id: aiMessageId, role: 'assistant', text: narrative }],
        newItems,
        hasKeyEvent,
      );
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      showToast('API 呼叫失敗，請檢查設定或網路連線');
      if (aiMessageId !== null) {
        setMessages(prev => prev.filter(m => m.id !== aiMessageId));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = (msgId: number) => {
    if (isLoading) return;
    const msgIndex = messages.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    let lastUserMsgIndex = -1;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMsgIndex = i;
        break;
      }
    }

    if (lastUserMsgIndex === -1) return;

    const userMsgText = messages[lastUserMsgIndex].text;
    const historyToUse = messages.slice(0, lastUserMsgIndex);
    
    handleSendMessage(userMsgText, historyToUse);
  };

  return (
    <div className="flex flex-col h-screen font-sans overflow-hidden" style={{ color: 'var(--text-title)' }}>
      {/* Background image - fixed full screen */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{ backgroundImage: `url('/background.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      {/* Sky gradient overlay */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{ background: getSkyGradient(timeState.hour, timeState.weather), opacity: 0.55, transition: 'background 2s ease' }} />
      {/* Left/Right panel glass overlays - fixed at root level so they don't create containing blocks for child fixed elements */}
      <div className="fixed inset-y-0 left-0 pointer-events-none" style={{ width: '12.5em', background: 'var(--bg-glass-left)', zIndex: 5 }} />
      <div className="fixed inset-y-0 right-0 pointer-events-none" style={{ width: '15rem', background: 'var(--bg-glass-right)', backdropFilter: 'blur(20px) saturate(150%)', WebkitBackdropFilter: 'blur(20px) saturate(150%)', zIndex: 5 }} />
      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative z-10">

        {/* Left Panel */}
        <div
        className="w-50 flex flex-col px-0 py-4 space-y-4 overflow-y-auto"
        style={{ borderRight: '2px solid var(--border-default)', boxShadow: '4px 0 24px rgba(0, 0, 0, 0.3)', zIndex: 20 }}>
          {/* Adventure Log & Goals */}
          <div className="px-4 py-3 transition-all" style={{ boxShadow: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 5px 10px rgba(204, 173, 105, 0.6), 0 12px 40px rgba(65, 46, 109, 0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}>
            <h3 className="flex items-center font-bold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
              <ScrollText className="w-4 h-4 mr-2" /> 當前目標
              {isUpdatingLog && <RefreshCw className="w-3 h-3 ml-2 animate-spin opacity-50" />}
            </h3>
            <ul className="text-sm space-y-1.5" style={{ color: 'var(--text-body)' }}>
              {currentGoals.length > 0 ? (
                currentGoals.map((goal, i) => (
                  <li key={i} className="text-sm leading-relaxed pl-2 py-0.5 italic" style={{ color: 'var(--text-body)', borderLeft: '2px solid var(--border-default)' }}>{goal}</li>
                ))
              ) : (
                <li className="text-sm ml-6 text-[var(--text-muted)] italic">暫無明確目標...</li>
              )}
            </ul>
          </div>

            <div className="px-4 py-3 transition-all" style={{ boxShadow: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 5px 10px rgba(204, 173, 105, 0.6), 0 12px 40px rgba(65, 46, 109, 0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}>
            <h3 className="flex items-center font-bold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
              <History className="w-4 h-4 mr-2" /> 冒險摘要
            </h3>
            <div className="pr-1">
              {adventureLog.length > 0 ? (
                <div className="text-sm leading-relaxed pl-2 py-0.5 italic" style={{ color: 'var(--text-body)', borderLeft: '2px solid var(--border-default)' }}>
                  {adventureLog[0]}
                </div>
              ) : (
                <div className="text-sm ml-6 text-[var(--text-muted)] italic">等待冒險展開...</div>
              )}
            </div>
          </div>

          <div
            className="px-4 py-3 cursor-pointer transition-all relative group"
            style={{ boxShadow: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 5px 10px rgba(204, 173, 105, 0.6), 0 12px 40px rgba(65, 46, 109, 0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
            onClick={() => setIsQuestModalOpen(true)}
          >
            <div className="flex items-center justify-between text-lg mb-2">
              <h3 className="flex items-center font-bold" style={{ color: 'var(--text-primary)' }}><Book className="w-4 h-4 mr-2" /> 任務日誌</h3>
              <ChevronRight className="w-4 h-4 transition" style={{ color: 'var(--bg-elevated)', opacity: 0.5 }} />
            </div>
            <ul className="text-sm space-y-1" style={{ color: 'var(--text-body)' }}>
              {quests.filter(q => q.status === 'active').length > 0 ? (
                <>
                  {quests.filter(q => q.status === 'active').slice(0, 3).map(q => (
                    <li key={q.id} className="flex items-center gap-1.5 truncate">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--color-emerald)' }} />
                      <span className="truncate">{q.title}</span>
                    </li>
                  ))}
                  {quests.filter(q => q.status === 'active').length > 3 && (
                    <li className="text-[var(--text-muted)] text-sm pl-3">…還有 {quests.filter(q => q.status === 'active').length - 3} 個</li>
                  )}
                </>
              ) : (
                <li className="text-sm ml-6 text-[var(--text-muted)] italic">目前沒有任務</li>
              )}
            </ul>
          </div>

          <div className="relative">
            <div className="transition-all">
              <button
                ref={inventoryBtnRef}
                onClick={() => {
                  if (!isInventoryOpen && inventoryBtnRef.current) {
                    const rect = inventoryBtnRef.current.getBoundingClientRect();
                    setInventoryPanelPos({ top: rect.top, left: rect.right + 8 });
                  }
                  setIsInventoryOpen(!isInventoryOpen);
                  if (isConsumablesOpen) setIsConsumablesOpen(false);
                }}
                className="w-full px-4 py-3 flex items-center justify-between transition-all"
                style={{ boxShadow: 'none' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 5px 10px rgba(204, 173, 105, 0.6), 0 12px 40px rgba(65, 46, 109, 0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
              >
                <h3 className="flex items-center font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                  <Package className="w-4 h-4 mr-2" /> 裝備 ({equipment.length})
                </h3>
                <ChevronRight className="w-4 h-4 transition-transform" style={{ color: isInventoryOpen ? 'var(--bg-elevated)' : 'var(--text-muted)', transform: isInventoryOpen ? 'rotate(90deg)' : undefined }} />
              </button>
            </div>

            <AnimatePresence>
              {isInventoryOpen && (
                <motion.div
                  ref={inventoryPanelRef}
                  initial={{ opacity: 0, x: -10, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -10, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="fixed w-72 backdrop-blur-xl rounded-[8px] z-[200] flex flex-col overflow-hidden"
                  style={{ maxHeight: '60vh', top: inventoryPanelPos.top, left: inventoryPanelPos.left, border: `1px solid var(--border-default)`, background: 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)' }}
                >
                  <div className="sticky top-0 backdrop-blur-md p-3 flex justify-between items-center z-10" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 90%, transparent)', borderBottom: `1px solid rgba(0, 0, 0, 0.1)` }}>
                    <h3 className="font-bold flex items-center text-sm" style={{ color: 'var(--bg-elevated)' }}><Package className="w-4 h-4 mr-2" /> 裝備清單</h3>
                    <button onClick={() => setIsInventoryOpen(false)} className="text-[var(--text-muted)] hover:bg-white/5 transition-colors p-1 rounded-full" style={{ color: 'var(--text-muted)' }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-3 space-y-2 overflow-y-auto custom-scrollbar flex-1">
                    {equipment.length > 0 ? equipment.map(item => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-[8px] border cursor-pointer transition-all"
                        style={{ borderColor: `color-mix(in srgb, var(--bg-elevated) 50%, transparent)` }}
                        onClick={() => setSelectedInventoryItem(selectedInventoryItem === item.id ? null : item.id)}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium" style={{ color: 'var(--text-title)' }}>{item.name}</span>
                          <span className="text-sm font-mono px-1.5 py-0.5 rounded-[8px]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-body)' }}>x{item.quantity}</span>
                        </div>
                        <div className="text-sm leading-relaxed" style={{ color: 'color-mix(in srgb, var(--text-body) 80%, transparent)' }}>{item.description}</div>

                        <AnimatePresence>
                          {selectedInventoryItem === item.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="flex space-x-2 mt-2.5 pt-2.5 overflow-hidden"
                              style={{ borderTop: `1px solid color-mix(in srgb, var(--bg-elevated) 50%, transparent)` }}
                            >
                              <button
                                className="flex-1 text-sm py-1.5 rounded-[8px] transition font-medium"
                                style={{ background: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)', color: 'var(--text-title)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)'}
                                onClick={(e) => { e.stopPropagation(); showToast(`裝備了 ${item.name}`); setSelectedInventoryItem(null); }}
                              >
                                裝備
                              </button>
                              <button
                                className="flex-1 text-sm py-1.5 rounded-[8px] transition font-medium"
                                style={{ background: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)', color: 'var(--text-title)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)'}
                                onClick={(e) => { e.stopPropagation(); showToast(`卸下了 ${item.name}`); setSelectedInventoryItem(null); }}
                              >
                                卸下
                              </button>
                              <button
                                className="flex-1 border text-sm py-1.5 rounded-[8px] transition font-medium"
                                style={{ background: 'color-mix(in srgb, var(--color-rose) 10%, transparent)', color: 'var(--text-danger)', borderColor: 'color-mix(in srgb, var(--color-rose) 20%, transparent)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-rose) 20%, transparent)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-rose) 10%, transparent)'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEquipment(prev => prev.filter(i => i.id !== item.id));
                                  showToast(`丟棄了 ${item.name}`);
                                  setSelectedInventoryItem(null);
                                }}
                              >
                                丟棄
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )) : (
                      <div className="text-center text-[var(--text-muted)] text-sm py-8 italic">背包空空如也...</div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative">
            <div className="transition-all">
              <button
                ref={consumablesBtnRef}
                onClick={() => {
                  if (!isConsumablesOpen && consumablesBtnRef.current) {
                    const rect = consumablesBtnRef.current.getBoundingClientRect();
                    setConsumablesPanelPos({ top: rect.top, left: rect.right + 8 });
                  }
                  setIsConsumablesOpen(!isConsumablesOpen);
                  if (isInventoryOpen) setIsInventoryOpen(false);
                }}
                className="w-full px-4 py-3 flex items-center justify-between transition-all"
                style={{ boxShadow: 'none' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 5px 10px rgba(204, 173, 105, 0.6), 0 12px 40px rgba(65, 46, 109, 0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
              >
                <h3 className="flex items-center font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                  <Beaker className="w-4 h-4 mr-2" /> 消耗品 ({items.reduce((acc, item) => acc + item.quantity, 0)})
                </h3>
                <ChevronRight className="w-4 h-4 transition-transform" style={{ color: isConsumablesOpen ? 'var(--bg-elevated)' : 'var(--text-muted)', transform: isConsumablesOpen ? 'rotate(90deg)' : undefined }} />
              </button>
            </div>
            
            <AnimatePresence>
              {isConsumablesOpen && (
                <motion.div
                  ref={consumablesPanelRef}
                  initial={{ opacity: 0, x: -10, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -10, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="fixed w-72 backdrop-blur-xl rounded-[8px] z-[200] flex flex-col overflow-hidden"
                  style={{ maxHeight: '60vh', top: consumablesPanelPos.top, left: consumablesPanelPos.left, border: `1px solid var(--border-default)`, background: 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)' }}
                >
                  <div className="sticky top-0 backdrop-blur-md p-3 flex justify-between items-center z-10" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 90%, transparent)', borderBottom: `1px solid rgba(0, 0, 0, 0.1)` }}>
                    <h3 className="font-bold flex items-center text-sm" style={{ color: 'var(--bg-elevated)' }}><Beaker className="w-4 h-4 mr-2" /> 消耗品清單</h3>
                    <button onClick={() => setIsConsumablesOpen(false)} className="hover:bg-white/5 transition-colors p-1 rounded-full" style={{ color: 'var(--text-muted)' }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-3 space-y-2 overflow-y-auto custom-scrollbar flex-1">
                    {items.length > 0 ? items.map(item => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-[8px] border cursor-pointer transition-all"
                        style={{ borderColor: `color-mix(in srgb, var(--bg-elevated) 50%, transparent)` }}
                        onClick={() => setSelectedConsumableItem(selectedConsumableItem === item.id ? null : item.id)}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium" style={{ color: 'var(--text-title)' }}>{item.name}</span>
                          <span className="text-sm font-mono px-1.5 py-0.5 rounded-[8px]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-body)' }}>x{item.quantity}</span>
                        </div>
                        <div className="text-sm leading-relaxed" style={{ color: 'color-mix(in srgb, var(--text-body) 80%, transparent)' }}>{item.description}</div>

                        <AnimatePresence>
                          {selectedConsumableItem === item.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="flex space-x-2 mt-2.5 pt-2.5 overflow-hidden"
                              style={{ borderTop: `1px solid color-mix(in srgb, var(--bg-elevated) 50%, transparent)` }}
                            >
                              <button
                                className="flex-1 border text-sm py-1.5 rounded-[8px] transition font-medium"
                                style={{ background: 'color-mix(in srgb, var(--color-emerald) 10%, transparent)', color: 'var(--color-emerald)', borderColor: 'color-mix(in srgb, var(--color-emerald) 20%, transparent)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-emerald) 20%, transparent)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-emerald) 10%, transparent)'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  useItem(item.name);
                                  setSelectedConsumableItem(null);
                                  handleSendMessage(`（我使用了 ${item.name}（${item.description}））`);
                                }}
                              >
                                使用
                              </button>
                              <button
                                className="flex-1 border text-sm py-1.5 rounded-[8px] transition font-medium"
                                style={{ background: 'color-mix(in srgb, var(--color-rose) 10%, transparent)', color: 'var(--text-danger)', borderColor: 'color-mix(in srgb, var(--color-rose) 20%, transparent)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-rose) 20%, transparent)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-rose) 10%, transparent)'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setItems(prev => prev.filter(i => i.id !== item.id));
                                  showToast(`丟棄了 ${item.name}`);
                                  setSelectedConsumableItem(null);
                                }}
                              >
                                丟棄
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )) : (
                      <div className="text-center text-[var(--text-muted)] text-sm py-8 italic">沒有任何消耗品...</div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div
            className="px-4 py-3 cursor-pointer transition-all"
            style={{ boxShadow: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 5px 10px rgba(204, 173, 105, 0.6), 0 12px 40px rgba(65, 46, 109, 0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
            onClick={() => { setIsDiaryModalOpen(true); setHasNewDiary(false); }}
          >
            <h3 className="flex items-center font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
              <Book className="w-4 h-4 mr-2" />日記
              {hasNewDiary && <span className="ml-2 text-xs font-bold" style={{ color: 'var(--bg-mark)' }}>【新日記】</span>}
            </h3>
          </div>

          {npcs.filter(n => n.isPinned).length > 0 && (
            <div className="overflow-hidden px-4 py-3 transition-all" style={{ boxShadow: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 20px rgba(99, 102, 241, 0.6), 0 12px 40px rgba(34, 211, 238, 0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}>
              <h3 className="font-bold mb-3" style={{ color: 'var(--text-primary)' }}>✦ 關注</h3>
              <div className="space-y-2">
                {npcs.filter(n => n.isPinned).map(npc => (
                  <div
                    key={npc.id}
                    className="backdrop-blur-md p-3 rounded-[10px] flex justify-between items-center cursor-pointer transition-all duration-300 shadow-md border border-white/5 relative overflow-hidden group/pinned"
                    onClick={() => setSelectedNpc(npc)}
                  >
                    <div className="absolute top-0 left-0 w-1 h-full opacity-40" style={{ background: 'var(--border-accent)' }}></div>
                    <div>
                      <div className="text-sm font-bold" style={{ color: 'var(--text-title)' }}>{npc.name}</div>
                      <div className="text-sm uppercase tracking-tighter" style={{ color: 'var(--text-body)' }}>{npc.job}</div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="text-sm flex items-center bg-black/20 px-2 py-0.5 rounded-full border border-white/10" style={{ color: affectionColor(npc.affection) }}>
                        <Heart className="w-3 h-3 mr-1 fill-current" /> {npc.affection}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1"></div>

          <div className="grid grid-cols-2 gap-2 mt-auto px-3">
            {[
              { label: '個人資訊', action: () => setIsProfileModalOpen(true) },
              { label: '故事集', action: () => setIsLorebookModalOpen(true) },
              { label: '系統', action: () => setIsSettingsModalOpen(true) },
              { label: 'Prompt', action: () => setIsSystemPromptModalOpen(true) },
            ].map(item => (
              <div
                key={item.label}
                className="p-2 rounded-[5px] cursor-pointer transition-all flex items-center justify-center"
                style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.44)' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 10px rgba(204, 173, 105, 0.3), 0 12px 40px rgba(10, 10, 10, 0.71)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.44)'; }}
                onClick={item.action}
              >
                <span className="flex items-center text-sm" style={{ color: 'var(--text-main)' }}>{item.icon}{item.label}</span>
              </div>
            ))}
          </div>

          {lastSavedAt && (() => {
            const isToday = lastSavedAt.toDateString() === new Date().toDateString();
            const timeStr = lastSavedAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const dateStr = lastSavedAt.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
            return (
              <p className="text-center text-xs text-[var(--text-muted)] mt-1.5">
                上次存檔 {isToday ? timeStr : `${dateStr} ${timeStr}`}
              </p>
            );
          })()}
        </div>

        {/* Center Panel */}
        <div className="flex-1 flex flex-col relative">
          {/* Scene Bar */}
          <div className="p-3 flex items-center justify-end absolute top-0 w-full z-30">
            <div className="flex space-x-2">
              <button
                onClick={() => setIsMapOpen(true)}
                className="px-5 py-1 mr-3 rounded-[8px] text-base font-medium transition flex items-center"
                style={{ background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)', color: 'var(--text-primary)', border: `2px solid color-mix(in srgb, var(--border-default), transparent)` }}
                onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 40%, transparent)'}
                onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 20%, transparent)'}
              >
                <MapIcon className="w-3.5 h-3.5 mr-1" />
                世界地圖
              </button>
            </div>
          </div>

          {/* Dialogue Area */}
          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto p-6 pt-14 pb-40 space-y-6"
            onScroll={(e) => {
              const startTime = performance.now();
              const el = e.currentTarget;
              if (el.scrollTop <= 4) {
                handleLoadMore();
              }
              const duration = performance.now() - startTime;
              performanceMonitor.recordScrollEvent(duration, messages.length);
            }}
          >
            {visibleMessages.map(msg => (
              <MessageCard
                key={msg.id}
                msg={msg}
                profile={profile}
                activeMenuId={activeMenuId}
                editingMessageId={editingMessageId}
                editMessageText={editMessageText}
                isLoading={isLoading}
                messages={messages}
                onRegenerate={handleRegenerate}
                onMenuToggle={(msgId) => setActiveMenuId(activeMenuId === msgId ? null : msgId)}
                onCopy={(text) => {
                  const copyText = (text: string) => {
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(text).then(() => showToast('已複製訊息')).catch(() => {
                        const ta = document.createElement('textarea');
                        ta.value = text;
                        ta.style.position = 'fixed';
                        ta.style.opacity = '0';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                        showToast('已複製訊息');
                      });
                    } else {
                      const ta = document.createElement('textarea');
                      ta.value = text;
                      ta.style.position = 'fixed';
                      ta.style.opacity = '0';
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand('copy');
                      document.body.removeChild(ta);
                      showToast('已複製訊息');
                    }
                  };
                  copyText(text);
                  setActiveMenuId(null);
                }}
                onEdit={(msgId, text) => {
                  setEditingMessageId(msgId);
                  setEditMessageText(text);
                  setActiveMenuId(null);
                }}
                onDelete={(msgId) => {
                  const newMessages = messages.filter(m => m.id !== msgId);
                  setMessages(newMessages);
                  saveToStorage({ messages: newMessages });
                  showToast('已刪除訊息');
                  setActiveMenuId(null);
                }}
                onEditChange={setEditMessageText}
                onEditCancel={() => setEditingMessageId(null)}
                onEditSave={(msgId, newText) => {
                  const newMessages = messages.map(m => m.id === msgId ? { ...m, text: newText } : m);
                  setMessages(newMessages);
                  saveToStorage({ messages: newMessages });
                  setEditingMessageId(null);
                  showToast('已更新訊息');
                }}
                renderMarkdown={renderMarkdown}
                stripBareCommands={stripBareCommands}
                showToast={showToast}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="absolute bottom-0 w-full pt-4 pb-4 px-6 flex flex-col items-center z-30">
            <div className="absolute inset-0 pointer-events-none -z-10" style={{ height: '200%', top: '-100%', background: 'linear-gradient(to top, #182a3a 20%, transparent 60%)' }} />

            <div className="w-full max-w-3xl">
              {/* ⚡ Quick Options Popup Menu */}
              {showQuickMenu && quickOptions.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {quickOptions.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => { setShowQuickMenu(false); handleSendMessage(option); }}
                      className="w-full text-left px-4 py-2 rounded-lg text-sm transition-all"
                      style={{
                        color: 'var(--text-body)',
                        border: '0.5px solid var(--border-default)',
                        background: 'color-mix(in srgb, var(--bg-elevated) 85%, transparent)',
                        backdropFilter: 'blur(8px)',
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--bg-elevated) 100%, transparent)'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--bg-elevated) 85%, transparent)'}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-end overflow-hidden transition-all" style={{ borderRadius: '8px', border: `0.5px solid var(--border-default)`, background: 'var(--bg-dialog-input)' }}>
                {/* ⚡ Lightning Button */}
                <button
                  className="pl-3 pr-1 flex-shrink-0 transition-all"
                  style={{
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    color: (isUpdatingLog || isLoadingQuickOptions) ? 'var(--text-stat-label)' : 'color-mix(in srgb, var(--text-body) 60%, transparent)',
                    cursor: (isUpdatingLog || isLoadingQuickOptions) ? 'not-allowed' : 'pointer',
                    opacity: isUpdatingLog ? 0.35 : 1,
                  }}
                  onClick={() => { if (showQuickMenu) setShowQuickMenu(false); else handleGenerateQuickOptions(); }}
                  disabled={isUpdatingLog || isLoadingQuickOptions}
                  title={isUpdatingLog ? '日記生成中，請稍候' : '生成行動建議'}
                  onMouseEnter={e => { if (!isUpdatingLog && !isLoadingQuickOptions) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-body)'; }}
                  onMouseLeave={e => { if (!isUpdatingLog && !isLoadingQuickOptions) (e.currentTarget as HTMLButtonElement).style.color = 'color-mix(in srgb, var(--text-body) 60%, transparent)'; }}
                >
                  {isLoadingQuickOptions
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <Zap className="w-4 h-4" style={{ fill: showQuickMenu ? 'currentColor' : 'none' }} />
                  }
                </button>

                <textarea
                  className="w-full bg-transparent pl-2 pr-2 outline-none resize-none max-h-32 disabled:opacity-80"
                  style={{ color: 'var(--text-main)', lineHeight: '20px', paddingTop: '10px', paddingBottom: '10px' }}
                  placeholder={isLoading ? "..." : "輸入你的行動或對話..."}
                  rows={1}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
                  }}
                ></textarea>
                <button
                  className="px-3 transition"
                  style={{ height: '40px', display: 'flex', alignItems: 'center', color: isLoading || !inputText.trim() ? 'var(--bg-elevated)' : 'var(--bg-elevated)', cursor: isLoading || !inputText.trim() ? 'not-allowed' : 'pointer' }}
                  onMouseEnter={e => { if (!isLoading && inputText.trim()) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-body)'; }}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'}
                  onClick={handleSendMessage}
                  disabled={isLoading || !inputText.trim()}
                >
                  {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>

              {/* Status Bar */}
              <div className="mt-3 flex items-center justify-between text-sm font-mono px-2" style={{ color: 'var(--text-stat-label)' }}>
                <div className="flex items-center space-x-4">
                  <span className="flex items-center" title={`${currentMonthData.name}：${currentMonthData.elegant}`}>
                    <Calendar className="w-3.5 h-3.5 mr-1.5" /> 
                    {timeState.year}年 {timeState.month}月 {timeState.day}日
                  </span>
                  <span className="flex items-center">
                    {getWeatherIcon()} {timeState.weather}
                  </span>
                  <span className="flex items-center">
                    {getCelestialIcon()} 
                    {String(timeState.hour).padStart(2, '0')}:{String(timeState.minute).padStart(2, '0')}
                  </span>
                  <span className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-1.5" /> {currentLocation}</span>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="flex items-center" style={{ color: 'var(--text-stat-label)' }}><Heart className="w-3.5 h-3.5 mr-1.5 fill-current" style={{ color: 'var(--color-rose)' }} /> HP {profile.hp}</span>
                  <span className="flex items-center" style={{ color: 'var(--text-stat-label)' }}><Zap className="w-3.5 h-3.5 mr-1.5 fill-current" style={{ color: 'var(--color-blue)' }} /> MP {profile.mp}</span>
                  <span className="flex items-center" style={{ color: 'var(--text-stat-label)' }}><Shield className="w-3.5 h-3.5 mr-1.5" style={{ color: 'var(--text-body)' }} /> {profile.job}</span>
                  <span className="flex items-center" style={{ color: 'var(--text-stat-label)' }}><Coins className="w-3.5 h-3.5 mr-1.5" /> {(profile.gold ?? 0).toLocaleString()} G</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div
             className="w-60 flex flex-col p-4 space-y-6 overflow-y-auto z-10"
              style={{
               borderLeft: '2px solid var(--border-default)',
               boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.3)'
     }}
   >
          <div>
            <h3 className="font-bold mb-3 pb-2" style={{ color: 'var(--text-primary)', borderBottom: `0.5px solid var(--bg-elevated)` }}>✦ 當前場景人物</h3>
            <div className="space-y-2">
              {(() => {
                // ─── Phase 3: Limit scene NPC display to 8 people (UI layer only) ────
                const sceneNpcs = npcs.filter(n => n.location === currentLocation && !n.isPinned);
                const hiddenCount = Math.max(0, sceneNpcs.length - 8);
                const displayedNpcs = sceneNpcs.slice(0, 8);

                return sceneNpcs.length > 0 ? (
                  <>
                    {displayedNpcs.map(npc => {
                      const lore = lorebookEntries.find(e => e.category === 'NPC' && e.title === npc.name);
                      const displayJob    = lore?.job    ?? npc.job    ?? '';
                      const displayGender = lore?.gender ?? '';
                      return (
                      <div
                        key={npc.id}
                        className="backdrop-blur-md border border-white/5 p-3 rounded-[10px] flex justify-between items-center cursor-pointer transition-all duration-300 shadow-lg group/npc overflow-hidden relative"
                        onClick={() => setSelectedNpc(npc)}
                      >
                        <div className="absolute top-0 left-0 w-1 h-full opacity-0 group-hover/npc:opacity-40 transition-opacity" style={{ background: `linear-gradient(to bottom, transparent, var(--bg-elevated), transparent)` }}></div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium" style={{ color: 'var(--text-title)' }}>{npc.name}</span>
                          <span className="text-sm uppercase tracking-tighter" style={{ color: 'var(--text-body)' }}>{displayGender ? `${displayGender}・${displayJob}` : displayJob}</span>
                        </div>
                        <div className="text-sm flex items-center px-2 py-1 rounded-full bg-black/20 border border-white/5" style={{ color: affectionColor(npc.affection) }}>
                          <Heart className="w-3 h-3 mr-1 fill-current" />
                          <span className="font-mono">{npc.affection}</span>
                        </div>
                      </div>
                      );
                    })}
                    {hiddenCount > 0 && (
                      <div className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                        ✦ 還有 {hiddenCount} 人未顯示...
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm ml-4 text-[var(--text-muted)] italic">此處目前沒有人...</div>
                );
              })()}
            </div>
          </div>

          <div>
            <h3 className="font-bold mb-3 pb-2" style={{ color: 'var(--text-primary)', borderBottom: `0.5px solid var(--bg-elevated)` }}>✦ 當前場景記憶</h3>
            
            <div className="mb-4">
              <h4 className="text-base mb-2 uppercase tracking-wider flex items-center" style={{ color: 'var(--text-tab)' }}>✦ 世界記憶</h4>
              <div className="space-y-2">
                <div className="px-5 py-[10px] mb-2 rounded-[10px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-md relative overflow-hidden group" style={{ background: `linear-gradient(135deg, #1e1477, var(--bg-elevated))` }}>
                  <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:opacity-20 transition-all duration-700 rotate-12 group-hover:scale-110">
                    <Sparkles className="w-[80px] h-[80px]" style={{ color: 'white' }} />
                  </div>
                  <div className="absolute top-0 left-0 w-full h-[1px]" style={{ background: `linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)` }}></div>

                  <div className="flex items-center space-x-2.5 mb-2 relative z-10">
                    <div className="p-1.5 rounded-[8px] bg-white/5 border border-white/10 shadow-inner">
                      <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <span className="text-sm font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-body)' }}>{currentMonthData.elegant}</span>
                  </div>
                  <p className="text-sm leading-relaxed relative z-10 font-light italic pl-1 mb-2" style={{ color: 'color-mix(in srgb, var(--text-body) 90%, transparent)', borderLeft: `1px solid rgba(255,255,255,0.15)` }}>
                    {currentMonthData.desc}
                  </p>
                </div>

                {memories.filter(m => m.type === 'world' && m.isActive).map(mem => (
                  <div key={mem.id} className="memory-card backdrop-blur-sm p-3 text-sm text-[var(--text-muted)] transition-all duration-300 shadow-sm group/mem" style={{ borderLeft: `2px solid var(--border-default)` }}>
                    <div className="flex items-start gap-2">
                      {mem.importance === 'critical' && <Sparkles className="w-3 h-3 mt-0.5 shrink-0" style={{ color: 'var(--color-amber)' }} />}
                      <div className="flex-1">
                        <span className="leading-relaxed">{mem.content}</span>
                        {mem.tags?.factions?.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {mem.tags.factions.map((f: string) => (
                              <span key={f} className="text-[0.5625rem] px-1.5 py-0.5 rounded-[8px] uppercase tracking-tighter font-bold" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 10%, transparent)', color: 'color-mix(in srgb, var(--bg-elevated) 70%, transparent)', border: `1px solid color-mix(in srgb, var(--bg-elevated) 20%, transparent)` }}>
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {memories.filter(m => m.type === 'world').length === 0 && (
                  <div className="text-sm ml-4 text-[var(--text-muted)] italic">尚無世界記憶</div>
                )}
              </div>
            </div>

            {(() => {
              const regionMems = memories.filter(m => {
                if (m.type !== 'region' || !m.isActive) return false;
                const locs = m.tags?.locations || [];
                if (locs.length === 0) return true;
                return locs.some((l: string) => l === currentLocation);
              });
              return regionMems.length > 0 ? (
                <div className="mb-4">
                  <h4 className="text-sm mb-2 uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-tab)' }}>
                    ✦ 區域記憶
                  </h4>
                  <div className="space-y-1">
                    {regionMems.map(mem => (
                      <div key={mem.id} className="memory-card backdrop-blur-sm p-3 text-sm text-[var(--text-muted)] transition-all duration-300 shadow-sm" style={{ borderLeft: `2px solid var(--bg-elevated)` }}>
                        <div className="leading-relaxed">
                          {mem.content}
                          {mem.expiresAt && <span className="ml-1.5 italic" style={{ color: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)' }}>（至 {mem.expiresAt}）</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {(() => {
              const sceneMems = memories.filter(m =>
                m.type === 'scene' && m.isActive &&
                (m.tags?.locations || []).some((l: string) => l === currentLocation)
              );
              return (
                <div className="mb-4">
                  <h4 className="text-sm mb-2 uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-tab)' }}>
                    ✦ 場景記憶
                  </h4>
                    {sceneMems.length > 0 ? (
                      <div className="space-y-1">
                        {sceneMems.map(mem => (
                          <div key={mem.id} className="memory-card backdrop-blur-sm p-3 text-sm text-[var(--text-muted)] transition-all duration-300 shadow-sm" style={{ borderLeft: `2px solid var(--bg-elevated)` }}>
                            <div className="leading-relaxed">
                              {mem.content}
                              {mem.source === 'ai_generated' && <span className="ml-1.5 text-[0.5625rem] uppercase tracking-tighter font-bold" style={{ color: 'color-mix(in srgb, var(--bg-elevated) 40%, transparent)' }}>（AI）</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                    <div className="text-sm ml-4 text-[var(--text-muted)] italic">此場景尚無記憶...</div>
                  )}
                </div>
              );
            })()}

            {(() => {
              const npcMems = memories.filter(m => m.type === 'npc' && m.isActive);
              return npcMems.length > 0 ? (
                <div>
                  <h4 className="text-sm mb-2 uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--bg-elevated)' }}>
                    ✦ NPC 記憶
                  </h4>
                  <div className="space-y-1">
                    {npcMems.map(mem => (
                      <div key={mem.id} className="memory-card backdrop-blur-sm p-3 text-sm text-[var(--text-muted)] transition-all duration-300 shadow-sm" style={{ borderLeft: `2px solid var(--bg-elevated)` }}>
                        <div className="leading-relaxed">
                          {mem.tags?.npcs?.length > 0 && (
                            <span className="font-bold mr-1.5" style={{ color: 'var(--bg-elevated)' }}>
                              [{mem.tags.npcs.join(',')}]
                            </span>
                          )}
                          {mem.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
          </div>

        </div>
      </div>

      {/* Quest Modal Overlay */}
      <QuestModal
        isOpen={isQuestModalOpen}
        onClose={() => setIsQuestModalOpen(false)}
        quests={quests}
        currentTotalDays={timeState.year * 360 + (timeState.month - 1) * 30 + timeState.day}
      />

      {/* Profile Modal Overlay */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        profile={profile}
        setProfile={setProfile}
      />

      {/* Diary Modal Overlay */}
      <DiaryModal
        isOpen={isDiaryModalOpen}
        onClose={() => setIsDiaryModalOpen(false)}
        diaryEntries={diaryEntries}
        onAddDiary={handleAddDiary}
        onGenerateDiary={handleGenerateDiary}
        onMergeDiary={handleMergeDiary}
        onToggleDiary={handleToggleDiary}
        onDiaryChange={handleDiaryChange}
        onDiaryTitleChange={handleDiaryTitleChange}
        onDiaryKeywordAdd={handleDiaryKeywordAdd}
        onDiaryKeywordRemove={handleDiaryKeywordRemove}
        onDeleteDiary={handleDeleteDiary}
        scanKeywords={scanKeywords}
      />

      {/* Lorebook Modal Overlay */}
      <LorebookModal
        isOpen={isLorebookModalOpen}
        onClose={() => setIsLorebookModalOpen(false)}
        lorebookEntries={lorebookEntries}
        npcs={npcs}
        onAddLorebook={handleAddLorebook}
        onAddNpc={handleAddNpc}
        onUpdateLorebook={handleUpdateLorebook}
        onDeleteLorebook={handleDeleteLorebook}
        onLorebookKeywordAdd={handleLorebookKeywordAdd}
        onLorebookKeywordRemove={handleLorebookKeywordRemove}
        onSelectNpc={setSelectedNpc}
        showToast={showToast}
      />

      {/* NPC Modal Overlay */}
      <NpcModal
        selectedNpc={selectedNpc}
        lorebookEntries={lorebookEntries}
        onClose={() => setSelectedNpc(null)}
        onRecordNpc={handleRecordNpc}
        onTogglePinNpc={handleTogglePinNpc}
        onAddNpcMemory={handleAddNpcMemory}
        onRemoveNpcMemory={handleRemoveNpcMemory}
        onUpdateNpcMemory={handleUpdateNpcMemory}
        onUpdateLorebook={handleUpdateLorebook}
        onDeleteNpc={handleDeleteNpc}
        onClearNewMemories={handleClearNewMemories}
        onUpdateNpcName={handleUpdateNpcName}
      />

      {/* System Prompt Modal Overlay */}
      <SystemPromptModal
        isOpen={isSystemPromptModalOpen}
        onClose={() => setIsSystemPromptModalOpen(false)}
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
        showToast={showToast}
      />

      {/* Settings Modal Overlay */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        mainGMConfig={mainGMConfig}
        setMainGMConfig={setMainGMConfig}
        subGMConfig={subGMConfig}
        setSubGMConfig={setSubGMConfig}
        handleExportSave={handleExportSave}
        handleImportSave={handleImportSave}
        handleResetGame={handleResetGame}
      />

      {/* Map Modal */}
      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        lorebookEntries={lorebookEntries}
        currentLocation={currentLocation}
        profile={profile}
        memories={memories}
        onTravel={handleTravel}
        showToast={showToast}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 backdrop-blur-md px-6 py-3 rounded-full shadow-[0_0_30px_rgba(0,0,0,0.5)] z-[100] flex items-center animate-in fade-in slide-in-from-top-4 duration-300" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)', border: `1px solid color-mix(in srgb, var(--bg-elevated) 10%, transparent)`, color: 'var(--text-title)' }}>
          <CheckSquare className="w-4 h-4 mr-2" style={{ color: 'var(--color-emerald)' }} />
          {toastMessage}
        </div>
      )}
    </div>
  );
}
