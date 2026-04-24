import { getStore } from '../_lib/storeKv.js'

const parseNum = (v) => {
  if (v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

const clampBBox = (q) => {
  const latMin = parseNum(q.latMin)
  const latMax = parseNum(q.latMax)
  const lngMin = parseNum(q.lngMin)
  const lngMax = parseNum(q.lngMax)
  if ([latMin, latMax, lngMin, lngMax].some((v) => v === undefined)) return null
  return { latMin, latMax, lngMin, lngMax }
}

const isDraftExpired = (d, nowSec) => {
  const exp = d?.draftExpiresAt
  if (exp == null) return false
  const n = Number(exp)
  return Number.isFinite(n) ? n <= nowSec : false
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const store = await getStore()
    const user = typeof req.query.user === 'string' ? req.query.user.toLowerCase() : null
    const bbox = clampBBox(req.query)

    const nowSec = Math.floor(Date.now() / 1000)
    const draftsRaw = Array.isArray(store.drafts) ? store.drafts : []
    const drafts = draftsRaw.filter((d) => !isDraftExpired(d, nowSec))

    const minted = Array.isArray(store.memories) ? store.memories : []
    let items = [...drafts, ...minted]

    if (user) {
      items = items.filter((m) => m.creatorLower === user)
    } else {
      items = items.filter((m) => m.isPublic)
    }

    if (bbox) {
      items = items.filter(
        (m) =>
          m.latitude >= bbox.latMin &&
          m.latitude <= bbox.latMax &&
          m.longitude >= bbox.lngMin &&
          m.longitude <= bbox.lngMax
      )
    }

    res.status(200).json({ memories: items })
  } catch (e) {
    res.status(503).json({
      error: e instanceof Error ? e.message : 'kv_unavailable',
      memories: []
    })
  }
}
