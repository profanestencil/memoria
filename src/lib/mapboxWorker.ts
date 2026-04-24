import mapboxgl from 'mapbox-gl'
import mapboxGlWorkerUrl from 'mapbox-gl/dist/mapbox-gl-csp-worker.js?url'

let configured = false

/** Vite bundles must point Mapbox GL at the CSP worker or tile rendering often stays blank. */
export const ensureMapboxGlWorkerConfigured = (): void => {
  if (configured) return
  mapboxgl.workerUrl = mapboxGlWorkerUrl
  configured = true
}
