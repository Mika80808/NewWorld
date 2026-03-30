import React from 'react'

export const FONT_CLASS_MAP: Record<string, string> = {
  sans:  'font-game-sans',
  serif: 'font-game-serif',
  spell: 'font-game-spell',
}

// 顯示時清理殘留指令（AI 有時不包在 COMMANDS 區塊內）
export const BARE_CMD_PATTERN = /^(?:<<)?(?:HP:[+-]\d+|MP:[+-]\d+|GOLD:[+-]\d+|AFFINITY:.+:[+-]?\d+|LOCATION:.+|TIME:\+\d+[hm]|ITEM_ADD:.+|ITEM_REMOVE:.+:\d+|ITEM_USE:.+|NPC_NEW:.+|NPC_HOME:[^:]+:.+|NPC_LOCATION:[^:]+:.+|NPC_THOUGHT:[^:]+:.+|NPC_RELATIONSHIP:[^:]+:.+|QUEST_ADD:.+|QUEST_GOAL_MET:.+|QUEST_COMPLETE:.+|MEMORY_ADD:.+|LOCATION_DISCOVER:.+)(?:>>)?$/

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

export function stripBareCommands(text: string): string {
  return text.split('\n').filter(line => !BARE_CMD_PATTERN.test(line.trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
