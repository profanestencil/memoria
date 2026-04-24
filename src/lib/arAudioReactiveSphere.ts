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
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export async function createAudioReactiveSphere(opts: BuildOpts): Promise<AudioReactiveSphereHandle> {
  const radius = opts.radius ?? 0.42
  const detail = clamp(opts.detail ?? 4, 3, 5)

  const audio = new Audio()
  try {
    const u = new URL(opts.audioUrl, typeof window !== 'undefined' ? window.location.href : 'https://localhost/')
    if (typeof window !== 'undefined' && u.origin === window.location.origin) {
      // same-origin (e.g. /api/media/proxy) — no CORS; Web Audio can still connect
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
    analyser.smoothingTimeConstant = 0.72
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

  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a2838,
    emissive: 0x112a3a,
    metalness: 0.55,
    roughness: 0.28,
    envMapIntensity: 1,
  })

  const sphere = new THREE.Mesh(geo, mat)
  sphere.castShadow = true

  const shadowGeo = new THREE.PlaneGeometry(2.8, 2.8)
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.38 })
  const shadow = new THREE.Mesh(shadowGeo, shadowMat)
  shadow.rotation.x = -Math.PI / 2
  shadow.receiveShadow = true

  const anchor = new THREE.Group()
  anchor.add(shadow)
  anchor.add(sphere)
  sphere.position.set(0, radius + 0.02, 0)
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
    if (!analyser) return
    if (audio.paused) return
    analyser.getByteFrequencyData(freq)
    const t = performance.now() * 0.001
    const bins = freq.length
    let energy = 0
    for (let i = 0; i < bins; i++) energy += freq[i]
    energy /= bins * 255
    mat.emissive.setRGB(0.05 + energy * 0.85, 0.12 + energy * 0.5, 0.3 + energy * 0.6)
    const baseArr = geo.userData.basePositions as Float32Array
    const normArr = geo.userData.baseNormals as Float32Array
    for (let i = 0; i < n; i++) {
      const bin = i % bins
      const f = freq[bin] / 255
      const wave = Math.sin(t * 2.2 + i * 0.07) * 0.012
      const bump = (f * 0.22 + wave) * radius
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
    geo.dispose()
    mat.dispose()
    shadowGeo.dispose()
    shadowMat.dispose()
  }

  return { anchor, sphere, shadow, audio, onFrame, startPlayback, dispose }
}
