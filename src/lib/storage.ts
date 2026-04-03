/**
 * Storage abstraction: upload image and metadata, return URIs.
 * Primary: Pinata — VITE_PINATA_JWT (Bearer, uploads.pinata.cloud/v3) or legacy api.pinata.cloud pinning keys.
 * Fallback: NFT.Storage (VITE_NFT_STORAGE_API_KEY).
 */

const NFT_STORAGE_KEY = import.meta.env.VITE_NFT_STORAGE_API_KEY
/** Legacy Pinata pair from the “API Keys” screen (not the long JWT-only key). */
const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY?.trim()
const PINATA_SECRET = import.meta.env.VITE_PINATA_SECRET?.trim()
/** New Pinata keys are often a single JWT — use Bearer auth (see https://docs.pinata.cloud). */
const PINATA_JWT = import.meta.env.VITE_PINATA_JWT?.trim()

const pinataJwtConfigured = Boolean(PINATA_JWT)
const pinataLegacyConfigured = Boolean(PINATA_API_KEY && PINATA_SECRET)
const pinataConfigured = pinataJwtConfigured || pinataLegacyConfigured

/** True when Pinata or NFT.Storage is configured at build time (Vite inlines env). */
export function isStorageConfigured(): boolean {
  return pinataConfigured || Boolean(NFT_STORAGE_KEY?.trim())
}

/** Legacy pinning host only — many dashboard JWTs are not valid for these routes. */
function pinataLegacyHeaders(contentTypeJson: boolean): HeadersInit {
  const h: Record<string, string> = {
    pinata_api_key: PINATA_API_KEY!,
    pinata_secret_api_key: PINATA_SECRET!,
  }
  if (contentTypeJson) h['Content-Type'] = 'application/json'
  return h
}

function pinataBearerHeaders(): HeadersInit {
  return { Authorization: `Bearer ${PINATA_JWT}` }
}

function parsePinataV3FileResponse(data: unknown): string {
  const row = data as { data?: { cid?: string }; cid?: string }
  const cid = row?.data?.cid ?? row?.cid
  if (!cid || typeof cid !== 'string') throw new Error('No CID in Pinata response')
  return cid
}

