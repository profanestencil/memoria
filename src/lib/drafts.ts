import { appApiUrl } from '@/lib/apiBase'
import type { MemoryPin } from '@/lib/memoryPin'

export type DraftTtlMode = 'EndOfDay' | 'CampaignEnd' | 'NoExpiry'

export const buildDraftMessage = (draftId: string, wallet: `0x${string}`) =>
  `Memoria draft memory\nDraft: ${draftId}\nWallet: ${wallet.toLowerCase()}`

export const buildDraftMintMessage = (draftId: string, wallet: `0x${string}`) =>
  `Memoria mint draft\nDraft: ${draftId}\nWallet: ${wallet.toLowerCase()}`

export type CreateDraftInput = {
  draftId: string
  creator: `0x${string}`
  message: string
  signature: `0x${string}`
  title: string
  note: string
  isPublic: boolean
  lat: number
  lng: number
  mediaKind: 'image' | 'audio'
  imageUrl?: string
  audioUrl?: string
  audioLoop?: boolean
  campaignTag?: string
  campaignId?: string
  pinColor?: string
  ttlMode?: DraftTtlMode
  clientTzOffsetMin?: number
  campaignEndsAtSec?: number | null
}

export async function createDraftMemory(input: CreateDraftInput): Promise<{ ok: true; draft: MemoryPin } | { ok: false; error: string }> {
  try {
    const res = await fetch(appApiUrl('/api/drafts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; draft?: MemoryPin; error?: string }
    if (!res.ok || !j.ok || !j.draft) return { ok: false, error: j.error ?? `HTTP ${res.status}` }
    return { ok: true, draft: j.draft }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Draft request failed' }
  }
}

