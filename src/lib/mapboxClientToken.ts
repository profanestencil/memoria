/** Mapbox GL and static map URLs in the browser require a default public token (pk.*). Secret tokens (sk.*) are server-side only and will not load tiles in the client. */
export type MapboxClientTokenResult =
  | { ok: true; token: string }
  | { ok: false; message: string }

export const getMapboxClientTokenState = (): MapboxClientTokenResult => {
  const raw = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined
  const t = raw?.trim()
  if (!t) {
    return {
      ok: false,
      message:
        'Set VITE_MAPBOX_ACCESS_TOKEN to a Mapbox default public token (starts with pk.), then restart the dev server or redeploy.',
    }
  }
  if (t.startsWith('sk.')) {
    return {
      ok: false,
      message:
        'Mapbox secret tokens (sk.*) cannot be used in the browser. In Mapbox Account → Tokens, create or copy a default public token (pk.*), set VITE_MAPBOX_ACCESS_TOKEN to that value, and rotate any secret token that was exposed.',
    }
  }
  if (!t.startsWith('pk.')) {
    return {
      ok: false,
      message:
        'VITE_MAPBOX_ACCESS_TOKEN should be a Mapbox public default token (starts with pk.).',
    }
  }
  return { ok: true, token: t }
}
