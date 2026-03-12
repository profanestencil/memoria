export interface Coords {
  latitude: number
  longitude: number
}

export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })
}
