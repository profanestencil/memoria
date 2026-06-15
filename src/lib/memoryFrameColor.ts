/** Deterministic frame accent hue from memory id (placeholder until user-custom frames). */
export const frameHueForMemory = (memoryId: string): number => {
  let hash = 0
  for (let i = 0; i < memoryId.length; i++) {
    hash = (hash * 31 + memoryId.charCodeAt(i)) >>> 0
  }
  return hash % 360
}
