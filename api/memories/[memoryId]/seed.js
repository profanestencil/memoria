import { getIndexerEnv, getPublicClient } from '../../_lib/chain.js'
import { MEMORY_REGISTRY_ABI } from '../../_lib/abi.js'
import { getStore, saveStore } from '../../_lib/storeKv.js'

const toLowerAddr = (a) => (typeof a === 'string' ? a.toLowerCase() : '')

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
    res.status(503).json({ error: 'Indexer has no MEMORY_REGISTRY_ADDRESS' })
    return
  }

  const memoryId = req.query.memoryId
  if (typeof memoryId !== 'string' || !/^\d+$/.test(memoryId)) {
    res.status(400).json({ error: 'Invalid memoryId' })
    return
  }

  try {
    const client = getPublicClient()
    const store = await getStore()

    const exists = store.memories.find((m) => m.memoryId === memoryId)
    if (exists) {
      res.status(200).json({ ok: true, seeded: false })
      return
    }

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

    store.memories.push({
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
    })

    await saveStore(store)
    res.status(200).json({ ok: true, seeded: true })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'seed failed' })
  }
}

