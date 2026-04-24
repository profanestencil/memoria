import { Redis } from '@upstash/redis'

const KEY = 'memoria:indexer:v1'

const getRedis = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    throw new Error(
      'Missing Redis REST credentials: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (Vercel → Storage → Redis / Upstash), or legacy KV_REST_API_URL + KV_REST_API_TOKEN'
    )
  }
  return new Redis({ url, token })
}

export const getStore = async () => {
  const redis = getRedis()
  const v = await redis.get(KEY)
  if (v && typeof v === 'object' && Array.isArray(v.memories)) {
    return {
      lastBlock: typeof v.lastBlock === 'number' ? v.lastBlock : 0,
      memories: v.memories,
      drafts: Array.isArray(v.drafts) ? v.drafts : []
    }
  }
  return { lastBlock: 0, memories: [], drafts: [] }
}

export const saveStore = async (store) => {
  const redis = getRedis()
  await redis.set(KEY, {
    lastBlock: store.lastBlock ?? 0,
    memories: store.memories ?? [],
    drafts: store.drafts ?? []
  })
}
