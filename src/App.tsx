import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Settings, Send, RefreshCw, MoreVertical, Book, BookOpen, User, Package, Beaker, Users, Heart, MapPin, Zap, Coins, Calendar, Shield, CheckSquare, ChevronDown, ChevronRight, Map as MapIcon, Cloud, Sun, CloudRain, Snowflake, Moon, Wind, Sparkles, Brain, ScrollText, History, X, Edit2, Trash2, Pin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAIRequest } from './hooks/useAIRequest';
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
import { useGameStore } from './hooks/useGameStore';
import { useCommandParser } from './hooks/useCommandParser';
import { useAuth } from './hooks/useAuth';
import { SaveSlot } from './lib/supabase';
import { performanceMonitor } from './utils/performanceMonitor';
import { debounce } from './utils/debounce';
import { renderMarkdown, stripBareCommands } from './utils/markdownParser';
import { buildPrompt, BuildPromptDeps } from './utils/promptBuilder';
import { SaveSlotsModal } from './components/SaveSlotsModal';

export default function App() {
  // ─── UI 狀態（Modal / 輸入 / 載入）──────────────────────────────────────────
  const [isPriorityMode, setIsPriorityMode] = useState(false);
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
  const [summaryCollapsed, setSummaryCollapsed] = useState(true);
  const [isQuestPanelOpen, setIsQuestPanelOpen] = useState(false);
  const questBtnRef = useRef<HTMLDivElement>(null);
  const questPanelRef = useRef<HTMLDivElement>(null);
  const [questPanelPos, setQuestPanelPos] = useState({ top: 0, left: 0 });
  // ── Mobile Layout State ──────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640);
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);
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
  "summary": "以第三人稱過去式精簡記錄：主角做了什麼、結果如何、實質影響。若本輪純屬日常閒聊或無實質進展，輸出 null",
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
  const [isLoadingQuickOptions, setIsLoadingQuickOptions] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  // ─── 雲端存檔 / 帳號 ─────────────────────────────────────────────────────────
  const [currentSlotName, setCurrentSlotName] = useState<string>('存檔一');
  const [isSaveSlotsModalOpen, setIsSaveSlotsModalOpen] = useState(false);
  const [cloudSaves, setCloudSaves] = useState<SaveSlot[]>([]);
  const [isCloudSaving, setIsCloudSaving] = useState(false);

  // ─── Auth ─────────────────────────────────────────────────────────────────────
  const {
    authUser,
    authLoading,
    handleGoogleLogin,
    handleLogout,
    saveToCloud,
    loadFromCloud,
    listCloudSaves,
    deleteCloudSave,
  } = useAuth();

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

  // ─── AI 請求（D7：timeout / abort / retry）────────────────────────────────
  const { callAI, abort: abortAI, aiRequestStatus, setAiRequestStatus } = useAIRequest(mainGMConfig, subGMConfig);
  // isLoading 由 aiRequestStatus 派生，其他地方不需改動
  const isLoading = aiRequestStatus === 'loading';
  // 儲存最後一次用戶輸入，供 abort 後重試用
  const lastInputRef = useRef<string>('');

  // ─── 遊戲狀態（useGameStore）────────────────────────────────────────────────
  const store = useGameStore();
  const {
    isStoreReady,
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
    statusEffects, setStatusEffects,
    factions, setFactions, addFaction, updateFaction,
    buildSaveSnapshot,
    loadFromData,
    setIsStoreReady,
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

  // ─── 登入後從雲端載入存檔（讀最新槽；若無存檔則自動建立）─────────────────
  useEffect(() => {
    if (!authUser) return;
    const init = async () => {
      // 1. 列出所有存檔槽
      const slots = await listCloudSaves(authUser.id);
      if (slots.length > 0) {
        // 2a. 有存檔：讀最新的槽
        const latest = slots[0]; // 已按 updated_at DESC 排序
        const raw = await loadFromCloud(authUser.id, latest.slot_name);
        if (raw) {
          loadFromData(raw);
          setCurrentSlotName(latest.slot_name);
        }
      } else {
        // 2b. 全新玩家：建立「存檔一」
        const snapshot = buildSaveSnapshot();
        await saveToCloud(authUser.id, '存檔一', snapshot);
        setCurrentSlotName('存檔一');
      }
      setIsStoreReady(true);
    };
    init();
  }, [authUser]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // callAI 已由 useAIRequest hook 提供（D7）

  // ─── 指令解析器（useCommandParser）─────────────────────────────────────────
  const { parseAndExecuteCommands, useItem, scanKeywords, isMemoryTriggered, tickMemoryCounters } =
    useCommandParser({
      timeState, profile, currentLocation, quests, memories, items, npcs,
      stickyCounters, cooldownCounters, messages, lorebookEntries, statusEffects,
      factions,
      setTimeState, setProfile, setCurrentLocation, setQuests,
      setMemories, setEquipment, setItems, setNpcs,
      setLorebookEntries, setQuickOptions,
      setStickyCounters, setCooldownCounters,
      setStatusEffects, setFactions,
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

  useEffect(() => {
    if (!isQuestPanelOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (questBtnRef.current?.contains(target) || questPanelRef.current?.contains(target)) return;
      setIsQuestPanelOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isQuestPanelOpen]);

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
      const snapshot = buildSaveSnapshot();
      if (authUser) {
        setIsCloudSaving(true);
        saveToCloud(authUser.id, currentSlotName, snapshot)
          .finally(() => setIsCloudSaving(false));
      }
      const now = new Date();
      localStorage.setItem('rpworld_last_saved', now.toISOString());
      setLastSavedAt(now);
    }
  }, [isLoading, isUpdatingLog]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 存檔匯出 ────────────────────────────────────────────────────────────────
  const handleExportSave = async () => {
    if (!authUser) return;
    const raw = await loadFromCloud(authUser.id, currentSlotName);
    if (!raw) { showToast('讀取存檔失敗'); return; }

    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' });
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const hr = String(now.getHours()).padStart(2,'0');
    const mi = String(now.getMinutes()).padStart(2,'0');
    const safeName = (profile.name || '玩家').replace(/[\\/:*?"<>|]/g, '_');
    const filename = `RPworld-${safeName}-${date}-${hr}-${mi}.json`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('存檔已匯出');
  };

  // ─── 存檔匯入 ────────────────────────────────────────────────────────────────
  const handleImportSave = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !authUser) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        loadFromData(parsed);
        const snapshot = buildSaveSnapshot();
        const ok = await saveToCloud(authUser.id, currentSlotName, snapshot);
        showToast(ok ? '存檔已匯入並同步至雲端' : '存檔已匯入（雲端同步失敗）');
        setIsSettingsModalOpen(false);
      } catch {
        showToast('存檔格式錯誤');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── 重置遊戲 ────────────────────────────────────────────────────────────────
  const handleResetGame = async () => {
    if (!window.confirm('確定要重置遊戲嗎？雲端存檔也會一併清除。')) return;
    if (authUser) {
      await deleteCloudSave(authUser.id, currentSlotName);
    }
    localStorage.removeItem('rpworld_last_saved');
    window.location.reload();
  };

  // ─── 存檔槽操作 ──────────────────────────────────────────────────────────────
  const handleLoadSlot = async (slotName: string) => {
    if (!authUser) return;
    const raw = await loadFromCloud(authUser.id, slotName);
    if (raw) {
      loadFromData(raw);
      setCurrentSlotName(slotName);
      showToast(`已載入「${slotName}」`);
      setIsSaveSlotsModalOpen(false);
    } else {
      showToast('載入失敗');
    }
  };

  const handleDeleteSlot = async (slotName: string) => {
    if (!authUser || !window.confirm(`確定要刪除「${slotName}」？`)) return;
    const ok = await deleteCloudSave(authUser.id, slotName);
    if (ok) {
      setCloudSaves(prev => prev.filter(s => s.slot_name !== slotName));
      if (slotName === currentSlotName) setCurrentSlotName('存檔一');
      showToast(`已刪除「${slotName}」`);
    }
  };

  const handleCreateSlot = async () => {
    if (!authUser) return;
    const name = window.prompt('新存檔槽名稱（最多 10 字）')?.trim();
    if (!name || name.length > 10) return;
    if (cloudSaves.some(s => s.slot_name === name)) {
      showToast('已有相同名稱的存檔槽');
      return;
    }
    const snapshot = buildSaveSnapshot();
    const ok = await saveToCloud(authUser.id, name, snapshot);
    if (ok) {
      setCurrentSlotName(name);
      const updated = await listCloudSaves(authUser.id);
      setCloudSaves(updated);
      showToast(`已建立「${name}」`);
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
  const buildPromptWrapper = (userInput: string, currentMessages: Message[], locationOverride?: string, isPriority?: boolean): string => {
    const deps: BuildPromptDeps = {
      profile, systemPrompt, npcs, appearingNpcs, lorebookEntries,
      memories, equipment, items, quests, timeState, currentLocation,
      diaryEntries, statusEffects, factions, scanKeywords, isMemoryTriggered,
    };
    return buildPrompt(deps, userInput, currentMessages, locationOverride, isPriority);
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

    lastInputRef.current = text;
    const currentIsPriority = isPriorityMode;
    if (isPriorityMode) setIsPriorityMode(false);
    const userMessage = { id: Date.now(), role: 'user', text: text };
    const newMessages = historyToUse ? [...historyToUse, userMessage] : [...messages, userMessage];
    setMessages(newMessages);
    if (authUser) {
      const snapshot = buildSaveSnapshot({ messages: newMessages });
      setIsCloudSaving(true);
      saveToCloud(authUser.id, currentSlotName, snapshot)
        .finally(() => setIsCloudSaving(false));
    }
    if (typeof textToUse !== 'string') setInputText('');
    setAiRequestStatus('loading');

    let aiMessageId: number | null = null;
    let didError = false;
    try {
      if (!mainGMConfig.apiKey.trim()) {
        showToast('❌ 請先在系統設定輸入 API Key');
        setAiRequestStatus('idle');
        return;
      }
      const prompt = buildPromptWrapper(text, historyToUse || messages, locationOverride, currentIsPriority);

      aiMessageId = Date.now() + 1;
      setMessages(prev => [...prev, { id: aiMessageId!, role: 'assistant', text: '' }]);

      // 使用 streaming（避免長回應 timeout），背景累積不即時顯示，避免 <<COMMANDS>> 閃現
      const fullText = await callAI(prompt, { role: 'main', onChunk: () => {} });
      if (!fullText) {
        showToast('❌ AI 沒有回應，請檢查 API Key 或網路連線');
        if (aiMessageId !== null) setMessages(prev => prev.filter(m => m.id !== aiMessageId));
        setAiRequestStatus('idle');
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
      didError = true;
      if (aiMessageId !== null) {
        setMessages(prev => prev.filter(m => m.id !== aiMessageId));
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        setAiRequestStatus('aborted');
      } else if (error instanceof Error && error.message === 'REQUEST_TIMEOUT') {
        showToast('⏱ 請求超時，可點「重試」再試一次');
        setAiRequestStatus('timeout');
      } else {
        console.error('Error calling Gemini API:', error);
        showToast('❌ API 呼叫失敗，請檢查設定或網路連線');
        setAiRequestStatus('error');
      }
    } finally {
      if (!didError) setAiRequestStatus('idle');
    }
  };

  // ─── D7：切背景偵測（手機回來後自動中斷未完成請求）───────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isLoading) {
        abortAI();
        setMessages(prev => prev.filter(m => !(m.role === 'assistant' && m.text === '')));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isLoading, abortAI]);

  // ── Mobile: resize 偵測 ──────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ── Mobile: 鍵盤頂起（visualViewport）────────────────────────────
  useEffect(() => {
    if (!isMobile) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const handler = () => {
      document.documentElement.style.setProperty(
        '--keyboard-inset',
        `${window.innerHeight - vv.height}px`
      );
    };
    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    return () => {
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
    };
  }, [isMobile]);

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

  // ─── Auth loading ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen"
           style={{ background: 'var(--bg-base)', color: 'var(--text-muted)' }}>
        <p className="text-sm">載入中...</p>
      </div>
    );
  }

  // ─── 未登入：顯示登入頁 ───────────────────────────────────────────────────────
  if (!authUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6"
           style={{ background: 'var(--bg-base)' }}>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          NewWorld
        </h1>
        <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
          登入後開始你的異世界冒險
        </p>
        <button
          onClick={handleGoogleLogin}
          className="flex items-center gap-3 px-6 py-3 rounded-[10px] text-sm font-medium transition"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-body)',
            border: '1px solid var(--border-default)'
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)'}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          使用 Google 登入
        </button>
      </div>
    );
  }

  // ─── 存檔尚未從雲端載入時顯示 loading 畫面 ───────────────────────────────────
  if (!isStoreReady) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-base)' }}>
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>載入存檔中…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col font-sans overflow-hidden" style={{ color: 'var(--text-title)', height: '100dvh' }}>
      {/* Background image - fixed full screen */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{ backgroundImage: `url('/background.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      {/* Sky gradient overlay */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{ background: getSkyGradient(timeState.hour, timeState.weather), opacity: 0.55, transition: 'background 2s ease' }} />
      {/* panel glass overlays removed — individual widgets handle their own glass */}

      {/* ── Mobile Nav Bar（手機專用）── */}
      {isMobile && (
        <div
          className="relative z-20 flex items-center px-3 shrink-0"
          style={{
            height: '46px',
            background: 'rgba(10,12,10,0.82)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '0.5px solid rgba(255,255,255,0.07)',
          }}
        >
          {/* 左側：☰ 開啟左抽屜 */}
          <button
            onClick={() => { setMobileLeftOpen(prev => !prev); setMobileRightOpen(false); }}
            className="flex items-center justify-center shrink-0"
            style={{
              width: '34px', height: '34px', borderRadius: '8px',
              background: mobileLeftOpen ? 'rgba(192,160,96,0.15)' : 'rgba(255,255,255,0.05)',
              border: `0.5px solid ${mobileLeftOpen ? 'rgba(192,160,96,0.35)' : 'rgba(255,255,255,0.09)'}`,
            }}
          >
            <MoreVertical className="w-4 h-4" style={{ color: mobileLeftOpen ? 'var(--border-accent)' : 'var(--text-title)' }} />
          </button>

          {/* 左側：任務日誌 */}
          <button
            onClick={() => { setIsQuestModalOpen(true); setMobileLeftOpen(false); }}
            className="flex items-center justify-center shrink-0 ml-1.5"
            style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.09)' }}
          >
            <BookOpen className="w-4 h-4" style={{ color: 'var(--text-title)' }} />
          </button>

          {/* 左側：日記 */}
          <button
            onClick={() => { setIsDiaryModalOpen(true); setHasNewDiary(false); setMobileLeftOpen(false); }}
            className="flex items-center justify-center shrink-0 relative ml-1.5"
            style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.09)' }}
          >
            <Book className="w-4 h-4" style={{ color: 'var(--text-title)' }} />
            {hasNewDiary && <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: 'var(--bg-mark)' }} />}
          </button>

          {/* 中央 spacer */}
          <div className="flex-1" />

          {/* 右側按鈕群 */}
          <div className="flex items-center gap-1.5">
            {/* 地圖 */}
            <button
              onClick={() => setIsMapOpen(true)}
              className="flex items-center justify-center shrink-0"
              style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.09)' }}
            >
              <MapIcon className="w-4 h-4" style={{ color: 'var(--text-title)' }} />
            </button>
            {/* ⓘ 開啟右抽屜 */}
            <button
              onClick={() => { setMobileRightOpen(prev => !prev); setMobileLeftOpen(false); }}
              className="flex items-center justify-center shrink-0"
              style={{
                width: '34px', height: '34px', borderRadius: '8px',
                background: mobileRightOpen ? 'rgba(192,160,96,0.15)' : 'rgba(255,255,255,0.05)',
                border: `0.5px solid ${mobileRightOpen ? 'rgba(192,160,96,0.35)' : 'rgba(255,255,255,0.09)'}`,
              }}
            >
              <Brain className="w-4 h-4" style={{ color: mobileRightOpen ? 'var(--border-accent)' : 'var(--text-title)' }} />
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile HUD 橫條（手機專用）── */}
      {false && isMobile && (
        <div
          className="relative z-20 flex items-center px-3 gap-3 shrink-0"
          style={{
            height: '30px',
            background: 'rgba(6,8,6,0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '0.5px solid rgba(255,255,255,0.04)',
          }}
        >
          {/* HP */}
          <div className="flex items-center gap-1">
            <span style={{ fontSize: '9.5px', fontWeight: 500, color: 'var(--text-stat-label)' }}>HP</span>
            <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '2px', background: 'linear-gradient(90deg,#b83030,#ff5050)', width: `${Math.max(0, Math.min(100, (profile.hp / (profile.maxHp ?? 100)) * 100))}%` }} />
            </div>
            <span style={{ fontSize: '9.5px', fontWeight: 600, color: 'var(--text-stat-value)' }}>{profile.hp}</span>
          </div>

          {/* 分隔線 */}
          <div style={{ width: '0.5px', height: '12px', background: 'rgba(255,255,255,0.1)' }} />

          {/* MP */}
          <div className="flex items-center gap-1">
            <span style={{ fontSize: '9.5px', fontWeight: 500, color: 'var(--text-stat-label)' }}>MP</span>
            <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '2px', background: 'linear-gradient(90deg,#2060a8,#5090d0)', width: `${Math.max(0, Math.min(100, (profile.mp / (profile.maxMp ?? 100)) * 100))}%` }} />
            </div>
            <span style={{ fontSize: '9.5px', fontWeight: 600, color: 'var(--text-stat-value)' }}>{profile.mp}</span>
          </div>

          {/* 分隔線 */}
          <div style={{ width: '0.5px', height: '12px', background: 'rgba(255,255,255,0.1)' }} />

          {/* 天氣 */}
          <div className="flex items-center gap-1" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {getWeatherIcon()}
            <span>{timeState.weather}</span>
          </div>

          {/* 金幣（推到最右） */}
          <div className="flex items-center gap-1 ml-auto" style={{ fontSize: '10px', fontWeight: 500, color: 'var(--color-amber)' }}>
            <Coins className="w-3 h-3" />
            <span>{(profile.gold ?? 0).toLocaleString()} G</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative z-10">

        {/* Left Panel */}
        <div
          className="w-[260px] shrink-0 flex flex-col px-3 py-4 gap-3 overflow-y-auto"
          style={{ zIndex: 20, display: isMobile ? 'none' : undefined }}>

          {/* ── Widget: Note Paper ── */}
          <div
            className="rounded-[8px] overflow-hidden relative"
            style={{
              background: 'rgba(248,242,226,0.90)',
              border: '1px solid rgba(185,165,130,0.55)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              boxShadow: `2px 2px 0 0 rgba(235,225,205,0.92), 4px 4px 0 0 rgba(220,210,190,0.82), 0 10px 28px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.55)`,
            }}
          >
            {/* Ruled horizontal lines */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'repeating-linear-gradient(transparent 0, transparent 27px, rgba(140,110,70,0.09) 27px, rgba(140,110,70,0.09) 28px)',
              backgroundPosition: '0 52px',
              zIndex: 0,
            }} />
            {/* Left margin line */}
            <div className="absolute top-0 bottom-0 pointer-events-none" style={{
              left: '38px', width: '1px',
              background: 'linear-gradient(to bottom, transparent 8%, rgba(188,55,55,0.16) 16%, rgba(188,55,55,0.16) 84%, transparent 92%)',
              zIndex: 0,
            }} />
            {/* Content layer */}
            <div className="relative" style={{ zIndex: 1 }}>
              <div className="px-4 pt-3 pb-1 flex items-center">
                <h3 className="flex items-center font-bold text-lg" style={{ color: 'var(--text-note)' }}>
                  <ScrollText className="w-4 h-4 mr-2" style={{ color: 'var(--text-note)' }} /> 當前目標
                  {isUpdatingLog && <RefreshCw className="w-3 h-3 ml-2 animate-spin opacity-50" style={{ color: 'var(--text-note)' }} />}
                </h3>
              </div>
              <ul className="px-4 pb-2 space-y-1.5">
                {currentGoals.length > 0 ? currentGoals.map((goal, i) => (
                  <li key={i} className="text-sm leading-relaxed flex items-start gap-2">
                    <span className="flex-shrink-0 mt-0.5 text-xs" style={{ color: 'rgba(120,90,50,0.40)' }}>○</span>
                    <span style={{ color: 'var(--text-note)' }}>{goal}</span>
                  </li>
                )) : (
                  <li className="text-sm" style={{ color: 'var(--text-note-muted)' }}>暫無明確目標...</li>
                )}
              </ul>
              <button className="w-full px-4 py-2 flex items-center transition-all" onClick={() => setSummaryCollapsed(prev => !prev)} style={{ background: 'transparent' }}>
                {summaryCollapsed ? <ChevronRight className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" style={{ color: 'var(--text-note)' }} /> : <ChevronDown className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" style={{ color: 'var(--text-note)' }} />}
                <span className="text-sm font-bold" style={{ color: 'var(--text-note)' }}>冒險摘要</span>
              </button>
              <AnimatePresence>
                {!summaryCollapsed && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="px-4 pb-3">
                      {adventureLog.length > 0 ? (
                        <div className="text-sm leading-relaxed flex items-start gap-2">
                          <span className="flex-shrink-0 mt-0.5 text-xs" style={{ color: 'rgba(120,90,50,0.35)' }}>∵</span>
                          <span style={{ color: 'var(--text-note)', opacity: 0.85 }}>{adventureLog[0]}</span>
                        </div>
                      ) : (
                        <div className="text-sm" style={{ color: 'var(--text-note-muted)' }}>等待冒險展開...</div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Widget: Quest Log ── */}
          <div
            ref={questBtnRef}
            className="rounded-[8px] px-4 py-3 cursor-pointer transition-all shadow-xl"
            style={{
              background: isQuestPanelOpen ? 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)' : 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)',
              border: `1px solid ${isQuestPanelOpen ? 'var(--border-accent)' : 'color-mix(in srgb, var(--border-default) 60%, transparent)'}`,
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            }}
            onClick={() => {
              if (!isQuestPanelOpen && questBtnRef.current) {
                const rect = questBtnRef.current.getBoundingClientRect();
                setQuestPanelPos({ top: rect.top, left: rect.right + 8 });
              }
              setIsQuestPanelOpen(prev => !prev);
            }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)'}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = isQuestPanelOpen ? 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)' : 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)'}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                <BookOpen className="w-4 h-4 mr-2" /> 任務日誌
              </h3>
              <div className="flex items-center gap-2">
                {quests.filter(q => q.status === 'active').length > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--color-success)', color: '#fff' }}>
                    {quests.filter(q => q.status === 'active').length}
                  </span>
                )}
                <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>
          </div>

          {/* ── Widget: 裝備 ── */}
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
            className="w-full rounded-[8px] px-4 py-3 shadow-xl flex items-center gap-3 transition-all"
            style={{
              background: isInventoryOpen ? 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)' : 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)',
              border: `1px solid ${isInventoryOpen ? 'var(--border-accent)' : 'color-mix(in srgb, var(--border-default) 60%, transparent)'}`,
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = isInventoryOpen ? 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)' : 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)'}
          >
            <div className="relative shrink-0">
              <Package className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
              {equipment.length > 0 && (
                <span className="absolute -top-1.5 -right-2 text-[0.625rem] font-bold px-1 min-w-[16px] text-center rounded-full" style={{ background: 'var(--tab-active)', color: '#fff', lineHeight: '16px' }}>
                  {equipment.length}
                </span>
              )}
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>裝備</span>
          </button>

          {/* ── Widget: 消耗品 ── */}
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
            className="w-full rounded-[8px] px-4 py-3 shadow-xl flex items-center gap-3 transition-all"
            style={{
              background: isConsumablesOpen ? 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)' : 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)',
              border: `1px solid ${isConsumablesOpen ? 'var(--border-accent)' : 'color-mix(in srgb, var(--border-default) 60%, transparent)'}`,
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = isConsumablesOpen ? 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)' : 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)'}
          >
            <div className="relative shrink-0">
              <Beaker className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
              {items.reduce((acc, item) => acc + item.quantity, 0) > 0 && (
                <span className="absolute -top-1.5 -right-2 text-[0.625rem] font-bold px-1 min-w-[16px] text-center rounded-full" style={{ background: 'var(--tab-active)', color: '#fff', lineHeight: '16px' }}>
                  {items.reduce((acc, item) => acc + item.quantity, 0)}
                </span>
              )}
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>消耗品</span>
          </button>

          {/* ── Widget: 日記 ── */}
          <button
            className="w-full rounded-[8px] px-4 py-3 shadow-xl flex items-center gap-3 transition-all"
            style={{
              background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)',
              border: '1px solid color-mix(in srgb, var(--border-default) 60%, transparent)',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)'}
            onClick={() => { setIsDiaryModalOpen(true); setHasNewDiary(false); }}
          >
            <div className="relative shrink-0">
              <Book className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
              {hasNewDiary && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ background: 'var(--bg-mark)' }} />
              )}
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>日記</span>
          </button>

          {/* Inventory floating panel */}
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
                    <div className="text-center text-[var(--text-muted)] text-sm py-8">背包空空如也...</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Consumables floating panel */}
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
                    <div className="text-center text-[var(--text-muted)] text-sm py-8">沒有任何消耗品...</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Widget: Pinned NPCs ── */}
          {npcs.filter(n => n.isPinned).length > 0 && (
            <div className="rounded-[8px] px-4 py-3 shadow-xl overflow-hidden"
              style={{
                background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)',
                border: '1px solid color-mix(in srgb, var(--border-default) 60%, transparent)',
                backdropFilter: 'blur(24px) saturate(160%)',
                WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              }}>
              <h3 className="font-bold mb-3 text-sm" style={{ color: 'var(--text-primary)' }}>✦ 關注</h3>
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

          <div
            className="rounded-[8px] p-2 mt-auto"
            style={{
              background: 'rgba(0,0,0,0.58)',
              backdropFilter: 'blur(20px) saturate(150%)',
              WebkitBackdropFilter: 'blur(20px) saturate(150%)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
            }}
          >
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: '個人資訊', action: () => setIsProfileModalOpen(true) },
                { label: '故事集', action: () => setIsLorebookModalOpen(true) },
                { label: '系統', action: () => setIsSettingsModalOpen(true) },
                { label: 'Prompt', action: () => setIsSystemPromptModalOpen(true) },
              ].map(item => (
                <div
                  key={item.label}
                  className="p-1.5 rounded-[5px] cursor-pointer transition-all flex items-center justify-center"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.10)';
                    e.currentTarget.style.border = '1px solid rgba(255,255,255,0.12)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                    e.currentTarget.style.border = '1px solid rgba(255,255,255,0.06)';
                  }}
                  onClick={item.action}
                >
                  <span className="flex items-center text-xs" style={{ color: 'var(--text-main)' }}>{item.label}</span>
                </div>
              ))}
            </div>
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
          <div className="p-3 flex items-center justify-end absolute top-0 w-full z-30" style={{ display: isMobile ? 'none' : undefined }}>
            <div className="flex space-x-2">
              <button
                onClick={() => setIsMapOpen(true)}
                className="px-5 py-1.5 mr-3 rounded-[8px] text-base font-medium transition flex items-center"
                style={{
                  background: 'rgba(10,12,16,0.55)',
                  color: 'var(--text-primary)',
                  border: `1px solid rgba(255,255,255,0.12)`,
                  backdropFilter: 'blur(16px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(160%)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(30,32,40,0.7)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(10,12,16,0.55)')}
              >
                <MapIcon className="w-3.5 h-3.5 mr-1.5" />
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
                      navigator.clipboard.writeText(text).then(() => showToast('已複製')).catch(() => {
                        const ta = document.createElement('textarea');
                        ta.value = text;
                        ta.style.position = 'fixed';
                        ta.style.opacity = '0';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                        showToast('已複製');
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
                      showToast('已複製');
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
                  if (authUser) {
                    const snapshot = buildSaveSnapshot({ messages: newMessages });
                    setIsCloudSaving(true);
                    saveToCloud(authUser.id, currentSlotName, snapshot)
                      .finally(() => setIsCloudSaving(false));
                  }
                  showToast('已刪除');
                  setActiveMenuId(null);
                }}
                onEditChange={setEditMessageText}
                onEditCancel={() => setEditingMessageId(null)}
                onEditSave={(msgId, newText) => {
                  const newMessages = messages.map(m => m.id === msgId ? { ...m, text: newText } : m);
                  setMessages(newMessages);
                  if (authUser) {
                    const snapshot = buildSaveSnapshot({ messages: newMessages });
                    setIsCloudSaving(true);
                    saveToCloud(authUser.id, currentSlotName, snapshot)
                      .finally(() => setIsCloudSaving(false));
                  }
                  setEditingMessageId(null);
                  showToast('已更新');
                }}
                renderMarkdown={renderMarkdown}
                stripBareCommands={stripBareCommands}
                showToast={showToast}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className={`absolute bottom-0 w-full z-30 flex justify-center px-4 pt-2 pb-2${isMobile ? ' mobile-input-safe' : ''}`}>
            <div className="w-full md:w-4/5 rounded-[8px] px-4 pt-2 pb-1 backdrop-blur-xl border border-white/8" style={{ background: 'rgba(10,12,16,0.72)', boxShadow: '0 -4px 32px rgba(0,0,0,0.5)' }}>
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

              <div className="flex items-end overflow-hidden transition-all" style={{ borderRadius: '8px', border: isPriorityMode ? `1.5px solid var(--color-amber)` : `0.5px solid var(--border-default)`, background: 'var(--bg-dialog-input)' }}>
                {/* 📌 Priority Button */}
                <button
                  className="pl-3 pr-1 flex-shrink-0 transition-all"
                  style={{
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    color: isPriorityMode ? 'var(--color-amber)' : 'color-mix(in srgb, var(--text-body) 60%, transparent)',
                    cursor: 'pointer',
                    background: isPriorityMode ? 'color-mix(in srgb, var(--color-amber) 10%, transparent)' : 'transparent',
                  }}
                  onClick={() => setIsPriorityMode(prev => !prev)}
                  title={isPriorityMode ? '取消優先指令' : '優先指令（本回合 AI 必須採納）'}
                  onMouseEnter={e => { if (!isPriorityMode) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-body)'; }}
                  onMouseLeave={e => { if (!isPriorityMode) (e.currentTarget as HTMLButtonElement).style.color = 'color-mix(in srgb, var(--text-body) 60%, transparent)'; }}
                >
                  <Pin className="w-4 h-4" style={{ fill: isPriorityMode ? 'currentColor' : 'none' }} />
                </button>
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
                  style={{ color: 'var(--text-main)', lineHeight: '20px', paddingTop: '8px', paddingBottom: '8px' }}
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
                {isLoading ? (
                  /* 中止按鈕（D7）*/
                  <button
                    className="px-3 transition"
                    style={{ height: '40px', display: 'flex', alignItems: 'center', color: 'var(--color-rose)', cursor: 'pointer' }}
                    onClick={abortAI}
                    title="中止請求"
                  >
                    <X className="w-5 h-5" />
                  </button>
                ) : (
                  /* 送出按鈕 */
                  <button
                    className="px-3 transition"
                    style={{ height: '40px', display: 'flex', alignItems: 'center', color: !inputText.trim() ? 'var(--text-muted)' : 'var(--btn-primary)', cursor: !inputText.trim() ? 'not-allowed' : 'pointer', opacity: !inputText.trim() ? 0.4 : 1 }}
                    onMouseEnter={e => { if (inputText.trim()) (e.currentTarget as HTMLButtonElement).style.color = 'var(--btn-primary-hover)'; }}
                    onMouseLeave={e => { if (inputText.trim()) (e.currentTarget as HTMLButtonElement).style.color = 'var(--btn-primary)'; }}
                    onClick={handleSendMessage}
                    disabled={!inputText.trim()}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* D7：中斷 / 超時 / 錯誤 重試列 */}
              {(aiRequestStatus === 'aborted' || aiRequestStatus === 'timeout' || aiRequestStatus === 'error') && (
                <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>
                    {aiRequestStatus === 'aborted'  && '已中斷'}
                    {aiRequestStatus === 'timeout'  && '請求超時'}
                    {aiRequestStatus === 'error'    && '發生錯誤'}
                  </span>
                  {lastInputRef.current && (
                    <button
                      className="px-2 py-0.5 rounded text-xs transition"
                      style={{ background: 'var(--btn-primary)', color: 'var(--btn--text)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--btn-primary-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--btn-primary)')}
                      onClick={() => { setAiRequestStatus('idle'); handleSendMessage(lastInputRef.current); }}
                    >重試</button>
                  )}
                  <button
                    className="px-2 py-0.5 rounded text-xs"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => setAiRequestStatus('idle')}
                  >取消</button>
                </div>
              )}

              {/* Status Bar */}
              <div className="mt-1 flex items-center justify-between text-xs font-mono gap-2 flex-wrap" style={{ color: 'var(--text-stat-label)' }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="flex items-center whitespace-nowrap" title={`${currentMonthData.name}：${currentMonthData.elegant}`}>
                    <Calendar className="w-3 h-3 mr-1" />
                    {timeState.year}年 {timeState.month}月 {timeState.day}日
                  </span>
                  <span className="flex items-center whitespace-nowrap">
                    {getWeatherIcon()} {timeState.weather}
                  </span>
                  <span className="flex items-center whitespace-nowrap">
                    {getCelestialIcon()}
                    {String(timeState.hour).padStart(2, '0')}:{String(timeState.minute).padStart(2, '0')}
                  </span>
                  <span className="flex items-center whitespace-nowrap"><MapPin className="w-3 h-3 mr-1" /> {currentLocation}</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="flex items-center whitespace-nowrap"><Heart className="w-3 h-3 mr-1 fill-current" style={{ color: 'var(--color-rose)' }} /> HP {profile.hp}</span>
                  <span className="flex items-center whitespace-nowrap"><Zap className="w-3 h-3 mr-1 fill-current" style={{ color: 'var(--color-blue)' }} /> MP {profile.mp}</span>
                  <span className="flex items-center whitespace-nowrap"><Shield className="w-3 h-3 mr-1" style={{ color: 'var(--text-body)' }} /> {profile.job}</span>
                  <span className="flex items-center whitespace-nowrap"><Coins className="w-3 h-3 mr-1" /> {(profile.gold ?? 0).toLocaleString()} G</span>
                  {statusEffects.length > 0 && statusEffects.map(s => (
                    <span key={s.id} className="flex items-center whitespace-nowrap" style={{ color: 'var(--color-rose)', fontSize: '0.625rem' }}>
                      {s.emoji} {s.name}{s.duration !== -1 && ` ×${s.duration}`}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel — 3 Independent Widgets */}
        <div
          className="w-[260px] shrink-0 flex flex-col p-3 gap-3 overflow-y-auto z-10"
          style={{ display: isMobile ? 'none' : undefined }}
        >

          {/* ── Widget 1: 世界記憶 ────────────────────────────── */}
          <div
            className="rounded-[8px] border border-white/10 backdrop-blur-md p-4 shadow-xl transition-all duration-300 group/wm"
            style={{ background: 'rgba(10,10,20,0.55)' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 0 1px rgba(253,210,137,0.18), 0 8px 32px rgba(0,0,0,0.5)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 10px 32px rgba(0,0,0,0.4)')}
          >
            {/* Widget header */}
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--color-amber)' }} />
              <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>世界記憶</span>
            </div>

            {/* Monthly event card */}
            <div className="rounded-[4px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-md relative overflow-hidden mb-3" style={{ background: `linear-gradient(135deg, #1e1477, var(--bg-elevated))` }}>
              <div className="absolute -right-6 -bottom-6 opacity-10 group-hover/wm:opacity-20 transition-all duration-700 rotate-12 group-hover/wm:scale-110">
                <Sparkles className="w-[72px] h-[72px]" style={{ color: 'white' }} />
              </div>
              <div className="absolute top-0 left-0 w-full h-[1px]" style={{ background: `linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)` }}></div>
              <div className="px-4 py-2.5 relative z-10">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="p-1.5 rounded-[8px] bg-white/5 border border-white/10">
                    <Calendar className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <span className="text-xs font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-body)' }}>{currentMonthData.elegant}</span>
                </div>
                <p className="text-xs leading-relaxed font-light pl-1" style={{ color: 'color-mix(in srgb, var(--text-body) 85%, transparent)', borderLeft: `1px solid rgba(255,255,255,0.15)` }}>
                  {currentMonthData.desc}
                </p>
              </div>
            </div>

            {/* World memory entries */}
            <div className="space-y-1.5">
              {memories.filter(m => m.type === 'world' && m.isActive).map(mem => (
                <div key={mem.id} className="flex items-start gap-2 text-xs leading-relaxed py-1 pl-2" style={{ borderLeft: `2px solid var(--border-default)` }}>
                  {mem.importance === 'critical' && <Sparkles className="w-3 h-3 mt-0.5 shrink-0" style={{ color: 'var(--color-amber)' }} />}
                  <span style={{ color: 'var(--text-muted)' }}>{mem.content}</span>
                </div>
              ))}
              {memories.filter(m => m.type === 'world' && m.isActive).length === 0 && (
                <p className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>尚無世界記憶</p>
              )}
            </div>
          </div>

          {/* ── Widget 2: 當前場景人物 ────────────────────────── */}
          <div
            className="rounded-[8px] border border-white/10 backdrop-blur-md p-4 shadow-xl transition-all duration-300"
            style={{ background: 'rgba(10,15,10,0.55)' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 0 1px rgba(180,255,180,0.12), 0 8px 32px rgba(0,0,0,0.5)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 10px 32px rgba(0,0,0,0.4)')}
          >
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 shrink-0" style={{ color: 'var(--text-title)' }} />
              <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>當前場景人物</span>
            </div>

            <div className="space-y-2">
              {(() => {
                const sceneNpcs = npcs.filter(n =>
                  appearingNpcs.includes(n.name) ||
                  n.location === currentLocation ||
                  n.isPinned
                );
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
                          className="backdrop-blur-md border border-white/5 p-2.5 rounded-[4px] flex justify-between items-center cursor-pointer transition-all duration-300 shadow-lg group/npc overflow-hidden relative hover:border-white/15"
                          onClick={() => setSelectedNpc(npc)}
                        >
                          <div className="absolute top-0 left-0 w-1 h-full opacity-0 group-hover/npc:opacity-40 transition-opacity" style={{ background: `linear-gradient(to bottom, transparent, var(--bg-elevated), transparent)` }}></div>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium" style={{ color: 'var(--text-title)' }}>{npc.name}</span>
                            <span className="text-xs uppercase tracking-tighter" style={{ color: 'var(--text-body)' }}>{displayGender ? `${displayGender}・${displayJob}` : displayJob}</span>
                          </div>
                          <div className="text-xs flex items-center px-2 py-1 rounded-full bg-black/20 border border-white/5" style={{ color: affectionColor(npc.affection) }}>
                            <Heart className="w-3 h-3 mr-1 fill-current" />
                            <span className="font-mono">{npc.affection}</span>
                          </div>
                        </div>
                      );
                    })}
                    {hiddenCount > 0 && (
                      <div className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>
                        ✦ 還有 {hiddenCount} 人未顯示...
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>此處目前沒有人...</p>
                );
              })()}
            </div>
          </div>

          {/* ── Widget 3: 場景 & 區域記憶 ────────────────────── */}
          <div
            className="rounded-[8px] border border-white/10 backdrop-blur-md p-4 shadow-xl transition-all duration-300"
            style={{ background: 'rgba(15,10,5,0.55)' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 0 1px rgba(253,200,100,0.14), 0 8px 32px rgba(0,0,0,0.5)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 10px 32px rgba(0,0,0,0.4)')}
          >
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-4 h-4 shrink-0" style={{ color: 'var(--color-amber)' }} />
              <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>場景記憶</span>
            </div>

            {/* Region memories */}
            {(() => {
              const regionMems = memories.filter(m => {
                if (m.type !== 'region' || !m.isActive) return false;
                const locs = m.tags?.locations || [];
                if (locs.length === 0) return true;
                return locs.some((l: string) => l === currentLocation);
              });
              return regionMems.length > 0 ? (
                <div className="mb-3">
                  <p className="text-[0.625rem] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>區域</p>
                  <ul className="space-y-1.5">
                    {regionMems.map(mem => (
                      <li key={mem.id} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-amber)', opacity: 0.7 }}></span>
                        <span>{mem.content}{mem.expiresAt && <em className="ml-1 opacity-60">（至 {mem.expiresAt}）</em>}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}

            {/* Scene memories */}
            {(() => {
              const sceneMems = memories.filter(m =>
                m.type === 'scene' && m.isActive &&
                (m.tags?.locations || []).some((l: string) => l === currentLocation)
              );
              return (
                <div className="mb-3">
                  <p className="text-[0.625rem] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>場景</p>
                  {sceneMems.length > 0 ? (
                    <ul className="space-y-1.5">
                      {sceneMems.map(mem => (
                        <li key={mem.id} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-sky)', opacity: 0.7 }}></span>
                          <span>{mem.content}{mem.source === 'ai_generated' && <em className="ml-1 text-[0.625rem] opacity-50">AI</em>}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>此場景尚無記憶...</p>
                  )}
                </div>
              );
            })()}

            {/* NPC memories */}
            {(() => {
              const npcMems = memories.filter(m => m.type === 'npc' && m.isActive);
              return npcMems.length > 0 ? (
                <div>
                  <p className="text-[0.625rem] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>NPC</p>
                  <ul className="space-y-1.5">
                    {npcMems.map(mem => (
                      <li key={mem.id} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-emerald)', opacity: 0.7 }}></span>
                        <span>
                          {mem.tags?.npcs?.length > 0 && (
                            <strong className="mr-1" style={{ color: 'var(--text-title)' }}>[{mem.tags.npcs.join(',')}]</strong>
                          )}
                          {mem.content}
                        </span>
                      </li>
                    ))}
                  </ul>
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
        statusEffects={statusEffects}
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
        factions={factions}
        onAddFaction={addFaction}
        onUpdateFaction={updateFaction}
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
        authUser={authUser}
        onLogout={handleLogout}
        onOpenSaveSlots={() => {
          listCloudSaves(authUser.id).then(setCloudSaves);
          setIsSaveSlotsModalOpen(true);
        }}
        isCloudSaving={isCloudSaving}
      />

      {/* 存檔槽 Modal */}
      <SaveSlotsModal
        isOpen={isSaveSlotsModalOpen}
        onClose={() => setIsSaveSlotsModalOpen(false)}
        cloudSaves={cloudSaves}
        currentSlotName={currentSlotName}
        authUser={authUser}
        onLoadSlot={handleLoadSlot}
        onDeleteSlot={handleDeleteSlot}
        onCreateSlot={handleCreateSlot}
        showToast={showToast}
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
        factions={factions}
        npcs={npcs}
        onOpenNpcModal={(id) => {
          const npc = npcs.find(n => n.id === id);
          if (npc) setSelectedNpc(npc);
        }}
      />

      {/* ── Quest Side Panel ── */}
      <AnimatePresence>
        {isQuestPanelOpen && (
          <motion.div
            ref={questPanelRef}
            initial={{ opacity: 0, x: -10, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed z-[200] flex flex-col overflow-hidden rounded-[8px]"
            style={{
              top: questPanelPos.top,
              left: questPanelPos.left,
              width: '340px',
              maxHeight: '70vh',
              background: 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)',
              border: '1px solid var(--border-default)',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                <span className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>任務日誌</span>
              </div>
              <div className="flex items-center gap-3 text-xs mr-2">
                {[{ count: quests.filter(q=>q.status==='active'&&!q.isGoalMet).length, color:'var(--color-success)', label:'進行' },
                  { count: quests.filter(q=>q.status==='active'&&q.isGoalMet).length, color:'var(--color-amber)', label:'待報' },
                  { count: quests.filter(q=>q.status==='completed').length, color:'var(--color-sky)', label:'完成' }].map(({count,color,label})=> count > 0 && (
                  <span key={label} className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    <span style={{ color }}>{count} {label}</span>
                  </span>
                ))}
              </div>
              <button onClick={() => setIsQuestPanelOpen(false)} className="p-1 rounded-full hover:bg-white/5 transition" style={{ color: 'var(--text-muted)' }}><X className="w-3.5 h-3.5" /></button>
            </div>
            {/* Quest list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {quests.length === 0 && <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>尚無任務...</p>}
              {quests.filter(q=>q.status==='active'&&q.isGoalMet).map(q => (
                <div key={q.id} className="rounded-[8px] p-3 text-sm" style={{ background: 'var(--bg-quest-pending)', border: '1px solid var(--border-quest-pending)' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-bold leading-snug" style={{ color: 'var(--text-title)' }}>{q.title}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ color: 'var(--color-amber)', background: 'color-mix(in srgb, var(--color-amber) 15%, transparent)' }}>待回報</span>
                  </div>
                  <p className="leading-relaxed" style={{ color: 'var(--text-body)' }}>{q.description}</p>
                </div>
              ))}
              {quests.filter(q=>q.status==='active'&&!q.isGoalMet).map(q => (
                <div key={q.id} className="rounded-[8px] p-3 text-sm" style={{ background: 'var(--bg-quest-active)', border: '1px solid var(--border-quest-active)' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-bold leading-snug" style={{ color: 'var(--text-title)' }}>{q.title}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ color: 'var(--color-success)', background: 'color-mix(in srgb, var(--color-success) 15%, transparent)' }}>進行中</span>
                  </div>
                  <p className="text-xs mb-1" style={{ color: 'color-mix(in srgb, var(--color-amber) 80%, transparent)' }}>委託：{q.giver||'—'}</p>
                  <p className="leading-relaxed" style={{ color: 'var(--text-body)' }}>{q.description}</p>
                </div>
              ))}
              {quests.filter(q=>q.status==='completed').map(q => (
                <div key={q.id} className="rounded-[8px] p-3 text-sm opacity-60" style={{ border: '1px solid color-mix(in srgb, var(--border-default) 30%, transparent)' }}>
                  <span className="font-bold line-through" style={{ color: 'var(--text-muted)' }}>{q.title}</span>
                </div>
              ))}
              {quests.filter(q=>q.status==='failed').map(q => (
                <div key={q.id} className="rounded-[8px] p-3 text-sm opacity-60" style={{ background: 'var(--bg-quest-failed)', border: '1px solid var(--border-quest-failed)' }}>
                  <span className="font-bold" style={{ color: 'var(--color-taupe)' }}>{q.title}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mobile 左側抽屜 ─────────────────────────────────── */}
      <AnimatePresence>
        {isMobile && mobileLeftOpen && (
          <>
            {/* Overlay */}
            <motion.div
              key="left-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[40]"
              style={{ background: 'rgba(0,0,0,0.55)' }}
              onClick={() => setMobileLeftOpen(false)}
            />
            {/* Drawer */}
            <motion.div
              key="left-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="fixed top-0 left-0 bottom-0 z-[50] flex flex-col overflow-hidden"
              style={{
                width: 'min(80vw, 300px)',
                background: 'rgba(12,14,12,0.97)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderRight: '0.5px solid rgba(255,255,255,0.07)',
              }}
            >
              {/* Drawer Header */}
              <div
                className="flex items-center justify-between px-4 shrink-0"
                style={{
                  height: '56px',
                  paddingTop: 'env(safe-area-inset-top, 0px)',
                  borderBottom: '0.5px solid rgba(255,255,255,0.07)',
                }}
              >
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>選單</span>
                <button
                  onClick={() => setMobileLeftOpen(false)}
                  className="flex items-center justify-center"
                  style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.08)' }}
                >
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">

                {/* ── Widget: Note Paper ── */}
                <div
                  className="rounded-[8px] overflow-hidden relative"
                  style={{
                    background: 'rgba(248,242,226,0.90)',
                    border: '1px solid rgba(185,165,130,0.55)',
                    backdropFilter: 'blur(24px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                    boxShadow: `2px 2px 0 0 rgba(235,225,205,0.92), 4px 4px 0 0 rgba(220,210,190,0.82), 0 10px 28px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.55)`,
                  }}
                >
                  <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(transparent 0, transparent 27px, rgba(140,110,70,0.09) 27px, rgba(140,110,70,0.09) 28px)', backgroundPosition: '0 52px', zIndex: 0 }} />
                  <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: '38px', width: '1px', background: 'linear-gradient(to bottom, transparent 8%, rgba(188,55,55,0.16) 16%, rgba(188,55,55,0.16) 84%, transparent 92%)', zIndex: 0 }} />
                  <div className="relative" style={{ zIndex: 1 }}>
                    <div className="px-4 pt-3 pb-1 flex items-center">
                      <h3 className="flex items-center font-bold text-lg" style={{ color: 'var(--text-note)' }}>
                        <ScrollText className="w-4 h-4 mr-2" style={{ color: 'var(--text-note)' }} /> 當前目標
                        {isUpdatingLog && <RefreshCw className="w-3 h-3 ml-2 animate-spin opacity-50" style={{ color: 'var(--text-note)' }} />}
                      </h3>
                    </div>
                    <ul className="px-4 pb-2 space-y-1.5">
                      {currentGoals.length > 0 ? currentGoals.map((goal, i) => (
                        <li key={i} className="text-sm leading-relaxed flex items-start gap-2">
                          <span className="flex-shrink-0 mt-0.5 text-xs" style={{ color: 'rgba(120,90,50,0.40)' }}>○</span>
                          <span style={{ color: 'var(--text-note)' }}>{goal}</span>
                        </li>
                      )) : (
                        <li className="text-sm" style={{ color: 'var(--text-note-muted)' }}>暫無明確目標...</li>
                      )}
                    </ul>
                    <button className="w-full px-4 py-2 flex items-center transition-all" onClick={() => setSummaryCollapsed(prev => !prev)} style={{ background: 'transparent' }}>
                      {summaryCollapsed ? <ChevronRight className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" style={{ color: 'var(--text-note)' }} /> : <ChevronDown className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" style={{ color: 'var(--text-note)' }} />}
                      <span className="text-sm font-bold" style={{ color: 'var(--text-note)' }}>冒險摘要</span>
                    </button>
                    <AnimatePresence>
                      {!summaryCollapsed && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="px-4 pb-3">
                            {adventureLog.length > 0 ? (
                              <div className="text-sm leading-relaxed flex items-start gap-2">
                                <span className="flex-shrink-0 mt-0.5 text-xs" style={{ color: 'rgba(120,90,50,0.35)' }}>∵</span>
                                <span style={{ color: 'var(--text-note)', opacity: 0.85 }}>{adventureLog[0]}</span>
                              </div>
                            ) : (
                              <div className="text-sm" style={{ color: 'var(--text-note-muted)' }}>等待冒險展開...</div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* ── Widget: 裝備（inline expand）── */}
                <div>
                  <button
                    onClick={() => { setIsInventoryOpen(prev => !prev); if (isConsumablesOpen) setIsConsumablesOpen(false); }}
                    className="w-full rounded-[8px] px-4 py-3 shadow-xl flex items-center gap-3 transition-all"
                    style={{
                      background: isInventoryOpen ? 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)' : 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)',
                      border: `1px solid ${isInventoryOpen ? 'var(--border-accent)' : 'color-mix(in srgb, var(--border-default) 60%, transparent)'}`,
                      backdropFilter: 'blur(24px) saturate(160%)',
                      WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                    }}
                  >
                    <div className="relative shrink-0">
                      <Package className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                      {equipment.length > 0 && (
                        <span className="absolute -top-1.5 -right-2 text-[0.625rem] font-bold px-1 min-w-[16px] text-center rounded-full" style={{ background: 'var(--tab-active)', color: '#fff', lineHeight: '16px' }}>
                          {equipment.length}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>裝備</span>
                    <ChevronDown className="w-3.5 h-3.5 ml-auto" style={{ color: 'var(--text-muted)', transform: isInventoryOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>
                  <AnimatePresence>
                    {isInventoryOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-1 rounded-[8px] border p-2 space-y-2" style={{ borderColor: 'var(--border-default)', background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)' }}>
                          {equipment.length > 0 ? equipment.map(item => (
                            <div key={item.id} className="p-2.5 rounded-[8px] border cursor-pointer transition-all" style={{ borderColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }} onClick={() => setSelectedInventoryItem(selectedInventoryItem === item.id ? null : item.id)}>
                              <div className="text-sm font-medium" style={{ color: 'var(--text-title)' }}>{item.name}</div>
                              <div className="text-sm leading-relaxed" style={{ color: 'color-mix(in srgb, var(--text-body) 80%, transparent)' }}>{item.description}</div>
                              <AnimatePresence>
                                {selectedInventoryItem === item.id && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex space-x-2 mt-2.5 pt-2.5 overflow-hidden" style={{ borderTop: '1px solid color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}>
                                    <button className="flex-1 text-sm py-1.5 rounded-[8px] transition font-medium" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)', color: 'var(--text-title)' }} onClick={(e) => { e.stopPropagation(); showToast(`裝備了 ${item.name}`); setSelectedInventoryItem(null); }}>裝備</button>
                                    <button className="flex-1 text-sm py-1.5 rounded-[8px] transition font-medium" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)', color: 'var(--text-title)' }} onClick={(e) => { e.stopPropagation(); showToast(`卸下了 ${item.name}`); setSelectedInventoryItem(null); }}>卸下</button>
                                    <button className="flex-1 border text-sm py-1.5 rounded-[8px] transition font-medium" style={{ background: 'color-mix(in srgb, var(--color-rose) 10%, transparent)', color: 'var(--text-danger)', borderColor: 'color-mix(in srgb, var(--color-rose) 20%, transparent)' }} onClick={(e) => { e.stopPropagation(); setEquipment(prev => prev.filter(i => i.id !== item.id)); showToast(`丟棄了 ${item.name}`); setSelectedInventoryItem(null); }}>丟棄</button>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )) : <div className="text-center text-sm py-4" style={{ color: 'var(--text-muted)' }}>背包空空如也...</div>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ── Widget: 消耗品（inline expand）── */}
                <div>
                  <button
                    onClick={() => { setIsConsumablesOpen(prev => !prev); if (isInventoryOpen) setIsInventoryOpen(false); }}
                    className="w-full rounded-[8px] px-4 py-3 shadow-xl flex items-center gap-3 transition-all"
                    style={{
                      background: isConsumablesOpen ? 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)' : 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)',
                      border: `1px solid ${isConsumablesOpen ? 'var(--border-accent)' : 'color-mix(in srgb, var(--border-default) 60%, transparent)'}`,
                      backdropFilter: 'blur(24px) saturate(160%)',
                      WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                    }}
                  >
                    <div className="relative shrink-0">
                      <Beaker className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                      {items.reduce((acc, item) => acc + item.quantity, 0) > 0 && (
                        <span className="absolute -top-1.5 -right-2 text-[0.625rem] font-bold px-1 min-w-[16px] text-center rounded-full" style={{ background: 'var(--tab-active)', color: '#fff', lineHeight: '16px' }}>
                          {items.reduce((acc, item) => acc + item.quantity, 0)}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>消耗品</span>
                    <ChevronDown className="w-3.5 h-3.5 ml-auto" style={{ color: 'var(--text-muted)', transform: isConsumablesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>
                  <AnimatePresence>
                    {isConsumablesOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-1 rounded-[8px] border p-2 space-y-2" style={{ borderColor: 'var(--border-default)', background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)' }}>
                          {items.length > 0 ? items.map(item => (
                            <div key={item.id} className="p-2.5 rounded-[8px] border cursor-pointer transition-all" style={{ borderColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }} onClick={() => setSelectedConsumableItem(selectedConsumableItem === item.id ? null : item.id)}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-medium" style={{ color: 'var(--text-title)' }}>{item.name}</span>
                                <span className="text-sm font-mono px-1.5 py-0.5 rounded-[8px]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-body)' }}>x{item.quantity}</span>
                              </div>
                              <div className="text-sm leading-relaxed" style={{ color: 'color-mix(in srgb, var(--text-body) 80%, transparent)' }}>{item.description}</div>
                              <AnimatePresence>
                                {selectedConsumableItem === item.id && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex space-x-2 mt-2.5 pt-2.5 overflow-hidden" style={{ borderTop: '1px solid color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}>
                                    <button className="flex-1 border text-sm py-1.5 rounded-[8px] transition font-medium" style={{ background: 'color-mix(in srgb, var(--color-emerald) 10%, transparent)', color: 'var(--color-emerald)', borderColor: 'color-mix(in srgb, var(--color-emerald) 20%, transparent)' }} onClick={(e) => { e.stopPropagation(); useItem(item.name); setSelectedConsumableItem(null); handleSendMessage(`（我使用了 ${item.name}（${item.description}））`); }}>使用</button>
                                    <button className="flex-1 border text-sm py-1.5 rounded-[8px] transition font-medium" style={{ background: 'color-mix(in srgb, var(--color-rose) 10%, transparent)', color: 'var(--text-danger)', borderColor: 'color-mix(in srgb, var(--color-rose) 20%, transparent)' }} onClick={(e) => { e.stopPropagation(); setItems(prev => prev.filter(i => i.id !== item.id)); showToast(`丟棄了 ${item.name}`); setSelectedConsumableItem(null); }}>丟棄</button>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )) : <div className="text-center text-sm py-4" style={{ color: 'var(--text-muted)' }}>沒有任何消耗品...</div>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ── Widget: Pinned NPCs ── */}
                {npcs.filter(n => n.isPinned).length > 0 && (
                  <div className="rounded-[8px] px-4 py-3 shadow-xl overflow-hidden" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)', border: '1px solid color-mix(in srgb, var(--border-default) 60%, transparent)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)' }}>
                    <h3 className="font-bold mb-3 text-sm" style={{ color: 'var(--text-primary)' }}>✦ 關注</h3>
                    <div className="space-y-2">
                      {npcs.filter(n => n.isPinned).map(npc => (
                        <div key={npc.id} className="backdrop-blur-md p-3 rounded-[10px] flex justify-between items-center cursor-pointer transition-all duration-300 shadow-md border border-white/5 relative overflow-hidden group/pinned" onClick={() => setSelectedNpc(npc)}>
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

                {/* 底部快捷按鈕 */}
                <div className="rounded-[8px] p-2 mt-auto" style={{ background: 'rgba(0,0,0,0.58)', backdropFilter: 'blur(20px) saturate(150%)', WebkitBackdropFilter: 'blur(20px) saturate(150%)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 4px 20px rgba(0,0,0,0.55)' }}>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: '個人資訊', action: () => setIsProfileModalOpen(true) },
                      { label: '故事集', action: () => setIsLorebookModalOpen(true) },
                      { label: '系統', action: () => setIsSettingsModalOpen(true) },
                      { label: 'Prompt', action: () => setIsSystemPromptModalOpen(true) },
                    ].map(item => (
                      <div key={item.label} className="p-1.5 rounded-[5px] cursor-pointer transition-all flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.border = '1px solid rgba(255,255,255,0.12)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.border = '1px solid rgba(255,255,255,0.06)'; }}
                        onClick={item.action}
                      >
                        <span className="flex items-center text-xs" style={{ color: 'var(--text-main)' }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Mobile 右側抽屜 ─────────────────────────────────── */}
      <AnimatePresence>
        {isMobile && mobileRightOpen && (
          <>
            {/* Overlay */}
            <motion.div
              key="right-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[40]"
              style={{ background: 'rgba(0,0,0,0.55)' }}
              onClick={() => setMobileRightOpen(false)}
            />
            {/* Drawer */}
            <motion.div
              key="right-drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="fixed top-0 right-0 bottom-0 z-[50] flex flex-col overflow-hidden"
              style={{
                width: 'min(80vw, 300px)',
                background: 'rgba(12,14,12,0.97)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderLeft: '0.5px solid rgba(255,255,255,0.07)',
              }}
            >
              {/* Drawer Header */}
              <div
                className="flex items-center justify-between px-4 shrink-0"
                style={{
                  height: '56px',
                  paddingTop: 'env(safe-area-inset-top, 0px)',
                  borderBottom: '0.5px solid rgba(255,255,255,0.07)',
                }}
              >
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>資訊面板</span>
                <button
                  onClick={() => setMobileRightOpen(false)}
                  className="flex items-center justify-center"
                  style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.08)' }}
                >
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>

              {/* Drawer Body — 桌面右欄內容 */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

                {/* ── Widget 1: 世界記憶 ── */}
                <div className="rounded-[8px] border border-white/10 backdrop-blur-md p-4 shadow-xl transition-all duration-300 group/wm" style={{ background: 'rgba(10,10,20,0.55)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--color-amber)' }} />
                    <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>世界記憶</span>
                  </div>
                  <div className="rounded-[4px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-md relative overflow-hidden mb-3" style={{ background: `linear-gradient(135deg, #1e1477, var(--bg-elevated))` }}>
                    <div className="absolute -right-6 -bottom-6 opacity-10 group-hover/wm:opacity-20 transition-all duration-700 rotate-12 group-hover/wm:scale-110">
                      <Sparkles className="w-[72px] h-[72px]" style={{ color: 'white' }} />
                    </div>
                    <div className="absolute top-0 left-0 w-full h-[1px]" style={{ background: `linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)` }}></div>
                    <div className="px-4 py-2.5 relative z-10">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="p-1.5 rounded-[8px] bg-white/5 border border-white/10"><Calendar className="w-3 h-3" style={{ color: 'var(--text-muted)' }} /></div>
                        <span className="text-xs font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-body)' }}>{currentMonthData.elegant}</span>
                      </div>
                      <p className="text-xs leading-relaxed font-light pl-1" style={{ color: 'color-mix(in srgb, var(--text-body) 85%, transparent)', borderLeft: `1px solid rgba(255,255,255,0.15)` }}>{currentMonthData.desc}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {memories.filter(m => m.type === 'world' && m.isActive).map(mem => (
                      <div key={mem.id} className="flex items-start gap-2 text-xs leading-relaxed py-1 pl-2" style={{ borderLeft: `2px solid var(--border-default)` }}>
                        {mem.importance === 'critical' && <Sparkles className="w-3 h-3 mt-0.5 shrink-0" style={{ color: 'var(--color-amber)' }} />}
                        <span style={{ color: 'var(--text-muted)' }}>{mem.content}</span>
                      </div>
                    ))}
                    {memories.filter(m => m.type === 'world' && m.isActive).length === 0 && (
                      <p className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>尚無世界記憶</p>
                    )}
                  </div>
                </div>

                {/* ── Widget 2: 當前場景人物 ── */}
                <div className="rounded-[8px] border border-white/10 backdrop-blur-md p-4 shadow-xl transition-all duration-300" style={{ background: 'rgba(10,15,10,0.55)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-4 h-4 shrink-0" style={{ color: 'var(--text-title)' }} />
                    <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>當前場景人物</span>
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const sceneNpcs = npcs.filter(n => appearingNpcs.includes(n.name) || n.location === currentLocation || n.isPinned);
                      const hiddenCount = Math.max(0, sceneNpcs.length - 8);
                      const displayedNpcs = sceneNpcs.slice(0, 8);
                      return sceneNpcs.length > 0 ? (
                        <>
                          {displayedNpcs.map(npc => {
                            const lore = lorebookEntries.find(e => e.category === 'NPC' && e.title === npc.name);
                            const displayJob    = lore?.job    ?? npc.job    ?? '';
                            const displayGender = lore?.gender ?? '';
                            return (
                              <div key={npc.id} className="backdrop-blur-md border border-white/5 p-2.5 rounded-[4px] flex justify-between items-center cursor-pointer transition-all duration-300 shadow-lg group/npc overflow-hidden relative hover:border-white/15" onClick={() => setSelectedNpc(npc)}>
                                <div className="absolute top-0 left-0 w-1 h-full opacity-0 group-hover/npc:opacity-40 transition-opacity" style={{ background: `linear-gradient(to bottom, transparent, var(--bg-elevated), transparent)` }}></div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium" style={{ color: 'var(--text-title)' }}>{npc.name}</span>
                                  <span className="text-xs uppercase tracking-tighter" style={{ color: 'var(--text-body)' }}>{displayGender ? `${displayGender}・${displayJob}` : displayJob}</span>
                                </div>
                                <div className="text-xs flex items-center px-2 py-1 rounded-full bg-black/20 border border-white/5" style={{ color: affectionColor(npc.affection) }}>
                                  <Heart className="w-3 h-3 mr-1 fill-current" />
                                  <span className="font-mono">{npc.affection}</span>
                                </div>
                              </div>
                            );
                          })}
                          {hiddenCount > 0 && <div className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>✦ 還有 {hiddenCount} 人未顯示...</div>}
                        </>
                      ) : <p className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>此處目前沒有人...</p>;
                    })()}
                  </div>
                </div>

                {/* ── Widget 3: 場景 & 區域記憶 ── */}
                <div className="rounded-[8px] border border-white/10 backdrop-blur-md p-4 shadow-xl transition-all duration-300" style={{ background: 'rgba(15,10,5,0.55)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="w-4 h-4 shrink-0" style={{ color: 'var(--color-amber)' }} />
                    <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>場景記憶</span>
                  </div>
                  {(() => {
                    const regionMems = memories.filter(m => { if (m.type !== 'region' || !m.isActive) return false; const locs = m.tags?.locations || []; if (locs.length === 0) return true; return locs.some((l: string) => l === currentLocation); });
                    return regionMems.length > 0 ? (
                      <div className="mb-3">
                        <p className="text-[0.625rem] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>區域</p>
                        <ul className="space-y-1.5">
                          {regionMems.map(mem => (
                            <li key={mem.id} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                              <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-amber)', opacity: 0.7 }}></span>
                              <span>{mem.content}{mem.expiresAt && <em className="ml-1 opacity-60">（至 {mem.expiresAt}）</em>}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null;
                  })()}
                  {(() => {
                    const sceneMems = memories.filter(m => m.type === 'scene' && m.isActive && (m.tags?.locations || []).some((l: string) => l === currentLocation));
                    return (
                      <div className="mb-3">
                        <p className="text-[0.625rem] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>場景</p>
                        {sceneMems.length > 0 ? (
                          <ul className="space-y-1.5">
                            {sceneMems.map(mem => (
                              <li key={mem.id} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-sky)', opacity: 0.7 }}></span>
                                <span>{mem.content}{mem.source === 'ai_generated' && <em className="ml-1 text-[0.625rem] opacity-50">AI</em>}</span>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>此場景尚無記憶...</p>}
                      </div>
                    );
                  })()}
                  {(() => {
                    const npcMems = memories.filter(m => m.type === 'npc' && m.isActive);
                    return npcMems.length > 0 ? (
                      <div>
                        <p className="text-[0.625rem] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>NPC</p>
                        <ul className="space-y-1.5">
                          {npcMems.map(mem => (
                            <li key={mem.id} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                              <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-emerald)', opacity: 0.7 }}></span>
                              <span>
                                {mem.tags?.npcs?.length > 0 && <strong className="mr-1" style={{ color: 'var(--text-title)' }}>[{mem.tags.npcs.join(',')}]</strong>}
                                {mem.content}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null;
                  })()}
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
