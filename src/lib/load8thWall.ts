type XR8Global = unknown

let loadPromise: Promise<XR8Global> | null = null

const getXR8 = () => (globalThis as unknown as { XR8?: XR8Global }).XR8

const waitForXR8 = async (timeoutMs: number) => {
  const start = Date.now()
  while (!getXR8()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('8th Wall runtime loaded, but XR8 was not found')
    }
    await new Promise((r) => setTimeout(r, 25))
  }
  return getXR8()!
}

/**
 * Loads the 8th Wall web runtime and resolves when `globalThis.XR8` exists.
 * Uses a cached promise so the script is injected at most once.
 */
export const load8thWall = async (appKey: string): Promise<XR8Global> => {
  if (getXR8()) return getXR8()!
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const trimmed = appKey.trim()
    if (!trimmed) {
      throw new Error('Missing VITE_8THWALL_APP_KEY')
    }

    const src = `https://apps.8thwall.com/xrweb?appKey=${encodeURIComponent(trimmed)}`

    const existing = document.querySelector<HTMLScriptElement>('script[data-8thwall="xrweb"]')
    if (existing) {
      return waitForXR8(12_000)
    }

    const s = document.createElement('script')
    s.async = true
    s.src = src
    s.dataset['8thwall'] = 'xrweb'

    const loaded = new Promise<void>((resolve, reject) => {
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load 8th Wall runtime.'))
    })

    document.head.appendChild(s)
    await loaded
    return waitForXR8(12_000)
  })()

  return loadPromise
}

