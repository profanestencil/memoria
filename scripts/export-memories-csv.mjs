import { createPublicClient, http, decodeEventLog } from 'viem'

const CONTRACT_ADDRESS = '0x64d2e7AeB0b14Ad1e9B439DeAB675CC5B49284B7'

const MEMORY_ARCHIVE_ABI = [
  {
    type: 'event',
    anonymous: false,
    name: 'MemoryMinted',
    inputs: [
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'tokenURI', type: 'string' },
    ],
  },
  {
    type: 'function',
    stateMutability: 'view',
    outputs: [{ name: '', type: 'string' }],
    name: 'tokenURI',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
  },
]

function ipfsToHttp(uri) {
  if (typeof uri !== 'string') return ''
  if (uri.startsWith('ipfs://')) return `https://nftstorage.link/ipfs/${uri.slice(7)}`
  return uri
}

const baseChain = {
  id: 8453,
  name: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://mainnet.base.org'] } },
}

const client = createPublicClient({
  chain: baseChain,
  transport: http('https://mainnet.base.org'),
})

async function main() {
  const logs = await client.getLogs({
    address: CONTRACT_ADDRESS,
    event: {
      type: 'event',
      name: 'MemoryMinted',
      inputs: [
        { indexed: true, name: 'tokenId', type: 'uint256' },
        { indexed: true, name: 'to', type: 'address' },
        { indexed: false, name: 'tokenURI', type: 'string' },
      ],
    },
    fromBlock: 0n,
  })

  const rows = []
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: MEMORY_ARCHIVE_ABI,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName !== 'MemoryMinted') continue

      const { tokenId, to, tokenURI } = decoded.args
      const uri =
        typeof tokenURI === 'string'
          ? tokenURI
          : await client.readContract({
              address: CONTRACT_ADDRESS,
              abi: MEMORY_ARCHIVE_ABI,
              functionName: 'tokenURI',
              args: [tokenId],
            })

      const metaUrl = ipfsToHttp(uri)
      const res = await fetch(metaUrl)
      const json = await res.json()

      const image = json.image ? ipfsToHttp(String(json.image)) : ''
      const attrs = Array.isArray(json.attributes) ? json.attributes : []

      const getAttr = (name) => {
        const found = attrs.find((a) => a?.trait_type === name)
        return found ? String(found.value) : ''
      }

      rows.push({
        tokenId: tokenId.toString(),
        to,
        title: getAttr('title'),
        image,
        latitude: getAttr('latitude'),
        longitude: getAttr('longitude'),
        captureTime: getAttr('captureTime'),
        author: getAttr('author'),
        device: getAttr('device'),
        metadataUrl: metaUrl,
      })
    } catch {
      continue
    }
  }

  // Sort by numeric token id ascending
  rows.sort((a, b) => BigInt(a.tokenId) - BigInt(b.tokenId))

  const header = [
    'tokenId',
    'to',
    'title',
    'image',
    'latitude',
    'longitude',
    'captureTime',
    'author',
    'device',
    'metadataUrl',
  ]

  console.log(header.join(','))
  for (const row of rows) {
    const values = header.map((key) => {
      const v = row[key] ?? ''
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    })
    console.log(values.join(','))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

