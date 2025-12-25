import { base64urlEncode, base64urlDecode, hmacSha256Base64Url, timingSafeEqual } from "./crypto"

export function makeSessionCookie(token: string) {
  return `session=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=None; Secure`
}

export function clearSessionCookie() {
  return `session=; HttpOnly; Path=/; Max-Age=0; SameSite=None; Secure`
}

function readCookie(req: Request, name: string) {
  const cookie = req.headers.get("Cookie") || ""
  const m = cookie.match(new RegExp(`${name}=([^;]+)`))
  return m ? m[1] : null
}

// Create signed session token: payload.signature
export async function createSessionToken(userId: string, secret: string) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  const payload = base64urlEncode(JSON.stringify({ uid: userId, exp }))
  const sig = await hmacSha256Base64Url(payload, secret)
  return `${payload}.${sig}`
}

// Verify cookie + signature + expiration => userId
export async function getSessionUserId(req: Request, secret: string) {
  const token = readCookie(req, "session")
  if (!token) return null

  const [payload, sig] = token.split(".")
  if (!payload || !sig) return null

  const expected = await hmacSha256Base64Url(payload, secret)
  if (!timingSafeEqual(sig, expected)) return null

  try {
    const data = JSON.parse(base64urlDecode(payload))
    if (!data?.uid || !data?.exp) return null
    if (Math.floor(Date.now() / 1000) > Number(data.exp)) return null
    return String(data.uid)
  } catch {
    return null
  }
}
