import { ref, watch, onMounted, onUnmounted } from 'vue'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'agenda-theme'

function resolveSystemPreference(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyDark(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark)
}

// Singleton state — shared across the whole app
const theme = ref<Theme>((localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system')
const isDark = ref<boolean>(
  theme.value === 'dark' || (theme.value === 'system' && resolveSystemPreference() === 'dark'),
)
applyDark(isDark.value)

let mediaQuery: MediaQueryList | null = null

function onSystemChange(e: MediaQueryListEvent): void {
  if (theme.value === 'system') {
    isDark.value = e.matches
  }
}

export function useDarkMode() {
  onMounted(() => {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', onSystemChange)
  })

  onUnmounted(() => {
    mediaQuery?.removeEventListener('change', onSystemChange)
  })

  watch(theme, (val) => {
    localStorage.setItem(STORAGE_KEY, val)
    isDark.value = val === 'dark' || (val === 'system' && resolveSystemPreference() === 'dark')
  })

  watch(isDark, applyDark)

  function toggle(): void {
    theme.value = isDark.value ? 'light' : 'dark'
  }

  return { isDark, theme, toggle }
}
