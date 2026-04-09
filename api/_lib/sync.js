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
    throw new Error(
      'MEMORY_REGISTRY_ADDRESS or VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS is not set'
    )
  }

  const client = getPublicClient()
  const store = await getStore()

  const latest = await client.getBlockNumber()
  const toBlock = latest

  // Many public RPCs limit eth_getLogs to a 10k block range.
  // On first run (lastBlock=0), only scan the most recent window to avoid hard failures.
  const MAX_RANGE = 9_500n
  const defaultFromBlock = toBlock > MAX_RANGE ? toBlock - MAX_RANGE : 0n
  let fromBlock = store.lastBlock === 0 ? defaultFromBlock : BigInt(store.lastBlock + 1)

  let added = 0
  if (fromBlock <= toBlock) {
    const seen = new Set(store.memories.map((m) => m.memoryId))

    const handleLogs = (logs) => {
      for (const log of logs) {
        const decoded = decodeEventLog({
          abi: MEMORY_REGISTRY_ABI,
          data: log.data,
          topics: log.topics
        })
        if (decoded.eventName !== 'MemoryMinted') continue
        const args = decoded.args

        const memoryId = args.memoryId.toString()
        if (seen.has(memoryId)) continue
        seen.add(memoryId)

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
    }

    // Fetch in bounded ranges to stay under provider limits.
    while (fromBlock <= toBlock) {
      const end = fromBlock + MAX_RANGE < toBlock ? fromBlock + MAX_RANGE : toBlock
      const logs = await client.getLogs({
        address: contractAddress,
        event: MEMORY_REGISTRY_ABI[0],
        fromBlock,
        toBlock: end
      })
      handleLogs(logs)
      fromBlock = end + 1n
    }

    store.lastBlock = Number(toBlock)
  }

  await saveStore(store)
  return { added, lastBlock: store.lastBlock, memoryCount: store.memories.length }
}
