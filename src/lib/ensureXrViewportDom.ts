/**
 * 8th Wall engine expects `#arview` + `#overlayView3d` (canvas) on `document.body`
 * before `XR8.run(canvas, config)`. The minified bundle only auto-creates this stack
 * on some Studio / Sumerian paths; calling `XR8.run({})` without a canvas leaves
 * `#overlayView3d` missing and the camera/WebGL pipeline never attaches.
 *
 * Mirrors the engine’s own IIFE: canvas class `8w overlayView3d`, id `overlayView3d`.
 */
export const ensureXrViewportDom = (): HTMLCanvasElement => {
  let arview = document.getElementById('arview')
  if (!arview) {
    arview = document.createElement('div')
    arview.id = 'arview'
    arview.setAttribute(
      'style',
      'position:absolute; top: 0; left: 0; bottom: 0; right: 0; z-index: -1;'
    )
    document.body.appendChild(arview)
  }

  let el = document.getElementById('overlayView3d')
  if (!el) {
    const canvas = document.createElement('canvas')
    canvas.classList.add('8w')
    canvas.classList.add('overlayView3d')
    canvas.id = 'overlayView3d'
    arview.appendChild(canvas)
    el = canvas
  }

  return el as HTMLCanvasElement
}
