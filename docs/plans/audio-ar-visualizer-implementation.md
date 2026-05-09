# Audio AR visualizer (Three.js morphing sphere) — implementation handoff

**Goal:** When users open an **audio memory**, offer **View in AR** at the memory’s geo location. In AR, show a **morphing icosphere** whose vertices react to the memory’s audio (Web Audio `AnalyserNode`), reusing the existing **8th Wall / XR8** pipeline in [`src/screens/AR.tsx`](../../src/screens/AR.tsx).

**Why this doc:** Plan mode cannot create `.ts` / `.tsx` files; apply the patches below in Agent mode or manually.

---

## 1. New module: `src/lib/arAudioReactiveSphere.ts`

Create this file with:

- `createAudioReactiveSphere(opts: { audioUrl: string; loop: boolean; radius?: number; detail?: number })`
- Returns `{ anchor, sphere, shadow, audio, tick, dispose }` matching the image-AR pattern (group + shadow plane).
- `HTMLAudioElement` + `crossOrigin = 'anonymous'`
- `AudioContext` → `MediaElementAudioSourceNode` → `AnalyserNode` → destination
- `fftSize = 512`, `getByteFrequencyData` each `tick()`
- `IcosahedronGeometry(radius, detail)` with **stored base positions/normals** in `geometry.userData`; each frame update `position` attribute from `base + normal * bump(frequency)`
- Emissive color modulated by average spectrum energy
- Organic motion: small `sin(time + idx)` term so the sphere subtly moves even at low volume

**Edge cases:**

- Call `audioContext.resume()` after user gesture (tap-to-start AR already satisfies this).
- Remote audio may fail if the host blocks CORS — document for operators (IPFS gateways usually OK).

---

## 2. Extend [`src/screens/AR.tsx`](../../src/screens/AR.tsx)

### `LocationState`

Add optional fields:

```ts
audioUrl?: string
audioLoop?: boolean
```

### Branch `ArMemoryXR`

- If `state.audioUrl` is set (and optionally still require `latitude`/`longitude` unless `arDebug=1`), treat as **audio AR**:
  - Geo gate logic: same as image (`computeGate`, watchPosition).
  - Skip `buildContent` image path; use **`buildAudioContent`** that calls `createAudioReactiveSphere` inside `onStart` after `ensureThreeSceneConfigured`.
  - Placement machine: identical hit-test flow; on `PLACED`, call **`sphereHandle.tick()`** every `onUpdate` (and optionally trigger `audio.play()` on first PLACED frame — `tick` already resumes context + plays).
  - **Dispose** `sphereHandle.dispose()` in effect cleanup alongside XR stop.

### Debug query params (mirror image debug)

When `arDebug=1`, allow:

- `audioUrl=<encoded url>` to test without navigating from the map.

### Types: `placedRef` / `content`

- Replace `plane: THREE.Mesh<THREE.PlaneGeometry, ...>` with **`content: THREE.Mesh`** (or keep name `plane` but assign sphere) so bobbing animation applies to the sphere.
- `dropY` bob on the sphere’s `position.y` (already offset by `radius` on the sphere).

---

## 3. [`src/components/MemoryInspect.tsx`](../../src/components/MemoryInspect.tsx)

- Set **`MEMORY_PIN_AR_ENTRY_ENABLED`** to **`true`** (or split flags: image AR + audio AR if you want a slower rollout).
- **`canViewInAr`:** `Boolean(pin.imageUrl) || Boolean(pinAudioPlaybackUrl(pin))`
- **`handleViewInAr` / navigate state:**  
  - If audio: pass `audioUrl: pinAudioPlaybackUrl(pin)!`, `audioLoop: Boolean(pin.audioLoop)`, `latitude`, `longitude`  
  - If image only: keep existing `imageUrl` payload  
  - Do not send both unless you define precedence (prefer **audio** when `pinIsAudioMemory(pin)`).

Add the same **View in AR** affordance on **`MemoryPinFull`** (hero section) for parity with peek.

---

## 4. Smoke test

1. Pick an audio memory with a playable HTTPS/IPFS URL.
2. Peek → **View in AR** → tap **Tap to start AR** → scan floor → placement → sphere morphs with audio.
3. `?arDebug=1&audioUrl=https://…` on `/ar` without map navigation.

---

## 5. Files touched (summary)

| Action | Path |
|--------|------|
| Add | `src/lib/arAudioReactiveSphere.ts` |
| Edit | `src/screens/AR.tsx` |
| Edit | `src/components/MemoryInspect.tsx` |

No new npm dependencies (`three` already in [`package.json`](../../package.json)).

---

## Appendix A — full `arAudioReactiveSphere.ts` (copy-paste)

```ts
import * as THREE from 'three'

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
  audio.crossOrigin = 'anonymous'
  audio.loop = opts.loop
  audio.src = opts.audioUrl
  audio.preload = 'auto'

  let ctx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let sourceNode: MediaElementAudioSourceNode | null = null
  const freq = new Uint8Array(512)

  const ensureGraph = () => {
    if (ctx && analyser) return
    ctx = new AudioContext()
    analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.72
    sourceNode = ctx.createMediaElementSource(audio)
    sourceNode.connect(analyser)
    analyser.connect(ctx.destination)
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
```

In **`AR.tsx`**, after placement (`PLACED`), call `await audioHandle.startPlayback()` once, then each `onUpdate` call `audioHandle.onFrame()` plus existing bobbing on `sphere.position.y`.
