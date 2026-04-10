/** Optional absolute origin for serverless `/api/*` when the SPA is not served from the same host (local Vite + `vercel dev`). */
export const getAppApiBase = (): string => {
  const explicit = import.meta.env.VITE_API_BASE_URL
  if (typeof explicit === 'string' && explicit.trim()) return explicit.replace(/\/$/, '')
  return ''
}

export const appApiUrl = (path: string): string => {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = getAppApiBase()
  return base ? `${base}${p}` : p
}
