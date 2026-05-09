/**
 * Official three.js world-effects sample passes a single body canvas to `XR8.run({ canvas })`
 * (see https://github.com/8thwall/threejs-world-effects-example — id `camerafeed`).
 * We keep classes `8w` + `overlayView3d` for compatibility with engine helpers that look them up.
 */
export const ensureXrViewportDom = (): HTMLCanvasElement => {
  let canvas = document.getElementById('camerafeed') as HTMLCanvasElement | null
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.id = 'camerafeed'
    canvas.classList.add('8w')
    canvas.classList.add('overlayView3d')
    document.body.appendChild(canvas)
  }
  return canvas
}
