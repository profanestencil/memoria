import type { MemoryPin } from '@/lib/memoryPin'
import { ipfsToHttp } from '@/lib/storage'

export const pinIsAudioMemory = (pin: MemoryPin): boolean =>
  pin.mediaKind === 'audio' || Boolean(pin.audioUrl)

export const pinIsDraftMemory = (pin: MemoryPin): boolean => pin.mintStatus === 'draft' || Boolean(pin.draftId)

function toHttpPlaybackUrl(raw: string): string {
  const t = raw.trim()
  if (t.startsWith('ipfs://')) return ipfsToHttp(t)
  return t
}

/**
 * Same-origin `/api/media/proxy` so IPFS gateways work with &lt;audio&gt;, Web Audio (AR), and CORS.
 * Disable with `VITE_MEDIA_PROXY=0` (direct gateway URLs — may fail for AR / some browsers).
 */
function wrapMediaProxyIfNeeded(httpUrl: string): string {
  if (import.meta.env.VITE_MEDIA_PROXY === '0') return httpUrl
  if (typeof window === 'undefined') return httpUrl
  if (!httpUrl || httpUrl.startsWith('blob:') || httpUrl.startsWith('data:')) return httpUrl
  if (httpUrl.includes('/api/media/proxy')) return httpUrl
  try {
    const u = new URL(httpUrl)
    if (u.origin === window.location.origin) return httpUrl
  } catch {
    return httpUrl
  }
  return `${window.location.origin}/api/media/proxy?target=${encodeURIComponent(httpUrl)}`
}

/** Resolve any stored audio URL for playback (ipfs → https → optional proxy). */
export function resolveMediaPlaybackUrl(raw: string): string {
  const t = raw.trim()
  if (!t || t.startsWith('blob:') || t.startsWith('data:')) return t
  const http = toHttpPlaybackUrl(t)
  return wrapMediaProxyIfNeeded(http)
}

/** URL safe for `<audio src>` (resolves ipfs://, then optional same-origin proxy). */
export const pinAudioPlaybackUrl = (pin: MemoryPin): string | null => {
  const raw = pin.audioUrl?.trim()
  if (!raw) return null
  return resolveMediaPlaybackUrl(raw)
}
