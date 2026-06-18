const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** Deterministic frame accent hue when no custom colour is set. */
export const frameHueForMemory = (memoryId: string): number => {
  let hash = 0
  for (let i = 0; i < memoryId.length; i++) {
    hash = (hash * 31 + memoryId.charCodeAt(i)) >>> 0
  }
  return hash % 360
}

export type FrameAccent = { frameColor: string } | { frameHue: number }

/** Campaign / mint pin colour wins; otherwise deterministic hue from memory id. */
export const frameAccentForPin = (pin: { memoryId: string; pinColor?: string }): FrameAccent => {
  const hex = pin.pinColor?.trim()
  if (hex && HEX_RE.test(hex)) return { frameColor: hex }
  return { frameHue: frameHueForMemory(pin.memoryId) }
}
