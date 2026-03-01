import { ref, type Ref } from 'vue'
import { POLL_BACKEND_URL } from '../config'
import { type PollItem, buildOption } from '../utils/poll.utils'

export function useSendPoll(chatId: string, question: Ref<string>, items: Ref<PollItem[]>) {
  const sendState = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
  const sendError = ref('')
  const copyState = ref<'idle' | 'copied'>('idle')

  function checkedItems() {
    return items.value.filter((i) => i.checked && i.title.trim())
  }

  async function copyPreview() {
    const lines = [question.value.trim(), '', ...checkedItems().map(buildOption)]
    await navigator.clipboard.writeText(lines.join('\n'))
    copyState.value = 'copied'
    setTimeout(() => (copyState.value = 'idle'), 2000)
  }

  async function sendPoll() {
    const selected = checkedItems()
    if (selected.length < 2) {
      sendError.value = 'Sélectionnez au moins 2 éléments à inclure dans le sondage.'
      sendState.value = 'error'
      return
    }
    if (!question.value.trim()) {
      sendError.value = 'La question est obligatoire.'
      sendState.value = 'error'
      return
    }

    sendState.value = 'loading'
    sendError.value = ''
    try {
      const res = await fetch(`${POLL_BACKEND_URL}/send-poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          question: question.value.trim(),
          options: selected.map(buildOption),
          isAnonymous: false,
          allowsMultipleAnswers: true,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        sendError.value = data.error ?? 'Erreur Telegram inconnue'
        sendState.value = 'error'
      } else {
        sendState.value = 'success'
      }
    } catch (e) {
      sendError.value = e instanceof Error ? e.message : 'Erreur réseau'
      sendState.value = 'error'
    }
  }

  return { sendState, sendError, copyState, sendPoll, copyPreview }
}
