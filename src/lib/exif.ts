import exifr from 'exifr'

export interface ExifData {
  date?: string
  device?: string
  orientation?: number
}

export async function readExif(blob: Blob): Promise<ExifData> {
  try {
    const tags = await exifr.parse(blob, { pick: ['DateTimeOriginal', 'Model', 'Orientation'] })
    if (!tags) return {}
    return {
      date: tags.DateTimeOriginal?.toISOString?.() ?? undefined,
      device: tags.Model ?? undefined,
      orientation: tags.Orientation ?? undefined,
    }
  } catch {
    return {}
  }
}
