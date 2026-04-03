import express from 'express'
import cors from 'cors'
import { startIndexer } from './indexer.js'
import { MEMORY_REGISTRY_ABI } from './abi.js'
import { saveStore } from './store.js'

const port = Number(process.env.PORT ?? 8787)

function parseNum(v) {
  if (v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function toLowerAddr(a) {
  return typeof a === 'string' ? a.toLowerCase() : ''
}

function isAllowedImageUrl(u) {
  if (typeof u !== 'string' || u.length > 2048) return false
  const lower = u.toLowerCase()
  return lower.startsWith('https://') || lower.startsWith('http://') || lower.startsWith('ipfs://')
}

function clampBBox(q) {
  const latMin = parseNum(q.latMin)
  const latMax = parseNum(q.latMax)
  const lngMin = parseNum(q.lngMin)
  const lngMax = parseNum(q.lngMax)
  if ([latMin, latMax, lngMin, lngMax].some((v) => v === undefined)) return null
  return { latMin, latMax, lngMin, lngMax }
}

async function main() {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '32kb' }))

  const idx = await startIndexer()
  const contractAddress = process.env.MEMORY_REGISTRY_ADDRESS

  app.get('/health', (_req, res) => {
    res.json({ ok: true, memories: idx.store.memories.length, lastBlock: idx.store.lastBlock })
  })

  app.get('/memories', (req, res) => {
    const user = typeof req.query.user === 'string' ? req.query.user.toLowerCase() : null
    const bbox = clampBBox(req.query)

    let items = idx.store.memories

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

    res.json({ memories: items })
  })

  /** Attach cover image (client proves wallet by sending creator address; must match on-chain). */
  app.post('/memories/:memoryId/image', async (req, res) => {
    if (!contractAddress) {
      res.status(503).json({ error: 'Indexer has no MEMORY_REGISTRY_ADDRESS' })
      return
    }
    const memoryId = req.params.memoryId
    if (!/^\d+$/.test(memoryId)) {
      res.status(400).json({ error: 'Invalid memoryId' })
      return
    }
    const { imageUrl, creator } = req.body ?? {}
    if (!isAllowedImageUrl(imageUrl) || typeof creator !== 'string' || !creator.startsWith('0x')) {
      res.status(400).json({ error: 'imageUrl (http(s) or ipfs) and creator (0x…) required' })
      return
    }
    const creatorLower = toLowerAddr(creator)
    try {
      let mem = idx.store.memories.find((m) => m.memoryId === memoryId)
      if (!mem) {
        const m = await idx.client.readContract({
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
        idx.store.memories.push(mem)
      }
      if (mem.creatorLower !== creatorLower) {
        res.status(403).json({ error: 'creator does not match memory owner' })
        return
      }
      mem.imageUrl = imageUrl
      await saveStore(idx.store)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'attach failed' })
    }
  })

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[indexer] listening on :${port}`)
  })
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})

