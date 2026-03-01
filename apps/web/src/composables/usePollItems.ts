import { ref, watch, type Ref } from 'vue'
import type { PollEvent } from './usePollEvents'
import { type PollItem, extractLeadingEmoji, extractReferents } from '../utils/poll.utils'

let keySeq = 0

function makeItem(overrides: Partial<PollItem> = {}): PollItem {
  return {
    key: keySeq++,
    checked: true,
    emoji: '📅',
    time: '',
    title: '',
    referents: '',
    color: '',
    showEmojiPicker: false,
    ...overrides,
  }
}

function eventToItem(e: PollEvent): PollItem {
  const d = e.startDate
  const time = d
    ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : ''
  const { emoji, rest } = extractLeadingEmoji(e.title)
  return makeItem({ emoji, time, title: rest, referents: extractReferents(e.description), color: e.color })
}

export function usePollItems(calEvents: Ref<PollEvent[]>) {
  const CANNOT_ATTEND = makeItem({ emoji: '❌', title: 'Je ne peux pas', checked: true })
  const items = ref<PollItem[]>([CANNOT_ATTEND])
  let autoKeys = new Set<number>()

  watch(calEvents, (newEvents) => {
    const manual = items.value.filter((i) => !autoKeys.has(i.key))
    const auto = newEvents.map(eventToItem)
    autoKeys = new Set(auto.map((i) => i.key))
    items.value = [...auto, ...manual]
  })

  function addItem() {
    const item = makeItem()
    items.value.splice(items.value.length - 1, 0, item)
  }

  function removeItem(key: number) {
    items.value = items.value.filter((i) => i.key !== key)
    autoKeys.delete(key)
  }

  function closeAllEmojiPickers(exceptKey?: number) {
    for (const i of items.value) {
      if (i.key !== exceptKey) i.showEmojiPicker = false
    }
  }

  function toggleEmojiPicker(item: PollItem) {
    const wasOpen = item.showEmojiPicker
    closeAllEmojiPickers(item.key)
    item.showEmojiPicker = !wasOpen
  }

  function pickEmoji(item: PollItem, emoji: string) {
    item.emoji = emoji
    item.showEmojiPicker = false
  }

  return { items, autoKeys, addItem, removeItem, toggleEmojiPicker, pickEmoji }
}
