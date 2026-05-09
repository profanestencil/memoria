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
 * Optional: sample apps use `xrloaded` when the engine + SLAM chunk are ready to register pipelines.
 * If the event never fires (older builds), we still proceed after XR8 appears.
 */
const waitForXrLoadedEvent = async (timeoutMs: number) => {
  await new Promise<void>((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    window.addEventListener('xrloaded', done, { once: true })
    window.setTimeout(done, timeoutMs)
  })
}

/**
 * Loads the self-hosted 8th Wall Engine Binary (served from our domain) and resolves when `globalThis.XR8` exists.
 * If `index.html` already injected `script[data-8thwall="xr"]`, we only wait for XR8 (no duplicate script).
 * XRExtras is loaded via a separate script tag (see `index.html`).
 */
export const loadXrEngine = async (): Promise<XR8Global> => {
  if (getXR8()) return getXR8()!
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const src = '/external/xr/xr.js'

    const existing =
      document.querySelector<HTMLScriptElement>('script[data-8thwall="xr"]') ??
      document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)

    if (existing) {
      const xr = await waitForXR8(15_000)
      await waitForXrLoadedEvent(3_000)
      return xr
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
    const xr = await waitForXR8(15_000)
    await waitForXrLoadedEvent(3_000)
    return xr
  })()

  return loadPromise
}

