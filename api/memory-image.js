import { getIndexerEnv, getPublicClient } from './_lib/chain.js'
import { MEMORY_REGISTRY_ABI } from './_lib/abi.js'
import { getStore, saveStore } from './_lib/storeKv.js'

const toLowerAddr = (a) => (typeof a === 'string' ? a.toLowerCase() : '')

const isAllowedMediaUrl = (u) => {
  if (typeof u !== 'string' || u.length > 2048) return false
  const lower = u.toLowerCase()
  return lower.startsWith('https://') || lower.startsWith('http://') || lower.startsWith('ipfs://')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { contractAddress } = getIndexerEnv()
  if (!contractAddress) {
    res.status(503).json({ error: 'Indexer has no registry contract address configured' })
    return
  }

  const memoryId = req.query.memoryId
  if (typeof memoryId !== 'string' || !/^\d+$/.test(memoryId)) {
    res.status(400).json({ error: 'Invalid memoryId' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' })
      return
    }
  }

  const { imageUrl, audioUrl, audioLoop, creator, campaignTag, campaignId, pinColor } = body ?? {}
  const hasImage = typeof imageUrl === 'string' && isAllowedMediaUrl(imageUrl)
  const hasAudio = typeof audioUrl === 'string' && isAllowedMediaUrl(audioUrl)
  if (!(hasImage || hasAudio) || typeof creator !== 'string' || !creator.startsWith('0x')) {
    res.status(400).json({
      error: 'creator (0x…) and at least one of imageUrl / audioUrl (http(s) or ipfs) required',
    })
    return
  }
  const creatorLower = toLowerAddr(creator)

  try {
    const client = getPublicClient()
    const store = await getStore()

    let mem = store.memories.find((m) => m.memoryId === memoryId)
    if (!mem) {
      const m = await client.readContract({
        address: contractAddress,
        abi: MEMORY_REGISTRY_ABI,
        functionName: 'getMemory',
        args: [BigInt(memoryId)]
      })
      const zero = '0x0000000000000000000000000000000000000000'
      if (!m || m.creator.toLowerCase() === zero) {
        res.status(404).json({ error: 'Memory not found on chain' })
        return
      }
      mem = {
        memoryId,
        creator: m.creator,
        creatorLower: toLowerAddr(m.creator),
        timestamp: Number(m.timestamp),
        latitude: Number(m.latitudeE7) / 1e7,
        longitude: Number(m.longitudeE7) / 1e7,
        isPublic: Boolean(m.isPublic),
        title: String(m.title ?? ''),
        note: String(m.note ?? ''),
        txHash: null,
        blockNumber: null
      }
      store.memories.push(mem)
    }

    if (mem.creatorLower !== creatorLower) {
      res.status(403).json({ error: 'creator does not match memory owner' })
      return
    }

    if (hasAudio && !hasImage) {
      mem.audioUrl = audioUrl
      mem.audioLoop = Boolean(audioLoop)
      mem.mediaKind = 'audio'
      delete mem.imageUrl
    } else if (hasImage) {
      mem.imageUrl = imageUrl
      mem.mediaKind = 'image'
      if (!hasAudio) {
        delete mem.audioUrl
        delete mem.audioLoop
      }
    }
    if (campaignTag != null && campaignTag !== '') mem.campaignTag = String(campaignTag).slice(0, 120)
    if (campaignId != null && campaignId !== '') mem.campaignId = String(campaignId).slice(0, 80)
    if (pinColor != null && pinColor !== '') mem.pinColor = String(pinColor).slice(0, 32)
    await saveStore(store)
    res.status(200).json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'attach failed' })
  }
}

