import {
  Profile, SystemPrompt, Npc, LorebookEntry, MemoryEntry,
  Message, EquipmentItem, ItemEntry, ItemCatalog, Quest, TimeState, DiaryEntry,
  StatusEffect, Faction,
} from '../types'
import { getTotalDaysFromTimeState, getQuestRemainingDays } from './timeUtils'
import { selectKnownItemNames, describeItem } from './itemCatalog'
import { relationText } from './affectionLabel'
import { resolveNpcProfile, npcIdentityBrief } from './npcProfile'
import { isNpcOnStage } from './npcPresence'
import { factionTypeLabel, factionRelationLabel } from './factionLabel'
import { COMMANDS_VERSION } from './commandParser'

export interface BuildPromptDeps {
  profile: Profile
  systemPrompt: SystemPrompt
  npcs: Npc[]
  appearingNpcs: string[]
  lorebookEntries: LorebookEntry[]
  memories: MemoryEntry[]
  equipment: EquipmentItem[]
  items: ItemEntry[]
  itemCatalog: ItemCatalog
  quests: Quest[]
  timeState: TimeState
  currentLocation: string
  /**
   * 助理 GM 產出的中期記憶池（每 3 回合一則，滿 10 則壓縮成一段）。
   *
   * 先前這個池子只流向日記、從不回到主 GM，於是「最近 20 則對話」與
   * 「日記（要壓縮 3 次≈90 回合才生成，且須關鍵字命中才注入）」之間整段是空的——
   * 那期間發生的事只要 AI 當時沒輸出 MEMORY_ADD，對它就等於沒發生過。
   */
  summaryPool: string[]
  /**
   * 助理 GM 上一輪挑出的「本輪可能相關」設定集條目 id。
   *
   * 為什麼需要這個：設定集的挑選原本純靠規則比對——`homeLocation === loc`、
   * `e.title === loc`、關鍵字 `includes`——只要字串差一個字就整條漏掉，
   * 而玩家完全看不出差別。助理 GM 做的是語意判斷，補得到規則漏掉的東西。
   *
   * ⚠️ 這是**聯集**，不是取代。規則仍是地板：助理沒回、回錯、或整趟呼叫失敗時，
   * 最壞情況只是回到純規則的行為，絕不會比原本少給資料。
   *
   * ⚠️ 慢一輪是刻意的。助理併在既有的 `updateAdventureState`（回應後才跑、
   * 不 await）裡順便挑，因此**不增加任何 API 呼叫、也不讓玩家多等**。
   * NPC 的兩階段注入本來就是慢一輪（`[出場:]` 出現後下一輪才注入完整資料），
   * 這與既有架構一致，不是新引入的行為。
   */
  loreHints?: number[]
  diaryEntries: DiaryEntry[]
  statusEffects: StatusEffect[]
  factions: Faction[]
  // 外部函式依賴
  scanKeywords: (keywords: string[], depth?: number) => boolean
  isMemoryTriggered: (mem: MemoryEntry, userInput: string, location: string) => boolean
}

export interface BuildPromptResult {
  prompt: string
  /**
   * 本回合實際觸發的記憶 id。
   *
   * `isMemoryTriggered` 內含機率擲骰（`trigger.probability`），呼叫兩次會得到兩組
   * 不同結果。因此觸發判定只在這裡做一次，呼叫端拿這份清單去更新 sticky / cooldown
   * 計數器，確保「注入 prompt 的記憶」與「被計數的記憶」永遠是同一組。
   */
  triggeredMemoryIds: string[]
}

