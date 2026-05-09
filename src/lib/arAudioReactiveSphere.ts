import * as THREE from 'three'

/** CPU-displaced icosphere driven by Web Audio analyzer — works inside 8th Wall Three pipeline */
export type AudioReactiveSphereHandle = {
  anchor: THREE.Group
  sphere: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  shadow: THREE.Mesh
  audio: HTMLAudioElement
  onFrame: () => void
  startPlayback: () => Promise<void>
  dispose: () => void
}

type BuildOpts = {
  audioUrl: string
  loop: boolean
  radius?: number
  detail?: number
  /** Blend in Three.VideoTexture from AR camera &lt;video&gt; when available */
  useCameraFeedTexture?: boolean
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Prefer the largest playing video (8th Wall camera preview is usually a &lt;video&gt; in the DOM). */
export function pickCameraFeedVideo(): HTMLVideoElement | null {
  if (typeof document === 'undefined') return null
  const candidates = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[]
  const ok = candidates.filter((v) => v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && (v.videoWidth || 0) > 0)
  if (ok.length === 0) return null
  return ok.reduce((a, b) =>
    a.videoWidth * a.videoHeight >= b.videoWidth * b.videoHeight ? a : b
  )
}

export async function createAudioReactiveSphere(opts: BuildOpts): Promise<AudioReactiveSphereHandle> {
  const radius = opts.radius ?? 0.48
  const detail = clamp(opts.detail ?? 4, 3, 5)
  /** When true (default), blend in camera preview texture once a &lt;video&gt; feed exists */
  const wantCamTex = opts.useCameraFeedTexture !== false

  const audio = new Audio()
  try {
    const u = new URL(opts.audioUrl, typeof window !== 'undefined' ? window.location.href : 'https://localhost/')
    if (typeof window !== 'undefined' && u.origin === window.location.origin) {
      // same-origin — OK
    } else {
      audio.crossOrigin = 'anonymous'
    }
  } catch {
    audio.crossOrigin = 'anonymous'
  }
  audio.loop = opts.loop
  audio.src = opts.audioUrl
  audio.preload = 'auto'

  let ctx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let sourceNode: MediaElementAudioSourceNode | null = null
  let freq = new Uint8Array(256)

  const ensureGraph = () => {
    if (ctx && analyser) return
    ctx = new AudioContext()
    analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.68
    sourceNode = ctx.createMediaElementSource(audio)
    sourceNode.connect(analyser)
    analyser.connect(ctx.destination)
    freq = new Uint8Array(analyser.frequencyBinCount)
  }

  await new Promise<void>((resolve, reject) => {
    const done = () => {
      audio.removeEventListener('canplay', done)
      audio.removeEventListener('error', onErr)
      resolve()
    }
    const onErr = () => {
      audio.removeEventListener('canplay', done)
      audio.removeEventListener('error', onErr)
      reject(new Error('Could not load audio for AR'))
    }
    audio.addEventListener('canplay', done, { once: true })
    audio.addEventListener('error', onErr, { once: true })
    audio.load()
  })

  const geo = new THREE.IcosahedronGeometry(radius, detail)
  const pos = geo.attributes.position
  const n = pos.count
  const base = new Float32Array(n * 3)
  const norm = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    base[i * 3] = pos.getX(i)
    base[i * 3 + 1] = pos.getY(i)
    base[i * 3 + 2] = pos.getZ(i)
  }
  geo.userData.basePositions = base
  geo.computeVertexNormals()
  const na = geo.attributes.normal
  for (let i = 0; i < n; i++) {
    norm[i * 3] = na.getX(i)
    norm[i * 3 + 1] = na.getY(i)
    norm[i * 3 + 2] = na.getZ(i)
  }
  geo.userData.baseNormals = norm

  let videoTex: THREE.VideoTexture | null = null
  const feed = wantCamTex ? pickCameraFeedVideo() : null
  if (feed) {
    try {
      videoTex = new THREE.VideoTexture(feed)
      videoTex.colorSpace = THREE.SRGBColorSpace
      videoTex.minFilter = THREE.LinearFilter
      videoTex.magFilter = THREE.LinearFilter
    } catch {
      videoTex = null
    }
  }

  const mat = new THREE.MeshStandardMaterial({
    color: videoTex ? 0xffffff : 0x1a2838,
    map: videoTex ?? undefined,
    emissive: 0x112a3a,
    metalness: videoTex ? 0.22 : 0.55,
    roughness: videoTex ? 0.55 : 0.28,
    envMapIntensity: videoTex ? 0.65 : 1,
  })

  const sphere = new THREE.Mesh(geo, mat)
  sphere.castShadow = true
  sphere.scale.set(1, 0.55, 1)

  const shadowGeo = new THREE.PlaneGeometry(2.4, 2.4)
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.42 })
  const shadow = new THREE.Mesh(shadowGeo, shadowMat)
  shadow.rotation.x = -Math.PI / 2
  shadow.receiveShadow = true

  const anchor = new THREE.Group()
  anchor.add(shadow)
  anchor.add(sphere)
  sphere.position.set(0, radius * 0.52 + 0.02, 0)
  anchor.visible = false

  let started = false
  const startPlayback = async () => {
    ensureGraph()
    if (ctx?.state === 'suspended') await ctx.resume()
    if (started) return
    started = true
    try {
      await audio.play()
    } catch {
      started = false
    }
  }

  const onFrame = () => {
    if (!videoTex && wantCamTex) {
      const feedLater = pickCameraFeedVideo()
      if (feedLater) {
        try {
          videoTex = new THREE.VideoTexture(feedLater)
          videoTex.colorSpace = THREE.SRGBColorSpace
          videoTex.minFilter = THREE.LinearFilter
          videoTex.magFilter = THREE.LinearFilter
          mat.map = videoTex
          mat.color.setRGB(1, 1, 1)
          mat.metalness = 0.22
          mat.roughness = 0.55
          mat.envMapIntensity = 0.65
        } catch {
          videoTex = null
        }
      }
    }
    if (videoTex) videoTex.needsUpdate = true
    if (!analyser) return
    if (audio.paused) return
    analyser.getByteFrequencyData(freq)
    const t = performance.now() * 0.001
    const bins = freq.length
    let energy = 0
    for (let i = 0; i < bins; i++) energy += freq[i]
    energy /= bins * 255
    const eBoost = 0.08 + energy * 0.95
    mat.emissive.setRGB(eBoost * 0.35, eBoost * 0.55, eBoost * 0.75)
    const baseArr = geo.userData.basePositions as Float32Array
    const normArr = geo.userData.baseNormals as Float32Array
    for (let i = 0; i < n; i++) {
      const bin = i % bins
      const f = freq[bin] / 255
      const wave = Math.sin(t * 2.4 + i * 0.065) * 0.014
      const bump = (f * 0.26 + wave) * radius
      const ix = i * 3
      pos.setXYZ(
        i,
        baseArr[ix] + normArr[ix] * bump,
        baseArr[ix + 1] + normArr[ix + 1] * bump,
        baseArr[ix + 2] + normArr[ix + 2] * bump
      )
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
  }

  const dispose = () => {
    try {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    } catch {
      // ignore
    }
    try {
      sourceNode?.disconnect()
      analyser?.disconnect()
      void ctx?.close()
    } catch {
      // ignore
    }
    ctx = null
    analyser = null
    sourceNode = null
    try {
      videoTex?.dispose()
    } catch {
      // ignore
    }
    geo.dispose()
    mat.dispose()
    shadowGeo.dispose()
    shadowMat.dispose()
  }

  return { anchor, sphere, shadow, audio, onFrame, startPlayback, dispose }
}
