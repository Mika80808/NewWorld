import {
  Profile, SystemPrompt, Npc, LorebookEntry, MemoryEntry,
  Message, EquipmentItem, ItemEntry, Quest, TimeState, DiaryEntry,
  StatusEffect,
} from '../types'
import { getTotalDaysFromTimeState, getQuestRemainingDays } from './timeUtils'
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
  quests: Quest[]
  timeState: TimeState
  currentLocation: string
  diaryEntries: DiaryEntry[]
  statusEffects: StatusEffect[]
  // 外部函式依賴
  scanKeywords: (keywords: string[], depth?: number) => boolean
  isMemoryTriggered: (mem: MemoryEntry, userInput: string, location: string) => boolean
}

export function buildPrompt(
  deps: BuildPromptDeps,
  userInput: string,
  currentMessages: Message[],
  locationOverride?: string,
  isPriority?: boolean,
): string {
  const {
    profile, systemPrompt, npcs, appearingNpcs, lorebookEntries,
    memories, equipment, items, quests, timeState, diaryEntries,
    statusEffects,
    scanKeywords, isMemoryTriggered,
  } = deps

  const loc = locationOverride ?? deps.currentLocation
  const SLIDING_WINDOW = 20

  const lorebookScanText = currentMessages.slice(-5).map(m => m.text).join(' ') + ' ' + userInput

  const lorebookHitsKeywords = (e: any): boolean => {
    const keys: string[] = e.keywords || []
    const secKeys: string[] = e.secondaryKeys || []
    const selective: boolean = e.selective ?? false
    const text = lorebookScanText.toLowerCase()

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

  const npcCandidates = lorebookEntries
    .filter(e => e.category === 'NPC' && e.isActive && (
      e.homeLocation === loc ||
      (e.roamLocations || []).includes(loc)
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

  const relevantLorebook = lorebookEntries
    .filter(e => {
      if (!e.isActive) return false
      if (e.category === 'NPC') {
        // Phase 2：出場 NPC、釘選 NPC、或「候選名單內」好感度 ≥ 60 的核心 NPC → 完整注入
        // 注意：高好感條件限定在 npcCandidates（當前場景）內，避免全體 NPC 掃描造成 prompt 膨脹
        const isInCandidates = npcCandidates.some(c => c.title === e.title)
        const npcData = isInCandidates ? npcs.find(n => n.name === e.title) : undefined
        const isHighAffectionCandidate = isInCandidates && (npcData?.affection ?? 0) >= 60

        const inScene =
          appearingNpcs.some(n => e.title.includes(n) || n.includes(e.title)) ||
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
Status Effects: ${statusEffects.length > 0 ? statusEffects.map(s => { const dur = s.duration === -1 ? '永久' : `${s.duration} 回合`; return `${s.emoji} ${s.name}（${dur}）`; }).join('、') : '（無）'}

[Inventory]
${equipment.length > 0 ? equipment.map(e => `- [裝備] ${e.name}${e.isEquipped ? '（裝備中）' : ''}: ${e.description}`).join('\n') : '（無裝備）'}
${(() => {
  if (items.length === 0) return ''
  const hasEffect = (desc: string) => /HP|MP|回復|治療|效果|使用後|傷害|攻擊|防禦|強化|解毒|能量/i.test(desc)
  // 超過 15 件時，只有最近新增的 5 件才保留完整說明
  const recentIds = [...items].sort((a, b) => b.id - a.id).slice(0, 5).map(i => i.id)
  const overLimit = items.length > 15
  return items.map(i => {
    const showFull = (i.quantity > 1 || hasEffect(i.description)) && (!overLimit || recentIds.includes(i.id))
    return showFull ? `- ${i.name} x${i.quantity}: ${i.description}` : `- ${i.name} x${i.quantity}`
  }).join('\n')
})()}

[進行中任務]
${(() => {
  const active = quests.filter(q => q.status === 'active')
  if (active.length === 0) return '（無）'
  const currentTotalDays = getTotalDaysFromTimeState(timeState)
  return active.map(q => {
    const remainingDays = getQuestRemainingDays(q, currentTotalDays)
    const remaining = remainingDays != null ? `剩 ${remainingDays} 天` : '無期限'
    if (q.isGoalMet) {
      return `${q.title}（委託：${q.giver}，目標已達成，待玩家回報）`
    }
    return `${q.title}（委託：${q.giver}，${remaining}）`
  }).join('\n')
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
    const raceText = e.race ? `｜種族：${e.race}` : (e.other ? `｜備註：${e.other}` : '')
    const ageText = e.age ? `｜年齡：${e.age}` : ''
    const backstoryText = (npcData?.affection ?? 0) >= 20 && e.backstory ? `｜背景：${e.backstory}` : ''
    return `[NPC] ${e.title}｜性別：${e.gender || ''}${raceText}${ageText}｜職業：${e.job || ''}｜外貌：${e.appearance || ''}｜個性：${e.personality || ''}${backstoryText}${thoughtsText}${memoriesText}`
  }
  return `[${e.category}] ${e.title}：${e.content}`
}).join('\n') || '（無）'}

[Pinned NPCs]
${pinnedNpcs.length > 0 ? pinnedNpcs.map(n => {
  const thoughtsText = n.thoughts && n.thoughts.length > 0
    ? `｜[近期想法] ${n.thoughts.map((t, i) => `${i + 1}.${t.text}`).join(' / ')}`
    : ''
  return (() => {
    const lorePinned = lorebookEntries.find(e => e.category === 'NPC' && e.title === n.name)
    const genderPinned = lorePinned?.gender ? `${lorePinned.gender}・` : ''
    const racePinned = lorePinned?.race ? `種族：${lorePinned.race}｜` : ''
    const agePinned = lorePinned?.age ? `年齡：${lorePinned.age}｜` : ''
    const jobPinned = lorePinned?.job ?? n.job ?? ''
    const backstoryPinned = n.affection >= 20 && lorePinned?.backstory ? `｜背景：${lorePinned.backstory}` : ''
    const lines: string[] = [`- ${n.name}（${genderPinned}${jobPinned}）${racePinned}${agePinned}好感度:${n.affection}${backstoryPinned}${thoughtsText}`]
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

}).join('\n') : '（無）'}

---
[Active Diary]
${(() => {
  const triggered = diaryEntries.filter(e => {
    if (!e.isActive) return false
    return scanKeywords(e.keywords || [])
  })
  return triggered.length > 0
    ? triggered.map(e => {
        const kwLabel = e.keywords?.length > 0 ? ` [觸發詞: ${e.keywords.join(',')}]` : ''
        return `- ${e.text}${kwLabel}`
      }).join('\n')
    : '（無）'
})()}

${isPriority ? `---
[⚠️ PRIORITY INSTRUCTION — 玩家明確要求，本回合必須優先採納，不可忽略或淡化]
${userInput}
---` : ''}
---
[Recent Chat (最近${Math.min(SLIDING_WINDOW, recentMessages.length)}則)]
${recentMessages.map(m => `${m.role === 'user' ? 'Player' : 'DM'}: ${m.text}`).join('\n')}
Player: ${userInput}

---
[COMMAND FORMAT — COMMANDS ${COMMANDS_VERSION}]
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
QUEST_GOAL_MET|title=任務名
QUEST_COMPLETE|title=任務名
NPC_NEW|name=姓名|race=種族|gender=性別|age=年齡|job=職業|appearance=外貌|personality=個性|backstory=背景(選填)
NPC_HOME|name=姓名|loc=地點
NPC_LOCATION|npc=姓名|loc=地點
NPC_THOUGHT|npc=角色名|text=第一人稱內心想法
NPC_RELATIONSHIP|npc=角色名|rel=關係描述
LOCATION_DISCOVER|name=地點名稱|x=0|y=0
MEMORY_ADD:region:normal:迷霧森林昨日大火:locations=迷霧森林:factions=黑牙氏族:keywords=大火,火災:sticky=3
MEMORY_ADD:scene:normal:酒館因打架暫時關閉:locations=酒館
MEMORY_ADD:npc:normal:芬里爾透露停火協議內容:npcs=芬里爾:keywords=停火,協議
MEMORY_ADD:world:critical:魔王宣布向月湖鎮宣戰:keywords=魔王,宣戰
STATUS_ADD|emoji=☠️|name=中毒|duration=3
STATUS_ADD|emoji=🔥|name=燃燒|duration=-1
STATUS_REMOVE|name=中毒
STATUS_CLEAR
<</COMMANDS>>

敘事開頭輸出出場標記（非 COMMANDS 區塊，每回應必須）：
[出場:姓名1,姓名2]（從候選名單選誰實際在場；無人可輸出 [出場:]；可加候選外新角色）

【各指令觸發時機】
- TIME：每次回應必須輸出。依行動性質推進。
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
- STATUS_ADD：玩家獲得狀態異常（中毒、詛咒、祝福等）時。duration=-1 為永久。
- STATUS_REMOVE：玩家解除特定狀態異常時。
- STATUS_CLEAR：所有狀態異常一次清除時（例如神聖淨化）。
- 同名 STATUS_ADD 會覆蓋舊的（重置 duration）。

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

Please respond as the DM.`
}
