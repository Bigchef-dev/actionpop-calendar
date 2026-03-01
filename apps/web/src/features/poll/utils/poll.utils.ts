export const EMOJIS = ['🚪', '🏫', '🚇', '🍒', '🪣', '⛺', '🇵🇸', '✊', '💡', '🍽️', '📢', '🔥', '🌟', '☀️', '🏠', '🚨', '📄']

export interface PollItem {
  key: number
  checked: boolean
  emoji: string
  time: string
  endTime: string
  title: string
  referents: string
  color: string
  showEmojiPicker: boolean
}

export function extractLeadingEmoji(text: string): { emoji: string; rest: string } {
  const match = text.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(\s*)/u)
  if (match) return { emoji: match[1], rest: text.slice(match[0].length).trim() }
  return { emoji: '📅', rest: text }
}

export function formatTime(t: string): string {
  if (!t) return ''
  const [hh, mm] = t.split(':')
  const h = parseInt(hh, 10)
  const m = parseInt(mm, 10)
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export function extractReferents(description: string): string {
  const names: string[] = []
  for (const line of description.split(/\n|\\n/)) {
    if (/responsable|référent/i.test(line)) {
      const afterColon = line.includes(':') ? line.split(':').slice(1).join(':').trim() : ''
      const value = afterColon || line.replace(/responsable|referent|référent[s]?/gi, '').replace(/[:\-–]/g, '').trim()
      if (value) names.push(value)
    }
  }
  return names.join(', ')
}

export function buildOption(item: PollItem): string {
  const parts: string[] = []
  if (item.emoji) parts.push(item.emoji)
  if (item.time) {
    const start = formatTime(item.time)
    const timeStr = item.endTime ? `${start} - ${formatTime(item.endTime)}` : start
    parts.push(timeStr)
  }
  parts.push(item.title.trim())
  if (item.referents.trim()) parts.push(`(référent·e: ${item.referents.trim()})`)
  return parts.join(' ')
}
