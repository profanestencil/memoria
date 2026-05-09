import type { MemoryPin } from '@/lib/memoryPin'

const KEY = 'memoria:optimisticPins:v1'
const MAX_PINS = 80

/** Persist across browser restarts so pins don’t vanish before KV is ready */
export const loadOptimisticPins = (): MemoryPin[] => {
  try {
    const rawLocal = localStorage.getItem(KEY)
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal)
      return Array.isArray(parsed) ? (parsed as MemoryPin[]) : []
    }
    const rawLegacy = sessionStorage.getItem(KEY)
    if (rawLegacy) {
      const parsed = JSON.parse(rawLegacy)
      const arr = Array.isArray(parsed) ? (parsed as MemoryPin[]) : []
      if (arr.length) {
        try {
          localStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX_PINS)))
        } catch {
          /* quota / private mode */
        }
        sessionStorage.removeItem(KEY)
      }
      return arr
    }
  } catch {
    /* invalid JSON */
  }
  return []
}

export const saveOptimisticPins = (pins: MemoryPin[]) => {
  const trimmed = pins.slice(-MAX_PINS)
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
