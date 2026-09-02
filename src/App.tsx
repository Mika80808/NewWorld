import React, { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { RefreshCw, MoreVertical, Book, BookOpen, Package, Beaker, Heart, MapPin, Zap, Coins, Calendar, Shield, CheckSquare, ChevronDown, ChevronRight, Map as MapIcon, Cloud, Sun, CloudRain, Snowflake, Moon, Wind, Brain, X, Pin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAIRequest } from './hooks/useAIRequest';
import { Npc, LorebookEntry, Message, NpcMemory, EquipmentItem, ItemEntry, GMConfig, SubGMConfig, FactionRelation, Quest } from './types';
import { QuestModal } from './components/QuestModal';
import { QuestCard } from './components/QuestCard';
import { ProfileModal } from './components/ProfileModal';
import { SystemPromptModal } from './components/SystemPromptModal';
import { MessageCard } from './components/MessageCard';
import { StreamingBubble, StreamingBubbleHandle } from './components/StreamingBubble';
import { ChatInput } from './components/ChatInput';
import { ConfirmDialog, DialogRequest } from './components/ConfirmDialog';
// 桌面欄位與手機抽屜共用的面板組件（原本兩邊各有一份幾乎相同的 JSX）
import { GoalsPanel } from './components/panels/GoalsPanel';
import { WorldMemoryWidget } from './components/panels/WorldMemoryWidget';
import { SceneNpcsWidget } from './components/panels/SceneNpcsWidget';
import { SceneMemoryWidget } from './components/panels/SceneMemoryWidget';
import { PinnedNpcsWidget } from './components/panels/PinnedNpcsWidget';
import { QuickLinksGrid } from './components/panels/QuickLinksGrid';
import { EquipmentList } from './components/panels/EquipmentList';
import { ConsumableList } from './components/panels/ConsumableList';

// 大型 Modal 延遲載入：不進首屏 bundle，開啟時才下載對應 chunk
const DiaryModal    = lazy(() => import('./components/DiaryModal').then(m => ({ default: m.DiaryModal })));
const LorebookModal = lazy(() => import('./components/LorebookModal').then(m => ({ default: m.LorebookModal })));
const NpcModal      = lazy(() => import('./components/NpcModal').then(m => ({ default: m.NpcModal })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const MapModal      = lazy(() => import('./components/MapModal').then(m => ({ default: m.MapModal })));
import { MONTHS_DATA } from './constants';
import { useGameStore, saveDataMapper } from './hooks/useGameStore';
import { useCommandParser } from './hooks/useCommandParser';
import { useAuth } from './hooks/useAuth';
import { SaveSlot } from './lib/supabase';
import { performanceMonitor } from './utils/performanceMonitor';
import { debounce } from './utils/debounce';
import { renderMarkdown, cleanNarrative, APPEAR_TAG_PATTERN, APPEAR_TAG_CAPTURE_PATTERN } from './utils/markdownParser';
import { buildPrompt, BuildPromptDeps, BuildPromptResult } from './utils/promptBuilder';
import { parseNpcImport, mergeImportedNpcs, mergeImportedFactions } from './utils/npcImport';
import { setFactionRelation, removeFactionRelation } from './utils/factionRelation';
import { ThemeId, loadTheme, saveTheme, applyTheme } from './utils/theme';
import { describeItem, registerItemDef, normalizeItemName } from './utils/itemCatalog';
import { updateNpcFootprints } from './utils/npcPresence';
import { SaveSlotsModal } from './components/SaveSlotsModal';

export default function App() {
  const backgroundImageUrl = `${import.meta.env.BASE_URL}background.webp`;

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
  // 助理 GM 在上一輪順便挑出的「可能相關」設定集條目 id，與規則比對取聯集後注入。
  // 刻意不進存檔：這是每輪重算的暫時提示，存起來只會在載入後沿用過期的場景判斷。
  // 載入後的第一輪退回純規則行為，助理跑完一輪就會補上。
  const [loreHints, setLoreHints] = useState<number[]>([]);
  // 佈景主題。初值直接讀 localStorage（不是先給預設再用 effect 補），
  // 否則重新整理時會先閃一幀深色再跳成羊皮紙
  const [theme, setThemeState] = useState<ThemeId>(() => loadTheme());
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
  // 重入鎖，見 updateAdventureState 開頭的說明
  const subGMBusyRef = useRef(false);

  // 背景處理：整理冒險日誌與目標（使用 callAI 封裝層，不綁定特定 API）
  const updateAdventureState = async (history: Message[], newItems: string[] = [], hasKeyEvent = false) => {
    if (history.length < 2) return;

    // ── 重入鎖：上一輪還沒跑完就直接跳過本輪 ──────────────────────────────
    //
    // 這支是 fire-and-forget（handleSendMessage 沒有 await 它），而 handleSendMessage
    // 的 finally 立刻把 aiRequestStatus 設回 idle，所以玩家可以在助理 GM 還在跑時
    // 送出下一則。`hasKeyEvent`（任何一條 LOCATION 指令就成立）會跳過節流，
    // 於是兩輪並行是實際到得了的狀態。並行的後果：
    //
    //   1. 兩邊都從 summaryPoolRef 讀同一份舊池、再各自「整份寫回」——後寫的那個
    //      會吃掉先寫的那則摘要
    //   2. 壓縮階段更糟：A 還在 await 壓縮用的 callAI 時池子沒被清空，
    //      B 讀到同一份 10 則的池子也判定該壓縮，兩份壓縮結果互相覆蓋，
    //      compressCount 還可能一起跨過 3 而生成兩篇日記
    //
    // 跳過一輪是安全的——這只是背景摘要，本來就已經在節流。
    // 刻意放在節流計數之前：被跳過的這輪不該消耗節流額度，下一輪會再試。
    if (subGMBusyRef.current) return;

    // 節流：每 3 回合最多觸發一次；關鍵事件（任務/移動/世界記憶）可跳過冷卻
    subGMRoundsRef.current += 1;
    if (subGMRoundsRef.current < 3 && !hasKeyEvent) return;
    subGMRoundsRef.current = 0;

    subGMBusyRef.current = true;
    setIsUpdatingLog(true);
    try {
      const playerName = profileRef.current.name?.trim() || '主角';
      const lastMessages = history.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
      const itemClassifySection = newItems.length > 0
        ? `\n\n另外，請判斷以下新增道具各屬於「裝備」（武器、防具、飾品等穿戴型）還是「道具」（消耗品、材料、卷軸等使用型）。
請在 JSON 中加入 "item_types" 欄位，key 為道具名，value 為 "equipment" 或 "item"。
新增道具：${newItems.join('、')}`
        : '';

      // ── 設定集挑選：讓助理 GM 順便標出「下一輪可能用得到」的條目 ──────────
      //
      // 設定集原本純靠規則比對挑選（homeLocation === loc、標題相等、關鍵字
      // includes），字串差一個字就整條漏掉，而玩家看不出差別。助理做語意判斷，
      // 補得到規則漏掉的。結果與規則取**聯集**，規則仍是地板。
      //
      // ⚠️ 併進這趟既有的呼叫，不另外發請求——所以不增加 API 次數，
      // 也不讓玩家多等（updateAdventureState 在回應後才跑且沒有 await）。
      //
      // ⚠️ 只送 id／類別／標題，不送內容：內容動輒上千字，全塞進來等於每輪
      // 重傳整本設定集。助理靠標題就足以判斷相關性。
      // 場景沒變就不重送索引：同一個地點跟同一批人繼續對話時，助理挑出來的
      // 答案不會變，那 120 行索引等於白送。沿用上一輪的提示即可。
      // 指紋刻意只取「地點＋在場的人」——設定集本身變動時也要重算，
      // 故一併納入條目數量（新增／刪除條目會改變它）。
      const sceneKey = [
        currentLocationRef.current,
        [...appearingNpcsRef.current].sort().join(','),
        lorebookEntriesRef.current.length,
      ].join('#');
      const sceneUnchanged = sceneKey === loreHintSceneRef.current;

      const loreIndex = sceneUnchanged
        ? ''
        : lorebookEntriesRef.current
            .filter(e => e.isActive)
            .slice(0, 120)
            .map(e => `${e.id}|${e.category}|${e.title}`)
            .join('\n');
      const loreSection = loreIndex
        ? `\n\n另外，以下是這個世界的設定集索引（格式 id|類別|標題）。
請判斷接下來的劇情**可能需要哪些條目**，在 JSON 中加入 "lore_ids" 欄位，
值為 id 的陣列（最多 8 個，寧缺勿濫，沒有就給空陣列）。只回 id，不要回標題。
設定集索引：
${loreIndex}`
        : '';

      // ── 階段一：生成本輪摘要 ──────────────────────────────────────────────
      // ⚠️ 玩家角色一律以名字稱呼。這裡的產物會進 summaryPool → 壓縮 → 日記，
      // 一旦寫成「主角」就會沿著整條鏈路擴散，之後每篇日記都跟著錯。
      const prompt = `你是 RPG 後台資料整理員，不負責說故事。
玩家角色的名字是「${playerName}」，一律以此名稱呼，不可使用「主角」「玩家」「他」等代稱。
根據以下最新一則對話，輸出固定 JSON，只輸出 JSON，不要任何說明：
{
  "summary": "以第三人稱過去式精簡記錄：${playerName}做了什麼、結果如何、實質影響。若本輪純屬日常閒聊或無實質進展，輸出 null",
  "goals": ["短期目標1", "短期目標2"]${newItems.length > 0 ? `,\n  "item_types": { "道具名": "equipment 或 item" }` : ''}${loreIndex ? `,\n  "lore_ids": [1, 5]` : ''}
}
${itemClassifySection}${loreSection}

對話內容：
${lastMessages}`;

      // structured output 直接回 JSON；``` 圍欄清理保留作為 Gemma 等不支援模型的 fallback
      const text = await callAI(prompt, { responseJson: true });
      if (!text) return;
      const clean = text.replace(/```json|```/g, '').trim();
      const data = JSON.parse(clean);

      // 更新短期目標
      // 型別防衛：AI 偶爾會回 "goals": "單一目標" 之類的非陣列值，
      // 直接寫進 state 會讓 GoalsPanel 的 .map 爆炸，而且它會被存進雲端存檔，
      // 之後每次載入都白畫面（saveDataMapper 的 `|| []` 對非空字串無效）
      if (Array.isArray(data.goals)) {
        setCurrentGoals(data.goals.filter((g: unknown): g is string => typeof g === 'string'));
      } else if (typeof data.goals === 'string' && data.goals.trim()) {
        setCurrentGoals([data.goals.trim()]);
      }

      // 設定集提示：只收數字 id，且必須對得上實際存在的條目。
      // 型別防衛比照 goals——助理偶爾會回標題字串或物件，直接寫進 state
      // 會讓 promptBuilder 的 Set 比對整組失效（而且是靜默失效）。
      // 比不到任何 id 時寫入空陣列，讓下一輪乾淨地退回純規則行為，
      // 不要沿用上一輪的舊提示（場景已經換了）。
      // 只在這輪真的有送索引時才更新（沒送索引就沒問，助理回的任何 lore_ids
      // 都是幻覺）。同時記下算這份提示時的場景指紋，供下一輪比對
      if (loreIndex && Array.isArray(data.lore_ids)) {
        const validIds = new Set(lorebookEntriesRef.current.map(e => e.id));
        setLoreHints(
          data.lore_ids
            .map((v: unknown) => typeof v === 'number' ? v : parseInt(String(v), 10))
            .filter((n: number) => Number.isFinite(n) && validIds.has(n))
        );
        loreHintSceneRef.current = sceneKey;
      }

      // 道具分類（讀 itemsRef 取最新道具清單，寫入一律 functional update）
      if (data.item_types && typeof data.item_types === 'object') {
        const toEquip: string[] = Object.entries(data.item_types)
          .filter(([, v]) => v === 'equipment')
          .map(([k]) => k);
        if (toEquip.length > 0) {
          const moving = itemsRef.current.filter(i => toEquip.includes(i.name));
          setItems(prev => prev.filter(i => !toEquip.includes(i.name)));
          setEquipment(prev => {
            const next = [...prev];
            moving.forEach(item => {
              if (!next.some(e => e.name === item.name)) {
                // 說明不跟著搬——它只在圖鑑一份（見 utils/itemCatalog.describeItem）
                next.push({ id: item.id, name: item.name, isEquipped: false });
              }
            });
            return next;
          });
        }
      }

      // 摘要加入暫存池（null 表示本輪無實質進展，略過）
      //
      // ⚠️ 這裡先前還會同時 `setAdventureLog([data.summary])`，把同一份摘要
      // 分存兩個地方：左欄讀 adventureLog、prompt 讀 summaryPool。同一個
      // data.summary、相隔三行寫進兩個 state，之後就各自漂移——玩家改了左欄
      // 看到的那則，AI 讀到的還是舊的。左欄現在直接讀 summaryPool 的最後一則，
      // 只留一份（adventureLog 已於 schema v8 移除）。
      if (data.summary && typeof data.summary === 'string') {
        // 加入暫存池，達 10 則觸發壓縮（讀 ref 取最新池，避免 await 期間的 stale closure）
        const newPool = [...summaryPoolRef.current, data.summary];
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
            const newCompressCount = compressCountRef.current + 1;
            setSummaryPool([compressed.trim()]);
            setCompressCount(newCompressCount >= 3 ? 0 : newCompressCount);

            // ── 階段三：壓縮 3 次後自動生成日記（靜默）────────────────────
            if (newCompressCount >= 3) {
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
      subGMBusyRef.current = false;
      setIsUpdatingLog(false);
    }
  };
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<number | null>(null);
  const [selectedConsumableItem, setSelectedConsumableItem] = useState<number | null>(null);
  const [selectedNpc, setSelectedNpc] = useState<Npc | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(() => {
    const saved = localStorage.getItem('rpworld_last_saved');
    return saved ? new Date(saved) : null;
  });
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editMessageText, setEditMessageText] = useState('');
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [dialogRequest, setDialogRequest] = useState<DialogRequest | null>(null);
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
    authError,
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
  // 儲存最後一次用戶輸入，供 abort 後重試用。
  // 用 state 而非 ref：中斷／超時／錯誤列的「重試」鈕是用這個值決定要不要顯示，
  // 而寫 ref 不會觸發重繪——先前只是剛好靠 aiRequestStatus 的變動順帶重繪才看起來正常。
  const [lastInput, setLastInput] = useState<string>('');

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
    itemCatalog, setItemCatalog,
    messages, setMessages,
    quickOptions, setQuickOptions,
    currentGoals, setCurrentGoals,
    summaryPool, setSummaryPool,
    compressCount, setCompressCount,
    statusEffects, setStatusEffects,
    factions, setFactions, addFaction, updateFaction,
    buildSaveSnapshot,
    loadFromData,
    resetGame,
    setIsStoreReady,
  } = store;

  // 最新值 refs：updateAdventureState 在 await AI 回應後讀取這些 ref，
  // 避免 async 閉包捕獲舊快照（stale closure）覆蓋等待期間的狀態變更。
  // 另外 messagesRef / buildSaveSnapshotRef 供 MessageCard 的穩定 callbacks
  //（useCallback []）在事件觸發時讀取最新值，讓 React.memo 不因 callback 引用變動而失效。
  const itemsRef = useRef(items);
  const summaryPoolRef = useRef(summaryPool);
  const compressCountRef = useRef(compressCount);
  const messagesRef = useRef(messages);
  const buildSaveSnapshotRef = useRef(buildSaveSnapshot);
  // 助理 GM 的摘要／日記 prompt 要用玩家名字稱呼角色。走 ref 而非直接讀 profile：
  // 直接讀會讓 React Compiler 把 updateAdventureState / handleGenerateDiary* 判定為
  // render 範圍內的反應式程式碼，連帶把它們（及其呼叫到的 _applyDiaryText）裡既有的
  // Date.now() 全部報成 react-hooks/purity 違規。
  const profileRef = useRef(profile);
  // NPC 匯入是 FileReader 回呼，讀檔期間可能剛好有 AI 回應寫入 npcs／設定集。
  // 走 ref 才不會用讀檔當下的舊快照算 id 與同名判斷，造成重複角色或 id 碰撞。
  const npcsRef = useRef(npcs);
  const lorebookEntriesRef = useRef(lorebookEntries);
  const factionsRef = useRef(factions);
  // 助理 GM 的設定集索引要在場景沒變時跳過重送，需要這兩個最新值
  const currentLocationRef = useRef(currentLocation);
  const appearingNpcsRef = useRef(appearingNpcs);
  /** 上次真的向助理要提示時的場景指紋；與本輪相同就不重送索引 */
  const loreHintSceneRef = useRef('');

  // 同步一律在 commit 後做，不在 render 期間寫 ref（render 必須是純函數：
  // React 可能捨棄或重跑一次 render，render 期間寫入會留下不屬於任何已提交畫面的值）。
  // 這個 effect 宣告在所有其他 effect 之前，同一次 commit 內會最先執行，
  // 因此下面讀 ref 的 effect（例如 persistToken 存檔）拿到的仍是最新值。
  // 讀取端全部落在 commit 之後（await 之後、或事件 callback 內），時序不變。
  // 掛載時把已儲存的主題套到 <html>。
  // 之後的切換由 handleSetTheme 直接套用，這裡只負責首次載入。
  useEffect(() => {
    applyTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    itemsRef.current = items;
    summaryPoolRef.current = summaryPool;
    compressCountRef.current = compressCount;
    messagesRef.current = messages;
    buildSaveSnapshotRef.current = buildSaveSnapshot;
    profileRef.current = profile;
    npcsRef.current = npcs;
    lorebookEntriesRef.current = lorebookEntries;
    factionsRef.current = factions;
    currentLocationRef.current = currentLocation;
    appearingNpcsRef.current = appearingNpcs;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const INITIAL_VISIBLE_MESSAGES = 10;
  const VISIBLE_MESSAGES_STEP = 10;
  const [visibleMessageCount, setVisibleMessageCount] = useState<number>(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const isAutoLoadingRef = useRef(false);
  // 串流泡泡的命令式介面：onChunk 直接推文字進去，不經過 messages state
  const streamingBubbleRef = useRef<StreamingBubbleHandle>(null);
  const visibleMessages = visibleMessageCount > 0 ? messages.slice(-visibleMessageCount) : [];
  const hiddenMessageCount = Math.max(messages.length - visibleMessages.length, 0);

  // ─── Phase 2: Debounced load-more handler ──────────────────────────────────────
  // react-hooks/refs 誤判：規則看到 useMemo 內出現 ref 存取就當成 render 期間讀取，
  // 但這個 arrow function 是交給 debounce 排程的，只會在捲動事件後才被呼叫，
  // 執行時機必定晚於 commit。useMemo 本身只負責建立那支 debounced 函數，不碰 ref。
  const handleLoadMore = useMemo(
    // eslint-disable-next-line react-hooks/refs
    () => debounce(() => {
      if (hiddenMessageCount > 0 && !isAutoLoadingRef.current) {
        isAutoLoadingRef.current = true;
        setVisibleMessageCount(prev => Math.min(messages.length, prev + VISIBLE_MESSAGES_STEP));
      }
    }, 150),
    [hiddenMessageCount, messages.length]
  );

  // 只在「訊息數量」變動時捲動。串流期間 messages 不再逐 chunk 更新，
  // 串流中的跟隨捲動由 StreamingBubble 自行以 rAF + behavior:'auto' 處理，
  // 避免每個 chunk 都重啟一次 smooth 捲動動畫造成抖動
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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

  // 依訊息數調整可見則數：首次顯示 10 則，已捲到底時跟著新訊息長。
  //
  // 用 render 期間比對而非 useEffect：effect 版會先 commit 一次舊的可見則數、
  // 下一幀才修正，載入存檔時聊天區會閃一下空白。
  // 哨兵 -1 是必要的——原本的 effect 在 mount 當下也會跑一次，改成比對後
  // 若用 messages.length 當初始值，首次 render 就不會執行，載入存檔後可見則數
  // 會卡在 0（整個聊天區空白）。
  const [prevMessagesLength, setPrevMessagesLength] = useState(-1);
  if (messages.length !== prevMessagesLength) {
    setPrevMessagesLength(messages.length);
    if (messages.length === 0) {
      if (visibleMessageCount !== 0) setVisibleMessageCount(0);
    } else {
      setVisibleMessageCount(prev => {
        if (prev === 0) return Math.min(messages.length, INITIAL_VISIBLE_MESSAGES);
        if (prev >= messages.length - 1) return messages.length;
        return prev;
      });
    }
  }

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
    if (!import.meta.env.DEV) return;
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
  // 消耗品徽章數量：原本判斷與顯示各算一次 reduce
  const totalItemCount = items.reduce((acc, item) => acc + item.quantity, 0);
  // 背景光暈的色調：隨遊戲時間變化。
  // 原本還有 timeText 供 SCENE 資訊列使用，該列與底部狀態列完全重複已移除。
  const sceneMeta = useMemo(() => {
    const hour = timeState.hour;
    const isNightScene = hour >= 19 || hour < 5;
    return {
      sceneAccent: isNightScene ? 'var(--fx-orb-violet)' : 'var(--fx-orb-amber)',
      sceneAccentSecondary: hour >= 9 && hour < 17 ? 'var(--fx-orb-sky)' : 'var(--fx-orb-violet)',
    };
  }, [timeState.hour]);

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
  /**
   * 色碼例外：場景氛圍色。
   * 天空與天氣的色碼隨遊戲內時間變化，是世界的樣子，不是 UI 主題色——
   * 中午的天空在夜色主題與羊皮紙主題底下都該是一樣的藍。
   */
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
    drainToastQueue(messages);
  }, [showToast, drainToastQueue]);

  // callAI 已由 useAIRequest hook 提供（D7）

  // ─── 指令解析器（useCommandParser）─────────────────────────────────────────
  const { parseAndExecuteCommands, consumeItem, scanKeywords, isMemoryTriggered, tickMemoryCounters } =
    useCommandParser({
      timeState, profile, currentLocation, quests, memories, items, itemCatalog, npcs,
      stickyCounters, cooldownCounters, messages, lorebookEntries, statusEffects,
      factions,
      setTimeState, setProfile, setCurrentLocation, setQuests,
      setMemories, setEquipment, setItems, setItemCatalog, setNpcs,
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
    setDiaryEntries(prev => [{ id: newId, title: '', text: '', isActive: true, keywords: [] }, ...prev]);
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
    setDiaryEntries(prev => prev.filter(entry => entry.id !== id));
  };

  const handleToggleDiary = (id: number) => {
    setDiaryEntries(prev => prev.map(entry =>
      entry.id === id ? { ...entry, isActive: !entry.isActive } : entry
    ));
  };

  // ─── 🔮 魔法日記：AI 自動生成（手動觸發，吃最近 20 則對話）─────────────────
  const handleGenerateDiary = async (silent = false) => {
    if (!mainGMConfig.apiKey.trim()) { if (!silent) showToast('❌ 請先設定 API Key'); return; }
    try {
      const playerName = profileRef.current.name?.trim() || '主角';
      const recentChat = messages.slice(-20).map(m =>
        `${m.role === 'user' ? 'Player' : 'DM'}: ${m.text}`
      ).join('\n');

      const prompt = `你是一個故事日記助手。根據以下最近的20則對話紀錄，生成一則第三人稱的日記條目，格式如下：

玩家角色的名字是「${playerName}」，一律以此名稱呼，不可使用「主角」「玩家」等代稱。

## 必須寫進日記的要點
* 角色層面 - ${playerName}的變化、角色關係進展、重要新角色登場
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
    } catch {
      if (!silent) showToast('❌ 生成失敗，請稍後再試');
    }
  };

  // ─── 🔮 魔法日記：自動觸發（吃暫存壓縮摘要，靜默）──────────────────────────
  const handleGenerateDiaryFromPool = async (pool: string[]) => {
    if (!mainGMConfig.apiKey.trim()) return;
    try {
      const playerName = profileRef.current.name?.trim() || '主角';
      const poolText = pool.map((p, i) => `[紀錄 ${i + 1}]\n${p}`).join('\n\n');
      const prompt = `你是一個故事日記助手。根據以下冒險紀錄，生成一則第三人稱日記條目。

玩家角色的名字是「${playerName}」，一律以此名稱呼，不可使用「主角」「玩家」等代稱。
（下方冒險紀錄若出現「主角」字樣，是舊資料的殘留，請一併改用「${playerName}」。）

## 寫作要點
- 角色層面：${playerName}的變化、關係進展、重要新角色
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
    } catch {
      showToast('❌ 融合失敗，請稍後再試');
    }
  };

  const handleDiaryChange = (id: number, text: string) => {
    setDiaryEntries(prev => prev.map(entry =>
      entry.id === id ? { ...entry, text } : entry
    ));
  };

  const handleAddLorebook = (category: string) => {
    const newId = Date.now();
    setLorebookEntries(prev => [{ id: newId, title: '新設定', content: '', category, isActive: true, insertionOrder: 100, selective: false, secondaryKeys: [] }, ...prev]);
    return newId;
  };

  const handleAddNpc = () => {
    const newId = Date.now();
    // 身分欄位一律寫在下面的設定集條目（唯一來源），這裡只建執行狀態
    const newNpc: Npc = {
      id: newId, name: '新角色', affection: 0, relationship: '',
      location: '', lastSeenLocation: '',
      category: 'NPC', isActive: true, isPinned: false, memories: [], thoughts: [],
    };
    const newLore: LorebookEntry = {
      id: newId + 1, title: '新角色', category: 'NPC', content: '',
      isActive: true, insertionOrder: 100, selective: false, secondaryKeys: [], keywords: [],
      gender: '', race: '', age: '', job: '', appearance: '', personality: '', backstory: '', other: '',
      // 主場地點預設為玩家當前所在地。留空的話這個角色永遠進不了 Phase 1 候選名單，
      // 而 homeLocation 在 UI 裡沒有任何編輯入口（只有 AI 的 NPC_HOME 寫得到），
      // 玩家等於做出一個 GM 永遠讀不到設定的角色
      homeLocation: currentLocation, roamLocations: [],
    };
    setNpcs(prev => [newNpc, ...prev]);
    setLorebookEntries(prev => [newLore, ...prev]);
    setSelectedNpc(newNpc);
  };

  // NPC 勢力歸屬的唯一寫入點。故事集的成員勾選與 NPC 卡的下拉選單都走這裡，
  // 兩邊寫同一個欄位（Npc.factionIds），promptBuilder 也只讀它。
  const handleSetNpcFactions = (npcId: number, factionIds: number[]) => {
    setNpcs(prev => prev.map(n =>
      n.id === npcId ? { ...n, factionIds: [...new Set(factionIds)] } : n
    ));
  };

  // 左欄顯示的「冒險摘要」＝ summaryPool 的最後一則。
  // 這是**衍生值**不是另一份 state——先前它是獨立的 adventureLog，同一份摘要
  // 存兩個地方，改了左欄 AI 讀到的還是舊的（schema v8 已移除）。
  const latestSummary = summaryPool.length > 0 ? summaryPool[summaryPool.length - 1] : '';

  /**
   * 手動改寫摘要。改的就是 AI 會讀到的那一則（`[前情提要]` 的最後一項），
   * 因為現在只有一份。
   *
   * ⚠️ 助理 GM 每 3 回合會再往池子裡追加一則，屆時這次的修改會被推到
   * 倒數第二位、左欄顯示新的那則——這是預期行為（玩家選擇「手改是臨時的」）。
   * 修改仍留在池子裡，AI 讀得到，只是不再是最新那則。
   */
  const handleEditSummary = (next: string) => {
    setSummaryPool(prev => {
      if (prev.length === 0) return next ? [next] : [];
      // 清空內容視為刪掉這一則，而不是留一個空字串在 prompt 裡
      if (!next) return prev.slice(0, -1);
      return [...prev.slice(0, -1), next];
    });
  };

  // 任務面板與 QuestModal 共用的排序與剩餘天數。待回報排最前——那是等著
  // 玩家去交差的，最需要被看到。
  const questsForPanel = [
    ...quests.filter(q => q.status === 'active' && q.isGoalMet),
    ...quests.filter(q => q.status === 'active' && !q.isGoalMet),
    ...quests.filter(q => q.status === 'completed'),
    ...quests.filter(q => q.status === 'failed'),
  ];

  const questRemaining = (q: Quest): string | null => {
    if (q.deadline == null) return null;
    const totalDays = timeState.year * 360 + (timeState.month - 1) * 30 + timeState.day;
    const left = q.deadline - (totalDays - q.createdAtTotalDays);
    return left > 0 ? `${left} 天` : '0 天';
  };

  /**
   * 手動回報任務完成——AI 漏掉 `QUEST_COMPLETE` 時的人工出口。
   *
   * 短 ID 讓 AI 更容易指對任務，但它**沒有輸出指令**時仍然無解：任務會永遠
   * 掛在「進行中」，玩家先前完全沒有辦法自己收掉。
   *
   * 獎勵照發（與 `QUEST_COMPLETE` 一致）——玩家會按這個鈕就是因為劇情上已經
   * 交差了，只是 AI 沒記錄。少發獎勵等於讓玩家為 AI 的疏漏買單。
   */
  const handleCompleteQuest = (quest: Quest) => {
    const gameDate = `${timeState.month}/${timeState.day}`;
    setQuests(prev => prev.map(q =>
      q.id === quest.id ? { ...q, status: 'completed' as const, isGoalMet: true, completedAt: gameDate } : q
    ));

    const gold = quest.reward?.gold ?? 0;
    if (gold > 0) setProfile(prev => ({ ...prev, gold: prev.gold + gold }));

    const rewardItems = quest.reward?.items ?? [];
    if (rewardItems.length > 0) {
      setItemCatalog(prevCatalog => {
        let catalog = prevCatalog;
        for (const raw of rewardItems) {
          catalog = registerItemDef(catalog, normalizeItemName(raw), '完成任務獲得的獎勵', gameDate).catalog;
        }
        return catalog;
      });
      setItems(prev => {
        let next = [...prev];
        for (const raw of rewardItems) {
          const name = normalizeItemName(raw);
          const idx = next.findIndex(i => i.name === name);
          if (idx !== -1) next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
          else next = [...next, { id: Date.now() + Math.floor(Math.random() * 1000), name, quantity: 1 }];
        }
        return next;
      });
    }

    const rewardText = [gold > 0 ? `${gold} 金幣` : '', ...rewardItems].filter(Boolean).join('、');
    showToast(rewardText ? `✅ ${quest.title}（獎勵：${rewardText}）` : `✅ ${quest.title} 已完成`);
  };

  /** 手動放棄任務。走 failed 而非直接刪除——放棄過什麼也是玩家的紀錄 */
  const handleAbandonQuest = (quest: Quest) => {
    setDialogRequest({
      title: '放棄任務',
      message: `確定放棄「${quest.title}」嗎？任務會移到失敗清單，獎勵不會發放。`,
      confirmLabel: '放棄',
      danger: true,
      onConfirm: () => {
        setQuests(prev => prev.map(q =>
          q.id === quest.id ? { ...q, status: 'failed' as const } : q
        ));
        showToast(`已放棄「${quest.title}」`);
      },
    });
  };

  // 主題切換的唯一入口：套用到 <html> 並寫回 localStorage。
  // 不進遊戲存檔——那是這台裝置的閱讀偏好，不是世界狀態（見 utils/theme.ts）
  const handleSetTheme = (next: ThemeId) => {
    setThemeState(next);
    applyTheme(next);
    saveTheme(next);
  };

  // 勢力關係的唯一寫入點。與 AI 的 FACTION_RELATION 指令共用 utils/factionRelation，
  // 兩邊才不會出現「AI 設的是雙向、玩家設的是單向」這種分歧。
  // 傳 null 代表解除關係（兩邊一起清，不留單向殘骸）。
  const handleSetFactionRelation = (
    aId: number,
    bId: number,
    type: FactionRelation['type'] | null,
    note?: string,
  ) => {
    setFactions(prev => type === null
      ? removeFactionRelation(prev, aId, bId)
      : setFactionRelation(prev, aId, bId, type, note));
  };

  // ─── NPC 批次匯入 ────────────────────────────────────────────────────────────
  // 比照 NPC_NEW：同時建立 npcs[]（好感度／記憶庫／釘選）與設定集條目（注入 prompt），
  // 只建一份的話角色會開不了記憶庫、或根本不進 prompt。同名先寫先贏。
  const handleImportNpcs = (rawJson: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      showToast('❌ 檔案不是有效的 JSON');
      return;
    }

    const { npcs: incoming, factions: incomingFactions, errors } = parseNpcImport(parsed);
    if (incoming.length === 0 && incomingFactions.length === 0) {
      showToast(`❌ 沒有可匯入的角色${errors[0] ? `：${errors[0]}` : ''}`);
      return;
    }

    // 先合勢力再合角色：角色的勢力是用**名稱**解析的，勢力得先存在才對得上，
    // 否則檔案裡明明帶了勢力定義，角色仍會被判成「查無勢力」而失去歸屬
    const fResult = mergeImportedFactions(
      incomingFactions,
      factionsRef.current,
      lorebookEntriesRef.current,
    );

    const result = mergeImportedNpcs(
      incoming,
      npcsRef.current,
      lorebookEntriesRef.current,
      `${timeState.month}/${timeState.day}`,
      fResult.factions,
    );

    if (result.addedNames.length === 0 && fResult.addedNames.length === 0) {
      showToast(`⚠️ ${result.skippedNames.length} 位角色已存在，未匯入`);
      return;
    }

    if (fResult.addedNames.length > 0) setFactions(fResult.factions);
    if (result.addedNames.length > 0) {
      setNpcs(result.npcs);
      setLorebookEntries(result.lorebookEntries);
    }

    const parts: string[] = [];
    if (result.addedNames.length > 0) parts.push(`✅ 匯入 ${result.addedNames.length} 位角色`);
    if (fResult.addedNames.length > 0) parts.push(`新增 ${fResult.addedNames.length} 個勢力`);
    if (result.skippedNames.length > 0) parts.push(`已存在 ${result.skippedNames.length} 位`);
    if (result.unknownFactions.length > 0) parts.push(`查無勢力「${result.unknownFactions.join('、')}」`);
    if (fResult.unresolvedRelations.length > 0) parts.push(`${fResult.unresolvedRelations.length} 條勢力關係對不到對象`);
    if (errors.length > 0) parts.push(`${errors.length} 筆格式有誤`);
    showToast(parts.join('，'));
    if (errors.length > 0) console.warn('[NPC 匯入] 略過的資料：', errors);
    if (fResult.unresolvedRelations.length > 0) {
      console.warn('[NPC 匯入] 對不到對象的勢力關係：', fResult.unresolvedRelations);
    }

    // 匯入只寫進 state，雲端要等下一次 AI 回應的自動存檔才會同步——
    // 中間關掉分頁就整批白匯了。這裡主動送一次存檔
    requestPersist();
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

  // ─── 手動編輯的存檔提交（Modal 的「儲存」按鈕）─────────────────────────────
  //
  // 過去個人資訊／設定集／NPC／System Prompt 的編輯只寫進 React state，雲端要等到
  // 下一次 AI 回應才會被寫入——關掉分頁就整份消失，而「儲存」按鈕還會顯示成功訊息。
  //
  // 這裡刻意用 token + effect 而不是直接呼叫 saveToCloud：呼叫端通常在同一個事件裡
  // 剛做完 setState，同步組快照會讀到舊值（與 handleImportSave 踩過的是同一個坑）。
  // 遞增 token 會與那些 setState 一起批次處理，effect 在 commit 後才跑，
  // 此時 buildSaveSnapshotRef.current 已指向持有最新 state 的版本。
  const [persistToken, setPersistToken] = useState(0);
  const requestPersist = useCallback(() => setPersistToken(t => t + 1), []);

  useEffect(() => {
    if (persistToken === 0 || !authUser) return;
    const snapshot = buildSaveSnapshotRef.current();
    // 這不是規則想抓的 cascading render：setState 只是把「上傳中」旗標打開，
    // 目的就是讓 UI 立刻顯示存檔指示器，之後由 .finally 關掉。
    // 它不會再導出別的 setState，不構成連鎖重繪。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsCloudSaving(true);
    saveToCloud(authUser.id, currentSlotName, snapshot)
      .then(ok => {
        if (ok) {
          const now = new Date();
          localStorage.setItem('rpworld_last_saved', now.toISOString());
          setLastSavedAt(now);
          showToast('✅ 已儲存');
        } else {
          showToast('☁️ 儲存失敗，請檢查網路連線');
        }
      })
      .finally(() => setIsCloudSaving(false));
  }, [persistToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 每次 AI 回應結束後自動存檔 ─────────────────────────────────────────────
  // 「上次儲存」時間只在雲端寫入成功後更新，失敗時 toast 提醒，避免玩家誤以為已存檔
  useEffect(() => {
    if (!isLoading && !isUpdatingLog && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant') {
      if (!authUser) return;
      const snapshot = buildSaveSnapshot();
      // 同上：非連鎖重繪，只是打開「上傳中」旗標
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsCloudSaving(true);
      saveToCloud(authUser.id, currentSlotName, snapshot)
        .then(ok => {
          if (ok) {
            const now = new Date();
            localStorage.setItem('rpworld_last_saved', now.toISOString());
            setLastSavedAt(now);
          } else {
            showToast('☁️ 雲端存檔失敗，請檢查網路連線');
          }
        })
        .finally(() => setIsCloudSaving(false));
    }
  }, [isLoading, isUpdatingLog]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 存檔匯出 ────────────────────────────────────────────────────────────────
  const handleExportSave = () => {
    // 匯出當前畫面狀態，不從雲端重讀。
    // 雲端只在「AI 回應之後」才寫入，而個人資訊／設定集／NPC 等手動編輯是直接進
    // state 的——從雲端重讀會漏掉所有尚未同步的編輯，玩家會拿到一份缺資料的檔案
    // （最典型：剛填完個人資訊就匯出，檔案裡的 profile 是空的）。
    const raw = buildSaveSnapshot();

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
        // ⚠️ 這裡不能用 buildSaveSnapshot()：它讀的是閉包捕獲的 state，
        // 而 loadFromData 的 setState 要到下次 render 才生效——會把「匯入前」
        // 的舊狀態上傳，等於用舊資料覆蓋雲端槽，玩家重整後匯入的內容就消失。
        // 改用 saveDataMapper(parsed)：它是純函數，回傳的正是剛寫進 state 的同一份資料。
        const snapshot = saveDataMapper(parsed);
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
  //
  // 重置＝把目前這一槽的進度清回全新遊戲，**不刪存檔槽**。
  // 舊版是「deleteCloudSave + reload」，但 reload 後的初始化（見上面的雲端載入
  // effect）會去讀「最新的一槽」——玩家只要還有第二個存檔槽就會被直接載入，
  // 結果是刪掉一個檔、然後掉進另一份舊進度，遊戲從頭到尾沒被重置。
  const handleResetGame = () => {
    setDialogRequest({
      title: '重置遊戲',
      message: `確定要重置「${currentSlotName}」嗎？對話、道具、任務、日記、好感度與時間地點都會回到全新遊戲；世界觀設定、設定集與角色設定會保留，其他存檔槽不受影響。`,
      confirmLabel: '重置',
      danger: true,
      onConfirm: async () => {
        // 串流中重置的話，回應寫回來會落在新遊戲的訊息串上
        abortAI();
        setLastInput('');
        // resetGame 回傳的正是剛寫進 state 的那份資料。這裡不能用 buildSaveSnapshot()：
        // 它讀的是閉包捕獲的舊 state，會把重置前的進度原封不動再傳回雲端（同 handleImportSave 的坑）
        const fresh = resetGame();
        setIsSettingsModalOpen(false);
        if (!authUser) return;
        setIsCloudSaving(true);
        const ok = await saveToCloud(authUser.id, currentSlotName, fresh);
        setIsCloudSaving(false);
        if (ok) {
          const now = new Date();
          localStorage.setItem('rpworld_last_saved', now.toISOString());
          setLastSavedAt(now);
          showToast('遊戲已重置');
        } else {
          showToast('遊戲已重置（雲端同步失敗）');
        }
      },
    });
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

  const handleDeleteSlot = (slotName: string) => {
    if (!authUser) return;
    setDialogRequest({
      title: '刪除存檔槽',
      message: `確定要刪除「${slotName}」？此動作無法復原。`,
      confirmLabel: '刪除',
      danger: true,
      onConfirm: async () => {
        const ok = await deleteCloudSave(authUser.id, slotName);
        if (ok) {
          setCloudSaves(prev => prev.filter(s => s.slot_name !== slotName));
          if (slotName === currentSlotName) setCurrentSlotName('存檔一');
          showToast(`已刪除「${slotName}」`);
        }
      },
    });
  };

  const handleCreateSlot = () => {
    if (!authUser) return;
    setDialogRequest({
      title: '新增存檔槽',
      input: { placeholder: '新存檔槽名稱（最多 10 字）', maxLength: 10 },
      confirmLabel: '建立',
      onConfirm: async (value) => {
        const name = value?.trim();
        if (!name) return;
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
      },
    });
  };

  // selectedNpc 與 npcs 同步：NPC 資料更新後讓開啟中的 Modal 顯示最新內容。
  // 取代原本在 setNpcs updater 內呼叫 setSelectedNpc 的做法（updater 必須是純函數）
  // updater 在沒有變化時原樣回傳 prev，React 會直接 bail out，不會連鎖重繪；
  // 規則看不出這一點。要真正消掉它得把 selectedNpc 改存 id、由 npcs 現算，
  // 但 setSelectedNpc 的呼叫點散在多處（含尚未進 npcs 的「新角色」），
  // 在沒有組件層測試的情況下不值得動。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedNpc(prev => {
      if (!prev) return prev;
      const fresh = npcs.find(n => n.id === prev.id);
      return fresh && fresh !== prev ? fresh : prev;
    });
  }, [npcs]);

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
    setNpcs(prev => prev.map(n =>
      n.id === npcId ? { ...n, memories: [...(n.memories || []), newMem] } : n
    ));
  };

  const handleRemoveNpcMemory = (npcId: number, memId: string) => {
    setNpcs(prev => prev.map(n =>
      n.id === npcId ? { ...n, memories: n.memories.filter(m => m.id !== memId) } : n
    ));
  };

  const handleUpdateNpcMemory = (npcId: number, memId: string, updates: Partial<NpcMemory>) => {
    setNpcs(prev => prev.map(n =>
      n.id === npcId
        ? { ...n, memories: n.memories.map(m => m.id === memId ? { ...m, ...updates } : m) }
        : n
    ));
  };

  const handleClearNewMemories = (npcId: number) => {
    setNpcs(prev => prev.map(n =>
      n.id === npcId
        ? { ...n, memories: n.memories.map(m => m.isNew ? { ...m, isNew: false } : m) }
        : n
    ));
  };

  const handleUpdateNpcName = (npcId: number, name: string) => {
    setNpcs(prev => prev.map(n => n.id === npcId ? { ...n, name } : n));
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
    setNpcs(prevNpcs => prevNpcs.map(n =>
      n.id === npcId ? { ...n, isPinned: !n.isPinned } : n
    ));

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

    // 身分欄位不從 npc 複製——它們的唯一來源就是設定集條目本身（schema v10）。
    // 走到這裡代表這個角色還沒有條目，所以本來就沒有設定可搬；建一張空白的
    // 給玩家在角色卡上填。
    const newId = lorebookEntries.length > 0 ? Math.max(...lorebookEntries.map(e => e.id)) + 1 : 1;
    const newEntry: LorebookEntry = {
      id: newId,
      title: npc.name,
      category: 'NPC',
      isActive: true,
      content: '',
      homeLocation: currentLocation,
    };
    
    setLorebookEntries(prev => [newEntry, ...prev]);
    showToast(`已將 ${npc.name} 記下並加入設定集`);
  };

  // ─── Prompt 組裝 ─────────────────────────────────────────────────────────────
  // 回傳 { prompt, triggeredMemoryIds }：記憶觸發判定含機率擲骰，只能做一次，
  // 因此由 buildPrompt 一併回報實際觸發的記憶，供 tickMemoryCounters 使用
  const buildPromptWrapper = (userInput: string, currentMessages: Message[], locationOverride?: string, isPriority?: boolean): BuildPromptResult => {
    const deps: BuildPromptDeps = {
      profile, systemPrompt, npcs, appearingNpcs, lorebookEntries,
      memories, equipment, items, itemCatalog, quests, timeState, currentLocation,
      summaryPool, diaryEntries, statusEffects, factions, loreHints, scanKeywords, isMemoryTriggered,
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
    } catch {
      showToast('⚡ 行動生成失敗');
    } finally {
      setIsLoadingQuickOptions(false);
    }
  };

  const handleSendMessage = async (text: string, historyToUse?: Message[], locationOverride?: string) => {
    if (!text.trim() || isLoading) return;

    setLastInput(text);
    const currentIsPriority = isPriorityMode;
    if (isPriorityMode) setIsPriorityMode(false);
    const userMessage: Message = { id: Date.now(), role: 'user', text: text };
    const newMessages = historyToUse ? [...historyToUse, userMessage] : [...messages, userMessage];
    setMessages(newMessages);
    // 送出時不立即上傳雲端：AI 回應後的自動存檔（含本則玩家訊息）已涵蓋，上傳次數減半
    setAiRequestStatus('loading');

    let aiMessageId: number | null = null;
    let didError = false;
    try {
      if (!mainGMConfig.apiKey.trim()) {
        showToast('❌ 請先在系統設定輸入 API Key');
        setAiRequestStatus('idle');
        return;
      }
      const { prompt, triggeredMemoryIds } = buildPromptWrapper(text, historyToUse || messages, locationOverride, currentIsPriority);

      aiMessageId = Date.now() + 1;
      setMessages(prev => [...prev, { id: aiMessageId!, role: 'assistant', text: '' }]);

      // 使用 streaming 即時顯示敘事；偵測到 << 起停止追加，避免 <<COMMANDS>> 閃現。
      // [出場:] 標記在串流中同步遮蔽（含跨 chunk 的未閉合片段），最終文字仍以串流結束後的完整解析為準。
      // 串流文字推進 StreamingBubble（見該組件註解），messages 中的佔位訊息維持 text: ''，
      // 只有串流結束後才寫入最終敘事——串流期間 App 不重渲染。
      let streamedText = '';
      let commandsStarted = false;
      const fullText = await callAI(prompt, {
        role: 'main',
        onStreamStart: () => {
          // 重試時重置累積文字，避免前一次 attempt 的半截輸出重複疊加
          streamedText = '';
          commandsStarted = false;
          streamingBubbleRef.current?.setText('');
        },
        onChunk: (chunk) => {
          if (commandsStarted) return;
          streamedText += chunk;
          const cutIdx = streamedText.indexOf('<<');
          if (cutIdx !== -1) commandsStarted = true;
          let visible = cutIdx === -1 ? streamedText : streamedText.slice(0, cutIdx);
          // 用共用 pattern，避免第三份寫死的出場標記正則各自漂移
          visible = visible.replace(APPEAR_TAG_PATTERN, '');
          // 上面只吃到行尾；標籤還在陸續到達（同一行、尚未收到 ]）時整段先藏起來，
          // 免得殘缺的 [出場:芬 閃現一下。streamedText 保留完整累積值，不受影響
          const lastOpen = visible.lastIndexOf('[出場');
          if (lastOpen !== -1 && !visible.includes(']', lastOpen)) {
            visible = visible.slice(0, lastOpen);
          }
          streamingBubbleRef.current?.setText(visible);
        },
      });
      if (!fullText) {
        showToast('❌ AI 沒有回應，請檢查 API Key 或網路連線');
        if (aiMessageId !== null) setMessages(prev => prev.filter(m => m.id !== aiMessageId));
        setAiRequestStatus('idle');
        return;
      }

      // sceneLocation / sceneDate 是「本回應的指令套用之後」的值。
      // 不能改用閉包裡的 currentLocation / timeState——那停在玩家送出的那一刻，
      // 而 LOCATION / TIME 指令已經在上一行執行過了。AI 常在同一則回應裡
      // 一邊移動玩家一邊讓 NPC 出場（「你走進酒館，看到芬里爾」），
      // 用舊值會把出場 NPC 的足跡蓋成移動前的地點。
      const {
        narrative: parsedNarrative,
        newItems,
        location: sceneLocation,
        date: sceneDate,
      } = await parseAndExecuteCommands(fullText);
      const rawNarrative = parsedNarrative;

      // ── 助理 GM 接口：有新增道具時才觸發分類──────────
      // newItems 為本回合新增的道具名稱清單，updateAdventureState 會請助理 GM 分類
      // 解析所有 [出場:] 標記（matchAll），合併去重後更新 appearingNpcs
      // 防呆：AI 若重複輸出同一角色的 [出場:] 標記，前端只計一次
      const allAppearMatches = [...rawNarrative.matchAll(APPEAR_TAG_CAPTURE_PATTERN)];
      if (allAppearMatches.length > 0) {
        const allNames = allAppearMatches
          .flatMap(m => m[1].split(',').map((n: string) => n.trim()))
          .filter(Boolean);
        const uniqueNames = [...new Set(allNames)];
        // 空的 [出場:] 是 prompt 明訂的「現場無人」訊號，必須寫入才能讓上一場的
        // NPC 下台。舊版被 `uniqueNames.length > 0` 擋掉，結果 appearingNpcs 只增不減：
        // 該 NPC 的完整檔案會無視地點、每一輪繼續注入 prompt（buildPrompt 的 inScene
        // 判定先於地點過濾），等於跟著玩家跨城鎮，且此狀態會存進存檔。
        setAppearingNpcs(uniqueNames);
        // 足跡只在真的有人出場時更新。判定走共用的 isNpcOnStage
        // （updateNpcFootprints 內部），不要在這裡再寫一份前後包含的比對
        setNpcs(prev => updateNpcFootprints(prev, uniqueNames, sceneLocation, sceneDate));
      }
      // 完全沒有標記時不動 appearingNpcs：那是 AI 沒照規矩輸出，維持現狀比誤清安全
      const narrative = rawNarrative.replace(APPEAR_TAG_PATTERN, '').trim();

      setMessages(prev => prev.map(m =>
        m.id === aiMessageId ? { ...m, text: narrative } : m
      ));

      // ⚠️ 這裡先前還有一段 `narrative.includes(npc.name)` 的足跡更新：
      // 只要名字在敘事裡**被提到**就把「最後出現於」寫成當前地點。
      // 「你聽說芬里爾去了北境」會讓芬里爾被記成在這裡出現過，而那個欄位會
      // 注入 prompt（[Scene Lorebook] 的「最後出現於」），AI 於是拿到一個
      // 他從沒去過的地點。已移除——足跡只認 [出場:] 名單。

      // 使用 buildPrompt 當時的判定結果，不重跑 isMemoryTriggered——
      // 它含機率擲骰，重跑會讓「被計數的記憶」與「實際注入的記憶」是兩組不同的
      tickMemoryCounters(triggeredMemoryIds);

      // 觸發背景整理（Sub GM）
      // 關鍵事件：任務新增、地點移動、世界記憶寫入 → 強制跳過節流
      // 偵測字串必須跟著 COMMANDS v1 的 pipe 格式走。舊版只比對冒號格式
      // （'QUEST_ADD:' / '\nLOCATION:' / 'MEMORY_ADD:world'），而 promptBuilder 早已
      // 改教 AI 輸出 pipe，導致 hasKeyEvent 恆為 false、跳過節流的機制形同關閉。
      // 兩種格式都比對，舊存檔重跑時仍成立。
      const hasKeyEvent =
        /^QUEST_ADD[|:]/m.test(fullText) ||
        /^LOCATION[|:]/m.test(fullText) ||
        /^MEMORY_ADD\|type=world\b/m.test(fullText) ||
        /^MEMORY_ADD:world\b/m.test(fullText);
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

  // ─── 背包／消耗品操作（EquipmentList / ConsumableList 共用）─────────────────
  const handleEquipItem   = (item: EquipmentItem) => showToast(`裝備了 ${item.name}`);
  const handleUnequipItem = (item: EquipmentItem) => showToast(`卸下了 ${item.name}`);
  const handleDropEquipment = (item: EquipmentItem) => {
    setEquipment(prev => prev.filter(i => i.id !== item.id));
    showToast(`丟棄了 ${item.name}`);
  };
  const handleUseConsumable = (item: ItemEntry) => {
    consumeItem(item.name);
    handleSendMessage(`（我使用了 ${item.name}（${describeItem(itemCatalog, item.name)}））`);
  };
  const handleDropConsumable = (item: ItemEntry) => {
    setItems(prev => prev.filter(i => i.id !== item.id));
    showToast(`丟棄了 ${item.name}`);
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
  }, [isLoading, abortAI, setMessages]);

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

  // ─── 訊息卡片 callbacks ──────────────────────────────────────────────────────
  // 全部以 useCallback + 最新值 ref 穩定引用，讓 MessageCard 的 React.memo 生效；
  // callback 內一律讀 ref / functional update，不捕獲 render 當下的 state
  // 同樣在 commit 後才寫（理由見上方最新值 refs 的註解）。
  // 這支只被事件 callback 讀取，一定晚於 commit，時序不受影響。
  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  });

  const handleRegenerate = useCallback((msgId: number) => {
    const msgs = messagesRef.current;
    const msgIndex = msgs.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    let lastUserMsgIndex = -1;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastUserMsgIndex = i;
        break;
      }
    }

    if (lastUserMsgIndex === -1) return;

    const userMsgText = msgs[lastUserMsgIndex].text;
    const historyToUse = msgs.slice(0, lastUserMsgIndex);

    handleSendMessageRef.current(userMsgText, historyToUse);
  }, []);

  const handleMenuToggle = useCallback((msgId: number) => {
    setActiveMenuId(prev => prev === msgId ? null : msgId);
  }, []);

  const handleCopyMessage = useCallback((text: string) => {
    const fallbackCopy = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('已複製');
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast('已複製')).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
    setActiveMenuId(null);
  }, [showToast]);

  const handleEditMessage = useCallback((msgId: number, text: string) => {
    setEditingMessageId(msgId);
    setEditMessageText(text);
    setActiveMenuId(null);
  }, []);

  const handleEditCancel = useCallback(() => setEditingMessageId(null), []);

  // saveToCloud（useAuth）行為只依賴模組層的 supabase client，可安全排除於 deps
  const handleDeleteMessage = useCallback((msgId: number) => {
    const newMessages = messagesRef.current.filter(m => m.id !== msgId);
    setMessages(newMessages);
    if (authUser) {
      const snapshot = buildSaveSnapshotRef.current({ messages: newMessages });
      setIsCloudSaving(true);
      saveToCloud(authUser.id, currentSlotName, snapshot)
        .finally(() => setIsCloudSaving(false));
    }
    showToast('已刪除');
    setActiveMenuId(null);
  }, [authUser, currentSlotName, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEditSave = useCallback((msgId: number, newText: string) => {
    const newMessages = messagesRef.current.map(m => m.id === msgId ? { ...m, text: newText } : m);
    setMessages(newMessages);
    if (authUser) {
      const snapshot = buildSaveSnapshotRef.current({ messages: newMessages });
      setIsCloudSaving(true);
      saveToCloud(authUser.id, currentSlotName, snapshot)
        .finally(() => setIsCloudSaving(false));
    }
    setEditingMessageId(null);
    showToast('已更新');
  }, [authUser, currentSlotName, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

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
          {/* 色碼例外：Google 品牌色，識別規範要求原色呈現，不得跟著主題變 */}
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          使用 Google 登入
        </button>
        {authError && (
          <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-danger)' }}>
            登入失敗：{authError}
          </p>
        )}
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
      {/* 氛圍圖層（背景圖 + 天空漸層）。兩者都掛 class 是為了讓主題能關掉它們：
          羊皮紙是「在看電子書」的主題，深色夜空與背景照片會整片蓋過紙面，
          玩家看到的就不是紙而是原本的深色背景（見 index.css 的對應規則）。
          vignette 與光暈是走 --fx-* 變數的，主題把值設成 transparent 就消失了，
          但這兩層是 inline style，CSS 搆不到，所以才需要 class。 */}
      {/* Background image - fixed full screen */}
      <div className="rpg-bg-image fixed inset-0 pointer-events-none z-0" style={{ backgroundImage: `url('${backgroundImageUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      {/* Sky gradient overlay */}
      <div className="rpg-bg-sky fixed inset-0 pointer-events-none z-0" style={{ background: getSkyGradient(timeState.hour, timeState.weather), opacity: 0.55, transition: 'background 2s ease' }} />
      <div className="fixed inset-0 pointer-events-none z-0 rpg-vignette" />
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="rpg-orb absolute -top-16 -left-10 h-56 w-56"
          style={{ background: sceneMeta.sceneAccent, animationDelay: '0s' }}
        />
        <div
          className="rpg-orb absolute top-[18%] right-[8%] h-48 w-48"
          style={{ background: sceneMeta.sceneAccentSecondary, animationDelay: '1.8s' }}
        />
        <div
          className="rpg-orb absolute bottom-[14%] left-[32%] h-40 w-40"
          style={{ background: 'var(--fx-orb-sky)', animationDelay: '3.2s' }}
        />
      </div>
      {/* panel glass overlays removed — individual widgets handle their own glass */}

      {/* ── Mobile Nav Bar（手機專用）── */}
      {isMobile && (
        <div
          className="relative z-20 flex items-center px-3 shrink-0"
          style={{
            height: '46px',
            background: 'var(--glass-sidebar-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '0.5px solid var(--tint-line)',
          }}
        >
          {/* 左側：☰ 開啟左抽屜 */}
          <button
            onClick={() => { setMobileLeftOpen(prev => !prev); setMobileRightOpen(false); }}
            className="flex items-center justify-center shrink-0"
            style={{
              width: '34px', height: '34px', borderRadius: '8px',
              background: mobileLeftOpen ? 'color-mix(in srgb, var(--border-accent) 20%, transparent)' : 'var(--tint-surface)',
              border: `0.5px solid ${mobileLeftOpen ? 'color-mix(in srgb, var(--border-accent) 45%, transparent)' : 'var(--tint-line)'}`,
            }}
          >
            <MoreVertical className="w-4 h-4" style={{ color: mobileLeftOpen ? 'var(--border-accent)' : 'var(--text-title)' }} />
          </button>

          {/* 左側：任務日誌 */}
          <button
            onClick={() => { setIsQuestModalOpen(true); setMobileLeftOpen(false); }}
            className="flex items-center justify-center shrink-0 ml-1.5"
            style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--tint-surface)', border: '0.5px solid var(--tint-line)' }}
          >
            <BookOpen className="w-4 h-4" style={{ color: 'var(--text-title)' }} />
          </button>

          {/* 左側：日記 */}
          <button
            onClick={() => { setIsDiaryModalOpen(true); setHasNewDiary(false); setMobileLeftOpen(false); }}
            className="flex items-center justify-center shrink-0 relative ml-1.5"
            style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--tint-surface)', border: '0.5px solid var(--tint-line)' }}
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
              style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--tint-surface)', border: '0.5px solid var(--tint-line)' }}
            >
              <MapIcon className="w-4 h-4" style={{ color: 'var(--text-title)' }} />
            </button>
            {/* ⓘ 開啟右抽屜 */}
            <button
              onClick={() => { setMobileRightOpen(prev => !prev); setMobileLeftOpen(false); }}
              className="flex items-center justify-center shrink-0"
              style={{
                width: '34px', height: '34px', borderRadius: '8px',
                background: mobileRightOpen ? 'color-mix(in srgb, var(--border-accent) 20%, transparent)' : 'var(--tint-surface)',
                border: `0.5px solid ${mobileRightOpen ? 'color-mix(in srgb, var(--border-accent) 45%, transparent)' : 'var(--tint-line)'}`,
              }}
            >
              <Brain className="w-4 h-4" style={{ color: mobileRightOpen ? 'var(--border-accent)' : 'var(--text-title)' }} />
            </button>
          </div>
        </div>
      )}


      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative z-10">

        {/* Left Panel（手機改用左抽屜，這裡直接不掛載，避免同時渲染兩套版面）*/}
        {!isMobile && (
        <div
          className="w-[260px] shrink-0 flex flex-col px-3 py-4 gap-3 overflow-y-auto"
          style={{ zIndex: 20 }}>

          <GoalsPanel
            currentGoals={currentGoals}
            summary={latestSummary}
            isUpdatingLog={isUpdatingLog}
            summaryCollapsed={summaryCollapsed}
            onToggleSummary={() => setSummaryCollapsed(prev => !prev)}
            onEditGoals={setCurrentGoals}
            onEditSummary={handleEditSummary}
          />

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
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--color-success)', color: 'var(--btn--text)' }}>
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
                <span className="absolute -top-1.5 -right-2 text-[0.625rem] font-bold px-1 min-w-[16px] text-center rounded-full" style={{ background: 'var(--tab-active)', color: 'var(--btn--text)', lineHeight: '16px' }}>
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
              {totalItemCount > 0 && (
                <span className="absolute -top-1.5 -right-2 text-[0.625rem] font-bold px-1 min-w-[16px] text-center rounded-full" style={{ background: 'var(--tab-active)', color: 'var(--btn--text)', lineHeight: '16px' }}>
                  {totalItemCount}
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
                className="fixed w-72 backdrop-blur-xl rounded-[8px] z-[110] flex flex-col overflow-hidden"
                style={{ maxHeight: '60vh', top: inventoryPanelPos.top, left: inventoryPanelPos.left, border: `1px solid var(--border-default)`, background: 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)' }}
              >
                <div className="sticky top-0 backdrop-blur-md p-3 flex justify-between items-center z-10" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 90%, transparent)', borderBottom: `1px solid var(--tint-line)` }}>
                  <h3 className="font-bold flex items-center text-sm" style={{ color: 'var(--bg-elevated)' }}><Package className="w-4 h-4 mr-2" /> 裝備清單</h3>
                  <button onClick={() => setIsInventoryOpen(false)} className="text-[var(--text-muted)] hover:bg-white/5 transition-colors p-1 rounded-full" style={{ color: 'var(--text-muted)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-3 space-y-2 overflow-y-auto custom-scrollbar flex-1">
                  <EquipmentList
                  itemCatalog={itemCatalog}
                    equipment={equipment}
                    selectedId={selectedInventoryItem}
                    onSelect={setSelectedInventoryItem}
                    onEquip={handleEquipItem}
                    onUnequip={handleUnequipItem}
                    onDrop={handleDropEquipment}
                  />
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
                className="fixed w-72 backdrop-blur-xl rounded-[8px] z-[110] flex flex-col overflow-hidden"
                style={{ maxHeight: '60vh', top: consumablesPanelPos.top, left: consumablesPanelPos.left, border: `1px solid var(--border-default)`, background: 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)' }}
              >
                <div className="sticky top-0 backdrop-blur-md p-3 flex justify-between items-center z-10" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 90%, transparent)', borderBottom: `1px solid var(--tint-line)` }}>
                  <h3 className="font-bold flex items-center text-sm" style={{ color: 'var(--bg-elevated)' }}><Beaker className="w-4 h-4 mr-2" /> 消耗品清單</h3>
                  <button onClick={() => setIsConsumablesOpen(false)} className="hover:bg-white/5 transition-colors p-1 rounded-full" style={{ color: 'var(--text-muted)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-3 space-y-2 overflow-y-auto custom-scrollbar flex-1">
                  <ConsumableList
                  itemCatalog={itemCatalog}
                    items={items}
                    selectedId={selectedConsumableItem}
                    onSelect={setSelectedConsumableItem}
                    onUse={handleUseConsumable}
                    onDrop={handleDropConsumable}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <PinnedNpcsWidget npcs={npcs} lorebookEntries={lorebookEntries} onSelectNpc={setSelectedNpc} />

          <div className="flex-1"></div>

          <QuickLinksGrid
            onOpenProfile={() => setIsProfileModalOpen(true)}
            onOpenLorebook={() => setIsLorebookModalOpen(true)}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onOpenSystemPrompt={() => setIsSystemPromptModalOpen(true)}
          />

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
        )}

        {/* Center Panel */}
        <div className="flex-1 flex flex-col relative">
          {/* Scene Bar（手機的地圖入口在 Mobile Nav Bar，這裡不掛載）*/}
          {!isMobile && (
          <div className="p-3 flex items-start justify-end gap-3 absolute top-0 w-full z-30">
            <div className="flex space-x-2">
              <button
                onClick={() => setIsMapOpen(true)}
                className="px-5 py-1.5 mr-3 rounded-[8px] text-base font-medium transition flex items-center"
                style={{
                  background: 'var(--bg-ui-card)',
                  color: 'var(--text-primary)',
                  border: `1px solid var(--tint-line-strong)`,
                  backdropFilter: 'blur(16px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(160%)',
                  boxShadow: 'var(--shadow-float)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--tint-surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-ui-card)')}
              >
                <MapIcon className="w-3.5 h-3.5 mr-1.5" />
                世界地圖
              </button>
            </div>
          </div>
          )}

          {/* Dialogue Area */}
          <div
            ref={chatScrollRef}
            className={`flex-1 overflow-y-auto p-6 pb-40 space-y-6 ${isMobile ? 'pt-36' : 'pt-20'}`}
            onScroll={(e) => {
              // 量測只在 DEV 進行：正式版不計時、不累積記錄、不觸發 console.warn
              if (import.meta.env.DEV) {
                const startTime = performance.now();
                if (e.currentTarget.scrollTop <= 4) handleLoadMore();
                performanceMonitor.recordScrollEvent(performance.now() - startTime, messages.length);
                return;
              }
              if (e.currentTarget.scrollTop <= 4) handleLoadMore();
            }}
          >
            {visibleMessages.map(msg => (
              // 串流中的佔位訊息（最後一則、assistant、text 仍為空）交給 StreamingBubble，
              // 由它自行持有串流文字，避免每個 chunk 重渲染整棵 App
              isLoading && msg.role === 'assistant' && msg.text === '' && msg.id === messages[messages.length - 1]?.id
              ? (
              <StreamingBubble
                key={msg.id}
                ref={streamingBubbleRef}
                renderMarkdown={renderMarkdown}
                cleanNarrative={cleanNarrative}
                scrollAnchorRef={messagesEndRef}
              />
              ) : (
              <MessageCard
                key={msg.id}
                msg={msg}
                playerName={profile.name}
                activeMenuId={activeMenuId}
                editingMessageId={editingMessageId}
                editMessageText={editMessageText}
                isLoading={isLoading}
                onRegenerate={handleRegenerate}
                onMenuToggle={handleMenuToggle}
                onCopy={handleCopyMessage}
                onEdit={handleEditMessage}
                onDelete={handleDeleteMessage}
                onEditChange={setEditMessageText}
                onEditCancel={handleEditCancel}
                onEditSave={handleEditSave}
                renderMarkdown={renderMarkdown}
                cleanNarrative={cleanNarrative}
              />
              )
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className={`absolute bottom-0 w-full z-30 flex justify-center px-4 pt-2 pb-2${isMobile ? ' mobile-input-safe' : ''}`}>
            <div className="w-full md:w-4/5 rounded-[8px] px-4 pt-2 pb-1 backdrop-blur-xl border border-[color:var(--tint-line)]" style={{ background: 'var(--glass-sidebar-bg)', boxShadow: 'var(--shadow-float)' }}>
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

                <ChatInput isLoading={isLoading} onSend={handleSendMessage} onAbort={abortAI} />
              </div>

              {/* D7：中斷 / 超時 / 錯誤 重試列 */}
              {(aiRequestStatus === 'aborted' || aiRequestStatus === 'timeout' || aiRequestStatus === 'error') && (
                <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>
                    {aiRequestStatus === 'aborted'  && '已中斷'}
                    {aiRequestStatus === 'timeout'  && '請求超時'}
                    {aiRequestStatus === 'error'    && '發生錯誤'}
                  </span>
                  {lastInput && (
                    <button
                      className="px-2 py-0.5 rounded text-xs transition"
                      style={{ background: 'var(--btn-primary)', color: 'var(--btn--text)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--btn-primary-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--btn-primary)')}
                      onClick={() => { setAiRequestStatus('idle'); handleSendMessage(lastInput); }}
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

        {/* Right Panel — 3 Independent Widgets（手機改用右抽屜，不掛載）*/}
        {!isMobile && (
        <div className="w-[260px] shrink-0 flex flex-col p-3 gap-3 overflow-y-auto z-10">

          <WorldMemoryWidget
            memories={memories}
            monthElegant={currentMonthData.elegant}
            monthDesc={currentMonthData.desc}
          />

          <SceneNpcsWidget
            npcs={npcs}
            appearingNpcs={appearingNpcs}
            lorebookEntries={lorebookEntries}
            onSelectNpc={setSelectedNpc}
          />

          <SceneMemoryWidget memories={memories} currentLocation={currentLocation} />

        </div>
        )}
      </div>

      {/* Quest Modal Overlay */}
      <QuestModal
        isOpen={isQuestModalOpen}
        onClose={() => setIsQuestModalOpen(false)}
        quests={quests}
        currentTotalDays={timeState.year * 360 + (timeState.month - 1) * 30 + timeState.day}
        onCompleteQuest={handleCompleteQuest}
        onAbandonQuest={handleAbandonQuest}
      />

      {/* Profile Modal Overlay */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        profile={profile}
        setProfile={setProfile}
        statusEffects={statusEffects}
        onSave={requestPersist}
      />

      {/* Diary Modal Overlay */}
      {isDiaryModalOpen && <Suspense fallback={null}>
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
      </Suspense>}

      {/* Lorebook Modal Overlay */}
      {isLorebookModalOpen && <Suspense fallback={null}>
      <LorebookModal
        isOpen={isLorebookModalOpen}
        onClose={() => setIsLorebookModalOpen(false)}
        lorebookEntries={lorebookEntries}
        npcs={npcs}
        onAddLorebook={handleAddLorebook}
        onAddNpc={handleAddNpc}
        onImportNpcs={handleImportNpcs}
        onSetNpcFactions={handleSetNpcFactions}
        onUpdateLorebook={handleUpdateLorebook}
        onDeleteLorebook={handleDeleteLorebook}
        onLorebookKeywordAdd={handleLorebookKeywordAdd}
        onLorebookKeywordRemove={handleLorebookKeywordRemove}
        onSelectNpc={setSelectedNpc}
        showToast={showToast}
        factions={factions}
        onAddFaction={addFaction}
        onUpdateFaction={updateFaction}
        onSetFactionRelation={handleSetFactionRelation}
        onSave={requestPersist}
      />
      </Suspense>}

      {/* NPC Modal Overlay */}
      {selectedNpc && <Suspense fallback={null}>
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
        factions={factions}
        onSetNpcFactions={handleSetNpcFactions}
        onSave={requestPersist}
      />
      </Suspense>}

      {/* System Prompt Modal Overlay */}
      <SystemPromptModal
        isOpen={isSystemPromptModalOpen}
        onClose={() => setIsSystemPromptModalOpen(false)}
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
        onSave={requestPersist}
      />

      {/* Settings Modal Overlay */}
      {isSettingsModalOpen && <Suspense fallback={null}>
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
        theme={theme}
        onSetTheme={handleSetTheme}
      />
      </Suspense>}

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
      {isMapOpen && <Suspense fallback={null}>
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
      </Suspense>}

      {/* 確認 / 輸入對話框（取代 window.confirm / window.prompt） */}
      <ConfirmDialog request={dialogRequest} onClose={() => setDialogRequest(null)} />

      {/* ── Quest Side Panel ── */}
      <AnimatePresence>
        {isQuestPanelOpen && (
          <motion.div
            ref={questPanelRef}
            initial={{ opacity: 0, x: -10, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed z-[110] flex flex-col overflow-hidden rounded-[8px]"
            style={{
              top: questPanelPos.top,
              left: questPanelPos.left,
              width: '340px',
              maxHeight: '70vh',
              background: 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)',
              border: '1px solid var(--border-default)',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--tint-line)' }}>
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
              {/* 卡片與 QuestModal 共用 QuestCard。
                  先前這裡是另一份自己寫的 JSX，而且欄位比 Modal 少——待回報的卡
                  連委託人都沒有、四種狀態全都沒有獎勵。玩家看到的資訊因此取決於
                  他從哪個入口打開，實際回報的「任務沒有寫委託人跟獎勵」就是這樣來的 */}
              {questsForPanel.map(q => (
                <QuestCard
                  key={q.id}
                  quest={q}
                  remaining={questRemaining(q)}
                  compact
                  onComplete={handleCompleteQuest}
                  onAbandon={handleAbandonQuest}
                />
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
              style={{ background: 'var(--bg-overlay)' }}
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
                background: 'var(--bg-glass-left)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderRight: '0.5px solid var(--tint-line)',
              }}
            >
              {/* Drawer Header */}
              <div
                className="flex items-center justify-between px-4 shrink-0"
                style={{
                  height: '56px',
                  paddingTop: 'env(safe-area-inset-top, 0px)',
                  borderBottom: '0.5px solid var(--tint-line)',
                }}
              >
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>選單</span>
                <button
                  onClick={() => setMobileLeftOpen(false)}
                  className="flex items-center justify-center"
                  style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--tint-surface)', border: '0.5px solid var(--tint-line)' }}
                >
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">

                <GoalsPanel
                  currentGoals={currentGoals}
                  summary={latestSummary}
                  isUpdatingLog={isUpdatingLog}
                  summaryCollapsed={summaryCollapsed}
                  onToggleSummary={() => setSummaryCollapsed(prev => !prev)}
                  onEditGoals={setCurrentGoals}
                  onEditSummary={handleEditSummary}
                />

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
                        <span className="absolute -top-1.5 -right-2 text-[0.625rem] font-bold px-1 min-w-[16px] text-center rounded-full" style={{ background: 'var(--tab-active)', color: 'var(--btn--text)', lineHeight: '16px' }}>
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
                          <EquipmentList
                  itemCatalog={itemCatalog}
                            equipment={equipment}
                            selectedId={selectedInventoryItem}
                            onSelect={setSelectedInventoryItem}
                            onEquip={handleEquipItem}
                            onUnequip={handleUnequipItem}
                            onDrop={handleDropEquipment}
                          />
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
                      {totalItemCount > 0 && (
                        <span className="absolute -top-1.5 -right-2 text-[0.625rem] font-bold px-1 min-w-[16px] text-center rounded-full" style={{ background: 'var(--tab-active)', color: 'var(--btn--text)', lineHeight: '16px' }}>
                          {totalItemCount}
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
                          <ConsumableList
                  itemCatalog={itemCatalog}
                            items={items}
                            selectedId={selectedConsumableItem}
                            onSelect={setSelectedConsumableItem}
                            onUse={handleUseConsumable}
                            onDrop={handleDropConsumable}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <PinnedNpcsWidget npcs={npcs} lorebookEntries={lorebookEntries} onSelectNpc={setSelectedNpc} />

                <QuickLinksGrid
                  onOpenProfile={() => setIsProfileModalOpen(true)}
                  onOpenLorebook={() => setIsLorebookModalOpen(true)}
                  onOpenSettings={() => setIsSettingsModalOpen(true)}
                  onOpenSystemPrompt={() => setIsSystemPromptModalOpen(true)}
                />

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
              style={{ background: 'var(--bg-overlay)' }}
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
                background: 'var(--bg-glass-right)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderLeft: '0.5px solid var(--tint-line)',
              }}
            >
              {/* Drawer Header */}
              <div
                className="flex items-center justify-between px-4 shrink-0"
                style={{
                  height: '56px',
                  paddingTop: 'env(safe-area-inset-top, 0px)',
                  borderBottom: '0.5px solid var(--tint-line)',
                }}
              >
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>資訊面板</span>
                <button
                  onClick={() => setMobileRightOpen(false)}
                  className="flex items-center justify-center"
                  style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--tint-surface)', border: '0.5px solid var(--tint-line)' }}
                >
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>

              {/* Drawer Body — 桌面右欄內容 */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

                <WorldMemoryWidget
                  memories={memories}
                  monthElegant={currentMonthData.elegant}
                  monthDesc={currentMonthData.desc}
                />

                <SceneNpcsWidget
                  npcs={npcs}
                  appearingNpcs={appearingNpcs}
                  lorebookEntries={lorebookEntries}
                  onSelectNpc={setSelectedNpc}
                />

                <SceneMemoryWidget memories={memories} currentLocation={currentLocation} />

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 backdrop-blur-md px-6 py-3 rounded-full shadow-[var(--shadow-float)] z-[100] flex items-center animate-in fade-in slide-in-from-top-4 duration-300" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)', border: `1px solid color-mix(in srgb, var(--bg-elevated) 10%, transparent)`, color: 'var(--text-title)' }}>
          <CheckSquare className="w-4 h-4 mr-2" style={{ color: 'var(--color-emerald)' }} />
          {toastMessage}
        </div>
      )}
    </div>
  );
}