/** Pinata “new” API keys (JWT) must use uploads.pinata.cloud/v3, not api.pinata.cloud/pinning/*. */
async function pinataUploadFileV3(blob: Blob, filename: string): Promise<string> {
  const form = new FormData()
  form.append('file', blob, filename)
  form.append('network', 'public')
  const res = await fetch('https://uploads.pinata.cloud/v3/files', {
    method: 'POST',
    headers: pinataBearerHeaders(),
    body: form,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Pinata upload failed ${res.status}`)
  }
  const json: unknown = await res.json()
  const cid = parsePinataV3FileResponse(json)
  return `ipfs://${cid}`
}

/** Reject NFT.Storage key that is clearly malformed (spaces, JSON, etc.) so we throw a clear error instead of NFT.Storage's generic one. */
function validateNftStorageKey(key: string): void {
  const trimmed = key.trim()
  if (trimmed.length === 0) {
    throw new Error('VITE_NFT_STORAGE_API_KEY is empty. Set VITE_PINATA_API_KEY + VITE_PINATA_SECRET instead, then redeploy.')
  }
  if (trimmed.includes(' ') || trimmed.includes('\n')) {
    throw new Error('VITE_NFT_STORAGE_API_KEY contains spaces or newlines. Use the raw key only, or switch to Pinata (VITE_PINATA_API_KEY + VITE_PINATA_SECRET) and redeploy.')
  }
  if (trimmed.startsWith('{')) {
    throw new Error('VITE_NFT_STORAGE_API_KEY looks like JSON. Paste only the API key string, or use Pinata (VITE_PINATA_API_KEY + VITE_PINATA_SECRET) and redeploy.')
  }
}

export interface MemoryMetadata {
  name: string
  description: string
  image: string
  attributes: { trait_type: string; value: string | number }[]
}

export async function uploadImage(blob: Blob): Promise<string> {
  if (pinataJwtConfigured) {
    return pinataUploadFileV3(blob, 'memory.jpg')
  }
  if (pinataLegacyConfigured) {
    const form = new FormData()
    form.append('file', blob, 'memory.jpg')
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: pinataLegacyHeaders(false),
      body: form,
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(t || `Pinata upload failed ${res.status}`)
    }
    const data = await res.json()
    const cid = data.IpfsHash
    if (!cid) throw new Error('No IpfsHash in Pinata response')
    return `ipfs://${cid}`
  }

  if (!NFT_STORAGE_KEY) {
    throw new Error(
      'No storage configured. Set VITE_PINATA_JWT, or VITE_PINATA_API_KEY + VITE_PINATA_SECRET, or VITE_NFT_STORAGE_API_KEY in Vercel → Environment Variables, then Redeploy with cache cleared.'
    )
  }
  validateNftStorageKey(NFT_STORAGE_KEY)

  const form = new FormData()
  form.append('file', blob, 'memory.jpg')
  const res = await fetch('https://api.nft.storage/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${NFT_STORAGE_KEY.trim()}` },
    body: form,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Upload failed ${res.status}`)
  }
  const data = await res.json()
  if (data?.ok === false) {
    const msg = data?.error?.message ?? 'Upload failed (NFT.Storage rejected API key)'
    const hint = msg.includes('MALFORMED') || msg.includes('malformed')
      ? ' Use Pinata instead: set VITE_PINATA_API_KEY + VITE_PINATA_SECRET in Vercel, then Redeploy with cache cleared.'
      : ''
    throw new Error(msg + hint)
  }
  const cid = data.value?.cid ?? data.cid
  if (!cid) throw new Error('No CID in response')
  return `ipfs://${cid}`
}

export async function uploadMetadata(metadata: MemoryMetadata): Promise<string> {
  if (pinataJwtConfigured) {
    const blob = new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    return pinataUploadFileV3(blob, 'metadata.json')
  }
  if (pinataLegacyConfigured) {
    const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: pinataLegacyHeaders(true),
      body: JSON.stringify(metadata),
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(t || `Pinata metadata upload failed ${res.status}`)
    }
    const data = await res.json()
    const cid = data.IpfsHash
    if (!cid) throw new Error('No IpfsHash in Pinata response')
    return `ipfs://${cid}`
  }

  if (!NFT_STORAGE_KEY) {
    throw new Error(
      'No storage configured. Set VITE_PINATA_JWT, or VITE_PINATA_API_KEY + VITE_PINATA_SECRET, or VITE_NFT_STORAGE_API_KEY in Vercel → Environment Variables, then Redeploy with cache cleared.'
    )
  }
  validateNftStorageKey(NFT_STORAGE_KEY)

  const blob = new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  const form = new FormData()
  form.append('file', blob, 'metadata.json')
  const res = await fetch('https://api.nft.storage/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${NFT_STORAGE_KEY.trim()}` },
    body: form,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Upload failed ${res.status}`)
  }
  const data = await res.json()
  if (data?.ok === false) {
    const msg = data?.error?.message ?? 'Upload failed (NFT.Storage rejected API key)'
    const hint = msg.includes('MALFORMED') || msg.includes('malformed')
      ? ' Use Pinata instead: set VITE_PINATA_API_KEY + VITE_PINATA_SECRET in Vercel, then Redeploy with cache cleared.'
      : ''
    throw new Error(msg + hint)
  }
  const cid = data.value?.cid ?? data.cid
  if (!cid) throw new Error('No CID in response')
  return `ipfs://${cid}`
}

export function ipfsToHttp(ipfsUri: string): string {
  if (!ipfsUri.startsWith('ipfs://')) return ipfsUri
  const cid = ipfsUri.slice(7)
  if (pinataConfigured) {
    return `https://gateway.pinata.cloud/ipfs/${cid}`
  }
  return `https://nftstorage.link/ipfs/${cid}`
}
