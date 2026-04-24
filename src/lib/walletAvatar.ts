/**
 * Deterministic visual from wallet address: conic-gradient + noise-like stops.
 */
export function walletAvatarBackground(address: string): string {
  const a = (address || '0x0').toLowerCase()
  let h1 = 0
  let h2 = 0
  for (let i = 0; i < a.length; i++) {
    h1 = (h1 * 31 + a.charCodeAt(i)) >>> 0
    h2 = (h2 * 37 + a.charCodeAt(i) * (i + 1)) >>> 0
  }
  const hue1 = h1 % 360
  const hue2 = (h1 / 7 + h2 / 11) % 360
  const hue3 = (h2 / 13 + 47) % 360
  return `conic-gradient(from ${(h1 % 180)}deg at 50% 50%, 
    hsl(${hue1}, 70%, 42%) 0deg,
    hsl(${hue2}, 65%, 38%) 120deg,
    hsl(${hue3}, 72%, 45%) 240deg,
    hsl(${hue1}, 70%, 42%) 360deg)`
}
