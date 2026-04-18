const indexerUrl = (import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:8787').replace(/\/$/, '')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 4xx client / auth failures — do not retry (indexer will not succeed on backoff). */
class IndexerClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IndexerClientError'
  }
}

/** Attach cover image and/or audio to a registry memory (creator must match on-chain). Retries while indexer catches up. */
export const attachMemoryCoverImage = async (input: {
  memoryId: string
  creator: `0x${string}`
  imageUrl?: string
  audioUrl?: string
  mediaKind?: 'image' | 'audio'
  audioLoop?: boolean
  campaignTag?: string
  campaignId?: string
  pinColor?: string
  maxAttempts?: number
}): Promise<void> => {
  const {
    memoryId,
    creator,
    imageUrl,
    audioUrl,
    mediaKind,
    audioLoop,
    campaignTag,
    campaignId,
    pinColor,
    maxAttempts = 12,
  } = input
  if (!imageUrl && !audioUrl) {
    throw new Error('attachMemoryCoverImage: pass imageUrl and/or audioUrl')
  }
  const url = new URL(`/memories/${encodeURIComponent(memoryId)}/image`, indexerUrl).toString()
  let lastErr: string | undefined
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator,
          ...(imageUrl != null && imageUrl !== '' ? { imageUrl } : {}),
          ...(audioUrl != null && audioUrl !== '' ? { audioUrl } : {}),
          ...(mediaKind != null ? { mediaKind } : {}),
          ...(audioLoop != null ? { audioLoop } : {}),
          ...(campaignTag != null ? { campaignTag } : {}),
          ...(campaignId != null ? { campaignId } : {}),
          ...(pinColor != null ? { pinColor } : {}),
        }),
      })
      if (res.ok) return
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      lastErr = j.error ?? `HTTP ${res.status}`
      if (res.status === 400 || res.status === 403) {
        throw new IndexerClientError(lastErr)
      }
    } catch (e) {
      if (e instanceof IndexerClientError) throw e
      lastErr = e instanceof Error ? e.message : 'fetch failed'
      if (attempt === maxAttempts - 1) throw e instanceof Error ? e : new Error(lastErr)
    }
    await sleep(800 + attempt * 400)
  }
  throw new Error(lastErr ?? 'Could not attach image to indexer')
}
