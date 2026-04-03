/** Memory row from indexer `/memories` (optionally enriched with cover image). */
export type MemoryPin = {
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
}
