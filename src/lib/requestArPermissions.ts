type RequestResult =
  | { ok: true; userGeo?: import('@/lib/arGeofence').UserGeo }
  | { ok: false; reason: 'unsupported' | 'denied' | 'unknown'; message: string }

const isProbablyIos = () => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/i.test(ua)
}

const requestMotionPermissionIfNeeded = async (): Promise<RequestResult> => {
  try {
    const orientationReq = (
      DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>
      }
    ).requestPermission
    const motionReq = (
      DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>
      }
    ).requestPermission

    if (!orientationReq && !motionReq) return { ok: true }

    if (orientationReq) {
      const result = await orientationReq.call(DeviceOrientationEvent)
      if (result !== 'granted') {
        return { ok: false, reason: 'denied', message: 'Motion permission was denied.' }
      }
    }

    if (motionReq) {
      const result = await motionReq.call(DeviceMotionEvent)
      if (result !== 'granted') {
        return { ok: false, reason: 'denied', message: 'Motion permission was denied.' }
      }
    }

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to request motion permission.'
    return { ok: false, reason: 'unknown', message: msg }
  }
}

const requestLocationPermission = async (): Promise<RequestResult> => {
  if (!navigator.geolocation) {
    return { ok: true }
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 0,
      })
    })
    return {
      ok: true,
      userGeo: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      },
    }
  } catch (e) {
    const geoErr = e as GeolocationPositionError
    if (geoErr?.code === geoErr.PERMISSION_DENIED) {
      return {
        ok: false,
        reason: 'denied',
        message: 'Location permission is required for AR. Enable location and try again.',
      }
    }
    const msg = e instanceof Error ? e.message : 'Unable to read your location.'
    return { ok: false, reason: 'unknown', message: msg }
  }
}

const requestCameraPermission = async (): Promise<RequestResult> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: 'unsupported', message: 'Camera API not available in this browser.' }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
    stream.getTracks().forEach((t) => t.stop())
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Camera permission was denied.'
    return { ok: false, reason: 'denied', message: msg }
  }
}

/**
 * Ask for permissions from the View in AR tap — motion must be first await (iOS gesture).
 * Order: motion/orientation → camera → location (feeds geofence).
 */
export const requestArPermissions = async (): Promise<RequestResult> => {
  const motion = await requestMotionPermissionIfNeeded()
  if (!motion.ok) {
    if (isProbablyIos() || motion.reason === 'denied') return motion
  }

  const camera = await requestCameraPermission()
  if (!camera.ok) return camera

  const location = await requestLocationPermission()
  if (!location.ok) return location

  return { ok: true, userGeo: location.userGeo }
}

