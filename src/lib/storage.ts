/**
 * Storage abstraction: upload image and metadata, return URIs.
 * Option A: NFT.Storage (client). Option B: backend that pins to IPFS.
 */

const NFT_STORAGE_KEY = import.meta.env.VITE_NFT_STORAGE_API_KEY

export interface MemoryMetadata {
  name: string
  description: string
  image: string
  attributes: { trait_type: string; value: string | number }[]
}

export async function uploadImage(blob: Blob): Promise<string> {
  if (!NFT_STORAGE_KEY) throw new Error('VITE_NFT_STORAGE_API_KEY not set')
  const form = new FormData()
  form.append('file', blob, 'memory.jpg')
  const res = await fetch('https://api.nft.storage/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${NFT_STORAGE_KEY}` },
    body: form,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Upload failed ${res.status}`)
  }
  const data = await res.json()
  const cid = data.value?.cid ?? data.cid
  if (!cid) throw new Error('No CID in response')
  return `ipfs://${cid}`
}

export async function uploadMetadata(metadata: MemoryMetadata): Promise<string> {
  if (!NFT_STORAGE_KEY) throw new Error('VITE_NFT_STORAGE_API_KEY not set')
  const blob = new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  const form = new FormData()
  form.append('file', blob, 'metadata.json')
  const res = await fetch('https://api.nft.storage/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${NFT_STORAGE_KEY}` },
    body: form,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Upload failed ${res.status}`)
  }
  const data = await res.json()
  const cid = data.value?.cid ?? data.cid
  if (!cid) throw new Error('No CID in response')
  return `ipfs://${cid}`
}

export function ipfsToHttp(ipfsUri: string): string {
  if (!ipfsUri.startsWith('ipfs://')) return ipfsUri
  const cid = ipfsUri.slice(7)
  return `https://nftstorage.link/ipfs/${cid}`
}
