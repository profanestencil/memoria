/** Memory row from indexer `/memories` (optionally enriched with cover image). */
export type MemoryPin = {
  /** For minted pins, this is the onchain MemoryRegistry `memoryId`. For drafts, it is a synthetic id. */
  memoryId: string
  creator: `0x${string}`
  timestamp: number
  latitude: number
  longitude: number
  isPublic: boolean
  title: string
  note: string
  /** HTTP(S) or ipfs gateway URL set via POST /memories/:id/image */
  imageUrl?: string
  /** Voice note / uploaded track — set with indexer attach (IPFS or https) */
  audioUrl?: string
  /** Defaults to image when absent; `audio` drives map + player UI */
  mediaKind?: 'image' | 'audio'
  /** When true, map/detail `<audio>` uses loop (publish-time choice) */
  audioLoop?: boolean
  /** Lazy-minting status */
  mintStatus?: 'draft' | 'minted'
  /** Draft-only: stable id (mirrors `memoryId` for drafts) */
  draftId?: string
  /** Draft-only: expiry time (epoch seconds). If omitted, draft is treated as non-expiring. */
  draftExpiresAt?: number
  /** Special-event campaign (indexer / attach payload) */
  campaignTag?: string
  campaignId?: string
  pinColor?: string
}
