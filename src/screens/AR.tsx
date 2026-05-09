import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { distanceMeters } from '@/lib/geoAr'
import { ensureXrViewportDom } from '@/lib/ensureXrViewportDom'
import { loadXrEngine } from '@/lib/loadXrEngine'
import { createAudioReactiveSphere, type AudioReactiveSphereHandle } from '@/lib/arAudioReactiveSphere'
import { createMemoryImageCard } from '@/lib/arMemoryImageCard'
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
  tiltGroup?: THREE.Group
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

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

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

  // Camera/WebGL canvas is `#camerafeed` on body (same contract as threejs-world-effects-example).
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

  /** One-finger drag rotates the memory card (yaw/pitch), relative to camera-facing pose */
  const imageDragRef = useRef({ yaw: 0, pitch: 0, active: false, lastX: 0, lastY: 0 })

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
      useCameraFeedTexture: true,
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

    const card = await createMemoryImageCard({ imageUrl: resolvedImageUrl })
    card.anchor.visible = false
    scene.add(card.anchor)

    ensureThreeSceneConfigured(renderer, scene)

    return {
      anchor: card.anchor,
      plane: card.plane,
      shadow: card.shadow,
      tiltGroup: card.tiltGroup,
    }
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

  /** Allow one-finger drag on the camera canvas for image-card rotation (otherwise AR raises canvas above UI with pointer-events: none). */
  useEffect(() => {
    const el = document.getElementById('camerafeed')
    if (!el) return
    if (ui.state === 'PLACED' && !isAudioAr) {
      el.style.setProperty('pointer-events', 'auto', 'important')
    } else {
      el.style.setProperty('pointer-events', 'none', 'important')
    }
  }, [ui.state, isAudioAr])

  const MAX_CARD_DRAG_YAW = 0.72
  const MAX_CARD_DRAG_PITCH = 0.5
  const CARD_DRAG_SENS = 0.0045

  useEffect(() => {
    if (ui.state !== 'PLACED' || isAudioAr) return
    const el = document.getElementById('camerafeed')
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const d = imageDragRef.current
      d.active = true
      d.lastX = e.touches[0].clientX
      d.lastY = e.touches[0].clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      const d = imageDragRef.current
      if (!d.active || e.touches.length !== 1) return
      const x = e.touches[0].clientX
      const y = e.touches[0].clientY
      const dx = x - d.lastX
      const dy = y - d.lastY
      d.lastX = x
      d.lastY = y
      d.yaw = clamp(d.yaw + dx * CARD_DRAG_SENS, -MAX_CARD_DRAG_YAW, MAX_CARD_DRAG_YAW)
      d.pitch = clamp(d.pitch - dy * CARD_DRAG_SENS, -MAX_CARD_DRAG_PITCH, MAX_CARD_DRAG_PITCH)
      e.preventDefault()
    }

    const onTouchEnd = () => {
      imageDragRef.current.active = false
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [ui.state, isAudioAr])

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

    /** Ensure `#camerafeed` composites above app chrome (CSS + inline fallback). */
    const liftArviewAboveAppChrome = () => {
      try {
        const canvas = document.getElementById('camerafeed') as HTMLElement | null
        if (!canvas) return
        canvas.style.setProperty('z-index', '2', 'important')
        canvas.style.setProperty('pointer-events', 'none', 'important')
        canvas.style.setProperty('opacity', '1', 'important')
        canvas.style.setProperty('visibility', 'visible', 'important')
      } catch {
        // ignore
      }
    }

    const logArDomSnapshot = (label: string) => {
      try {
        const canvas = document.getElementById('camerafeed') as HTMLCanvasElement | null
        const z = canvas ? getComputedStyle(canvas).zIndex : '—'
        const wh = canvas ? `${canvas.width}x${canvas.height}` : 'missing'
        pushDebug(`${label} camerafeed=${Boolean(canvas)} z(calc)=${z} canvas=${wh}`)
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
      // finishes; stale bundles also used to call `XR8.run({})` without mounting `#camerafeed`.
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

      const positionAudioVisualizerAnchor = () => {
        if (!xrSceneRef.current || !content?.audioHandle) return
        const cam = xrSceneRef.current.camera
        const dir = new THREE.Vector3()
        cam.getWorldDirection(dir)
        const p = cam.position.clone().addScaledVector(dir, 1.35)
        p.y = Math.max(0.12, cam.position.y - 1.25)
        content.anchor.position.copy(p)
        content.anchor.visible = true
      }

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
            xrScene.scene.background = null
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

          // No plane scan: Landing Page was removed (splash blocked startup); audio + image both go straight to PLACED.
          if (!content) return

          if (!isAudioAr) {
            imageDragRef.current = { yaw: 0, pitch: 0, active: false, lastX: 0, lastY: 0 }
            content.anchor.visible = true
            const now = Date.now()
            placedRef.current = {
              anchor: content.anchor,
              plane: content.plane,
              shadow: content.shadow,
              baseY: 0,
              placedAtMs: now,
              dropAtMs: now,
            }
            setMachine('PLACED', null)
            return
          }

          content.anchor.visible = true
          const nowAudio = Date.now()
          placedRef.current = {
            anchor: content.anchor,
            plane: content.plane,
            shadow: content.shadow,
            baseY: content.plane.position.y,
            placedAtMs: nowAudio,
            dropAtMs: nowAudio,
          }
          setMachine('PLACED', null)
        },
        onUpdate: () => {
          if (stopped) return
          if (!xrSceneRef.current || !content) return

          const cur = machineRef.current

          if (cur === 'PLACED') {
            const p = placedRef.current
            if (!p) return

            // Audio: reactive sphere + optional camera texture (re-anchor each frame — no SLAM placement dependency)
            if (content.audioHandle) {
              positionAudioVisualizerAnchor()

              if (!audioPlaybackStartedRef.current) {
                audioPlaybackStartedRef.current = true
                void content.audioHandle.startPlayback()
              }
              content.audioHandle.onFrame()

              const t = (Date.now() - p.dropAtMs) / 1000

              const dropT = clamp((Date.now() - p.dropAtMs) / 600, 0, 1)
              const easeOut = 1 - (1 - dropT) * (1 - dropT)
              const dropY = p.baseY + (1 - easeOut) * 0.4

              const bob = Math.sin(t * Math.PI * 2 * 0.9) * 0.03
              p.plane.position.y = dropY + bob
              return
            }

            // Image card: fixed distance in front of camera, user yaw/pitch on tiltGroup, gentle bob
            const cam = xrSceneRef.current.camera
            const dist = 1.06
            const dir = new THREE.Vector3()
            cam.getWorldDirection(dir)
            const pos = cam.position.clone().addScaledVector(dir, dist)
            content.anchor.position.copy(pos)
            const towardCam = new THREE.Vector3().subVectors(cam.position, content.anchor.position)
            if (towardCam.lengthSq() > 1e-8) {
              towardCam.normalize()
              content.anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), towardCam)
            }

            const tg = content.tiltGroup
            if (tg) {
              const drag = imageDragRef.current
              tg.rotation.order = 'YXZ'
              tg.rotation.y = drag.yaw
              tg.rotation.x = drag.pitch
              const tt = (Date.now() - p.dropAtMs) / 1000
              const bob = Math.sin(tt * Math.PI * 2 * 0.88) * 0.038
              tg.position.y = bob
            }
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

        const hostGlobals = globalThis as unknown as {
          XRExtras?: {
            FullWindowCanvas?: { pipelineModule?: () => unknown }
            Loading?: { pipelineModule?: () => unknown }
            RuntimeError?: { pipelineModule?: () => unknown }
          }
        }

        pushDebug(
          `XR8 modules: GlTextureRenderer=${Boolean(x.GlTextureRenderer)} Threejs=${Boolean(x.Threejs)} XrController=${Boolean(
            x.XrController
          )} XRExtras=${Boolean(hostGlobals.XRExtras)}`
        )

        const xrCanvas = ensureXrViewportDom()
        pushDebug(
          `viewport #camerafeed=${Boolean(document.getElementById('camerafeed'))} canvas=${xrCanvas.width}x${xrCanvas.height}`
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

        // Ensure the Three.js module is configured to render the camera texture background.
        // If this is off, the WebGL buffer can stay transparent/blank even with the camera feed modules attached.
        if (x.Threejs?.configure) {
          try {
            x.Threejs.configure({ renderCameraTexture: true })
            pushDebug('Threejs.configure renderCameraTexture=true')
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            pushDebug(`Threejs.configure error: ${msg}`)
          }
        }

        const debugPipelineModule = () => {
          let attached = false
          let lastVideo = ''
          let lastCanvas = ''
          return {
            name: 'memoria-debug-pipeline',
            onAttach: (args: any) => {
              attached = true
              try {
                const vw = args?.videoWidth
                const vh = args?.videoHeight
                const cw = args?.canvasWidth
                const ch = args?.canvasHeight
                lastVideo = `${vw}x${vh}`
                lastCanvas = `${cw}x${ch}`
                pushDebug(`pipeline onAttach video=${lastVideo} canvas=${lastCanvas}`)
              } catch {
                pushDebug('pipeline onAttach (failed to read sizes)')
              }
            },
            onUpdate: (args: any) => {
              if (!attached) return
              try {
                const vw = args?.videoWidth
                const vh = args?.videoHeight
                const cw = args?.canvasWidth
                const ch = args?.canvasHeight
                const v = `${vw}x${vh}`
                const c = `${cw}x${ch}`
                if (v !== lastVideo || c !== lastCanvas) {
                  lastVideo = v
                  lastCanvas = c
                  pushDebug(`pipeline sizes video=${v} canvas=${c}`)
                }
              } catch {
                // ignore
              }
            }
          }
        }

        // Same module order as https://github.com/8thwall/threejs-world-effects-example — GlTextureRenderer draws
        // the camera feed; FullWindowCanvas sizes the canvas; our logic module runs last.
        const modules: unknown[] = []
        const pushMod = (m: unknown) => {
          if (m) modules.push(m)
        }
        if (debugEnabled) pushMod(debugPipelineModule())
        pushMod(x.GlTextureRenderer?.pipelineModule?.())
        pushMod(x.Threejs?.pipelineModule?.())
        pushMod(x.XrController?.pipelineModule?.())
        if (hostGlobals.XRExtras?.FullWindowCanvas?.pipelineModule) {
          try {
            pushMod(hostGlobals.XRExtras.FullWindowCanvas.pipelineModule())
            pushDebug('XRExtras.FullWindowCanvas ok')
          } catch (e) {
            pushDebug(`FullWindowCanvas skip: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
        if (hostGlobals.XRExtras?.RuntimeError?.pipelineModule) {
          try {
            pushMod(hostGlobals.XRExtras.RuntimeError.pipelineModule())
          } catch {
            // ignore
          }
        }
        pushMod(logicModule())
        pushDebug(`pipelineModules count=${modules.length}`)

        if (x.addCameraPipelineModules) {
          x.addCameraPipelineModules(modules)
          pushDebug('addCameraPipelineModules ok')
        }

        if (x.run) {
          const arRunArity = typeof x.run === 'function' ? x.run.length : -1
          pushDebug(`XR8.run arity=${arRunArity} sdkFix=v4`)

          // XR8.run has multiple signatures depending on engine build / wrappers.
          // We prefer the "config object" signature if it looks supported (arity 1),
          // otherwise fall back to the (canvas, config) signature.
          try {
            if (arRunArity === 1) {
              pushDebug('XR8.run({ canvas }) sdkFix=v4')
              x.run({ canvas: xrCanvas })
            } else {
              pushDebug('XR8.run(canvasElement, {}) sdkFix=v4')
              x.run(xrCanvas, {})
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            pushDebug(`XR8.run threw: ${msg}`)
            throw e
          }
          xrRunning = true
          pushDebug('XR8.run() returned')
          try {
            if (x.isPaused) pushDebug(`XR8.isPaused=${Boolean(x.isPaused())}`)
          } catch {
            // ignore
          }

          pushDebug('XR8 internal render loop (no host RAF — matches threejs-world-effects-example)')

          if (debugEnabled) {
            const probeGlOnce = (label: string) => {
              if (stopped) return
              try {
                const c = document.getElementById('camerafeed') as HTMLCanvasElement | null
                if (!c) {
                  pushDebug(`GL probe(${label}): canvas missing`)
                  return
                }
                const gl =
                  (c.getContext('webgl2') as unknown as WebGLRenderingContext | null) ??
                  (c.getContext('webgl') as WebGLRenderingContext | null)
                if (!gl) {
                  pushDebug(`GL probe(${label}): no webgl context`)
                  return
                }
                const px = new Uint8Array(4)
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
                const err = gl.getError()
                pushDebug(`GL probe(${label}): px=[${px[0]},${px[1]},${px[2]},${px[3]}] err=${err}`)
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                pushDebug(`GL probe(${label}) error: ${msg}`)
              }
            }
            window.setTimeout(() => probeGlOnce('t+350ms'), 350)
            window.setTimeout(() => probeGlOnce('t+1200ms'), 1200)
            window.setTimeout(() => probeGlOnce('t+2500ms'), 2500)
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
    }
  }, [ui.state, copyOverlay, isAudioAr, resolvedImageUrl, resolvedAudioUrl, audioLoop, debugEnabled])

  const overlay = ui.error ? null : ui.overlay
  const showBack = true

  const requestMotionPermissions = async (pushDebug?: (line: string) => void) => {
    const w = window as unknown as {
      DeviceMotionEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> }
      DeviceOrientationEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> }
    }

    const tryReq = async (label: string, req?: () => Promise<'granted' | 'denied'>) => {
      if (!req) return
      try {
        const res = await req()
        pushDebug?.(`${label} permission=${res}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        pushDebug?.(`${label} permission error: ${msg}`)
      }
    }

    await tryReq('DeviceMotion', w.DeviceMotionEvent?.requestPermission)
    await tryReq('DeviceOrientation', w.DeviceOrientationEvent?.requestPermission)
  }

  const handleTapToStart = async () => {
    if (tapToStartBusy) return
    if (ui.state !== 'IN_RANGE_STARTING_AR') return
    if (!startXrRef.current) return
    setTapToStartBusy(true)
    try {
      // iOS Safari gates sensor APIs behind user gesture; 8th Wall may wait for these before producing frames.
      await requestMotionPermissions((line) => {
        if (debugEnabled) {
          // Use the same debug stream used by XR
          setDebug((prev) => {
            if (!prev.enabled) return prev
            const next = [...prev.lines, line]
            return { ...prev, lines: next.slice(-60) }
          })
        }
      })
      await startXrRef.current(true)
    } finally {
      setTapToStartBusy(false)
    }
  }

  return (
    <>
      {/* Engine draws to `#camerafeed` on body (threejs-world-effects-example contract). */}

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
    const lat = Number(state.latitude)
    const lng = Number(state.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return (
        <ArIframeScene
          iframeUrl={state.iframeUrl}
          latitude={lat}
          longitude={lng}
          geoRadiusM={state.geoRadiusM}
          sceneName={state.sceneName}
        />
      )
    }
  }
  return <ArMemoryXR state={state} />
}
