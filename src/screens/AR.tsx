import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { distanceMeters } from '@/lib/geoAr'
import { ensureXrViewportDom } from '@/lib/ensureXrViewportDom'
import { loadXrEngine } from '@/lib/loadXrEngine'
import { createAudioReactiveSphere, type AudioReactiveSphereHandle } from '@/lib/arAudioReactiveSphere'
import { ArIframeScene } from '@/screens/ArIframeScene'

type LocationState = {
  imageUrl?: string
  /** Playable URL (https or resolved); for audio-memory AR */
  audioUrl?: string
  audioLoop?: boolean
  latitude?: number
  longitude?: number
  mode?: 'iframe'
  iframeUrl?: string
  geoRadiusM?: number
  sceneName?: string
}

type XrBuiltContent = {
  anchor: THREE.Group
  plane: THREE.Mesh
  shadow: THREE.Mesh
  audioHandle?: AudioReactiveSphereHandle
}

type MachineState =
  | 'INIT'
  | 'GEO_ACQUIRING'
  | 'OUT_OF_RANGE_BLOCKED'
  | 'IN_RANGE_STARTING_AR'
  | 'SCANNING_FOR_PLANE'
  | 'LOCKING_PLACEMENT'
  | 'PLACED'
  | 'ERROR'

type GeoFix = { lat: number; lng: number; accuracyM?: number }