export function buildPrompt(
  deps: BuildPromptDeps,
  userInput: string,
  currentMessages: Message[],
  locationOverride?: string,
  isPriority?: boolean,
): BuildPromptResult {
  const {
    profile, systemPrompt, npcs, appearingNpcs, lorebookEntries,
    memories, equipment, items, itemCatalog, quests, timeState, diaryEntries,
    statusEffects, factions, summaryPool, loreHints,
    scanKeywords, isMemoryTriggered,
  } = deps

  const loc = locationOverride ?? deps.currentLocation
  const SLIDING_WINDOW = 20

  // 取得 NPC 所屬勢力名稱字串
  const getNpcFactionText = (npcFactionIds?: number[]): string => {
    if (!npcFactionIds || npcFactionIds.length === 0) return ''
    const names = npcFactionIds
      .map(id => factions.find(f => f.id === id)?.name)
      .filter(Boolean)
    return names.length > 0 ? `｜勢力：${names.join(', ')}` : ''
  }

  const lorebookScanText = currentMessages.slice(-5).map(m => m.text).join(' ') + ' ' + userInput

  /**
   * 標題被提到＝一定查得到。
   *
   * Lorebook 的基本契約是「玩家提起時就查得到」，但先前只有關鍵字能觸發：
   * 條目只要設了關鍵字、而那些關鍵字沒命中，即使玩家指名道姓講出**標題**
   * 也拿不到資料。標題是最自然的觸發詞，玩家不該還要另外去把標題設成關鍵字。
   *
   * 單字標題不觸發——例如姓「王」會誤中「王國」「國王」。
   */
  const titleMentioned = (e: LorebookEntry): boolean =>
    !!e.title && e.title.length >= 2 && lorebookScanText.includes(e.title)

  const lorebookHitsKeywords = (e: any): boolean => {
    const keys: string[] = e.keywords || []
    const secKeys: string[] = e.secondaryKeys || []
    const selective: boolean = e.selective ?? false
    const text = lorebookScanText.toLowerCase()

    // 標題直接被提到時無條件放行，不再受關鍵字／次要關鍵字的門檻限制
    if (titleMentioned(e)) return true

    const primaryHit = keys.length === 0 || keys.some(k => text.includes(k.toLowerCase()))
    if (!primaryHit) return false
    if (selective && secKeys.length > 0) {
      return secKeys.some(k => text.includes(k.toLowerCase()))
    }
    return true
  }

  // Phase 1：依地點篩選候選 NPC（輕量名單）
  // 城鎮類（locationType === 'town'）上限 8，野外 / 建築 / 未設定 上限 3
  const currentLocEntry = lorebookEntries.find(
    e => e.category === '地點' && e.title === loc
  )
  const candidateLimit = currentLocEntry?.locationType === 'town' ? 8 : 3

  // ⚠️ 第三個來源（足跡）不可省略。`homeLocation` / `roamLocations` **在整個 UI 裡
  // 都沒有編輯入口**，只有 AI 的 NPC_HOME / NPC_LOCATION 指令寫得到；而 NPC_NEW
  // 建立設定集條目時也不寫 homeLocation。於是兩種角色永遠進不了候選名單：
  // 玩家自己在角色卡建立的、以及 AI 建檔後忘了補 NPC_HOME 的。
  //
  // 進不了候選名單 → 不出現在「當前場景可能出現的角色」→ AI 不知道有這個人 →
  // 不會輸出 [出場:名字] → 不在 appearingNpcs → 設定集條目過不了 inScene →
  // **GM 永遠讀不到這個角色的設定**。除非玩家剛好把他釘選了。
  //
  // 這裡用 `Npc.location`（出場時寫入的足跡）當第三個來源把鏈接回去。
  // 足跡對「候選名單＝誰可能在這裡」正是恰當語意——它不等於「誰現在在台上」，
  // 後者一律以 appearingNpcs 為準（見 utils/npcPresence.ts）
  const npcCandidates = lorebookEntries
    .filter(e => e.category === 'NPC' && e.isActive && (
      e.homeLocation === loc ||
      (e.roamLocations || []).includes(loc) ||
      npcs.some(n => n.name === e.title && n.location === loc)
    ))
    .sort((a, b) => {
      const score = (e: LorebookEntry) => {
        if (e.homeLocation === loc) return 0
        if (npcs.some(n => n.name === e.title && n.isPinned)) return 1
        return 2
      }
      return score(a) - score(b)
    })
    .slice(0, candidateLimit)

  // 相鄰地點清單（讓 AI 知道玩家可以去哪裡）
  const adjacentLocTitles = new Set(currentLocEntry?.adjacentTo ?? [])

  // 助理 GM 的挑選結果。設上限避免它一次把整本設定集倒進來把 prompt 撐爆；
  // 超出的部分丟棄，規則命中的條目不受影響（下方是聯集）
  const MAX_LORE_HINTS = 10
  const hintedLoreIds = new Set((loreHints ?? []).slice(0, MAX_LORE_HINTS))

  const relevantLorebook = lorebookEntries
    .filter(e => {
      // isActive 是玩家明確關掉的意思，助理提示不得凌駕
      if (!e.isActive) return false
      // 助理 GM 挑中的直接放行，繞過下方所有規則比對。
      // 這條是規則的**補集**——規則命中的照樣進來，見 BuildPromptDeps.loreHints
      if (hintedLoreIds.has(e.id)) return true
      if (e.category === 'NPC') {
        // Phase 2：出場 NPC、釘選 NPC、或「候選名單內」好感度 ≥ 60 的核心 NPC → 完整注入
        // 注意：高好感條件限定在 npcCandidates（當前場景）內，避免全體 NPC 掃描造成 prompt 膨脹
        const isInCandidates = npcCandidates.some(c => c.title === e.title)
        const npcData = isInCandidates ? npcs.find(n => n.name === e.title) : undefined
        const isHighAffectionCandidate = isInCandidates && (npcData?.affection ?? 0) >= 60

        const inScene =
          isNpcOnStage(e.title, appearingNpcs) ||
          npcs.some(n => n.isPinned && n.name === e.title) ||
          isHighAffectionCandidate
        if (!inScene) return false
        return lorebookHitsKeywords(e)
      }
      if (e.category === '地點') {
        // 當前地點：強制注入（不受關鍵字限制，AI 必須知道所在位置的完整資料）
        if (e.title === loc) return true
        // 相鄰地點：強制注入（讓 AI 知道玩家可以前往哪裡）
        if (adjacentLocTitles.has(e.title)) return true
        // 其他地點：不注入（避免 prompt 膨脹）
        return false
      }
      return lorebookHitsKeywords(e)
    })
    .sort((a, b) => (a.insertionOrder ?? 100) - (b.insertionOrder ?? 100))

  const triggeredMemories = memories.filter(m => isMemoryTriggered(m, userInput, loc))

  // 依重要度截斷；normal/flavor 按最新優先（id 含時間戳）
  const sortByNewest = (mems: MemoryEntry[]) =>
    [...mems].sort((a, b) => parseInt(b.id.split('_')[1] || '0') - parseInt(a.id.split('_')[1] || '0'))

  const filterByImportance = (mems: MemoryEntry[], maxNormal: number, maxFlavor: number) => {
    const critical = mems.filter(m => m.importance === 'critical')
    const normal = sortByNewest(mems.filter(m => m.importance === 'normal')).slice(0, maxNormal)
    const flavor = sortByNewest(mems.filter(m => m.importance === 'flavor')).slice(0, maxFlavor)
    return [...critical, ...normal, ...flavor]
  }

  const worldMems  = filterByImportance(triggeredMemories.filter(m => m.type === 'world'), 8, 3)
  const regionMems = filterByImportance(triggeredMemories.filter(m => m.type === 'region'), 5, 2)
  const sceneMems  = filterByImportance(triggeredMemories.filter(m => m.type === 'scene'), 5, 2)
  const relevantLorebookNpcTitles = new Set(
    relevantLorebook.filter(e => e.category === 'NPC').map(e => e.title)
  )

  /**
   * 被玩家（或最近對話）點名、但**不在場**的 NPC。
   *
   * NPC 條目的注入判定是 `if (!inScene) return false` 擋在關鍵字比對之前，
   * 所以「玩家講了那個名字」對 NPC 類完全不生效——其他類條目（歷史／物品／
   * 怪物）都靠關鍵字掃最近對話觸發，只有 NPC 拿不到這個待遇。玩家問
   * 「凱爾最近怎麼樣」時，GM 手上是零資料，只能現編一個出來。
   *
   * 助理 GM 的語意挑選補不了這個洞——它慢一輪，玩家問的當下它還沒挑到。
   *
   * ⚠️ 這批人**另開一段注入，絕不能併進 `[Scene Lorebook]`**。那段的語意是
   * 「現在在場的人」，把不在場的塞進去，AI 會直接讓他走進場景。
   */
  const MAX_MENTIONED = 5
  const relevantLorebookIds = new Set(relevantLorebook.map(e => e.id))
  const mentionedAbsent = lorebookEntries.filter(e => {
    if (!e.isActive) return false
    // 只收「有在場語意」的兩類：人與地點。歷史／物品／怪物被提到時，
    // lorebookHitsKeywords 已經讓它們正常進 [Scene Lorebook]，那裡沒有
    // 「在不在場」的問題
    if (e.category !== 'NPC' && e.category !== '地點') return false
    if (!titleMentioned(e)) return false
    if (relevantLorebookIds.has(e.id)) return false
    if (e.category === '地點') return e.title !== loc && !adjacentLocTitles.has(e.title)
    return !relevantLorebookNpcTitles.has(e.title)
      && !npcs.some(n => n.isPinned && n.name === e.title)
  }).slice(0, MAX_MENTIONED)

  /**
   * 相關勢力（含關係鏈）。
   *
   * 先前 `factions` 在整個 prompt 裡只用在一個地方——把勢力**名稱**接在 NPC
   * 行尾（`｜勢力：黑牙氏族`）。沒有任何 `[勢力]` 區塊，所以 AI 只拿得到一個
   * 名字：不知道那是什麼組織、據點在哪、跟誰敵對。關係鏈（`FactionRelation`）
   * 的資料結構與地圖星圖都做好了，卻**從來沒有送給模型**，在遊戲裡等於不存在。
   *
   * 挑選來源（取聯集後再擴一跳）：
   *   1. 已注入 prompt 的 NPC 所屬勢力——AI 正在寫這些人，得知道他們效忠誰
   *   2. 據點在當前地點的勢力——玩家人就站在他們的地盤上
   *   3. 名稱被提到的勢力（同 Lorebook 的「標題提及即可查詢」契約）
   *   4. **上述勢力的關係對象**：這就是「關係鏈」。只擴**一跳**——
   *      兩跳會把整張關係圖拖進來，而且對當下劇情幾乎沒有幫助
   */
  const MAX_FACTIONS = 6
  const activeFactions = factions.filter(f => f.isActive)
  const seedFactionIds = new Set<number>()

  // 1. 已注入的 NPC 所屬勢力
  for (const title of [...relevantLorebookNpcTitles, ...mentionedAbsent.map(e => e.title)]) {
    const npcData = npcs.find(n => n.name === title)
    for (const fid of npcData?.factionIds ?? []) seedFactionIds.add(fid)
  }
  for (const n of npcs) {
    if (n.isPinned) for (const fid of n.factionIds ?? []) seedFactionIds.add(fid)
  }
  // 2. 據點在當前地點
  for (const f of activeFactions) {
    if (f.homeId != null && f.homeId === currentLocEntry?.id) seedFactionIds.add(f.id)
  }
  // 3. 名稱被提到
  for (const f of activeFactions) {
    if (f.name.length >= 2 && lorebookScanText.includes(f.name)) seedFactionIds.add(f.id)
  }
  // 4. 關係鏈：再擴一跳
  const chainedFactionIds = new Set(seedFactionIds)
  for (const id of seedFactionIds) {
    const f = activeFactions.find(x => x.id === id)
    for (const rel of f?.relations ?? []) chainedFactionIds.add(rel.targetFactionId)
  }

  const relevantFactions = activeFactions
    .filter(f => chainedFactionIds.has(f.id))
    // 種子勢力排在延伸出來的關係對象之前
    .sort((a, b) => Number(seedFactionIds.has(b.id)) - Number(seedFactionIds.has(a.id)))
    .slice(0, MAX_FACTIONS)

  const pinnedNpcs = npcs.filter(
    n => n.isPinned && !relevantLorebookNpcTitles.has(n.name)
  )

  // 出場 NPC：全量（依重要度截斷）
  const appearingNpcMems = filterByImportance(
    triggeredMemories.filter(m => {
      if (m.type !== 'npc') return false
      return (m.tags?.npcs || []).some(n => appearingNpcs.includes(n))
    }), 5, 2
  )
  // 未出場但 pinned/高好感 NPC：只保留 critical，最多 2 條
  const specialNpcMems = triggeredMemories.filter(m => {
    if (m.type !== 'npc') return false
    if ((m.tags?.npcs || []).some(n => appearingNpcs.includes(n))) return false
    return (m.tags?.npcs || []).some(n =>
      npcs.some(npc => npc.name === n && (npc.isPinned || npc.affection >= 60))
    )
  }).filter(m => m.importance === 'critical').slice(0, 2)
  const npcMems = [...appearingNpcMems, ...specialNpcMems]

  // 降級策略：記憶總數超過 20 時，只保留 critical
  const totalMemCount = worldMems.length + regionMems.length + sceneMems.length + npcMems.length
  const [finalWorldMems, finalRegionMems, finalSceneMems, finalNpcMems] =
    totalMemCount > 20
      ? [worldMems, regionMems, sceneMems, npcMems].map(arr => arr.filter(m => m.importance === 'critical'))
      : [worldMems, regionMems, sceneMems, npcMems]

  const recentMessages = currentMessages.slice(-SLIDING_WINDOW)

  // systemPrompt 三段都是模板文字，內含 {{user}} 佔位符指代玩家。
  // 先前完全沒有替換步驟，模型收到的是字面上的「{{user}}」——它只能從
  // [Player] Name 反推是在講誰。預設文案裡還有一處誤植成 {{userr}}，
  // 所以這裡容忍 user 後面多餘的 r 與前後空白，一律換成玩家名字。
  const fillUser = (tpl: string): string =>
    tpl.replace(/\{\{\s*user+\s*\}\}/gi, profile.name || '玩家')

  // ── 區塊組裝 ────────────────────────────────────────────────────────────────
  // body 為空時整段省略，不留「（無）」佔位（Minimal Viable Context）。
  // 先前有 9 個區塊在沒內容時仍照送標題加「（無）」，每回合白燒 token，
  // 而且模型得先讀完標題才知道這裡沒東西。
  // ⚠️ 唯一保留「無內容」分支的是下方「當前場景可能出現的角色」——那句話是給 AI
  // 的指示（沒有已知角色時可自由創造），不是佔位符，刪掉 AI 會不敢生新角色。
  const section = (title: string, body: string): string =>
    body.trim() ? `${title}\n${body.trim()}` : ''

  const memLines = (mems: MemoryEntry[], tagKey?: 'factions' | 'locations' | 'npcs') =>
    mems.map(m => {
      const tags = tagKey ? m.tags?.[tagKey] : undefined
      return `- ${m.content}${tags?.length ? ` [${tags.join(',')}]` : ''}`
    }).join('\n')

  // ── 靜態前綴：逐回合幾乎不變的內容，一律排在最前面 ──────────────────────────
  // 這不只是分層整齊。Gemini 的 context caching 是「前綴」匹配——前面只要有一個
  // 字元變了，後面全部失去快取資格。COMMAND FORMAT 是整份 prompt 裡最大的一塊
  // 固定內容，先前卻排在 Recent Chat 之後：擺在最變動的內容後面，等於永遠不可能
  // 命中快取。
  // ⚠️ 調整此處順序前，請先確認模型對指令格式的遵循度沒有下降（尤其是每回應必須
  // 輸出的 TIME 與 [出場:] 標記）。
  const staticContext = `[System Context]
World Premise: ${fillUser(systemPrompt.worldPremise)}
Roleplay Rules: ${fillUser(systemPrompt.roleplayRules)}
Writing Style: ${fillUser(systemPrompt.writingStyle)}

---
[Player]
Name: ${profile.name} | Job: ${profile.job}
Appearance: ${profile.appearance}
Personality: ${profile.personality}${profile.other ? `\nOther: ${profile.other}` : ''}`

  const dynamicSections = [
    section('[Current State]', [
      `Location: ${loc}`,
      `Time: ${timeState.year}年${timeState.month}月${timeState.day}日 ${String(timeState.hour).padStart(2,'0')}:${String(timeState.minute).padStart(2,'0')} | Weather: ${timeState.weather}`,
      `HP: ${profile.hp} | MP: ${profile.mp} | Gold: ${profile.gold}`,
      statusEffects.length > 0
        ? `Status Effects: ${statusEffects.map(s => { const dur = s.duration === -1 ? '永久' : `${s.duration} 回合`; return `${s.emoji} ${s.name}（${dur}）`; }).join('、')}`
        : '',
    ].filter(Boolean).join('\n')),

    section('[Inventory]', [
      ...equipment.map(e => `- [裝備] ${e.name}${e.isEquipped ? '（裝備中）' : ''}: ${describeItem(itemCatalog, e.name)}`),
      ...(() => {
        if (items.length === 0) return [] as string[]
        const hasEffect = (desc: string) => /HP|MP|回復|治療|效果|使用後|傷害|攻擊|防禦|強化|解毒|能量/i.test(desc)
        // 超過 15 件時，只有最近新增的 5 件才保留完整說明
        const recentIds = [...items].sort((a, b) => b.id - a.id).slice(0, 5).map(i => i.id)
        const overLimit = items.length > 15
        return items.map(i => {
          const desc = describeItem(itemCatalog, i.name)
          const showFull = (i.quantity > 1 || hasEffect(desc)) && (!overLimit || recentIds.includes(i.id))
          return showFull ? `- ${i.name} x${i.quantity}: ${desc}` : `- ${i.name} x${i.quantity}`
        })
      })(),
    ].join('\n')),

    // 道具圖鑑切片：只注入名稱（定義存於圖鑑），引導 AI 沿用既有名稱避免同義新名
    section('[已知物品（僅列名稱，介紹已登錄於圖鑑）]', selectKnownItemNames(itemCatalog).join('、')),

    // 地圖尺度基準：COMMAND FORMAT 只給得起「月湖鎮=0,0」一個參考點（那段是靜態的，
    // 不能塞會變動的座標），模型於是照範例輸出 (2,-1) 這種小數字，新地點全疊在原點的月湖鎮上。
    // 這裡把實際座標攤開當尺規。放在動態區而非靜態前綴，否則每新增一個地點就讓 caching 整段失效。
    section('[已知地點座標（世界地圖尺規，新地點請落在同一量級且與既有地點相距 20 以上）]',
      lorebookEntries
        .filter(e => e.category === '地點' && e.mapX != null && e.mapY != null)
        .map(e => `${e.title}(${e.mapX},${e.mapY})`)
        .join('、')),

    section('[進行中任務]', (() => {
      const active = quests.filter(q => q.status === 'active')
      if (active.length === 0) return ''
      const currentTotalDays = getTotalDaysFromTimeState(timeState)
      return active.map(q => {
        const remainingDays = getQuestRemainingDays(q, currentTotalDays)
        const remaining = remainingDays != null ? `剩 ${remainingDays} 天` : '無期限'
        // 短 ID 擺在最前面：模型回報完成時引用這三碼，不必重打中文標題。
        // 舊存檔的任務沒有 shortId，那就不印——印個 `#undefined` 只會教壞模型
        const ref = q.shortId ? `#${q.shortId} ` : ''
        if (q.isGoalMet) {
          return `${ref}${q.title}（委託：${q.giver}，目標已達成，待玩家回報）`
        }
        return `${ref}${q.title}（委託：${q.giver}，${remaining}）`
      }).join('\n')
    })()),

    section('[🌍 World Memory]', memLines(finalWorldMems, 'factions')),
    section('[🗺️ Region Memory]', memLines(finalRegionMems, 'locations')),
    section(`[🏠 Scene Memory: ${loc}]`, memLines(finalSceneMems)),
    section('[👤 NPC Memory]', memLines(finalNpcMems, 'npcs')),

    // 不套 section()：沒有候選角色時那句話是給 AI 的指示，不是佔位符
    //
    // ⚠️ 名單必須帶性別。先前只給「名字（職業）」，而完整設定要等 AI 輸出
    // `[出場:名字]` 之後的下一輪才注入（Phase 2）——角色首次登場的那一回合，
    // 模型手上根本沒有性別，只能自己編。編錯就寫進對話歷史，之後即使拿到
    // 正確設定也會為了前後一致繼續錯下去，玩家看到的就是「設定寫女的，
    // 故事裡是男的」。性別與種族只多幾個字，遠比事後救回便宜。
    `[當前場景可能出現的角色]\n${npcCandidates.length > 0
      ? npcCandidates.map(e => {
          const brief = npcIdentityBrief(e)
          return brief ? `${e.title}（${brief}）` : e.title
        }).join('、') + '\n以上為可能在場的角色，非必須出場。若故事需要新角色請自由創造。'
      : '無已知角色在附近。若故事需要新角色請自由創造。'}`,

    section(
      '[Scene Lorebook]\n（NPC 的「對玩家」欄位是該角色看待玩家的當前立場，語氣、稱呼、肯不肯幫忙都要與它一致；敵對者不會親暱，摯友不會見外。）',
      relevantLorebook.map(e => {
  if (e.category === 'NPC') {
    const npcData = npcs.find(n => n.name === e.title)
    const thoughtsText = npcData?.thoughts && npcData.thoughts.length > 0
      ? `｜[近期想法] ${npcData.thoughts.map((t, i) => `${i + 1}.${t.text}`).join(' / ')}`
      : ''
    let memoriesText = ''
    if (npcData && npcData.affection >= 60 && npcData.memories && npcData.memories.length > 0) {
      const activeMemories = npcData.memories.filter(m => !m.isMerged)
      const toInject = [
        ...activeMemories.filter(m => m.importance === 'core'),
        ...activeMemories.filter(m => m.importance === 'normal' && m.source !== 'merged').slice(-5),
        ...activeMemories.filter(m => m.source === 'merged').slice(-2),
      ]
      if (toInject.length > 0) {
        memoriesText = `｜[記憶庫] ${toInject.map(m => `(${m.createdAt})${m.text}`).join(' / ')}`
      }
    }
    // 欄位一律走 resolveNpcProfile：身分設定的唯一來源是設定集條目。
    // 先前只讀 e.*，但角色卡顯示時是有 fallback 的——玩家看到「女」，
    // AI 拿到空字串，於是自己編一個性別出來
    const prof = resolveNpcProfile(e)
    const raceText = prof.race ? `｜種族：${prof.race}` : ''
    const ageText = prof.age ? `｜年齡：${prof.age}` : ''
    const backstoryText = (npcData?.affection ?? 0) >= 20 && prof.backstory ? `｜背景：${prof.backstory}` : ''
    const factionText = getNpcFactionText(npcData?.factionIds)
    // 對玩家的態度：這是 NPC 決定「怎麼對待玩家」的直接依據，先前整條漏掉——
    // 出場 NPC 只拿得到外貌／個性／背景／記憶，卻不知道自己對玩家是友好還是敵對。
    // 有明確關係時以 relationship 為準，沒有時退回好感度推導的標籤（見 affectionLabel.ts）
    const affectionText = npcData
      ? `｜對玩家：${relationText(npcData.relationship, npcData.affection)}（好感度 ${npcData.affection}）`
      : ''
    return `[NPC] ${e.title}｜性別：${prof.gender}${raceText}${ageText}｜職業：${prof.job}｜外貌：${prof.appearance}｜個性：${prof.personality}${backstoryText}${factionText}${affectionText}${thoughtsText}${memoriesText}`
  }
  return `[${e.category}] ${e.title}：${e.content}`
}).join('\n'),
    ),

    // ⚠️ 段落標題與那句「不在場」是給 AI 的**指示**，不是裝飾。少了它，
    // 模型會把這些人當成在場角色直接寫進場景——玩家只是提到名字，人並沒有來。
    section(
      '[提及的設定（不在當前場景，僅供查詢回答；除非玩家實際前往或去找，否則不要讓它出現在本場景）]',
      mentionedAbsent.map(e => {
        if (e.category !== 'NPC') {
          return `[${e.category}] ${e.title}：${e.content}`
        }
        const npcData = npcs.find(n => n.name === e.title)
        const prof = resolveNpcProfile(e)
        const where = npcData?.lastSeenLocation ? `｜最後出現於：${npcData.lastSeenLocation}` : ''
        const rel = npcData
          ? `｜對玩家：${relationText(npcData.relationship, npcData.affection)}（好感度 ${npcData.affection}）`
          : ''
        const brief = [prof.gender, prof.race, prof.job].filter(Boolean).join('・')
        return `[NPC] ${e.title}${brief ? `（${brief}）` : ''}｜外貌：${prof.appearance}｜個性：${prof.personality}${rel}${where}`
      }).join('\n'),
    ),

    section('[勢力]（關係決定它們如何看待彼此與玩家；敵對勢力的成員不會替對方說話）',
      relevantFactions.map(f => {
        const home = f.homeId != null
          ? lorebookEntries.find(e => e.id === f.homeId)?.title
          : undefined
        const homeText = home ? `｜據點：${home}` : ''
        const rels = (f.relations ?? [])
          .map(r => {
            const target = activeFactions.find(x => x.id === r.targetFactionId)
            if (!target) return ''
            return `${factionRelationLabel(r.type)}：${target.name}${r.note ? `（${r.note}）` : ''}`
          })
          .filter(Boolean)
        const relText = rels.length > 0 ? `｜關係：${rels.join('、')}` : ''
        return `- ${f.name}（${factionTypeLabel(f.type)}）${f.description ? `：${f.description}` : ''}${homeText}${relText}`
      }).join('\n'),
    ),

    section('[Pinned NPCs]', pinnedNpcs.map(n => {
  const thoughtsText = n.thoughts && n.thoughts.length > 0
    ? `｜[近期想法] ${n.thoughts.map((t, i) => `${i + 1}.${t.text}`).join(' / ')}`
    : ''
  return (() => {
    const lorePinned = lorebookEntries.find(e => e.category === 'NPC' && e.title === n.name)
    // 同 [Scene Lorebook]：設定集沒填時退回 Npc 那份，避免與角色卡顯示的不一致
    const profPinned = resolveNpcProfile(lorePinned)
    const genderPinned = profPinned.gender ? `${profPinned.gender}・` : ''
    const racePinned = profPinned.race ? `種族：${profPinned.race}｜` : ''
    const agePinned = profPinned.age ? `年齡：${profPinned.age}｜` : ''
    const jobPinned = profPinned.job
    const backstoryPinned = n.affection >= 20 && profPinned.backstory ? `｜背景：${profPinned.backstory}` : ''
    const factionPinned = getNpcFactionText(n.factionIds)
    // 原本只給裸數字，模型得自己猜 37 分算friendly還是冷淡；補上語意標籤與明確關係
    const relPinned = relationText(n.relationship, n.affection)
    // 兩者都沒有時整組括號省略，不要輸出「凱爾（）」——這一段收的是**沒有
    // 設定集條目**的釘選角色（有條目的會走 [Scene Lorebook]），身分欄位
    // schema v10 起只存在條目上，所以這裡拿到空值是正常情況而非異常
    const identPinned = `${genderPinned}${jobPinned}`
    const namePinned = identPinned ? `${n.name}（${identPinned}）` : n.name
    const lines: string[] = [`- ${namePinned}${racePinned}${agePinned}對玩家：${relPinned}（好感度 ${n.affection}）${backstoryPinned}${factionPinned}${thoughtsText}`]
    // 好感度 ≥ 60 且有記憶才注入
    if (n.affection >= 60 && n.memories && n.memories.length > 0) {
      const MAX_NORMAL = 5
      const MAX_MERGED = 2
      const MAX_CHARS = 300

      const activeMemories = n.memories.filter(m => !m.isMerged)
      const coreMemories = activeMemories.filter(m => m.importance === 'core')
      let normalMemories = activeMemories
        .filter(m => m.importance === 'normal' && m.source !== 'merged')
        .slice(-MAX_NORMAL)
      const mergedMemories = activeMemories
        .filter(m => m.source === 'merged')
        .slice(-MAX_MERGED)

      // 超出 300 字時縮減 normal 到 3 則
      const baseText = [...coreMemories, ...normalMemories, ...mergedMemories]
        .map(m => m.text).join('')
      if (baseText.length > MAX_CHARS) {
        normalMemories = normalMemories.slice(-3)
      }

      const allToInject = [...coreMemories, ...normalMemories, ...mergedMemories]
      if (allToInject.length > 0) {
        lines.push('  [記憶庫]')
        allToInject.forEach(m => {
          const tag = m.importance === 'core' ? ' [★]' : m.source === 'merged' ? ' [摘要]' : ''
          lines.push(`  - (${m.createdAt}) ${m.text}${tag}`)
        })
      }
    }
    return lines.join('\n')
  })()

}).join('\n')),

    section('[Active Diary]', diaryEntries
      .filter(e => e.isActive && scanKeywords(e.keywords || []))
      .map(e => {
        const kwLabel = e.keywords?.length > 0 ? ` [觸發詞: ${e.keywords.join(',')}]` : ''
        return `- ${e.text}${kwLabel}`
      }).join('\n')),

    section(
      '[前情提要（早於下方對話的經歷，已壓縮，依時間順序）]',
      summaryPool.map(s => `- ${s}`).join('\n'),
    ),
  ].filter(Boolean)

  const priorityBlock = isPriority
    ? `[⚠️ PRIORITY INSTRUCTION — 玩家明確要求，本回合必須優先採納，不可忽略或淡化]\n${userInput}`
    : ''

  const recentChatBlock = `[Recent Chat (最近${Math.min(SLIDING_WINDOW, recentMessages.length)}則)]\n${[
    ...recentMessages.map(m => `${m.role === 'user' ? 'Player' : 'DM'}: ${m.text}`),
    `Player: ${userInput}`,
  ].join('\n')}`

  const commandSpec = `[COMMAND FORMAT — COMMANDS ${COMMANDS_VERSION}]
數值或狀態有變化時，在回應最前面輸出指令區塊：
<<COMMANDS>>
COMMANDS ${COMMANDS_VERSION}
STAT|field=hp|delta=-15
STAT|field=mp|delta=+10
STAT|field=gold|delta=+200
AFFINITY|npc=角色名|delta=+10
LOCATION|name=新地點名稱
TIME|delta=+1h
ITEM_ADD|name=道具名|qty=1|desc=說明（外觀與效果）
ITEM_REMOVE|name=道具名|qty=1
ITEM_USE|name=道具名
QUEST_ADD|title=任務名|giver=委託人|desc=目標描述|gold=100|items=物品A,物品B|deadline=7
QUEST_GOAL_MET|id=任務短ID
QUEST_COMPLETE|id=任務短ID
NPC_NEW|name=姓名|race=種族|gender=性別|age=年齡|job=職業|appearance=外貌|personality=個性|backstory=背景(選填)
NPC_HOME|name=姓名|loc=地點
NPC_LOCATION|npc=姓名|loc=地點
NPC_THOUGHT|npc=角色名|text=第一人稱內心想法
NPC_RELATIONSHIP|npc=角色名|rel=關係描述
LOCATION_DISCOVER|name=地點名稱|x=110|y=70|type=wilderness
MEMORY_ADD|type=region|importance=normal|content=迷霧森林昨日大火|locations=迷霧森林|factions=黑牙氏族|keywords=大火,火災|sticky=3
MEMORY_ADD|type=scene|importance=normal|content=酒館因打架暫時關閉|locations=酒館
MEMORY_ADD|type=npc|importance=normal|content=芬里爾透露停火協議內容|npcs=芬里爾|keywords=停火,協議
MEMORY_ADD|type=world|importance=critical|content=魔王宣布向月湖鎮宣戰|keywords=魔王,宣戰
STATUS_ADD|emoji=☠️|name=中毒|duration=3
STATUS_ADD|emoji=🔥|name=燃燒|duration=-1
STATUS_REMOVE|name=中毒
STATUS_CLEAR
FACTION_NEW|name=勢力名|type=race/guild/nation/religion/criminal/other|desc=描述
FACTION_JOIN|faction=勢力名|npc=NPC名
FACTION_RELATION|a=勢力A|type=ally/enemy/neutral/vassal/rival|b=勢力B|note=備註(選填)
NPC_RELATION|npc=NPC名|type=family/ally/rival/enemy/acquaintance/romantic|target=目標名或PLAYER|note=備註(選填)
<</COMMANDS>>

敘事開頭輸出出場標記（非 COMMANDS 區塊，每回應必須）：
[出場:姓名1,姓名2]（從候選名單選誰實際在場；無人可輸出 [出場:]；可加候選外新角色）

【各指令觸發時機】
- TIME：每次回應必須輸出。依行動性質推進。
- ITEM_ADD：玩家獲得道具時。說明需詳細描述外觀與效果（玩家使用時 AI 依此生成劇情）。若道具已列於【已知物品】清單，name 必須沿用完全相同的名稱（勿創同義新名），desc 可省略（系統自動沿用圖鑑既有定義）。
- ITEM_USE：玩家主動使用道具時（前端扣數量）。ITEM_REMOVE：道具消耗/丟失。
- QUEST_ADD：NPC 正式委託或玩家接布告欄任務時。
  **giver 與 gold 必填**：giver 寫委託人姓名（布告欄、公會等無名委託寫來源名稱），
  gold 依任務難度給一個合理數字。這兩欄玩家在任務欄看得到，留空會顯示成「—」與「無」。
  items（額外的物品報酬）與 deadline（天數）沒有就省略該欄，不要填空值。
- QUEST_GOAL_MET：玩家已完成目標但未回報時靜默輸出（前端標記「待回報」）。
- QUEST_COMPLETE：玩家向委託人回報結案時。
- QUEST_GOAL_MET / QUEST_COMPLETE 的 id 必須**原樣抄寫**【進行中任務】清單裡該任務前面的短 ID（例如清單寫「#k3p 找回失竊的聖遺物」，就輸出 id=k3p）。
  不要自己造 ID，也不要改寫；引用清單上沒有的 ID 一律會被忽略。清單上沒有的任務代表它不存在或已結案，不要對它輸出這兩個指令。
- NPC_NEW：新角色首次出場時建檔（一次性）。NPC_HOME 同步輸出其主場地點。
- NPC_LOCATION：NPC 出現於非主場地點時記錄足跡。
- NPC_THOUGHT：NPC 有明顯情緒變化、做出重要決定、或對玩家產生新看法時，第一人稱。
- NPC_RELATIONSHIP：玩家與 NPC 初次確立明確關係，或關係發生重大轉變時輸出。
- LOCATION_DISCOVER：**只有常駐地點**才登錄——有正式名稱、玩家日後可再訪、在世界地圖上佔一個位置的（城鎮、村落、據點、地標、獨立建築）。
  路線上的過渡點、行進描述、某地的「外圍／邊緣／路上／附近」、建築內的個別房間，一律**不要**輸出這個指令，直接寫進敘事即可。
- LOCATION_DISCOVER 的 x/y 是**世界地圖絕對座標**，整數，月湖鎮=0,0，全圖範圍約 -150~150。
  下方 [已知地點座標] 列出現有地點的實際座標，請以它們為尺度基準，並與最接近的既有地點保持至少 20 的距離；不要輸出 -10~10 的小數字，那會全部疊在月湖鎮上。
- LOCATION_DISCOVER 的 type 必填，三選一：town（城鎮／聚落，可容納較多角色）、wilderness（野外）、building（單一建築）。
- STATUS_ADD：玩家獲得狀態異常（中毒、詛咒、祝福等）時。duration=-1 為永久。
- STATUS_REMOVE：玩家解除特定狀態異常時。
- STATUS_CLEAR：所有狀態異常一次清除時（例如神聖淨化）。
- 同名 STATUS_ADD 會覆蓋舊的（重置 duration）。
- FACTION_NEW：故事中首次明確提及某組織/種族群體時。
- FACTION_JOIN：NPC 被確認為某勢力成員時。
- FACTION_RELATION：兩勢力的關係首次確立或發生重大轉變時。
- NPC_RELATION：NPC 之間或與玩家的私人關係明確確立時。PLAYER 代表玩家。

【MEMORY_ADD 觸發情境（以下情況必須輸出）】
1. world/critical：影響整個世界的重大事件（魔王宣戰、天象異變）
2. region/normal：特定區域動態（森林大火、城鎮慶典）。回應中出現 [ ] 格式布告欄必定觸發。
3. scene/normal：當前地點物理或狀態改變（酒館被砸毀、橋樑斷裂）
4. npc/normal：NPC 透露的關鍵秘密、身世或重要決定
5. world/region/npc：玩家重大成就、關鍵選擇、NPC 關係重大突破

【字體標記（可選）】
[FONT:serif]...[/FONT] 信件/公告/正式文書（明朝體）
[FONT:spell]...[/FONT] 咒語/古文/神諭（書法體）

指令區塊在敘事之前。無數值變化則省略指令區塊。`

  // 靜態層（世界觀／玩家設定／指令規格）→ 動態層（狀態／記憶／設定集）→ 對話 → 動作指示。
  // filter(Boolean) 把空區塊與未啟用的 priorityBlock 一併濾掉。
  const prompt = [
    staticContext,
    commandSpec,
    '---',
    ...dynamicSections,
    priorityBlock,
    '---',
    recentChatBlock,
    'Please respond as the DM.',
  ].filter(Boolean).join('\n\n')

  // 回傳「通過觸發判定」的完整清單（截斷前）。呼叫端據此更新 sticky / cooldown，
  // 與舊有行為一致；差別只在於擲骰現在全程只做一次。
  return { prompt, triggeredMemoryIds: triggeredMemories.map(m => m.id) }
}
