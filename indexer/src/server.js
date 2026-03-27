import express from 'express'
import cors from 'cors'
import { startIndexer } from './indexer.js'

const port = Number(process.env.PORT ?? 8787)

function parseNum(v) {
  if (v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
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

  const idx = await startIndexer()

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

