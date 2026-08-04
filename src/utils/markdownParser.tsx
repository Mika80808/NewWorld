import React from 'react'

export const FONT_CLASS_MAP: Record<string, string> = {
  sans:  'font-game-sans',
  serif: 'font-game-serif',
  spell: 'font-game-spell',
}

// 顯示時清理殘留指令（AI 有時不包在 COMMANDS 區塊內）
//
// ⚠️ 這裡必須跟著 COMMANDS 版本走。舊版只列了 legacy 冒號格式，但 promptBuilder
// 早已改教 AI 輸出 pipe（`STAT|field=hp|delta=-10`），漏出來的指令會原封不動
// 顯示在玩家眼前。pipe 分支要求「已知指令名 + | + key=」，一般敘事不會誤中。
const CMD_NAMES = [
  'STAT', 'HP', 'MP', 'GOLD', 'AFFINITY', 'LOCATION', 'TIME',
  'ITEM_ADD', 'ITEM_REMOVE', 'ITEM_USE',
  'QUEST_ADD', 'QUEST_GOAL_MET', 'QUEST_COMPLETE',
  'NPC_NEW', 'NPC_HOME', 'NPC_LOCATION', 'NPC_THOUGHT',
  'NPC_RELATIONSHIP', 'NPC_RELATION',
  'LOCATION_DISCOVER', 'MEMORY_ADD',
  'STATUS_ADD', 'STATUS_REMOVE', 'STATUS_CLEAR',
  'FACTION_NEW', 'FACTION_JOIN', 'FACTION_RELATION',
].join('|')

