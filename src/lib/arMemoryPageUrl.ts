import { resolveMediaPlaybackUrl } from '@/lib/memoryMedia'

export type ArMemoryOrientation = 'portrait' | 'landscape'

export type ArMemoryPageParams = {
  imageUrl: string
  title?: string
  creator?: string
  latitude?: number
  longitude?: number
  orientation?: ArMemoryOrientation
  aspect?: number
  frameHue?: number
}

/** Standalone Three.js AR page — avoids React/WebGL stacking issues. */
export const buildArMemoryPageUrl = ({
  imageUrl,
  title,
  creator,
  latitude,
  longitude,
  orientation,
  aspect,
  frameHue,
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
  if (aspect != null && Number.isFinite(aspect) && aspect > 0) {
    u.searchParams.set('aspect', String(Math.min(3, Math.max(0.25, aspect))))
  }
  if (frameHue != null && Number.isFinite(frameHue)) {
    u.searchParams.set('frameHue', String(Math.floor(frameHue) % 360))
  }
  return u.pathname + u.search
}

export type ImageDimensions = {
  orientation: ArMemoryOrientation
  aspect: number
  width: number
  height: number
}

export const detectImageDimensions = (imageUrl: string): Promise<ImageDimensions> =>
  new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const width = img.naturalWidth || 1
      const height = img.naturalHeight || 1
      const aspect = width / height
      resolve({
        orientation: height > width ? 'portrait' : 'landscape',
        aspect,
        width,
        height,
      })
    }
    img.onerror = () =>
      resolve({ orientation: 'portrait', aspect: 9 / 16, width: 9, height: 16 })
    img.src = imageUrl
  })

/** @deprecated use detectImageDimensions */
export const detectImageOrientation = async (imageUrl: string): Promise<ArMemoryOrientation> => {
  const d = await detectImageDimensions(imageUrl)
  return d.orientation
}

export const prefetchArImage = (imageUrl: string): void => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = imageUrl
}

export const prefetchArBoardGlb = (orientation: ArMemoryOrientation = 'portrait'): void => {
  const path =
    orientation === 'landscape'
      ? '/ar/memory-board-landscape.glb'
      : '/ar/memory-board-portrait.glb'
  void fetch(path, { mode: 'cors', credentials: 'same-origin' }).catch(() => {
    /* ignore */
  })
}
