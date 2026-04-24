import { appApiUrl } from '@/lib/apiBase'

const authHeaders = (token: string): HeadersInit => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
})

export const adminRequestNonce = async (address: string) => {
  const raw = appApiUrl('/api/admin/nonce')
  const u = raw.startsWith('http') ? new URL(raw) : new URL(raw, window.location.origin)
  u.searchParams.set('address', address)
  const res = await fetch(u.toString())
  const j = (await res.json()) as { nonce?: string; message?: string; expiresAt?: string; error?: string }
  if (!res.ok) throw new Error(j.error ?? `nonce ${res.status}`)
  return j
}

export const adminCreateSession = async (address: string, message: string, signature: string) => {
  const res = await fetch(appApiUrl('/api/admin/session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, message, signature }),
  })
  const j = (await res.json()) as { ok?: boolean; token?: string; error?: string }
  if (!res.ok) throw new Error(j.error ?? `session ${res.status}`)
  if (!j.token) throw new Error('No token')
  return j.token
}

export const adminGet = async (path: string, token: string) => {
  const res = await fetch(appApiUrl(path), { headers: authHeaders(token) })
  const j = await res.json()
  if (!res.ok) throw new Error((j as { error?: string }).error ?? `${path} ${res.status}`)
  return j
}

export const adminPost = async (path: string, token: string, body: unknown) => {
  const res = await fetch(appApiUrl(path), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  const j = await res.json()
  if (!res.ok) throw new Error((j as { error?: string }).error ?? `${path} ${res.status}`)
  return j
}

export const adminPatch = async (pathWithQuery: string, token: string, body: unknown) => {
  const res = await fetch(appApiUrl(pathWithQuery), {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  const j = await res.json()
  if (!res.ok) throw new Error((j as { error?: string }).error ?? `PATCH ${res.status}`)
  return j
}

export const adminDelete = async (pathWithQuery: string, token: string) => {
  const res = await fetch(appApiUrl(pathWithQuery), { method: 'DELETE', headers: authHeaders(token) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((j as { error?: string }).error ?? `DELETE ${res.status}`)
  return j
}