type Hit = {
  position: THREE.Vector3
  normal: THREE.Vector3
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

const dist3 = (a: THREE.Vector3, b: THREE.Vector3) => a.distanceTo(b)

function ArMemoryXR({ state }: { state: LocationState }) {
  const navigate = useNavigate()

  useEffect(() => {
    document.documentElement.classList.add('mem-ar-stack')
    return () => document.documentElement.classList.remove('mem-ar-stack')
  }, [])

  const debugEnabled = useMemo(() => {
    try {
      const url = new URL(window.location.href)
      return url.searchParams.get('arDebug') === '1'
    } catch {
      return false
    }
  }, [])

  const debugImageUrl = useMemo(() => {
    if (!debugEnabled) return null
    try {
      const url = new URL(window.location.href)
      const fromQuery = url.searchParams.get('imageUrl')
      if (fromQuery) return fromQuery
    } catch {
      // ignore
    }
    // 1x1 PNG (white)
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ax6E4UAAAAASUVORK5CYII='
  }, [debugEnabled])

  const debugAudioUrl = useMemo(() => {
    if (!debugEnabled) return null
    try {
      return new URL(window.location.href).searchParams.get('audioUrl')
    } catch {
      return null
    }
  }, [debugEnabled])

  const resolvedAudioUrl = useMemo(() => {
    const fromState = state.audioUrl?.trim()
    if (fromState) return fromState
    if (debugAudioUrl?.trim()) return debugAudioUrl.trim()
    return undefined
  }, [state.audioUrl, debugAudioUrl])

  const isAudioAr = Boolean(resolvedAudioUrl)

  const resolvedImageUrl = useMemo(() => {
    if (isAudioAr) return undefined
    return state.imageUrl ?? debugImageUrl ?? undefined
  }, [isAudioAr, state.imageUrl, debugImageUrl])

  const audioLoop = Boolean(state.audioLoop)

  const targetLat = state.latitude
  const targetLng = state.longitude

  // Note: we let the engine create/manage the camera canvas (`#overlayView3d`) to avoid
  // duplicate ids and z-index issues.
  const machineRef = useRef<MachineState>('INIT')
  const geoRef = useRef<GeoFix | null>(null)
  const startAttemptRef = useRef(0)
  const startXrRef = useRef<null | ((fromUserGesture: boolean) => Promise<void>)>(null)

  const [ui, setUi] = useState<{ state: MachineState; overlay: string | null; error: string | null }>({
    state: 'INIT',
    overlay: null,
    error: null
  })

  const [distanceM, setDistanceM] = useState<number | null>(null)
  const [tapToStart, setTapToStart] = useState(false)
  const [tapToStartBusy, setTapToStartBusy] = useState(false)
  const [debug, setDebug] = useState<{
    enabled: boolean
    lines: string[]
  }>({ enabled: debugEnabled, lines: debugEnabled ? ['arDebug=1 enabled'] : [] })

  const copyOverlay = useMemo(() => {
    const format = (d: number | null) => (d == null ? '' : `${Math.round(d)}m`)
    return {
      gettingLocation: 'Getting location…',
      moveCloser: (d: number | null) => `Move closer to view in AR. Distance: ${format(d)}`,
      tooFar: 'You’re too far from this memory to view it in AR.',
      starting: 'Starting AR…',
      scan: 'Scan surfaces to place the memory.',
      scanIndoor: 'Indoor location is approximate — scan surfaces to place the memory.',
      locking: 'Hold still… locking placement',
      trackingLost: 'Tracking lost — move your phone slowly'
    }
  }, [])

  const setMachine = (next: MachineState, overlay: string | null, error: string | null = null) => {
    machineRef.current = next
    setUi({ state: next, overlay, error })
  }

  const computeGate = (geo: GeoFix | null) => {
    if (!geo || targetLat == null || targetLng == null) {
      return { nearHard: false, nearSoft: false, tooFar: false, distanceM: null as number | null }
    }
    const d = distanceMeters(geo.lat, geo.lng, targetLat, targetLng)
    const accuracyM = geo.accuracyM
    const nearHard = d <= 15 && accuracyM != null && accuracyM <= 15
    const nearSoft = d <= 50 && (accuracyM == null || accuracyM <= 50)
    const tooFar = d > 150 && accuracyM != null && accuracyM <= 50
    return { nearHard, nearSoft, tooFar, distanceM: d }
  }

  // Placement refs (populated after XR8 starts)
  const xrSceneRef = useRef<{ scene: THREE.Scene; camera: THREE.Camera; renderer: THREE.WebGLRenderer } | null>(null)
  const placedRef = useRef<{
    anchor: THREE.Group
    plane: THREE.Mesh
    shadow: THREE.Mesh
    baseY: number
    placedAtMs: number
    dropAtMs: number
  } | null>(null)

  const sphereHandleRef = useRef<AudioReactiveSphereHandle | null>(null)
  const audioPlaybackStartedRef = useRef(false)

  const hitWindowRef = useRef<{
    frames: number
    last: THREE.Vector3 | null
    samples: THREE.Vector3[]
    normal: THREE.Vector3 | null
  }>({ frames: 0, last: null, samples: [], normal: null })

  const getHitCenter = (): Hit | null => {
    try {
      const XR8Any = (globalThis as unknown as { XR8?: any }).XR8
      if (!XR8Any?.XrController?.hitTest) return null
      const hits = XR8Any.XrController.hitTest(0.5, 0.5)
      if (!Array.isArray(hits) || hits.length === 0) return null
      const h = hits[0] as any

      const pos = h.position ?? h
      const p = new THREE.Vector3(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0)

      // Prefer provided normal; fall back to +Y
      const n0 = h.normal
      const n = n0 ? new THREE.Vector3(n0.x ?? 0, n0.y ?? 1, n0.z ?? 0) : new THREE.Vector3(0, 1, 0)
      if (n.lengthSq() < 1e-6) n.set(0, 1, 0)
      n.normalize()

      return { position: p, normal: n }
    } catch {
      return null
    }
  }

  const resetHitWindow = () => {
    hitWindowRef.current = { frames: 0, last: null, samples: [], normal: null }
  }

  const updateLocking = (hit: Hit | null) => {
    const w = hitWindowRef.current
    if (!hit) {
      resetHitWindow()
      return { stable: false, avg: null as THREE.Vector3 | null, normal: null as THREE.Vector3 | null }
    }

    if (hit.normal.y < 0.8) {
      resetHitWindow()
      return { stable: false, avg: null, normal: null }
    }

    if (w.last && dist3(w.last, hit.position) > 0.05) {
      resetHitWindow()
    }

    w.frames += 1
    w.last = hit.position.clone()
    w.samples.push(hit.position.clone())
    if (w.samples.length > 24) w.samples.shift()
    w.normal = hit.normal.clone()

    const stable = w.frames >= 20
    if (!stable) return { stable: false, avg: null, normal: null }

    const avg = w.samples.reduce((acc, v) => acc.add(v), new THREE.Vector3()).multiplyScalar(1 / w.samples.length)
    return { stable: true, avg, normal: w.normal }
  }

  const ensureThreeSceneConfigured = (renderer: THREE.WebGLRenderer, scene: THREE.Scene) => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const pmrem = new THREE.PMREMGenerator(renderer)
    const env = new RoomEnvironment()
    scene.environment = pmrem.fromScene(env, 0.04).texture
    pmrem.dispose()
  }

  const addArLighting = (scene: THREE.Scene) => {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 0.6)
    scene.add(hemi)

    const dir = new THREE.DirectionalLight(0xffffff, 1.25)
    dir.position.set(2, 4, 1)
    dir.castShadow = true
    dir.shadow.mapSize.set(1024, 1024)
    dir.shadow.camera.near = 0.1
    dir.shadow.camera.far = 20
    dir.shadow.camera.left = -6
    dir.shadow.camera.right = 6
    dir.shadow.camera.top = 6
    dir.shadow.camera.bottom = -6
    scene.add(dir)
  }

  const buildAudioContent = async (scene: THREE.Scene, renderer: THREE.WebGLRenderer): Promise<XrBuiltContent> => {
    if (!resolvedAudioUrl) throw new Error('No audio URL')
    addArLighting(scene)
    const audioHandle = await createAudioReactiveSphere({
      audioUrl: resolvedAudioUrl,
      loop: audioLoop,
    })
    scene.add(audioHandle.anchor)
    ensureThreeSceneConfigured(renderer, scene)
    return {
      anchor: audioHandle.anchor,
      plane: audioHandle.sphere,
      shadow: audioHandle.shadow,
      audioHandle,
    }
  }

  const buildContent = async (scene: THREE.Scene, renderer: THREE.WebGLRenderer): Promise<XrBuiltContent> => {
    if (!resolvedImageUrl) throw new Error('No imageUrl')

    addArLighting(scene)

    // Memory plane
    const tex = await new Promise<THREE.Texture>((resolve, reject) => {
      const loader = new THREE.TextureLoader()
      loader.load(
        resolvedImageUrl,
        (t) => resolve(t),
        undefined,
        () => reject(new Error('Failed to load image'))
      )
    })
    tex.colorSpace = THREE.SRGBColorSpace

    const planeH = 1.35
    const planeW = planeH
    const geo = new THREE.PlaneGeometry(planeW, planeH)
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      side: THREE.DoubleSide,
      transparent: true,
      roughness: 0.35,
      metalness: 0.1,
      envMapIntensity: 0.8
    })
    const plane = new THREE.Mesh(geo, mat)
    plane.castShadow = true

    // Shadow catcher
    const shadowGeo = new THREE.PlaneGeometry(3.5, 3.5)
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.35 })
    const shadow = new THREE.Mesh(shadowGeo, shadowMat)
    shadow.rotation.x = -Math.PI / 2
    shadow.receiveShadow = true

    // Anchor group (positioned when placed)
    const anchor = new THREE.Group()
    anchor.add(shadow)
    anchor.add(plane)

    // Start hidden until placed
    anchor.visible = false
    scene.add(anchor)

    // Warm up env map
    ensureThreeSceneConfigured(renderer, scene)

    return { anchor, plane, shadow }
  }

  // Geo + state machine driver
  useEffect(() => {
    const hasPayload = isAudioAr ? Boolean(resolvedAudioUrl) : Boolean(resolvedImageUrl)
    const hasGeoTarget = targetLat != null && targetLng != null

    if (!hasPayload) {
      setMachine('ERROR', null, 'No memory data. Open from the map.')
      return
    }

    if (!hasGeoTarget) {
      if (debugEnabled && hasPayload) {
        setMachine('IN_RANGE_STARTING_AR', copyOverlay.starting)
        return
      }
      setMachine('ERROR', null, 'No memory data. Open from the map.')
      return
    }

    if (debugEnabled) {
      // Debug mode: skip proximity gating so we can debug XR startup anywhere.
      setMachine('IN_RANGE_STARTING_AR', copyOverlay.starting)
      return
    }

    setMachine('GEO_ACQUIRING', copyOverlay.gettingLocation)

    let cancelled = false
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        if (cancelled) return
        geoRef.current = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyM: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : undefined
        }
        const gate = computeGate(geoRef.current)
        setDistanceM(gate.distanceM)

        const cur = machineRef.current
        if (cur === 'GEO_ACQUIRING' || cur === 'OUT_OF_RANGE_BLOCKED') {
          if (gate.tooFar) {
            setMachine('OUT_OF_RANGE_BLOCKED', copyOverlay.tooFar)
            return
          }
          if (gate.nearHard || gate.nearSoft) {
            setMachine('IN_RANGE_STARTING_AR', copyOverlay.starting)
            return
          }
          setMachine('GEO_ACQUIRING', copyOverlay.moveCloser(gate.distanceM))
        }
      },
      (err) => {
        if (cancelled) return
        if (err.code === err.PERMISSION_DENIED) {
          setMachine('ERROR', null, 'Location permission is required for AR. Enable location and try again.')
          return
        }
        setMachine('ERROR', null, 'Unable to get your location for AR. Check GPS and try again.')
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15_000 }
    )

    return () => {
      cancelled = true
      navigator.geolocation.clearWatch(watchId)
    }
  }, [
    isAudioAr,
    resolvedAudioUrl,
    resolvedImageUrl,
    targetLat,
    targetLng,
    copyOverlay,
    debugEnabled,
  ])

  // XR8 boot + render loop via pipeline module
  useEffect(() => {
    if (ui.state !== 'IN_RANGE_STARTING_AR') return

    let stopped = false
    let xrRunning = false

    const XR8Any = () => (globalThis as unknown as { XR8?: any }).XR8
    const isPermissionError = (e: unknown) => {
      const msg = e instanceof Error ? e.message : ''
      const lower = msg.toLowerCase()
      return (
        lower.includes('permission') ||
        lower.includes('notallowederror') ||
        lower.includes('not allowed') ||
        lower.includes('denied') ||
        lower.includes('gesture') ||
        lower.includes('user') && lower.includes('activation')
      )
    }

    const stopXR = () => {
      const x = XR8Any()
      try {
        if (x?.stop) x.stop()
      } catch {
        // ignore
      }
      xrRunning = false
    }

    const pushDebug = (line: string) => {
      setDebug((prev) => {
        if (!prev.enabled) return prev
        const next = [...prev.lines, line]
        return { ...prev, lines: next.slice(-60) }
      })
    }

    /**
     * Engine mounts `#arview` on `body` with inline z-index:-1 (below `#root`'s z-index:1).
     * `html.mem-ar-stack #arview` in index.css uses !important; we also set inline as a fallback.
     */
    const liftArviewAboveAppChrome = () => {
      try {
        const arview = document.getElementById('arview') as HTMLElement | null
        if (!arview) return
        arview.style.setProperty('z-index', '2', 'important')
        arview.style.setProperty('pointer-events', 'none', 'important')
        arview.style.setProperty('opacity', '1', 'important')
        arview.style.setProperty('visibility', 'visible', 'important')
        const canvas = document.getElementById('overlayView3d') as HTMLElement | null
        if (canvas) {
          canvas.style.setProperty('opacity', '1', 'important')
          canvas.style.setProperty('visibility', 'visible', 'important')
        }
      } catch {
        // ignore
      }
    }

    const logArDomSnapshot = (label: string) => {
      try {
        const arview = document.getElementById('arview')
        const canvas = document.getElementById('overlayView3d') as HTMLCanvasElement | null
        const z = arview ? getComputedStyle(arview).zIndex : '—'
        const wh = canvas ? `${canvas.width}x${canvas.height}` : 'missing'
        pushDebug(`${label} arview=${Boolean(arview)} z(calc)=${z} canvas=${wh}`)
      } catch {
        pushDebug(`${label} DOM snapshot failed`)
      }
    }

    const scheduleArviewAfterRun = (x: any) => {
      const tick = () => {
        if (stopped) return
        liftArviewAboveAppChrome()
        try {
          sizeCanvasToViewport(x)
        } catch {
          // ignore
        }
      }
      tick()
      requestAnimationFrame(() => {
        tick()
        requestAnimationFrame(tick)
      })
      for (const ms of [0, 50, 150, 400]) {
        window.setTimeout(tick, ms)
      }
      window.setTimeout(() => {
        if (stopped) return
        logArDomSnapshot('post-run')
      }, 450)
    }

    const sizeCanvasToViewport = (x: any) => {
      // Always ensure DOM before lookup — resize handlers and retries can run before `startXr`
      // finishes; stale bundles also used to call `XR8.run({})` without mounting `#overlayView3d`.
      const c = ensureXrViewportDom()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.floor(window.innerWidth * dpr))
      const h = Math.max(1, Math.floor(window.innerHeight * dpr))

      // WebGL uses the element's *attributes* for drawing buffer size, not CSS.
      if (c.width !== w) c.width = w
      if (c.height !== h) c.height = h
      pushDebug(`canvas=${c.width}x${c.height} dpr=${dpr.toFixed(2)}`)

      try {
        if (x?.Canvas?.setCanvasSize) x.Canvas.setCanvasSize({ canvas: c, width: w, height: h })
      } catch {
        // ignore
      }
      try {
        if (x?.Canvas?.configure) x.Canvas.configure({ canvas: c, width: w, height: h })
      } catch {
        // ignore
      }
    }

    const startXr = async (_fromUserGesture: boolean) => {
      if (stopped) return
      if (xrRunning) return
      setTapToStart(false)
      pushDebug('startXr()')
      try {
        await loadXrEngine()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load 8th Wall runtime.'
        setMachine('ERROR', null, msg)
        pushDebug(`loadXrEngine error: ${msg}`)
        return
      }

      if (stopped) return

      const x = XR8Any()
      if (!x) {
        setMachine('ERROR', null, 'Failed to load 8th Wall runtime.')
        pushDebug('XR8 missing after load')
        return
      }

      // 8th Wall's Threejs pipeline module expects THREE to be on window/globalThis.
      ;(globalThis as unknown as { THREE?: typeof THREE }).THREE = THREE
      pushDebug('globalThis.THREE set')

      try {
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
          })
          stream.getTracks().forEach((t) => t.stop())
          pushDebug('getUserMedia ok')
        } else {
          pushDebug('getUserMedia missing')
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        pushDebug(`getUserMedia error: ${msg}`)
      }

      let content: XrBuiltContent | null = null

      const logicModule = () => ({
        name: 'memoria-state-machine',
        onStart: async () => {
          const xrScene = x.Threejs?.xrScene?.()
          if (!xrScene?.scene || !xrScene?.renderer || !xrScene?.camera) {
            setMachine('ERROR', null, 'Failed to initialize 8th Wall Three.js scene.')
            return
          }
          xrSceneRef.current = xrScene

          // Critical: do not clear to opaque black. GlTextureRenderer renders the camera background;
          // if Three.js clears the framebuffer, you only see black.
          try {
            xrScene.renderer.autoClear = false
            xrScene.renderer.setClearColor(0x000000, 0)
          } catch {
            // ignore
          }

          try {
            sphereHandleRef.current?.dispose()
            sphereHandleRef.current = null
            audioPlaybackStartedRef.current = false
            if (isAudioAr) {
              content = await buildAudioContent(xrScene.scene, xrScene.renderer)
              sphereHandleRef.current = content.audioHandle ?? null
            } else {
              content = await buildContent(xrScene.scene, xrScene.renderer)
            }
          } catch (e) {
            setMachine(
              'ERROR',
              null,
              e instanceof Error ? e.message : isAudioAr ? 'Failed to load audio for AR' : 'Failed to load image'
            )
            return
          }

          // Once tracking is ready, we can scan for planes.
          const gate = computeGate(geoRef.current)
          setMachine(
            'SCANNING_FOR_PLANE',
            gate.nearHard ? copyOverlay.scan : copyOverlay.scanIndoor
          )
        },
        onUpdate: () => {
          if (stopped) return
          if (!xrSceneRef.current || !content) return

          const cur = machineRef.current
          if (cur === 'SCANNING_FOR_PLANE') {
            const hit = getHitCenter()
            if (!hit) return
            resetHitWindow()
            setMachine('LOCKING_PLACEMENT', copyOverlay.locking)
            return
          }

          if (cur === 'LOCKING_PLACEMENT') {
            const hit = getHitCenter()
            const locked = updateLocking(hit)
            if (!locked.stable || !locked.avg || !locked.normal) return

            // Place once
            const { anchor, plane } = content
            anchor.visible = true
            anchor.position.copy(locked.avg)

            const cam = xrSceneRef.current.camera as any
            const camPos = cam?.position ? (cam.position as THREE.Vector3) : new THREE.Vector3(0, 0, 0)

            // Image memory: billboard toward camera; audio sphere: symmetric — keep factory pose
            if (!content.audioHandle) {
              plane.position.set(0, 0.15, 0)
              const look = new THREE.Vector3(camPos.x, locked.avg.y + 0.15, camPos.z)
              plane.lookAt(look)
              plane.rotation.x = 0
              plane.rotation.z = 0
            }

            const now = Date.now()
            placedRef.current = {
              anchor,
              plane,
              shadow: content.shadow,
              baseY: plane.position.y,
              placedAtMs: now,
              dropAtMs: now
            }

            setMachine('PLACED', null)
            return
          }

          if (cur === 'PLACED') {
            const p = placedRef.current
            if (!p) return

            if (content.audioHandle && !audioPlaybackStartedRef.current) {
              audioPlaybackStartedRef.current = true
              void content.audioHandle.startPlayback()
            }
            content.audioHandle?.onFrame()

            const t = (Date.now() - p.dropAtMs) / 1000

            // Drop-in (first 0.6s)
            const dropT = clamp((Date.now() - p.dropAtMs) / 600, 0, 1)
            const easeOut = 1 - (1 - dropT) * (1 - dropT)
            const dropY = p.baseY + (1 - easeOut) * 0.4

            // Bob after drop (still ok to apply during drop)
            const bob = Math.sin(t * Math.PI * 2 * 0.9) * 0.03
            p.plane.position.y = dropY + bob
            return
          }
        }
      })

      try {
        if (x.clearCameraPipelineModules) {
          try {
            x.clearCameraPipelineModules()
          } catch {
            // ignore
          }
        }

        if (x.onError) {
          try {
            x.onError((err: unknown) => {
              const msg =
                typeof err === 'string'
                  ? err
                  : err instanceof Error
                    ? err.message
                    : JSON.stringify(err)
              pushDebug(`XR8.onError: ${msg}`)
            })
            pushDebug('XR8.onError handler set')
          } catch {
            // ignore
          }
        }

        let frames = 0
        let lastReportAt = Date.now()
        if (x.runPreRender) {
          try {
            x.runPreRender(() => {
              frames += 1
              const now = Date.now()
              if (now - lastReportAt > 1000) {
                pushDebug(`runPreRender fps~${frames}`)
                frames = 0
                lastReportAt = now
              }
            })
            pushDebug('XR8.runPreRender hooked')
          } catch {
            // ignore
          }
        } else {
          pushDebug('XR8.runPreRender missing')
        }

        pushDebug(
          `XR8 modules: Canvas=${Boolean(x.Canvas)} Camera=${Boolean(x.Camera)} GlTextureRenderer=${Boolean(
            x.GlTextureRenderer
          )} Threejs=${Boolean(x.Threejs)} XrController=${Boolean(x.XrController)}`
        )

        const xrCanvas = ensureXrViewportDom()
        pushDebug(
          `XR8 bootstrap sdkFix=v2 viewport ok #arview=${Boolean(document.getElementById('arview'))} canvas=${xrCanvas.width}x${xrCanvas.height}`
        )

        sizeCanvasToViewport(x)

        if (x.loadChunk) {
          try {
            await x.loadChunk('slam')
          } catch {
            // ignore
          }
        }

        if (x.GlTextureRenderer?.configure) {
          try {
            x.GlTextureRenderer.configure({ mirroredDisplay: false })
            pushDebug('GlTextureRenderer.configure mirroredDisplay=false')
          } catch {
            // ignore
          }
        }

        if (x.XrController?.configure) {
          try {
            // This engine build uses `disableWorldTracking` (not enableWorldTracking).
            x.XrController.configure({ disableWorldTracking: false, enableVps: false, scale: 1 })
            pushDebug('XrController.configure disableWorldTracking=false enableVps=false scale=1')
          } catch {
            // ignore
          }
        }

        // Pipeline modules: include optional camera/canvas modules when present.
        // Some engine builds require a Camera and/or Canvas pipeline module for camera background output.
        const modules = [
          x.Canvas?.pipelineModule?.(),
          x.Camera?.pipelineModule?.(),
          x.GlTextureRenderer?.pipelineModule?.(),
          x.Threejs?.pipelineModule?.(),
          x.XrController?.pipelineModule?.(),
          logicModule()
        ].filter(Boolean)
        pushDebug(`pipelineModules count=${modules.length}`)

        if (x.addCameraPipelineModules) {
          x.addCameraPipelineModules(modules)
          pushDebug('addCameraPipelineModules ok')
        }

        if (x.run) {
          pushDebug('XR8.run(canvasElement, {}) sdkFix=v2')
          // First argument must be the WebGL canvas; second is session config (`{}` ok).
          // `XR8.run({})` leaves pipeline without a canvas — `#overlayView3d` never existed.
          x.run(xrCanvas, {})
          xrRunning = true
          pushDebug('XR8.run() returned')
          try {
            if (x.isPaused) pushDebug(`XR8.isPaused=${Boolean(x.isPaused())}`)
          } catch {
            // ignore
          }

          scheduleArviewAfterRun(x)
        } else {
          setMachine('ERROR', null, 'Failed to start 8th Wall runtime.')
          pushDebug('XR8.run missing')
          return
        }
      } catch (e) {
        if (isPermissionError(e)) {
          const msg = e instanceof Error ? e.message : 'Camera permission is required for AR.'
          setTapToStart(true)
          setTapToStartBusy(false)
          // Keep the state machine in a retryable state (do NOT go to ERROR, which stops XR boot attempts).
          setMachine(
            'IN_RANGE_STARTING_AR',
            'Camera blocked — allow camera access, then tap to start AR again.',
            msg
          )
          pushDebug(`permission-ish error: ${msg}`)
          return
        }
        const msg = e instanceof Error ? e.message : 'Failed to start AR.'
        setMachine('ERROR', null, msg)
        pushDebug(`startXr error: ${msg}`)
        return
      }
    }

    // Navigation to /ar breaks the original user-gesture chain, so many browsers (notably iOS Safari)
    // will fail camera start unless XR8.run is called from a tap on THIS page.
    // Default to a tap-to-start UI; once started, the placement state machine remains auto.
    startAttemptRef.current += 1
    startXrRef.current = startXr
    setTapToStart(true)

    const handleResize = () => {
      const x = XR8Any()
      if (!x) return
      liftArviewAboveAppChrome()
      sizeCanvasToViewport(x)
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)

    return () => {
      stopped = true
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
      startXrRef.current = null
      if (xrRunning) stopXR()
      sphereHandleRef.current?.dispose()
      sphereHandleRef.current = null
      audioPlaybackStartedRef.current = false
      xrSceneRef.current = null
      placedRef.current = null
      resetHitWindow()
    }
  }, [ui.state, copyOverlay, isAudioAr, resolvedImageUrl, resolvedAudioUrl, audioLoop])

  const overlay = ui.error ? null : ui.overlay
  const showBack = true
  const handleTapToStart = async () => {
    if (tapToStartBusy) return
    if (ui.state !== 'IN_RANGE_STARTING_AR') return
    if (!startXrRef.current) return
    setTapToStartBusy(true)
    try {
      await startXrRef.current(true)
    } finally {
      setTapToStartBusy(false)
    }
  }

  return (
    <>
      {/* Engine injects `#arview` + `#overlayView3d` on body; no full-viewport wrapper (WebKit black composite). */}

      {overlay ? (
        <div
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 24,
            zIndex: 10,
            pointerEvents: 'auto',
            background: 'rgba(8,7,6,0.72)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 14,
            padding: 12,
            color: '#fff',
            fontSize: 14
          }}
        >
          {overlay}
        </div>
      ) : null}

      {tapToStart ? (
        <div
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 24,
            zIndex: 12,
            maxWidth: 420,
            margin: '0 auto',
            pointerEvents: 'auto',
            background: 'rgba(8,7,6,0.82)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 14,
            padding: 12,
            color: '#fff',
            fontSize: 14
          }}
          role="region"
          aria-label="Start AR"
        >
          <p style={{ margin: '0 0 10px', color: 'rgba(255,255,255,0.9)', lineHeight: 1.4 }}>
            Your browser requires a tap to start the camera for AR.
          </p>
          <button
            type="button"
            className="mem-btn mem-btn--primary"
            onClick={handleTapToStart}
            disabled={tapToStartBusy}
            aria-label="Tap to start AR"
            style={{ width: '100%' }}
          >
            {tapToStartBusy ? 'Starting…' : 'Tap to start AR'}
          </button>
        </div>
      ) : null}

      {ui.state === 'PLACED' ? null : null}

      {ui.error ? (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: 16,
            right: 16,
            zIndex: 10,
            pointerEvents: 'auto',
            background: 'rgba(80, 28, 28, 0.55)',
            border: '1px solid rgba(240, 160, 160, 0.22)',
            borderRadius: 14,
            padding: 12,
            color: '#ffd4d4',
            fontSize: 14,
            lineHeight: 1.45
          }}
        >
          {ui.error}
        </div>
      ) : null}

      {showBack ? (
        <div
          style={{
            position: 'fixed',
            top: 12,
            left: 12,
            zIndex: 11,
            display: 'flex',
            gap: 8,
            pointerEvents: 'auto'
          }}
        >
          <button
            type="button"
            className="mem-btn mem-btn--ghost"
            onClick={() => navigate('/map')}
            aria-label="Back to map"
            style={{ background: 'rgba(10, 9, 8, 0.88)' }}
          >
            Back to map
          </button>
          {distanceM != null ? (
            <div
              style={{
                alignSelf: 'center',
                color: 'rgba(255,255,255,0.75)',
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(10,9,8,0.55)'
              }}
            >
              {Math.round(distanceM)}m
            </div>
          ) : null}
        </div>
      ) : null}

      {debug.enabled ? (
        <div
          style={{
            position: 'fixed',
            top: 12,
            right: 12,
            zIndex: 20,
            width: 320,
            maxWidth: 'calc(100vw - 24px)',
            pointerEvents: 'auto',
            background: 'rgba(0,0,0,0.72)',
            border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: 12,
            padding: 10,
            color: 'rgba(255,255,255,0.88)',
            fontSize: 11,
            lineHeight: 1.35
          }}
          role="region"
          aria-label="AR debug"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <div style={{ fontWeight: 700 }}>AR debug</div>
            <button
              type="button"
              className="mem-btn mem-btn--ghost"
              onClick={() => setDebug({ enabled: false, lines: [] })}
              aria-label="Close AR debug"
              style={{ padding: '4px 8px', fontSize: 11, background: 'rgba(10,9,8,0.55)' }}
            >
              Close
            </button>
          </div>
          <div style={{ maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {debug.lines.join('\n')}
          </div>
        </div>
      ) : null}
    </>
  )
}

export function AR() {
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  if (state.mode === 'iframe' && state.iframeUrl && state.latitude != null && state.longitude != null) {
    return (
      <ArIframeScene
        iframeUrl={state.iframeUrl}
        latitude={state.latitude}
        longitude={state.longitude}
        geoRadiusM={state.geoRadiusM}
        sceneName={state.sceneName}
      />
    )
  }
  return <ArMemoryXR state={state} />
}
