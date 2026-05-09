const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Persist minted memory into KV via serverless / local indexer.
 * Retries on 404 until the chain state is readable.
 */
export const seedMemoryInIndexer = async (memoryId: string, indexerBaseUrl: string) => {
  const base = indexerBaseUrl.replace(/\/$/, '')
  const u = new URL(`/memories/${encodeURIComponent(memoryId)}/seed`, base)

  const maxAttempts = 6
  let lastErr: string | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(u.toString(), {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })

    const ct = res.headers.get('content-type') ?? ''

    if (!ct.includes('application/json')) {
      const snippet = (await res.text()).slice(0, 280)
      throw new Error(
        `Indexer seed returned non-JSON (${res.status}). Is VITE_INDEXER_URL your deployment URL and is /memories/:id/seed routed to the API? Body: ${snippet}`
      )
    }

    const j = (await res.json()) as { ok?: boolean; error?: string }

    if (res.ok && j.ok) {
      return
    }

    lastErr = j.error ?? `HTTP ${res.status}`
    if (res.status === 404 && attempt < maxAttempts - 1) {
      await sleep(800 + attempt * 400)
      continue
    }
    throw new Error(lastErr)
  }

  throw new Error(lastErr ?? 'seed failed')
}
