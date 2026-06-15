/** Default radius (m) for viewing a memory in AR without admin god mode. */
export const AR_VIEW_RADIUS_M = 80

export type UserGeo = { lat: number; lng: number }

export const getUserGeoOnce = (): Promise<UserGeo | null> =>
  new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 }
    )
  })

export type ArViewGateResult =
  | { ok: true; distanceM: number; godMode: boolean }
  | { ok: false; message: string }

export const checkArViewAllowed = async (
  memoryLat: number,
  memoryLng: number
): Promise<ArViewGateResult> => {
  const user = await getUserGeoOnce()
  if (!user) {
    return {
      ok: false,
      message: 'Turn on location to view memories in AR near you.',
    }
  }

  const u = new URL('/api/ar/can-view', window.location.origin)
  u.searchParams.set('lat', String(memoryLat))
  u.searchParams.set('lng', String(memoryLng))
  u.searchParams.set('userLat', String(user.lat))
  u.searchParams.set('userLng', String(user.lng))

  const token = localStorage.getItem('memoria:adminToken')
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

  try {
    const res = await fetch(u.toString(), { headers })
    const j = (await res.json()) as {
      allowed?: boolean
      distanceM?: number
      radiusM?: number
      godMode?: boolean
      error?: string
    }
    if (!res.ok) {
      return { ok: false, message: j.error ?? 'Could not verify AR range.' }
    }
    if (j.allowed) {
      return {
        ok: true,
        distanceM: j.distanceM ?? 0,
        godMode: Boolean(j.godMode),
      }
    }
    const dist = Math.round(j.distanceM ?? 0)
    const radius = Math.round(j.radiusM ?? AR_VIEW_RADIUS_M)
    return {
      ok: false,
      message: `Move closer to this memory (${dist}m away · within ${radius}m to view in AR).`,
    }
  } catch {
    return { ok: false, message: 'Could not verify AR range. Check your connection.' }
  }
}
