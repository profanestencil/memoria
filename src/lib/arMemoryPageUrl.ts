import { resolveMediaPlaybackUrl } from '@/lib/memoryMedia'

export type ArMemoryOrientation = 'portrait' | 'landscape'

export type ArMemoryPageParams = {
  imageUrl: string
  title?: string
  creator?: string
  latitude?: number
  longitude?: number
  orientation?: ArMemoryOrientation
}

/** Standalone Three.js AR page — avoids React/WebGL stacking issues. */
export const buildArMemoryPageUrl = ({
  imageUrl,
  title,
  creator,
  latitude,
  longitude,
  orientation,
}: ArMemoryPageParams): string => {
  const u = new URL('/ar-memory.html', window.location.origin)
  u.searchParams.set('imageUrl', resolveMediaPlaybackUrl(imageUrl.trim()))
  if (title?.trim()) u.searchParams.set('title', title.trim().slice(0, 80))
  if (creator?.trim()) u.searchParams.set('creator', creator.trim().slice(0, 48))
  if (latitude != null && Number.isFinite(latitude)) {
    u.searchParams.set('lat', String(latitude))
  }
  if (longitude != null && Number.isFinite(longitude)) {
    u.searchParams.set('lng', String(longitude))
  }
  if (orientation) u.searchParams.set('orientation', orientation)
  return u.pathname + u.search
}

/** Phone-camera style orientation from natural image dimensions. */
export const detectImageOrientation = (imageUrl: string): Promise<ArMemoryOrientation> =>
  new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      resolve(img.naturalHeight > img.naturalWidth ? 'portrait' : 'landscape')
    }
    img.onerror = () => resolve('portrait')
    img.src = imageUrl
  })

export const prefetchArImage = (imageUrl: string): void => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = imageUrl
}
