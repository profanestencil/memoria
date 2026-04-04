import { decodeEventLog } from 'viem'
import { MEMORY_REGISTRY_ABI } from './abi.js'
import { getPublicClient, getIndexerEnv } from './chain.js'
import { getStore, saveStore } from './storeKv.js'

const toLowerAddr = (a) => (typeof a === 'string' ? a.toLowerCase() : '')

/**
 * Pull MemoryMinted logs from lastBlock+1 .. latest and persist to KV.
 * @returns {{ added: number, lastBlock: number, memoryCount: number }}
 */
export const runSyncOnce = async () => {
  const { contractAddress } = getIndexerEnv()
  if (!contractAddress) {
    throw new Error('MEMORY_REGISTRY_ADDRESS is not set')
  }

  const client = getPublicClient()
  const store = await getStore()

  const latest = await client.getBlockNumber()
  const fromBlock = BigInt(store.lastBlock === 0 ? 0 : store.lastBlock + 1)
  const toBlock = latest

  let added = 0
  if (fromBlock <= toBlock) {
    const logs = await client.getLogs({
      address: contractAddress,
      event: MEMORY_REGISTRY_ABI[0],
      fromBlock,
      toBlock
    })

    for (const log of logs) {
      const decoded = decodeEventLog({
        abi: MEMORY_REGISTRY_ABI,
        data: log.data,
        topics: log.topics
      })
      if (decoded.eventName !== 'MemoryMinted') continue
      const args = decoded.args

      const memoryId = args.memoryId.toString()
      const exists = store.memories.find((m) => m.memoryId === memoryId)
      if (exists) continue

      store.memories.push({
        memoryId,
        creator: args.creator,
        creatorLower: toLowerAddr(args.creator),
        timestamp: Number(args.timestamp),
        latitude: Number(args.latitudeE7) / 1e7,
        longitude: Number(args.longitudeE7) / 1e7,
        isPublic: Boolean(args.isPublic),
        title: String(args.title ?? ''),
        note: String(args.note ?? ''),
        txHash: log.transactionHash,
        blockNumber: Number(log.blockNumber)
      })
      added += 1
    }

    store.lastBlock = Number(toBlock)
  }

  await saveStore(store)
  return { added, lastBlock: store.lastBlock, memoryCount: store.memories.length }
}
