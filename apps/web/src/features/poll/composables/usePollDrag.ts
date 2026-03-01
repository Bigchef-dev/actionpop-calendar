import { ref, type Ref } from 'vue'
import type { PollItem } from '../utils/poll.utils'

const LONG_PRESS_MS = 300
const MOVE_CANCEL_PX = 8

export function usePollDrag(items: Ref<PollItem[]>) {
  const draggingKey = ref<number | null>(null)
  const dragOverKey = ref<number | null>(null)
  const isTouchDragging = ref(false)

  let touchTimer: ReturnType<typeof setTimeout> | null = null
  let touchStartX = 0
  let touchStartY = 0

  function reorder(fromKey: number, toKey: number) {
    if (fromKey === toKey) return
    const arr = [...items.value]
    const from = arr.findIndex((i) => i.key === fromKey)
    const to = arr.findIndex((i) => i.key === toKey)
    if (from === -1 || to === -1) return
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    items.value = arr
  }

  // --- Mouse drag (desktop) ---

  function onDragStart(e: DragEvent, key: number) {
    draggingKey.value = key
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(key))
    }
  }

  function onDragOver(e: DragEvent, key: number) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    dragOverKey.value = key
  }

  function onDrop(key: number) {
    if (draggingKey.value !== null) reorder(draggingKey.value, key)
    draggingKey.value = null
    dragOverKey.value = null
  }

  function onDragEnd() {
    draggingKey.value = null
    dragOverKey.value = null
  }

  // --- Touch drag (mobile): long press on handle ---

  function cancelTouch() {
    if (touchTimer !== null) {
      clearTimeout(touchTimer)
      touchTimer = null
    }
    draggingKey.value = null
    dragOverKey.value = null
    isTouchDragging.value = false
  }

  function onHandleTouchStart(e: TouchEvent, key: number) {
    const touch = e.touches[0]
    touchStartX = touch.clientX
    touchStartY = touch.clientY
    touchTimer = setTimeout(() => {
      touchTimer = null
      draggingKey.value = key
      isTouchDragging.value = true
    }, LONG_PRESS_MS)
  }

  function onHandleTouchMove(e: TouchEvent) {
    if (isTouchDragging.value) {
      // Drag active — block scroll, track position
      e.preventDefault()
      const touch = e.touches[0]
      const el = document.elementFromPoint(touch.clientX, touch.clientY)
      const itemEl = el?.closest('[data-item-key]')
      if (itemEl) {
        const key = Number(itemEl.getAttribute('data-item-key'))
        if (key !== draggingKey.value) dragOverKey.value = key
      }
    } else if (touchTimer !== null) {
      // Not yet dragging — cancel if finger moved too much (user scrolling)
      const touch = e.touches[0]
      const dx = Math.abs(touch.clientX - touchStartX)
      const dy = Math.abs(touch.clientY - touchStartY)
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
        clearTimeout(touchTimer)
        touchTimer = null
      }
    }
  }

  function onHandleTouchEnd() {
    if (touchTimer !== null) {
      clearTimeout(touchTimer)
      touchTimer = null
    }
    if (isTouchDragging.value && draggingKey.value !== null && dragOverKey.value !== null) {
      reorder(draggingKey.value, dragOverKey.value)
    }
    draggingKey.value = null
    dragOverKey.value = null
    isTouchDragging.value = false
  }

  return {
    draggingKey,
    dragOverKey,
    isTouchDragging,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onHandleTouchStart,
    onHandleTouchMove,
    onHandleTouchEnd,
    cancelTouch,
  }
}
