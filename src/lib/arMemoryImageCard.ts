import * as THREE from 'three'

export type MemoryImageCardContent = {
  anchor: THREE.Group
  /** Applies user drag rotation + bob */
  tiltGroup: THREE.Group
  cardGroup: THREE.Group
  frontPlane: THREE.Mesh
  backPlane: THREE.Mesh
  /** Primary mesh for legacy refs — front face */
  plane: THREE.Mesh
  /** Hidden when floating in screen space */
  shadow: THREE.Mesh
}

const MATTE_BACK = 0xd8d4cc

/**
 * Double-sided memory card: image UV-mapped on front, matte canvas-style back.
 * Aspect ratio follows the loaded image; longest edge is `maxEdgeM` meters.
 */
export async function createMemoryImageCard(opts: {
  imageUrl: string
  /** Longer edge in meters (width or height) */
  maxEdgeM?: number
  /** Distance between front and back faces (m) */
  thicknessM?: number
}): Promise<MemoryImageCardContent> {
  const maxEdgeM = opts.maxEdgeM ?? 1.22
  const thicknessM = opts.thicknessM ?? 0.012

  const tex = await new Promise<THREE.Texture>((resolve, reject) => {
    const loader = new THREE.TextureLoader()
    if (!opts.imageUrl.startsWith('blob:') && !opts.imageUrl.startsWith('data:')) {
      loader.setCrossOrigin('anonymous')
    }
    loader.load(
      opts.imageUrl,
      (t) => resolve(t),
      undefined,
      () => reject(new Error('Failed to load memory image'))
    )
  })
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8

  const img = tex.image as HTMLImageElement | { width: number; height: number }
  const iw = img.width || 1
  const ih = img.height || 1
  const aspect = iw / ih

  let w: number
  let h: number
  if (aspect >= 1) {
    w = maxEdgeM
    h = maxEdgeM / aspect
  } else {
    h = maxEdgeM
    w = maxEdgeM * aspect
  }

  const halfT = thicknessM / 2
  const frontGeo = new THREE.PlaneGeometry(w, h)
  const frontMat = new THREE.MeshStandardMaterial({
    map: tex,
    side: THREE.FrontSide,
    transparent: true,
    roughness: 0.42,
    metalness: 0.06,
    envMapIntensity: 0.75,
  })
  const frontPlane = new THREE.Mesh(frontGeo, frontMat)
  frontPlane.position.z = halfT

  const backGeo = new THREE.PlaneGeometry(w, h)
  const backMat = new THREE.MeshStandardMaterial({
    color: MATTE_BACK,
    side: THREE.FrontSide,
    roughness: 0.94,
    metalness: 0,
    envMapIntensity: 0.15,
  })
  const backPlane = new THREE.Mesh(backGeo, backMat)
  backPlane.position.z = -halfT
  backPlane.rotation.y = Math.PI

  const cardGroup = new THREE.Group()
  cardGroup.add(frontPlane)
  cardGroup.add(backPlane)

  const tiltGroup = new THREE.Group()
  tiltGroup.add(cardGroup)

  const shadowGeo = new THREE.PlaneGeometry(Math.max(w, h) * 1.2, Math.max(w, h) * 1.2)
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.22 })
  const shadow = new THREE.Mesh(shadowGeo, shadowMat)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = -maxEdgeM * 0.55
  shadow.receiveShadow = true
  shadow.visible = false

  const anchor = new THREE.Group()
  anchor.add(tiltGroup)
  anchor.add(shadow)

  return {
    anchor,
    tiltGroup,
    cardGroup,
    frontPlane,
    backPlane,
    plane: frontPlane,
    shadow,
  }
}

export const disposeMemoryImageCard = (c: MemoryImageCardContent) => {
  try {
    c.frontPlane.geometry.dispose()
    ;(c.frontPlane.material as THREE.MeshStandardMaterial).map?.dispose()
    ;(c.frontPlane.material as THREE.Material).dispose()
    c.backPlane.geometry.dispose()
    ;(c.backPlane.material as THREE.Material).dispose()
    c.shadow.geometry.dispose()
    ;(c.shadow.material as THREE.Material).dispose()
  } catch {
    // ignore
  }
}
