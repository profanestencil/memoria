const LOGO_URL = '/logo.svg'

export async function watermarkImage(imageBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(imageBlob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('No canvas context'))
        return
      }
      ctx.drawImage(img, 0, 0)
      const logo = new Image()
      logo.crossOrigin = 'anonymous'
      logo.onload = () => {
        const pad = Math.min(canvas.width, canvas.height) * 0.03
        const size = Math.min(canvas.width, canvas.height) * 0.12
        ctx.globalAlpha = 0.8
        ctx.drawImage(logo, pad, pad, size, size)
        ctx.globalAlpha = 1
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
          'image/jpeg',
          0.92
        )
      }
      logo.onerror = () => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
          'image/jpeg',
          0.92
        )
      }
      logo.src = LOGO_URL
    }
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = url
  })
}
