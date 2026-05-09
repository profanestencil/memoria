import type { MemoryPin } from '@/lib/memoryPin'

const storagePrefix = 'memoria:favourites:'

export const favouriteKey = (pin: MemoryPin) => `${pin.creator.toLowerCase()}-${pin.memoryId}`

export const readFavouriteKeys = (ownerKey: string): Set<string> => {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(`${storagePrefix}${ownerKey}`)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

export const writeFavouriteKeys = (ownerKey: string, keys: Set<string>): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${storagePrefix}${ownerKey}`, JSON.stringify([...keys]))
  } catch {
    // quota / private mode
  }
}

/** Persists and returns the new set after toggling this pin. */
export const toggleFavouriteKey = (ownerKey: string, pin: MemoryPin): Set<string> => {
  const k = favouriteKey(pin)
  const next = new Set(readFavouriteKeys(ownerKey))
  if (next.has(k)) next.delete(k)
  else next.add(k)
  writeFavouriteKeys(ownerKey, next)
  return next
}
