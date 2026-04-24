type RequestResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'unknown'; message: string }

const isProbablyIos = () => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/i.test(ua)
}

const requestMotionPermissionIfNeeded = async (): Promise<RequestResult> => {
  try {
    const AnyDeviceMotionEvent = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }
    const AnyDeviceOrientationEvent = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }

    const request =
      AnyDeviceMotionEvent?.requestPermission ??
      AnyDeviceOrientationEvent?.requestPermission ??
      null

    if (!request) return { ok: true }

    const result = await request()
    if (result !== 'granted') {
      return { ok: false, reason: 'denied', message: 'Motion permission was denied.' }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to request motion permission.'
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
 * Ask for permissions up-front (from a user gesture) to improve AR startup reliability.\n+ * - Camera: via getUserMedia preflight\n+ * - Motion/orientation: iOS prompt if required\n+ */
export const requestArPermissions = async (): Promise<RequestResult> => {
  // iOS is the platform most likely to require explicit motion prompts.
  if (isProbablyIos()) {
    const motion = await requestMotionPermissionIfNeeded()
    if (!motion.ok) return motion
  } else {
    // Non-iOS can still have motion prompts in embedded browsers, but most do not.
    const motion = await requestMotionPermissionIfNeeded()
    if (!motion.ok && motion.reason === 'denied') return motion
  }

  return await requestCameraPermission()
}

