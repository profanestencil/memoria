export interface Coords {
  latitude: number
  longitude: number
}

export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      reject,
      {
        enableHighAccuracy: true,
        /** Android cold GPS / WebViews often need >10s for first fix */
        timeout: 25_000,
        /** Prefer a recent cached fix so claims/runtime refresh don’t hang */
        maximumAge: 15_000,
      },
    )
  })
}
