import { resolveMediaPlaybackUrl } from '@/lib/memoryMedia'

export type ArMemoryPageParams = {
  imageUrl: string
  title?: string
  latitude?: number
  longitude?: number
}

/** Standalone A-Frame AR page (Illust webar pattern) — avoids React/WebGL stacking issues. */
export const buildArMemoryPageUrl = ({
  imageUrl,
  title,
  latitude,
  longitude,
}: ArMemoryPageParams): string => {
  const u = new URL('/ar-memory.html', window.location.origin)
  u.searchParams.set('imageUrl', resolveMediaPlaybackUrl(imageUrl.trim()))
  if (title?.trim()) u.searchParams.set('title', title.trim().slice(0, 80))
  if (latitude != null && Number.isFinite(latitude)) {
    u.searchParams.set('lat', String(latitude))
  }
  if (longitude != null && Number.isFinite(longitude)) {
    u.searchParams.set('lng', String(longitude))
  }
  return u.pathname + u.search
}