export const BARE_CMD_PATTERN = new RegExp(
  '^(?:' +
    // COMMANDS 區塊殘骸（開閉標記沒配對成功時 parseCommandsToAST 不會吃掉）
    '<{1,2}\\/?COMMANDS>{0,2}' +
    '|COMMANDS\\s+v\\d+' +
    // v1 pipe 格式
    `|(?:${CMD_NAMES})\\|[A-Za-z_]+=.*` +
    // 無參數指令（pipe 格式下唯一一條）
    '|STATUS_CLEAR' +
    // legacy 冒號格式（維持原樣，不動既有行為）
    '|(?:<<)?(?:HP:[+-]\\d+|MP:[+-]\\d+|GOLD:[+-]\\d+|AFFINITY:.+:[+-]?\\d+|LOCATION:.+|TIME:\\+\\d+[hm]|ITEM_ADD:.+|ITEM_REMOVE:.+:\\d+|ITEM_USE:.+|NPC_NEW:.+|NPC_HOME:[^:]+:.+|NPC_LOCATION:[^:]+:.+|NPC_THOUGHT:[^:]+:.+|NPC_RELATIONSHIP:[^:]+:.+|QUEST_ADD:.+|QUEST_GOAL_MET:.+|QUEST_COMPLETE:.+|MEMORY_ADD:.+|LOCATION_DISCOVER:.+)(?:>>)?' +
  ')$'
)

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let lastIndex = 0
  let match
  let keyIdx = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const token = match[0]
    if (token.startsWith('`')) {
      parts.push(<span key={`${keyPrefix}-c${keyIdx++}`} className="font-medium" style={{ color: 'var(--color-rose)' }}>{token.slice(1, -1)}</span>)
    } else if (token.startsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-b${keyIdx++}`}>{token.slice(2, -2)}</strong>)
    } else {
      parts.push(<em key={`${keyPrefix}-i${keyIdx++}`} style={{ color: 'var(--text-dialog-muted)' }}>{token.slice(1, -1)}</em>)
    }
    lastIndex = match.index + token.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function renderLines(text: string): React.ReactNode {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // 引用區塊：連續 > 開頭行合併
    if (line.startsWith('>')) {
      const quoteLines: string[] = []
      const startI = i
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      result.push(
        <div key={`bq-${startI}`} className="border-l-2 pl-3 my-2 rounded-r-[8px] py-2 space-y-1" style={{ borderColor: 'var(--border-default)' }}>
          {quoteLines.map((ql, qi) => (
            <p key={qi} className="leading-relaxed text-sm" style={{ color: 'var(--text-body)' }}>{renderInline(ql, `bq-${startI}-${qi}`)}</p>
          ))}
        </div>
      )
      continue
    }
    // 分隔線
    if (line.trim() === '---') {
      result.push(<hr key={`hr-${i}`} className="my-3" style={{ borderColor: 'var(--bg-elevated)', opacity: 0.6 }} />)
      i++; continue
    }
    // 空行 → 間距
    if (line.trim() === '') {
      result.push(<div key={`sp-${i}`} className="h-2" />)
      i++; continue
    }
    // 普通段落
    result.push(<p key={`p-${i}`} className="leading-relaxed">{renderInline(line, `p-${i}`)}</p>)
    i++
  }
  return <>{result}</>
}

/**
 * 落單的 FONT 標記。
 *
 * fontRegex 要求 `[FONT:x]…[/FONT]` 成對，AI 漏寫收尾時整段不匹配，
 * `[FONT:serif]` 這幾個字就當正文印給玩家看。成對的在下方迴圈裡已被吃掉，
 * 所以此時還留在段落裡的必定是落單的，一律移除（內容照樣顯示，只是沒套字體）。
 */
const ORPHAN_FONT_PATTERN = /\[\/?FONT(?::(?:sans|serif|spell))?\]/g

/** 匯出供測試：renderMarkdown 回傳 ReactNode，純函數層測不到，故把這段抽出來 */
export function stripOrphanFontTags(text: string): string {
  return text.replace(ORPHAN_FONT_PATTERN, '')
}

export function renderMarkdown(text: string): React.ReactNode {
  // 切分 [FONT:xxx]...[/FONT] 區塊
  const fontRegex = /\[FONT:(sans|serif|spell)\]([\s\S]*?)\[\/FONT\]/g
  const segments: { text: string; font?: string }[] = []
  let lastIndex = 0
  let match
  while ((match = fontRegex.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ text: text.slice(lastIndex, match.index) })
    segments.push({ text: match[2], font: match[1] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex) })
  if (segments.length === 0) segments.push({ text })

  // 未配對的 FONT 標記只可能落在「沒有字體」的段落裡（有字體的段落是 match[2]，
  // 內容已被成對標記界定），故只清理這些段落
  for (const seg of segments) {
    if (!seg.font) seg.text = stripOrphanFontTags(seg.text)
  }

  return (
    <>
      {segments.map((seg, si) => {
        const fontClass = seg.font ? (FONT_CLASS_MAP[seg.font] ?? '') : ''
        const content = renderLines(seg.text)
        return fontClass
          ? <div key={si} className={fontClass}>{content}</div>
          : <React.Fragment key={si}>{content}</React.Fragment>
      })}
    </>
  )
}

// ── 敘事內的結構化標籤 ────────────────────────────────────────────────────────

/**
 * `[出場:名1,名2]` 出場標記。
 *
 * 容忍未閉合的寫法（`[出場:芬里爾` 後面沒有 `]`）：只吃到行尾為止，不跨行。
 * 舊版最終文字用的是嚴格的 `/\[出場:[^\]]*\]/g`，AI 漏寫 `]` 時標籤會殘留——
 * 而串流中的遮蔽邏輯有處理未閉合片段，於是同一個標籤「串流時被藏起來、
 * 寫入最終訊息時又冒出來」。兩邊現在共用這個 pattern。
 */
// m flag 不可少：`$` 沒有 m 時只匹配整個字串的結尾，未閉合標籤後面接換行就不匹配
export const APPEAR_TAG_PATTERN = /\[出場:?[^\]\n]*(?:\]|$)/gm

/** 帶擷取群組的版本，供讀取名單使用（未閉合時也讀得到已到齊的部分） */
export const APPEAR_TAG_CAPTURE_PATTERN = /\[出場:?([^\]\n]*)(?:\]|$)/gm

/**
 * 只有指示、沒有任何解析的死標籤。
 *
 * `[重要NPC]` 出自預設 systemPrompt 的 roleplayRules 第 8 條，但全專案沒有任何
 * 地方讀它——NPC 建檔早就由 `NPC_NEW` 指令負責了。預設值那句已移除，但
 * systemPrompt 存在存檔裡，舊存檔仍留著自己的副本，所以顯示層要擋。
 */
const DEAD_TAG_PATTERN = /\[重要NPC\]/g

/**
 * 顯示前清理敘事：濾掉漏出 COMMANDS 區塊的裸指令，並移除結構化標籤殘骸。
 *
 * 標籤是給程式讀的，不是給玩家看的——任何一種漏網都會直接印在故事裡。
 *
 * ⚠️ FONT 標記不在這裡處理：本函式在 renderMarkdown **之前**執行，
 * 在此濾掉會連成對的 `[FONT:serif]…[/FONT]` 一起吃掉，字體功能整個失效。
 * 落單的 FONT 標記由 renderMarkdown 在配對之後才清（見 ORPHAN_FONT_PATTERN）。
 */
export function cleanNarrative(text: string): string {
  return text
    .split('\n')
    .filter(line => !BARE_CMD_PATTERN.test(line.trim()))
    .join('\n')
    .replace(APPEAR_TAG_PATTERN, '')
    .replace(DEAD_TAG_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
