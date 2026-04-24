import type { CampaignOverlay } from '@/lib/runtimeActive'

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('overlay image failed'))
    img.src = url
  })

const insetForPosition = (
  position: string,
  imgW: number,
  imgH: number,
  scale: number,
  cw: number,
  ch: number
) => {
  const margin = 12 * scale
  const ow = Math.min(cw - margin * 2, imgW * scale)
  const oh = Math.min(ch - margin * 2, imgH * scale)
  const pos = position.toLowerCase().replace(/-/g, '_')
  let x = margin
  let y = margin
  if (pos.includes('right')) x = cw - ow - margin
  if (pos.includes('bottom')) y = ch - oh - margin
  if (pos === 'center' || pos.includes('center')) {
    x = (cw - ow) / 2
    y = (ch - oh) / 2
  }
  return { x, y, ow, oh }
}

/** Draw campaign image overlays on a JPEG/PNG blob (for upload + map thumbnail). */
export const applyCampaignOverlaysToBlob = async (blob: Blob, overlays: CampaignOverlay[]): Promise<Blob> => {
  if (!overlays.length) return blob
  const bmp = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bmp.close()
    return blob
  }
  ctx.drawImage(bmp, 0, 0)
  bmp.close()

  for (const o of overlays) {
    if (o.overlayType !== 'image' || !o.assetUrl) continue
    try {
      const img = await loadImage(o.assetUrl)
      const sc = Number.isFinite(Number(o.scale)) ? Number(o.scale) : 1
      const op = Math.min(1, Math.max(0, Number.isFinite(Number(o.opacity)) ? Number(o.opacity) : 1))
      ctx.save()
      ctx.globalAlpha = op
      const { x, y, ow, oh } = insetForPosition(o.position ?? 'top_left', img.width, img.height, sc, canvas.width, canvas.height)
      ctx.drawImage(img, x, y, ow, oh)
      ctx.restore()
    } catch {
      /* skip broken CORS or bad URL */
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92)
  })
}
