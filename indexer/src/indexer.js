import { createPublicClient, http, decodeEventLog } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { MEMORY_REGISTRY_ABI } from './abi.js'
import { loadStore, saveStore } from './store.js'

const resolveChainName = () => {
  const raw = (process.env.CHAIN ?? process.env.VITE_CHAIN ?? '').toString().trim().toLowerCase()
  return raw === 'base-sepolia' ? 'base-sepolia' : 'base'
}

const chainName = resolveChainName()
const chain = chainName === 'base-sepolia' ? baseSepolia : base
const rpcUrl =
  process.env.BASE_RPC_URL ??
  (chainName === 'base-sepolia' ? 'https://sepolia.base.org' : 'https://mainnet.base.org')
const contractAddress =
  process.env.MEMORY_REGISTRY_ADDRESS ?? process.env.VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS

function toLowerAddr(a) {
  return typeof a === 'string' ? a.toLowerCase() : ''
}

export async function startIndexer({ onUpdate } = {}) {
  if (!contractAddress) throw new Error('Set MEMORY_REGISTRY_ADDRESS')

  const client = createPublicClient({ chain, transport: http(rpcUrl) })
  const store = await loadStore()

  async function pollOnce() {
    const latest = await client.getBlockNumber()
    const toBlock = latest
    const MAX_RANGE = 9_500n
    const defaultFromBlock = toBlock > MAX_RANGE ? toBlock - MAX_RANGE : 0n
    let fromBlock = store.lastBlock === 0 ? defaultFromBlock : BigInt(store.lastBlock + 1)
    if (fromBlock > toBlock) return

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

        const creator = args.creator
        const timestamp = Number(args.timestamp)
        const latitude = Number(args.latitudeE7) / 1e7
        const longitude = Number(args.longitudeE7) / 1e7
        const isPublic = Boolean(args.isPublic)
        const title = String(args.title ?? '')
        const note = String(args.note ?? '')

        store.memories.push({
          memoryId,
          creator,
          creatorLower: toLowerAddr(creator),
          timestamp,
          latitude,
          longitude,
          isPublic,
          title,
          note,
          txHash: log.transactionHash,
          blockNumber: Number(log.blockNumber)
        })
      }
    }

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
    await saveStore(store)
    onUpdate?.(store)
  }

  let stopped = false
  async function loop() {
    while (!stopped) {
      try {
        await pollOnce()
      } catch (e) {
        // Keep going; caller can observe logs via stdout/stderr.
        // eslint-disable-next-line no-console
        console.error('[indexer] poll error', e)
      }
      await new Promise((r) => setTimeout(r, 5000))
    }
  }

  loop()

  return {
    store,
    client,
    stop() {
      stopped = true
    }
  }
}

