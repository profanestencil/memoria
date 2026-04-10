import crypto from 'crypto'
import { verifyMessage } from 'viem'

const getSecret = () => {
  const s = process.env.ADMIN_SESSION_SECRET
  if (!s || s.length < 16) {
    throw new Error('ADMIN_SESSION_SECRET must be set (min 16 chars)')
  }
  return s
}

/**
 * @param {string} address 0x-prefixed checksummed or lower
 * @returns {string} token for Authorization: Bearer
 */
export const issueAdminToken = (address) => {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000
  const payload = JSON.stringify({ a: address.toLowerCase(), e: exp })
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url')
  const b64 = Buffer.from(payload, 'utf8').toString('base64url')
  return `${b64}.${sig}`
}

/**
 * @param {string | undefined} token
 * @returns {string | null} lowercased wallet
 */
export const verifyAdminToken = (token) => {
  if (!token) return null
  try {
    const secret = process.env.ADMIN_SESSION_SECRET
    if (!secret || secret.length < 16) return null
    const dot = token.indexOf('.')
    if (dot < 1) return null
    const b64 = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const payload = Buffer.from(b64, 'base64url').toString('utf8')
    const expect = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
    if (expect !== sig) return null
    const j = JSON.parse(payload)
    if (typeof j.a !== 'string' || typeof j.e !== 'number') return null
    if (Date.now() > j.e) return null
    return j.a
  } catch {
    return null
  }
}

export const getBearerWallet = (req) => {
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) return null
  return verifyAdminToken(h.slice(7).trim())
}

/**
 * @param {{ address: `0x${string}`, message: string, signature: `0x${string}` }} p
 */
export const verifyWalletSignature = async (p) => {
  const ok = await verifyMessage({
    address: p.address,
    message: p.message,
    signature: p.signature,
  })
  return ok
}
