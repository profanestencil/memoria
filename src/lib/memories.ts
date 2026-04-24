import { type PublicClient, decodeEventLog } from 'viem'
import { MEMORY_ARCHIVE_ABI } from './abi/memory-archive'
import { ipfsToHttp } from './storage'

const contractAddress = import.meta.env.VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS as `0x${string}`

export interface MemoryMeta {
  /**
   * Token id as a decimal string, safe for use in URLs.
   */
  tokenId: string
  image: string
  latitude: number
  longitude: number
  captureTime?: string
}

export async function fetchMemoriesForAddress(
  publicClient: PublicClient,
  userAddress: `0x${string}`
): Promise<MemoryMeta[]> {
  if (!contractAddress) return []
  const logs = await publicClient.getLogs({
    address: contractAddress,
    event: {
      type: 'event',
      name: 'MemoryMinted',
      inputs: [
        { indexed: true, name: 'tokenId', type: 'uint256' },
        { indexed: true, name: 'to', type: 'address' },
        { indexed: false, name: 'tokenURI', type: 'string' },
      ],
    },
    args: { to: userAddress },
    fromBlock: 0n,
  })
  const out: MemoryMeta[] = []
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: MEMORY_ARCHIVE_ABI,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName !== 'MemoryMinted') continue
      const tokenId = (decoded.args as { tokenId: bigint }).tokenId
      const uri = await publicClient.readContract({
        address: contractAddress,
        abi: MEMORY_ARCHIVE_ABI,
        functionName: 'tokenURI',
        args: [tokenId],
      })
      const metaUrl = ipfsToHttp(uri)
      const res = await fetch(metaUrl)
      const json: { image?: string; attributes?: { trait_type: string; value: string | number }[] } =
        await res.json()
      const image = json.image ? ipfsToHttp(String(json.image)) : ''
      const attrs = json.attributes ?? []
      const lat = Number(attrs.find((a) => a.trait_type === 'latitude')?.value ?? 0)
      const lng = Number(attrs.find((a) => a.trait_type === 'longitude')?.value ?? 0)
      const captureTime = String(attrs.find((a) => a.trait_type === 'captureTime')?.value ?? '')
      out.push({
        tokenId: tokenId.toString(),
        image,
        latitude: lat,
        longitude: lng,
        captureTime: captureTime || undefined,
      })
    } catch {
      // If anything fails (decode, readContract, ipfsToHttp, fetch, parse), skip this memory.
      continue
    }
  }
  return out.reverse()
}
