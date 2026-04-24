type XR8Global = unknown

let loadPromise: Promise<XR8Global> | null = null

const getXR8 = () => (globalThis as unknown as { XR8?: XR8Global }).XR8

const waitForXR8 = async (timeoutMs: number) => {
  const start = Date.now()
  while (!getXR8()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('8th Wall engine loaded, but XR8 was not found')
    }
    await new Promise((r) => setTimeout(r, 25))
  }
  return getXR8()!
}

/**
 * Loads the self-hosted 8th Wall Engine Binary (served from our domain) and resolves when `globalThis.XR8` exists.
 * Uses a cached promise so the script is injected at most once.
 */
export const loadXrEngine = async (): Promise<XR8Global> => {
  if (getXR8()) return getXR8()!
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const src = '/external/xr/xr.js'

    const existing = document.querySelector<HTMLScriptElement>('script[data-8thwall="xr"]')
    if (existing) {
      return waitForXR8(12_000)
    }

    const s = document.createElement('script')
    s.async = true
    s.src = src
    s.dataset['8thwall'] = 'xr'

    // World tracking needs SLAM. This hints the loader to fetch the chunk eagerly.
    s.setAttribute('data-preload-chunks', 'slam')

    const loaded = new Promise<void>((resolve, reject) => {
      s.onload = () => resolve()
      s.onerror = () =>
        reject(new Error('Failed to load 8th Wall engine. Ensure /external/xr/xr.js exists.'))
    })

    document.head.appendChild(s)
    await loaded
    return waitForXR8(12_000)
  })()

  return loadPromise
}

