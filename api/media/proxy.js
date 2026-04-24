/**
 * Same-origin fetch proxy for audio/image bytes from public IPFS gateways.
 * Fixes: CORS (required by Web Audio + some browsers for media), flaky gateways, mixed headers.
 *
 * GET /api/media/proxy?target=<encoded https URL>
 */

const MAX_BYTES = 45 * 1024 * 1024

const EXACT_HOSTS = new Set([
  'gateway.pinata.cloud',
  'nftstorage.link',
  'dweb.link',
  'w3s.link',
  'ipfs.io',
  'gateway.ipfs.io',
  'cloudflare-ipfs.com',
  'cf-ipfs.com',
])

const isAllowedHost = (hostname) => {
  const h = String(hostname).toLowerCase()
  if (EXACT_HOSTS.has(h)) return true
  if (h.endsWith('.mypinata.cloud')) return true
  if (h.endsWith('.ipfs.dweb.link')) return true
  if (h.endsWith('.ipfs.w3s.link')) return true
  if (h.endsWith('.ipfs.nftstorage.link')) return true
  if (h.endsWith('.ipfs.cf-ipfs.com')) return true
  return false
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  let raw = typeof req.query?.target === 'string' ? req.query.target : ''
  try {
    raw = decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch {
    // keep raw
  }
  let target
  try {
    target = new URL(raw)
  } catch {
    res.status(400).json({ error: 'Invalid target' })
    return
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    res.status(400).json({ error: 'Only http(s) targets' })
    return
  }

  if (!isAllowedHost(target.hostname)) {
    res.status(403).json({ error: 'Host not allowed' })
    return
  }

  const forwardHeaders = {}
  const range = req.headers.range
  if (range && typeof range === 'string') {
    forwardHeaders.Range = range
  }

  let upstream
  try {
    upstream = await fetch(target.toString(), {
      method: req.method,
      headers: forwardHeaders,
      redirect: 'follow',
    })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Upstream fetch failed' })
    return
  }

  const cl = upstream.headers.get('content-length')
  if (cl && Number(cl) > MAX_BYTES) {
    res.status(413).json({ error: 'Asset too large' })
    return
  }

  const passthrough = [
    'content-type',
    'content-length',
    'accept-ranges',
    'content-range',
    'cache-control',
    'etag',
  ]

  res.status(upstream.status)

  for (const name of passthrough) {
    const v = upstream.headers.get(name)
    if (v) res.setHeader(name, v)
  }

  if (req.method === 'HEAD') {
    res.end()
    return
  }

  const buf = Buffer.from(await upstream.arrayBuffer())
  if (buf.length > MAX_BYTES) {
    res.status(413).json({ error: 'Asset too large' })
    return
  }

  res.send(buf)
}
