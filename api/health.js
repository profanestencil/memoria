import { getStore } from './_lib/storeKv.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const store = await getStore()
    res.status(200).json({
      ok: true,
      memories: store.memories.length,
      lastBlock: store.lastBlock,
      runtime: 'vercel-kv'
    })
  } catch (e) {
    res.status(503).json({
      ok: false,
      error: e instanceof Error ? e.message : 'kv_unavailable',
      hint: 'Add Vercel Redis (Upstash) and set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or legacy KV_REST_*'
    })
  }
}
