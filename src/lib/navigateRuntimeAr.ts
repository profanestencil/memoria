import type { NavigateFunction } from 'react-router-dom'
import type { RuntimeArScene } from '@/lib/runtimeActive'

/** Resolve iframe URL for a runtime scene when `sceneType` is `iframe_url`. */
export const getRuntimeIframeSceneUrl = (scene: RuntimeArScene): string | null => {
  if (scene.sceneType !== 'iframe_url') return null
  const pl = scene.scenePayload
  if (typeof pl?.url === 'string' && pl.url.trim()) return pl.url.trim()
  if (typeof pl?.iframeUrl === 'string' && pl.iframeUrl.trim()) return pl.iframeUrl.trim()
  return null
}

/** Navigate to `/ar` with iframe mode when the scene exposes a URL. Returns whether navigation ran. */
export const navigateRuntimeIframeAr = (
  navigate: NavigateFunction,
  scene: RuntimeArScene,
  options?: { sceneName?: string }
): boolean => {
  const iframeUrl = getRuntimeIframeSceneUrl(scene)
  if (!iframeUrl) return false
  navigate('/ar', {
    state: {
      mode: 'iframe' as const,
      iframeUrl,
      latitude: scene.lat,
      longitude: scene.lng,
      geoRadiusM: scene.geoRadiusM,
      sceneName: options?.sceneName ?? scene.name,
    },
  })
  return true
}
