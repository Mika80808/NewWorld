import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, Send, RefreshCw, MoreVertical, Book, BookOpen, User, Package, Beaker, Globe, Users, Heart, MapPin, Zap, Coins, Calendar, Shield, CheckSquare, ChevronDown, ChevronRight, Map as MapIcon, Cloud, Sun, CloudRain, Snowflake, Moon, Wind, Sparkles, Brain, ScrollText, History, X, Edit2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { DiaryModal } from './components/DiaryModal';
import { LorebookModal } from './components/LorebookModal';
import { Npc, LorebookEntry, Message, NpcMemory, EquipmentItem, ItemEntry, GMConfig, SubGMConfig } from './types';
import { NpcModal, affectionColor } from './components/NpcModal';
import { QuestModal } from './components/QuestModal';
import { ProfileModal } from './components/ProfileModal';
import { SystemPromptModal } from './components/SystemPromptModal';
import { SettingsModal } from './components/SettingsModal';
import { MapModal } from './components/MapModal';
import { MONTHS_DATA } from './constants';
import { useGameStore, SAVE_KEY } from './hooks/useGameStore';
import { useCommandParser } from './hooks/useCommandParser';

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
      parts.push(<span key={`${keyPrefix}-c${keyIdx++}`} className="text-rose-400 font-medium">{token.slice(1, -1)}</span>);
    } else if (token.startsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-b${keyIdx++}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={`${keyPrefix}-i${keyIdx++}`} className="text-[#e8e8e9]">{token.slice(1, -1)}</em>);
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
        <div key={`bq-${startI}`} className="border-l-2 border-[#444d5c] pl-3 my-2 bg2-[#303438]/30 rounded-r-[8px] py-2 space-y-1">
          {quoteLines.map((ql, qi) => (
            <p key={qi} className="text-[#e8e8e9] leading-relaxed text-sm">{renderInline(ql, `bq-${startI}-${qi}`)}</p>
          ))}
        </div>
      );
      continue;
    }
    // 分隔線
    if (line.trim() === '---') {
      result.push(<hr key={`hr-${i}`} className="border-[#444d5c]/60 my-3" />);
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
  const [isUpdatingLog, setIsUpdatingLog] = useState(false);

  // 背景處理：整理冒險日誌與目標（使用 callAI 封裝層，不綁定特定 API）

const updateAdventureState = async (history: Message[], newItems: string[] = []) => {
    if (history.length < 2) return;
    setIsUpdatingLog(true);
    try {
      const lastMessages = history.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
      const itemClassifySection = newItems.length > 0
        ? `\n\n另外，請判斷以下新增道具各屬於「裝備」（武器、防具、飾品等穿戴型）還是「道具」（消耗品、材料、卷軸等使用型）。
請在 JSON 中加入 "item_types" 欄位，key 為道具名，value 為 "equipment" 或 "item"。
新增道具：${newItems.join('、')}`
        : '';
      const prompt = `你是一個 RPG 後台資料整理員，不負責說故事。
請根據以下最近的對話，輸出固定 JSON 格式，只輸出 JSON，不要任何說明：
{
  "summary": "一句話總結剛發生的事",
  "goals": ["短期目標1", "短期目標2"]${newItems.length > 0 ? `,\n  "item_types": { "道具名": "equipment 或 item" }` : ''}
}
${itemClassifySection}

對話內容：
${lastMessages}`;

      const text = await callAI(prompt);
      if (!text) return;
      const clean = text.replace(/```json|```/g, '').trim();
      const data = JSON.parse(clean);
      if (data.summary) {
        setAdventureLog(prev => [data.summary, ...prev].slice(0, 10));
      }
      if (data.goals) {
        setCurrentGoals(data.goals);
      }
      if (data.item_types && typeof data.item_types === 'object') {
        const toEquip: string[] = Object.entries(data.item_types)
          .filter(([, v]) => v === 'equipment')
          .map(([k]) => k);
        if (toEquip.length > 0) {
          const moving = items.filter(i => toEquip.includes(i.name));
          const newItems = items.filter(i => !toEquip.includes(i.name));
          const newEquipment = [...equipment];
          moving.forEach(item => {
            if (!newEquipment.some(e => e.name === item.name)) {
              newEquipment.push({ id: item.id, name: item.name, description: item.description, isEquipped: false });
            }
          });
          setItems(newItems);
          setEquipment(newEquipment);
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

  // ─── API 設定（不屬於遊戲存檔，獨立存於 localStorage）───────────────────────
  const [mainGMConfig, setMainGMConfig] = useState<GMConfig>(() => {
    // 一次性 migrate：舊 gemini_api_key → mainGM_config
    const oldKey = localStorage.getItem('gemini_api_key');
    if (oldKey && !localStorage.getItem('mainGM_config')) {
      const cfg: GMConfig = {
        provider: 'gemini', apiKey: oldKey, model: 'gemini-2.0-flash',
        maxTokens: 2048, lastSaved: new Date().toISOString(),
      };
      localStorage.setItem('mainGM_config', JSON.stringify(cfg));
      localStorage.removeItem('gemini_api_key');
      localStorage.removeItem('gemini_max_tokens');
      return cfg;
    }
    try {
      const raw = localStorage.getItem('mainGM_config');
      if (raw) return { provider: 'gemini', model: 'gemini-2.0-flash', maxTokens: 2048, apiKey: '', lastSaved: '', ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { provider: 'gemini', apiKey: '', model: 'gemini-2.0-flash', maxTokens: 2048, lastSaved: '' };
  });

  const [subGMConfig, setSubGMConfig] = useState<SubGMConfig>(() => {
    try {
      const raw = localStorage.getItem('subGM_config');
      if (raw) return { provider: 'gemini', model: 'gemini-2.0-flash', maxTokens: 512, apiKey: '', useSameKey: true, lastSaved: '', ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { provider: 'gemini', apiKey: '', model: 'gemini-2.0-flash', maxTokens: 512, useSameKey: true, lastSaved: '' };
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
      case '晴朗': return <Sun className="w-3.5 h-3.5 mr-1.5 text-amber-400" />;
      case '陰天': return <Cloud className="w-3.5 h-3.5 mr-1.5 text-[var(--text3)]" />;
      case '下雨': return <CloudRain className="w-3.5 h-3.5 mr-1.5 text-blue-400" />;
      case '下雪': return <Snowflake className="w-3.5 h-3.5 mr-1.5 text-sky-200" />;
      case '起霧': return <Wind className="w-3.5 h-3.5 mr-1.5 text-[#e8e8e9]" />;
      default: return <Sun className="w-3.5 h-3.5 mr-1.5 text-amber-400" />;
    }
  };
  const getCelestialIcon = () => {
    if (timeState.month === 4) {
      return (
        <div className="flex items-center mr-1.5 relative w-5 h-4">
          <Moon className="w-3.5 h-3.5 text-[#e8e8e9] absolute left-0" />
          <Moon className="w-3.5 h-3.5 text-purple-300 absolute right-0 top-0.5 opacity-80" />
        </div>
      );
    }
    if (timeOfDay === '夜晚' || timeOfDay === '清晨') {
      return <Moon className="w-3.5 h-3.5 mr-1.5 text-[#e8e8e9]" />;
    }
    return <Sun className="w-3.5 h-3.5 mr-1.5 text-amber-500 opacity-50" />;
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
    const model = cfg.model || 'gemini-2.0-flash';
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
    } catch { return ''; }
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
      ? `你決定搭馬車前往${destName}。`
      : `你決定徒步前往${destName}。`;
    setIsMapOpen(false);
    handleSendMessage(msg);
  };

  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    if (activeMenuId !== null) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeMenuId]);

  const handleAddDiary = () => {
    const newId = Date.now();
    setDiaryEntries([{ id: newId, text: '', isActive: true, keywords: [] }, ...diaryEntries]);
    return newId;
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

  // ─── 🔮 水晶球日記：AI 自動生成 ────────────────────────────────────────────
  const handleGenerateDiary = async () => {
    if (!mainGMConfig.apiKey.trim()) { showToast('❌ 請先設定 API Key'); return; }
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
      if (!text) { showToast('❌ 生成失敗，請稍後再試'); return; }
      const newId = Date.now();
      setDiaryEntries(prev => [{
        id: newId,
        text: text.trim(),
        isActive: false,
        keywords: [],
        source: 'ai_generated',
      }, ...prev]);
      showToast('🔮 魔法日記已生成');
    } catch (e) {
      showToast('❌ 生成失敗，請稍後再試');
    }
  };

  // ─── 💫 融合日記：合併多條日記 ─────────────────────────────────────────────
  const handleMergeDiary = async (selectedIds: number[]) => {
    if (selectedIds.length < 2) { showToast('請勾選至少 2 條日記'); return; }
    if (!mainGMConfig.apiKey.trim()) { showToast('❌ 請先設定 API Key'); return; }
    const selected = diaryEntries.filter(e => selectedIds.includes(e.id));
    const combined = selected.map((e, i) => `[日記 ${i + 1}]\n${e.text}`).join('\n\n---\n\n');
    try {
      const prompt = `請將以下多則日記合併成一則，保留所有關鍵資訊，讓日記脈絡合理，去除重複內容，使用繁體中文，第三人稱，標題前加上 💫。格式與原始日記相同。\n\n${combined}`;
      const text = await callAI(prompt, { role: 'main' });
      if (!text) { showToast('❌ 融合失敗，請稍後再試'); return; }
      const newId = Date.now();
      const sourceIds = selectedIds.slice();
      setDiaryEntries(prev => [
        {
          id: newId,
          text: text.trim(),
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

  const visibleMessages = visibleMessageCount > 0 ? messages.slice(-visibleMessageCount) : [];
  const hiddenMessageCount = Math.max(messages.length - visibleMessages.length, 0);

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

    // 嘗試使用 File System Access API
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: defaultFilename,
          types: [{
            description: 'JSON 存檔',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        showToast('存檔已匯出');
        return;
      } catch (err: any) {
        // 如果使用者取消選擇，AbortError，不顯示錯誤
        if (err.name === 'AbortError') return;
        console.warn('File System Access API 失敗，退回傳統下載模式', err);
      }
    }

    // 退回傳統下載模式
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
  const buildPrompt = (userInput: string, currentMessages: Message[]): string => {
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
      e => e.category === '地點' && e.title === currentLocation
    );
    const candidateLimit = currentLocEntry?.locationType === 'town' ? 8 : 3;

    const npcCandidates = lorebookEntries
      .filter(e => e.category === 'NPC' && e.isActive && (
        e.homeLocation === currentLocation ||
        (e.roamLocations || []).includes(currentLocation)
      ))
      .sort((a, b) => {
        const score = (e: LorebookEntry) => {
          if (e.homeLocation === currentLocation) return 0;
          if (npcs.some(n => n.name === e.title && n.isPinned)) return 1;
          return 2;
        };
        return score(a) - score(b);
      })
      .slice(0, candidateLimit);

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
          const locationMatch = currentLocation.includes(e.title) || e.title.includes(currentLocation);
          if (!locationMatch) return false;
          return lorebookHitsKeywords(e);
        }
        return lorebookHitsKeywords(e);
      })
      .sort((a, b) => (a.insertionOrder ?? 100) - (b.insertionOrder ?? 100));

    const triggeredMemories = memories.filter(m => isMemoryTriggered(m, userInput, currentLocation));
    
    const filterByImportance = (mems: MemoryEntry[], maxNormal: number, maxFlavor: number) => {
      const critical = mems.filter(m => m.importance === 'critical');
      const normal = mems.filter(m => m.importance === 'normal').slice(0, maxNormal);
      const flavor = mems.filter(m => m.importance === 'flavor').slice(0, maxFlavor);
      return [...critical, ...normal, ...flavor];
    };

    const worldMems    = filterByImportance(triggeredMemories.filter(m => m.type === 'world'), 8, 3);
    const regionMems   = filterByImportance(triggeredMemories.filter(m => m.type === 'region'), 5, 2);
    const sceneMems    = filterByImportance(triggeredMemories.filter(m => m.type === 'scene'), 5, 2);
    const relevantLorebookNpcTitles = new Set(
      relevantLorebook.filter(e => e.category === 'NPC').map(e => e.title)
    );
    const pinnedNpcs = npcs.filter(
      n => n.isPinned && !relevantLorebookNpcTitles.has(n.name)
    );

    const npcMems      = triggeredMemories.filter(m => {
      if (m.type !== 'npc') return false;
     const npcTags = m.tags?.npcs || [];
      return npcTags.some(npcName => 
        appearingNpcs.includes(npcName) || pinnedNpcs.some(p => p.name === npcName)
      );
    });

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
Location: ${currentLocation}
Time: ${timeState.year}年${timeState.month}月${timeState.day}日 ${String(timeState.hour).padStart(2,'0')}:${String(timeState.minute).padStart(2,'0')} | Weather: ${timeState.weather}
HP: ${profile.hp} | MP: ${profile.mp} | Gold: ${profile.gold}

[Inventory]
${equipment.length > 0 ? equipment.map(e => `- [裝備] ${e.name}${e.isEquipped ? '（裝備中）' : ''}: ${e.description}`).join('\n') : '（無裝備）'}
${items.length > 0 ? items.map(i => `- ${i.name} x${i.quantity}: ${i.description}`).join('\n') : ''}

[進行中任務]
${(() => {
  const active = quests.filter(q => q.status === 'active');
  if (active.length === 0) return '（無）';
  const todayTotal = timeState.year * 360 + (timeState.month - 1) * 30 + timeState.day;
  return active.map(q => {
    const remaining = q.deadline != null
      ? `剩 ${q.deadline - (todayTotal - q.createdAtTotalDays)} 天`
      : '無期限';
    if (q.isGoalMet) {
      return `${q.title}（委託：${q.giver}，目標已達成，待玩家回報）`;
    }
    return `${q.title}（委託：${q.giver}，${remaining}）`;
  }).join('\n');
})()}

---
[🌍 World Memory]
${worldMems.length > 0 ? worldMems.map(m => `- ${m.content}${m.tags?.factions?.length ? ' ['+m.tags.factions.join(',')+']' : ''}`).join('\n') : '（無）'}

[🗺️ Region Memory]
${regionMems.length > 0 ? regionMems.map(m => `- ${m.content}${m.tags?.locations?.length ? ' ['+m.tags.locations.join(',')+']' : ''}`).join('\n') : '（無）'}

[🏠 Scene Memory: ${currentLocation}]
${sceneMems.length > 0 ? sceneMems.map(m => `- ${m.content}`).join('\n') : '（無）'}

[👤 NPC Memory]
${npcMems.length > 0 ? npcMems.map(m => `- ${m.content}${m.tags?.npcs?.length ? ' ['+m.tags.npcs.join(',')+']' : ''}`).join('\n') : '（無）'}

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
    const backstoryText = (npcData?.affection ?? 0) >= 20 && e.backstory ? `｜背景：${e.backstory}` : '';
    return `[NPC] ${e.title}｜性別：${e.gender || ''}${raceText}｜職業：${e.job || ''}｜外貌：${e.appearance || ''}｜個性：${e.personality || ''}${backstoryText}${thoughtsText}${memoriesText}`;
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
    const jobPinned = lorePinned?.job ?? n.job ?? '';
    const backstoryPinned = n.affection >= 20 && lorePinned?.backstory ? `｜背景：${lorePinned.backstory}` : '';
    const lines: string[] = [`- ${n.name}（${genderPinned}${jobPinned}）${racePinned}好感度:${n.affection}${backstoryPinned}${thoughtsText}`];
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
當劇情發生數值變化時，在回應最前面輸出指令區塊，格式如下：
<<COMMANDS>>
HP:-15
GOLD:+200
AFFINITY:角色名:+10
LOCATION:新地點名稱
TIME:+1h
ITEM_ADD:道具名:1:說明文字
- ITEM_ADD：當玩家獲得道具時輸出。若道具為消耗品（藥水、食物、卷軸等），請加上 effect 欄位（hp/mp/gold/status=值），前端會自動分類為消耗品欄並套用數值。
- ITEM_USE：當玩家在對話中明確表示使用某消耗品時輸出，使用與道具欄完全相同的道具名稱，前端會套用 effect 並扣除數量。
QUEST_ADD:任務名稱:委託人NPC:目標描述:獎勵金幣:獎勵道具(逗號分隔可留空):期限天數(可留空=無期限)
QUEST_GOAL_MET:任務名稱
QUEST_COMPLETE:任務名稱
NPC_THOUGHT:角色名:一句話內心想法
NPC_RELATIONSHIP:角色名:與玩家的關係描述
NPC_NEW:姓名:種族:職業:外貌一句話:個性一句話
NPC_HOME:姓名:地點名稱
NPC_LOCATION:姓名:地點名稱
LOCATION_DISCOVER:地點名稱
MEMORY_ADD:region:normal:迷霧森林昨日大火，黑牙氏族前往支援:locations=迷霧森林:factions=黑牙氏族:keywords=大火,火災:sticky=3
MEMORY_ADD:scene:normal:酒館因打架暫時關閉:locations=酒館
MEMORY_ADD:npc:normal:芬里爾透露停火協議內容:npcs=芬里爾:keywords=停火,協議
MEMORY_ADD:world:critical:魔王宣布向月湖鎮宣戰:keywords=魔王,宣戰
<</COMMANDS>>

並在敘事內文開頭輸出出場標記（非 COMMANDS 區塊）：
[出場:姓名1,姓名2]

【AI 何時應輸出 NPC_THOUGHT】
當 NPC 有明顯情緒變化、做出重要決定、或對玩家產生新看法時，以第一人稱輸出一句話內心想法。

【AI 何時應輸出 NPC_RELATIONSHIP】
當玩家與 NPC 初次建立明確關係（如：成為顧客、僱主、同行者、對手），或關係發生重大轉變時（如：從陌生人變成盟友、從朋友變成仇人），輸出一句簡短的關係描述（例如「偶爾光顧的旅行者」「被委託的冒險者」「礙眼的外來者」）。

【AI 何時應輸出 ITEM_ADD / ITEM_USE】
- ITEM_ADD：當玩家獲得任何道具時輸出，格式 ITEM_ADD:名稱:數量:說明文字。說明文字請詳細描述外觀與效果，玩家使用時 AI 根據說明生成劇情。
- ITEM_USE：當玩家明確使用某道具時輸出，前端會扣除數量並送訊息給 AI 接續描述。
- ITEM_USE：當玩家明確使用某道具時輸出，前端會扣除數量並送訊息給 AI 接續描述。

【AI 何時應輸出 QUEST_ADD】
當 NPC 正式委託玩家任務、或玩家從布告欄接取任務時輸出。格式：QUEST_ADD:任務名:委託人:目標描述:獎勵金幣(數字):獎勵道具(逗號分隔,可留空):期限天數(數字,可留空)。任務名稱之後的欄位均可留空。

【AI 何時應輸出 QUEST_GOAL_MET】
當 AI 判斷玩家已實際完成任務目標（例如：找到了物品、擊敗了目標、完成了交涉），但玩家尚未回到委託人處回報時，靜默輸出此指令。前端會標記任務為「待回報」狀態並提示玩家。

【AI 何時應輸出 QUEST_COMPLETE】
當玩家親自向委託人回報、且 AI 確認任務結案時輸出。必須使用與 QUEST_ADD 完全相同的任務名稱。若任務已標記 isGoalMet，此指令將自動發放獎勵並關閉任務。

【AI 何時應輸出 NPC_NEW / NPC_HOME / NPC_LOCATION】
- NPC_NEW：創造有名有姓、會在世界中固定出現的新角色時輸出（一次性建檔）
- NPC_HOME：新 NPC 第一次登場時，同步輸出其主要活動地點
- NPC_LOCATION：NPC 出現在非主場地點時，記錄其出沒足跡

【AI 何時輸出 [出場:] 標記】
每個場景或回合開頭，從「當前場景可能出現的角色」候選名單中選擇誰真正在場；也可不選任何人（輸出 [出場:]），或加入候選名單以外的新角色。每次回應都應輸出此標記讓前端追蹤。

【AI 何時應輸出 LOCATION_DISCOVER】
當玩家在旅途中路過、聽說或間接發現某個尚未正式踏足的地點（如路牌、旅人提及、地圖殘片等），輸出 LOCATION_DISCOVER:地點名稱，前端會自動將其標記為「待探索」地點加入世界地圖。

【字體標記（可選）】
敘事中若有特殊文體段落，可用以下標記包裹，前端會自動套用對應字體：
- [FONT:serif]...[/FONT]：信件、公告、書信、正式文書（明朝體）
- [FONT:spell]...[/FONT]：咒語、魔法陣文字、古文、神諭（書法體）
- [FONT:sans]...[/FONT]：現代感、系統提示、數據（黑體，預設可省略）
標記可與 markdown 混用，例如在 serif 區塊內使用 **粗體** 或 > 引用。

【AI 何時應輸出 MEMORY_ADD】
當發生以下五種情境時，請務必使用 MEMORY_ADD 記錄：
1. 世界事件 (world)：影響整個世界的重大變故（如：魔王宣戰、天象異變）。
2. 區域事件 (region)：特定區域的動態變化（如：森林大火、城鎮慶典）。
   * 特別規則：若你的回應裡出現 [ ] 格式的布告欄內容或公告時，必定觸發 MEMORY_ADD:region 將其記錄下來。
3. 場景狀態改變 (scene)：當前地點的物理或狀態改變（如：酒館被砸毀、橋樑斷裂）。
4. NPC 情報 (npc)：NPC 透露的關鍵秘密、身世或重要決定。
5. 玩家重要事件 (world/region/npc)：玩家達成的重大成就、做出的關鍵選擇，或與 NPC 關係的重大突破。

若需要提供玩家行動建議，請在回應最後面輸出選項區塊，格式如下（請不要加上數字編號，限制在10字以內，以簡單動作為主）：
<<OPTIONS>>
選項一
選項二
選項三
<</OPTIONS>>
指令區塊之後才是給玩家看的敘事內容。若無數值變化則省略指令區塊。

Please respond as the DM.`;
  };

  const handleSendMessage = async (textToUse?: string | React.MouseEvent | React.KeyboardEvent, historyToUse?: any[]) => {
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
      const prompt = buildPrompt(text, historyToUse || messages);

      aiMessageId = Date.now() + 1;
      setMessages(prev => [...prev, { id: aiMessageId!, role: 'assistant', text: '' }]);

      // 使用 streaming（避免長回應 timeout），背景累積不即時顯示，避免 <<COMMANDS>> 閃現
      const fullText = await callAI(prompt, { role: 'main', onChunk: () => {} });

      const { narrative: parsedNarrative, newItems } = parseAndExecuteCommands(fullText);
      const rawNarrative = parsedNarrative;

      // ── 助理 GM 接口：有新增道具時才觸發分類（Sub GM 實裝後補完）──────────
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

      // 觸發背景整理
      updateAdventureState(
        [...newMessages, { id: aiMessageId, role: 'assistant', text: narrative }],
        newItems,
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
    <div className="flex flex-col h-screen bg-[#171617] text-[#fbf5e4] font-sans overflow-hidden" style={{backgroundImage: 'radial-gradient(ellipse at top right, #24282d, #303438, #171617)'}}>
      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Panel */}
        <div className="w-64 bg-[#24282d] flex flex-col p-4 space-y-4 overflow-y-auto z-10" style={{borderRight: '0.5px solid #444d5c'}}>
          {/* Adventure Log & Goals */}
          <div className="text1-#fbf5e4 p-3 rounded-[8px] border border-[#444d5c] shadow-inner">
            <h3 className="flex items-center text-[#fbf5e4] font-bold text-sm mb-2">
              <ScrollText className="w-4 h-4 mr-2" /> 當前目標
              {isUpdatingLog && <RefreshCw className="w-3 h-3 ml-2 animate-spin opacity-50" />}
            </h3>
            <ul className="text-xs space-y-1.5 text-[#e8e8e9]">
              {currentGoals.length > 0 ? (
                currentGoals.map((goal, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 w-1 h-1 rounded-full bg-[#444d5c] flex-shrink-0" />
                    <span>{goal}</span>
                  </li>
                ))
              ) : (
                <li className="italic text-[var(--text3)]">暫無明確目標...</li>
              )}
            </ul>
          </div>

          <div className="bg2-[#303438] p-3 rounded-[8px] border border-[#444d5c]">
            <h3 className="flex items-center text-[#fbf5e4] font-bold text-sm mb-2">
              <History className="w-4 h-4 mr-2 text1-[#fbf5e4]" /> 冒險摘要
            </h3>
            <div className="max-h-32 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {adventureLog.length > 0 ? (
                adventureLog.map((log, i) => (
                  <div key={i} className="text-xs leading-relaxed text-[#e8e8e9] border-l border-[#444d5c] pl-2 py-0.5 italic">
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-xs text-[var(--text3)] italic">等待冒險展開...</div>
              )}
            </div>
          </div>

          <div
            className="bg2-[#303438] p-3 rounded-[8px] cursor-pointer hover:bg2-[#303438] transition relative group"
            style={{border: '0.5px solid #444d5c'}}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#444d5c')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#444d5c')}
            onClick={() => setIsQuestModalOpen(true)}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="flex items-center text-[#fbf5e4] font-bold"><Book className="w-4 h-4 mr-2" /> 任務日誌</h3>
              <ChevronRight className="w-4 h-4 text-[#444d5c]/50 group-hover:text-[#444d5c] transition" />
            </div>
            <ul className="text-sm space-y-1 text-[#e8e8e9]">
              {quests.filter(q => q.status === 'active').length > 0 ? (
                <>
                  {quests.filter(q => q.status === 'active').slice(0, 3).map(q => (
                    <li key={q.id} className="flex items-center gap-1.5 truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#fb7185] flex-shrink-0" />
                      <span className="truncate">{q.title}</span>
                    </li>
                  ))}
                  {quests.filter(q => q.status === 'active').length > 3 && (
                    <li className="text-[var(--text3)] text-xs pl-3">…還有 {quests.filter(q => q.status === 'active').length - 3} 個</li>
                  )}
                </>
              ) : (
                <li className="text-xs text-[var(--text3)] italic">目前沒有任務</li>
              )}
            </ul>
          </div>
          
          <div className="relative">
            <div className="bg2-[#303438] rounded-[8px] transition-colors" style={{border: '0.5px solid #444d5c'}}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#444d5c')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#444d5c')}>
              <button
                onClick={() => {
                  setIsInventoryOpen(!isInventoryOpen);
                  if (isConsumablesOpen) setIsConsumablesOpen(false);
                }}
                className={`w-full p-3 flex items-center justify-between hover:bg2-[#303438] transition rounded-[8px] ${isInventoryOpen ? 'bg2-[#303438]' : ''}`}
              >
                <h3 className="flex items-center text-[#fbf5e4] font-bold">
                  <Package className="w-4 h-4 mr-2" /> 裝備 ({equipment.length})
                </h3>
                <ChevronRight className={`w-4 h-4 text-[var(--text3)] transition-transform ${isInventoryOpen ? 'rotate-90 text-[#444d5c]' : ''}`} />
              </button>
            </div>
            
            <AnimatePresence>
              {isInventoryOpen && (
                <motion.div 
                  initial={{ opacity: 0, x: -10, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -10, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute left-[calc(100%+8px)] top-0 w-72 bg2-[#303438]/95 backdrop-blur-xl border border-[#444d5c] rounded-[8px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-50 flex flex-col overflow-hidden"
                  style={{ maxHeight: '60vh' }}
                >
                  <div className="sticky top-0 bg-[#24282d]/90 backdrop-blur-md p-3 border-b border-[#444d5c] flex justify-between items-center z-10">
                    <h3 className="text-[#444d5c] font-bold flex items-center text-sm"><Package className="w-4 h-4 mr-2" /> 裝備清單</h3>
                    <button onClick={() => setIsInventoryOpen(false)} className="text-[var(--text3)] hover:text-[#fbf5e4] transition-colors p-1 rounded-full hover:bg-white/5">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-3 space-y-2 overflow-y-auto custom-scrollbar flex-1">
                    {equipment.length > 0 ? equipment.map(item => (
                      <div 
                        key={item.id} 
                        className={`bg2-[#303438]/50 p-2.5 rounded-[8px] border cursor-pointer transition-all ${selectedInventoryItem === item.id ? 'border-[#444d5c]/50 shadow-[0_0_10px_rgba(230,191,85,0.1)]' : 'border-[#444d5c]/50 hover:border-[#444d5c] hover:bg2-[#303438]'}`}
                        onClick={() => setSelectedInventoryItem(selectedInventoryItem === item.id ? null : item.id)}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium text-[#fbf5e4]">{item.name}</span>
                          <span className="text-xs font-mono bg-[#24282d] px-1.5 py-0.5 rounded-[8px] text-[#e8e8e9]">x{item.quantity}</span>
                        </div>
                        <div className="text-xs text-[#e8e8e9]/80 leading-relaxed">{item.description}</div>
                        
                        <AnimatePresence>
                          {selectedInventoryItem === item.id && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="flex space-x-2 mt-2.5 pt-2.5 border-t border-[#444d5c]/50 overflow-hidden"
                            >
                              <button 
                                className="flex-1 bg-[#444d5c]/30 hover:bg-[#444d5c]/60 text-xs py-1.5 rounded-[8px] transition text-[#fbf5e4] font-medium"
                                onClick={(e) => { e.stopPropagation(); showToast(`裝備了 ${item.name}`); setSelectedInventoryItem(null); }}
                              >
                                裝備
                              </button>
                              <button 
                                className="flex-1 bg-[#444d5c]/30 hover:bg-[#444d5c]/60 text-xs py-1.5 rounded-[8px] transition text-[#fbf5e4] font-medium"
                                onClick={(e) => { e.stopPropagation(); showToast(`卸下了 ${item.name}`); setSelectedInventoryItem(null); }}
                              >
                                卸下
                              </button>
                              <button
                                className="flex-1 bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 border border-rose-900/30 text-xs py-1.5 rounded-[8px] transition font-medium"
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
                      <div className="text-center text-[var(--text3)] text-xs py-8 italic">背包空空如也...</div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative">
            <div className="bg2-[#303438] rounded-[8px] transition-colors" style={{border: '0.5px solid #444d5c'}}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#444d5c')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#444d5c')}>
              <button
                onClick={() => {
                  setIsConsumablesOpen(!isConsumablesOpen);
                  if (isInventoryOpen) setIsInventoryOpen(false);
                }}
                className={`w-full p-3 flex items-center justify-between hover:bg2-[#303438] transition rounded-[8px] ${isConsumablesOpen ? 'bg2-[#303438]' : ''}`}
              >
                <h3 className="flex items-center text-[#fbf5e4] font-bold">
                  <Beaker className="w-4 h-4 mr-2" /> 消耗品 ({items.reduce((acc, item) => acc + item.quantity, 0)})
                </h3>
                <ChevronRight className={`w-4 h-4 text-[var(--text3)] transition-transform ${isConsumablesOpen ? 'rotate-90 text-[#444d5c]' : ''}`} />
              </button>
            </div>
            
            <AnimatePresence>
              {isConsumablesOpen && (
                <motion.div 
                  initial={{ opacity: 0, x: -10, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -10, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute left-[calc(100%+8px)] top-0 w-72 bg2-[#303438]/95 backdrop-blur-xl border border-[#444d5c] rounded-[8px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-50 flex flex-col overflow-hidden"
                  style={{ maxHeight: '60vh' }}
                >
                  <div className="sticky top-0 bg-[#24282d]/90 backdrop-blur-md p-3 border-b border-[#444d5c] flex justify-between items-center z-10">
                    <h3 className="text-[#444d5c] font-bold flex items-center text-sm"><Beaker className="w-4 h-4 mr-2" /> 消耗品清單</h3>
                    <button onClick={() => setIsConsumablesOpen(false)} className="text-[var(--text3)] hover:text-[#fbf5e4] transition-colors p-1 rounded-full hover:bg-white/5">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-3 space-y-2 overflow-y-auto custom-scrollbar flex-1">
                    {items.length > 0 ? items.map(item => (
                      <div 
                        key={item.id} 
                        className={`bg2-[#303438]/50 p-2.5 rounded-[8px] border cursor-pointer transition-all ${selectedConsumableItem === item.id ? 'border-[#444d5c]/50 shadow-[0_0_10px_rgba(230,191,85,0.1)]' : 'border-[#444d5c]/50 hover:border-[#444d5c] hover:bg2-[#303438]'}`}
                        onClick={() => setSelectedConsumableItem(selectedConsumableItem === item.id ? null : item.id)}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium text-[#fbf5e4]">{item.name}</span>
                          <span className="text-xs font-mono bg-[#24282d] px-1.5 py-0.5 rounded-[8px] text-[#e8e8e9]">x{item.quantity}</span>
                        </div>
                        <div className="text-xs text-[#e8e8e9]/80 leading-relaxed">{item.description}</div>
                        
                        <AnimatePresence>
                          {selectedConsumableItem === item.id && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="flex space-x-2 mt-2.5 pt-2.5 border-t border-[#444d5c]/50 overflow-hidden"
                            >
                              <button
                                className="flex-1 bg-emerald-900/20 hover:bg-emerald-900/40 text-[#fb7185] border border-emerald-900/30 text-xs py-1.5 rounded-[8px] transition font-medium"
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
                                className="flex-1 bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 border border-rose-900/30 text-xs py-1.5 rounded-[8px] transition font-medium"
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
                      <div className="text-center text-[var(--text3)] text-xs py-8 italic">沒有任何消耗品...</div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div
            className="bg2-[#303438] p-3 rounded-[8px] cursor-pointer hover:bg2-[#303438] transition"
            style={{border: '0.5px solid #444d5c'}}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#444d5c')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#444d5c')}
            onClick={() => setIsDiaryModalOpen(true)}
          >
            <h3 className="flex items-center text-[#fbf5e4] font-bold"><Book className="w-4 h-4 mr-2" />日記</h3>
          </div>

          {npcs.filter(n => n.isPinned).length > 0 && (
            <div className="bg2-[#303438] rounded-[8px] overflow-hidden p-3" style={{border: '0.5px solid #444d5c'}}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#444d5c')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#444d5c')}>
              <h3 className="text-[#444d5c] font-bold mb-3">✦ 關注</h3>
              <div className="space-y-2">
                {npcs.filter(n => n.isPinned).map(npc => (
                  <div
                    key={npc.id}
                    className="bg2-[#303438]/60 backdrop-blur-md p-3 rounded-[10px] flex justify-between items-center cursor-pointer hover:bg2-[#303438] transition-all duration-300 shadow-md border border-white/5 relative overflow-hidden group/pinned"
                    onClick={() => setSelectedNpc(npc)}
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#444d5c] opacity-40"></div>
                    <div>
                      <div className="text-sm font-bold text-[#fbf5e4] group-hover/pinned:text-[#444d5c] transition-colors">{npc.name}</div>
                      <div className="text-xs text-[#e8e8e9] uppercase tracking-tighter">{npc.job}</div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="text-xs flex items-center bg-black/20 px-2 py-0.5 rounded-full border border-white/10" style={{ color: affectionColor(npc.affection) }}>
                        <Heart className="w-3 h-3 mr-1 fill-current" /> {npc.affection}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1"></div>

          <div className="grid grid-cols-2 gap-2 mt-auto">
            {[
              { label: '個人資訊', icon: <User className="w-4 h-4 mr-2" />, action: () => setIsProfileModalOpen(true) },
              { label: '設定集', icon: <BookOpen className="w-4 h-4 mr-2" />, action: () => setIsLorebookModalOpen(true) },
              { label: '設定', icon: <Settings className="w-4 h-4 mr-2" />, action: () => setIsSettingsModalOpen(true) },
              { label: 'Prompt', icon: <Brain className="w-4 h-4 mr-2" />, action: () => setIsSystemPromptModalOpen(true) },
            ].map(item => (
              <div
                key={item.label}
                className="bg2-[#303438] p-2 rounded-[8px] cursor-pointer hover:bg2-[#303438] transition flex items-center justify-center"
                style={{border: '0.5px solid #444d5c'}}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#444d5c')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#444d5c')}
                onClick={item.action}
              >
                <span className="flex items-center text-[#fbf5e4] font-bold text-sm">{item.icon}{item.label}</span>
              </div>
            ))}
          </div>

          {lastSavedAt && (() => {
            const isToday = lastSavedAt.toDateString() === new Date().toDateString();
            const timeStr = lastSavedAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const dateStr = lastSavedAt.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
            return (
              <p className="text-center text-xs text-[var(--text3)] mt-1.5">
                上次存檔 {isToday ? timeStr : `${dateStr} ${timeStr}`}
              </p>
            );
          })()}
        </div>

        {/* Center Panel */}
        <div className="flex-1 flex flex-col bg-transparent relative">
          {/* Scene Bar */}
          <div className="bg-[#24282d]/40 backdrop-blur-md border-b border-white/5 shadow-[0_4px_24px_rgba(0,0,0,0.2)] p-3 flex items-center justify-end absolute top-0 w-full z-30">
            <div className="flex space-x-2">
              <button 
                onClick={() => setIsMapOpen(true)}
                className="px-3 py-1.5 rounded-[8px] text-xs font-medium transition bg-[#444d5c]/20 text-[#444d5c] hover:bg-[#444d5c]/40 border border-[#444d5c]/30 flex items-center"
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
              const el = e.currentTarget;
              if (el.scrollTop <= 4 && hiddenMessageCount > 0 && !isAutoLoadingRef.current) {
                isAutoLoadingRef.current = true;
                setVisibleMessageCount(prev => Math.min(messages.length, prev + VISIBLE_MESSAGES_STEP));
              }
            }}
          >
            {visibleMessages.map(msg => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end pl-5' : 'items-start pr-5'} max-w-3xl mx-auto w-full group relative ${activeMenuId === msg.id ? 'z-20' : 'z-0'}`}>
                
                <div className={`flex items-center space-x-2 mb-1 ${msg.role === 'user' ? 'mr-2 flex-row-reverse space-x-reverse' : 'ml-2'}`}>
                  <span className="text-xs text-[var(--text3)] font-bold">
                    {msg.role === 'user' ? profile.name : '異世界'}
                  </span>
                  <div className={`flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition ${activeMenuId === msg.id ? 'opacity-100' : ''}`}>
                    {msg.role !== 'user' && (
                      <button 
                        onClick={() => handleRegenerate(msg.id)}
                        disabled={isLoading}
                        className="p-1 text-[var(--text3)] hover:text-[#e8e8e9] rounded-[8px] transition disabled:opacity-50 disabled:cursor-not-allowed" 
                        title="重新生成"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <div className="relative">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === msg.id ? null : msg.id);
                        }}
                        className="p-1 text-[var(--text3)] hover:text-[#e8e8e9] rounded-[8px] transition"
                        title="更多選項"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                      
                      {activeMenuId === msg.id && (
                        <div className={`absolute top-full mt-1 w-24 bg2-[#303438]/90 backdrop-blur-md border border-white/10 rounded-[10px] shadow-[0_0_20px_rgba(0,0,0,0.3)] z-50 overflow-hidden flex flex-col ${msg.role === 'user' ? 'right-0' : 'left-0'}`}>
                          <button 
                            className="px-3 py-2 text-xs text-[#e8e8e9] hover:bg2-[#303438]/50 text-left transition"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              navigator.clipboard.writeText(msg.text).then(() => showToast('已複製訊息')).catch(() => showToast('複製失敗'));
                              setActiveMenuId(null); 
                            }}
                          >
                            複製
                          </button>
                          <button 
                            className="px-3 py-2 text-xs text-[#e8e8e9] hover:bg2-[#303438]/50 text-left transition"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setEditingMessageId(msg.id);
                              setEditMessageText(msg.text);
                              setActiveMenuId(null); 
                            }}
                          >
                            編輯
                          </button>
                          <button 
                            className="px-3 py-2 text-xs text-rose-400 hover:bg2-[#303438]/50 text-left transition"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              const newMessages = messages.filter(m => m.id !== msg.id);
                              setMessages(newMessages);
                              saveToStorage({ messages: newMessages });
                              showToast('已刪除訊息');
                              setActiveMenuId(null); 
                            }}
                          >
                            刪除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={`p-4 text-left max-w-full ${
                  editingMessageId === msg.id ? 'w-full' : 'w-fit'
                } ${
                  msg.role === 'user'
                    ? 'bg-[#444d5c]/10 text-[#e8e8e9]'
                    : 'bg2-[#303438] text-[#fbf5e4]'
                }`} style={{
                  borderRadius: msg.role === 'user' ? '8px' : '8px',
                  border: msg.role === 'user' ? '0.5px solid rgba(201,168,76,0.3)' : '0.5px solid #444d5c'
                }}>
                  {editingMessageId === msg.id ? (
                    <div className="flex flex-col w-full">
                      <textarea 
                        value={editMessageText} 
                        onChange={(e) => setEditMessageText(e.target.value)}
                        className="w-full bg-[#24282d]/50 backdrop-blur-sm text-[#fbf5e4] p-3 rounded-[10px] border border-white/10 focus:border-[#444d5c]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none resize-none text-sm min-h-[200px]"
                        autoFocus
                      />
                      <div className="flex justify-end space-x-2 mt-2">
                        <button 
                          onClick={() => setEditingMessageId(null)} 
                          className="text-xs text-[var(--text3)] hover:text-[#fbf5e4] px-2 py-1"
                        >
                          取消
                        </button>
                        <button 
                          onClick={() => {
                            const newMessages = messages.map(m => m.id === msg.id ? { ...m, text: editMessageText } : m);
                            setMessages(newMessages);
                            saveToStorage({ messages: newMessages });
                            setEditingMessageId(null);
                            showToast('已更新訊息');
                          }} 
                          className="text-xs bg-[#1044ab] hover:bg-[#1a56db] active:bg-[#2563eb] backdrop-blur-sm text-[#fbf5e4] px-3 py-1 rounded-[8px] transition shadow-[0_4px_12px_rgba(16,68,171,0.2)]"
                        >
                          儲存
                        </button>
                      </div>
                    </div>
                  ) : msg.role === 'user' ? (
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  ) : msg.text === '' && isLoading && msg.id === messages[messages.length - 1]?.id ? (
                    <div className="flex items-center space-x-2 py-0.5 select-none">
                      <span className="text-[#444d5c] text-sm">✦ 異世界正在回應</span>
                      <span className="flex items-end space-x-0.5 pb-0.5">
                        {[0, 200, 400].map(delay => (
                          <span
                            key={delay}
                            className="inline-block w-1 h-1 rounded-full bg-[#444d5c]"
                            style={{ animation: `blink-dot 1.4s ease-in-out infinite`, animationDelay: `${delay}ms` }}
                          />
                        ))}
                      </span>
                    </div>
                  ) : (
                    <div className="leading-relaxed">{renderMarkdown(msg.text)}</div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="absolute bottom-0 w-full pt-10 pb-4 px-6 flex flex-col items-center z-30">
            <div className="absolute inset-0 bg-gradient-to-t from-[#171617]/90 via-[#171617]/60 to-transparent backdrop-blur-md [mask-image:linear-gradient(to_top,black_60%,transparent)] pointer-events-none -z-10"></div>
            
            <div className="w-full max-w-3xl">
              <div className="flex space-x-2 mb-3">
                {quickOptions.map((option, idx) => (
                  <button 
                    key={idx}
                    onClick={() => handleSendMessage(option)}
                    disabled={isLoading}
                    className="px-3 py-1 bg2-[#303438]/60 backdrop-blur-sm hover:bg2-[#303438]/80 border border-white/10 rounded-full text-xs text-[#e8e8e9] transition shadow-[0_0_10px_rgba(0,0,0,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="flex items-end bg2-[#303438] overflow-hidden transition-all" style={{borderRadius: '8px', border: '0.5px solid #444d5c'}} onFocus={(e) => e.currentTarget.style.borderColor = '#444d5c'} onBlur={(e) => e.currentTarget.style.borderColor = '#444d5c'}>
                <textarea 
                  className="w-full bg-transparent text-[#fbf5e4] p-4 outline-none resize-none max-h-32 min-h-[56px] disabled:opacity-50" 
                  placeholder={isLoading ? "AI 正在思考中..." : "輸入你的行動或對話..."}
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
                    e.currentTarget.style.height = 'auto';
                    e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 128) + 'px';
                  }}
                ></textarea>
                <button 
                  className={`p-4 transition ${isLoading || !inputText.trim() ? 'text-[#444d5c] cursor-not-allowed' : 'text-[#444d5c] hover:text-[#e8e8e9]'}`}
                  onClick={handleSendMessage}
                  disabled={isLoading || !inputText.trim()}
                >
                  {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>

              {/* Status Bar */}
              <div className="mt-3 flex items-center justify-between text-xs text-[#e6d6bf] font-mono px-2">
                <div className="flex items-center space-x-4">
                  <span className="flex items-center" title={`${currentMonthData.name}：${currentMonthData.elegant}`}>
                    <Calendar className="w-3.5 h-3.5 mr-1.5" /> 
                    帝國曆 {timeState.year}年 {timeState.month}月 {timeState.day}日
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
                  <span className="flex items-center text-[#e6d6bf]"><Heart className="w-3.5 h-3.5 mr-1.5 fill-current text-rose-400" /> HP {profile.hp}</span>
                  <span className="flex items-center text-[#e6d6bf]"><Zap className="w-3.5 h-3.5 mr-1.5 fill-current text-blue-400" /> MP {profile.mp}</span>
                  <span className="flex items-center text-[#e6d6bf]"><Shield className="w-3.5 h-3.5 mr-1.5 text-[#e8e8e9]" /> {profile.job}</span>
                  <span className="flex items-center text-[#444d5c]"><Coins className="w-3.5 h-3.5 mr-1.5" /> {(profile.gold ?? 0).toLocaleString()} G</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-64 bg-[#24282d] flex flex-col p-4 space-y-6 overflow-y-auto z-10" style={{borderLeft: '0.5px solid #444d5c'}}>

          <div>
            <h3 className="text-[#fbf5e4] font-bold mb-3 pb-2" style={{borderBottom: '0.5px solid #444d5c'}}>✦ 當前場景人物</h3>
            <div className="space-y-2">
              {npcs.filter(n => n.location === currentLocation && !n.isPinned).length > 0 ? (
                npcs.filter(n => n.location === currentLocation && !n.isPinned).map(npc => {
                  const lore = lorebookEntries.find(e => e.category === 'NPC' && e.title === npc.name);
                  const displayJob    = lore?.job    ?? npc.job    ?? '';
                  const displayGender = lore?.gender ?? '';
                  return (
                  <div
                    key={npc.id}
                    className="bg2-[#303438]/60 backdrop-blur-md border border-white/5 p-3 rounded-[10px] flex justify-between items-center cursor-pointer hover:bg2-[#303438]/80 transition-all duration-300 shadow-lg group/npc overflow-hidden relative"
                    onClick={() => setSelectedNpc(npc)}
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#444d5c]/0 via-[#444d5c]/40 to-[#444d5c]/0 opacity-0 group-hover/npc:opacity-100 transition-opacity"></div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-[#fbf5e4] group-hover/npc:text-[#444d5c] transition-colors">{npc.name}</span>
                      <span className="text-xs text-[#e8e8e9] uppercase tracking-tighter">{displayGender ? `${displayGender}・${displayJob}` : displayJob}</span>
                    </div>
                    <div className="text-xs flex items-center px-2 py-1 rounded-full bg-black/20 border border-white/5" style={{ color: affectionColor(npc.affection) }}>
                      <Heart className="w-3 h-3 mr-1 fill-current" />
                      <span className="font-mono">{npc.affection}</span>
                    </div>
                  </div>
                  );
                })
              ) : (
                <div className="text-xs text-[var(--text3)] italic py-2">此處目前沒有人...</div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-[#fbf5e4] font-bold mb-3 pb-2" style={{borderBottom: '0.5px solid #444d5c'}}>✦ 當前場景記憶</h3>
            
            <div className="mb-4">
              <h4 className="text-xs mb-2 uppercase tracking-wider text-[#fbf5e4] flex items-center">✦ 世界記憶</h4>
              <div className="space-y-2">
                <div className="bg-gradient-to-br from-[#1e1477] to-[#24282d] px-5 py-[10px] mb-2 rounded-[10px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-md relative overflow-hidden group">
                  <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:opacity-20 transition-all duration-700 rotate-12 group-hover:scale-110">
                    <Sparkles className="w-[80px] h-[80px] text-[#444d5c]" />
                  </div>
                  <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#444d5c]/40 to-transparent"></div>
                  
                  <div className="flex items-center space-x-2.5 mb-2 relative z-10">
                    <div className="p-1.5 rounded-[8px] bg-white/5 border border-white/10 shadow-inner">
                      <Calendar className="w-3.5 h-3.5 text-[#444d5c]" />
                    </div>
                    <span className="text-sm font-bold text-[#fbf5e4] tracking-[0.15em] uppercase">{currentMonthData.elegant}</span>
                  </div>
                  <p className="text-xs text-[#fbf5e4]/90 leading-relaxed relative z-10 font-light italic pl-1 border-l border-[#444d5c]/20 mb-2">
                    {currentMonthData.desc}
                  </p>
                </div>

                {memories.filter(m => m.type === 'world' && m.isActive).map(mem => (
                  <div key={mem.id} className="memory-card bg2-[#303438]/60 backdrop-blur-sm p-3 text-xs text-[var(--text3)] border-l-2 border-[#444d5c] hover:bg2-[#303438]/80 transition-all duration-300 shadow-sm group/mem">
                    <div className="flex items-start gap-2">
                      {mem.importance === 'critical' && <Sparkles className="w-3 h-3 text-[#444d5c] mt-0.5 shrink-0" />}
                      <div className="flex-1">
                        <span className="leading-relaxed">{mem.content}</span>
                        {mem.tags?.factions?.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {mem.tags.factions.map((f: string) => (
                              <span key={f} className="text-[9px] px-1.5 py-0.5 rounded-[8px] bg-[#444d5c]/10 text-[#444d5c]/70 border border-[#444d5c]/20 uppercase tracking-tighter font-bold">
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
                  <div className="text-xs text-[var(--text3)] italic">尚無世界記憶</div>
                )}
              </div>
            </div>

            {(() => {
              const regionMems = memories.filter(m =>
                m.type === 'region' && m.isActive &&
                (m.tags?.locations || []).some((l: string) => l === currentLocation || currentLocation.includes(l) || l.includes(currentLocation))
              );
              return regionMems.length > 0 ? (
                <div className="mb-4">
                  <h4 className="text-xs mb-2 uppercase tracking-wider flex items-center gap-1 text-[#fbf5e4]">
                    ✦ 區域記憶
                  </h4>
                  <div className="space-y-1">
                    {regionMems.map(mem => (
                      <div key={mem.id} className="memory-card bg2-[#303438]/60 backdrop-blur-sm p-3 text-xs text-[var(--text3)] border-l-2 border-[#444d5c] hover:bg2-[#303438]/80 transition-all duration-300 shadow-sm">
                        <div className="leading-relaxed">
                          {mem.content}
                          {mem.expiresAt && <span className="text-[#444d5c]/60 ml-1.5 italic">（至 {mem.expiresAt}）</span>}
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
                (m.tags?.locations || []).some((l: string) => l === currentLocation || currentLocation.includes(l) || l.includes(currentLocation))
              );
              return (
                <div className="mb-4">
                  <h4 className="text-xs mb-2 uppercase tracking-wider flex items-center gap-1 text-[#fbf5e4]">
                    ✦ 場景記憶
                  </h4>
                    {sceneMems.length > 0 ? (
                      <div className="space-y-1">
                        {sceneMems.map(mem => (
                          <div key={mem.id} className="memory-card bg2-[#303438]/60 backdrop-blur-sm p-3 text-xs text-[var(--text3)] border-l-2 border-[#444d5c] hover:bg2-[#303438]/80 transition-all duration-300 shadow-sm">
                            <div className="leading-relaxed">
                              {mem.content}
                              {mem.source === 'ai_generated' && <span className="text-[#444d5c]/40 ml-1.5 text-[9px] uppercase tracking-tighter font-bold">（AI）</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                    <div className="text-xs text-[var(--text3)] italic">此場景尚無記憶...</div>
                  )}
                </div>
              );
            })()}

            {(() => {
              const npcMems = memories.filter(m => m.type === 'npc' && m.isActive);
              return npcMems.length > 0 ? (
                <div>
                  <h4 className="text-xs mb-2 uppercase tracking-wider flex items-center gap-1 text-[#444d5c]">
                    ✦ NPC 記憶
                  </h4>
                  <div className="space-y-1">
                    {npcMems.map(mem => (
                      <div key={mem.id} className="memory-card bg2-[#303438]/60 backdrop-blur-sm p-3 text-xs text-[var(--text3)] border-l-2 border-[#444d5c] hover:bg2-[#303438]/80 transition-all duration-300 shadow-sm">
                        <div className="leading-relaxed">
                          {mem.tags?.npcs?.length > 0 && (
                            <span className="text-[#444d5c] font-bold mr-1.5">
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
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg2-[#303438]/80 backdrop-blur-md border border-[#303438]/10 text-[#fbf5e4] px-6 py-3 rounded-full shadow-[0_0_30px_rgba(0,0,0,0.5)] z-[100] flex items-center animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckSquare className="w-4 h-4 mr-2 text-[#fb7185]" />
          {toastMessage}
        </div>
      )}
    </div>
  );
}
