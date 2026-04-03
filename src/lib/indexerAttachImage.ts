const indexerUrl = (import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:8787').replace(/\/$/, '')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Attach cover image to a registry memory (creator must match on-chain). Retries while indexer catches up. */
export const attachMemoryCoverImage = async (input: {
  memoryId: string
  creator: `0x${string}`
  imageUrl: string
  maxAttempts?: number
}): Promise<void> => {
  const { memoryId, creator, imageUrl, maxAttempts = 12 } = input
  const url = new URL(`/memories/${encodeURIComponent(memoryId)}/image`, indexerUrl).toString()
  let lastErr: string | undefined
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, creator }),
      })
      if (res.ok) return
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      lastErr = j.error ?? `HTTP ${res.status}`
      if (res.status === 403 || res.status === 400) throw new Error(lastErr)
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'fetch failed'
      if (attempt === maxAttempts - 1) throw e instanceof Error ? e : new Error(lastErr)
    }
    await sleep(800 + attempt * 400)
  }
  throw new Error(lastErr ?? 'Could not attach image to indexer')
}
