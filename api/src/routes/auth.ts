import type { Env } from "../types"
import { json, safeJson } from "../lib/response"
import { sha256Hex, hashPassword } from "../lib/crypto"
import { createSessionToken, makeSessionCookie, clearSessionCookie, getSessionUserId } from "../lib/session"

function isValidEmail(email: any) {
  return typeof email === "string" && email.includes("@") && email.length <= 254
}

function isValidPassword(pw: any) {
  return typeof pw === "string" && pw.length >= 8 && pw.length <= 200
}

// POST /signup
export async function signup(req: Request, env: Env) {
  const { email, password } = await safeJson(req)
  if (!isValidEmail(email) || !isValidPassword(password)) {
    return json(req, { error: "Invalid input" }, 400)
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await hashPassword(password, salt)
  const password_hash = `${hash}:${btoa(String.fromCharCode(...salt))}`

  const userId = crypto.randomUUID()

  // Your schema requires api_key_hash UNIQUE NOT NULL
  const apiKey = crypto.randomUUID()
  const apiKeyHash = await sha256Hex(apiKey)

  try {
    await env.saas_tss_db
      .prepare(
        `INSERT INTO users (id, email, password_hash, api_key_hash, credits, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(userId, email, password_hash, apiKeyHash, 20_000, new Date().toISOString())
      .run()
  } catch {
    return json(req, { error: "Email already exists" }, 409)
  }

  const session = await createSessionToken(userId, env.SESSION_SECRET)
  return json(req, { ok: true }, 200, { "Set-Cookie": makeSessionCookie(session) })
}

// POST /login
export async function login(req: Request, env: Env) {
  const { email, password } = await safeJson(req)
  if (!isValidEmail(email) || !isValidPassword(password)) {
    return json(req, { error: "Invalid input" }, 400)
  }

  const user = await env.saas_tss_db
    .prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; password_hash: string } | null>()

  if (!user) return json(req, { error: "Invalid credentials" }, 401)

  const [storedHash, saltB64] = String(user.password_hash).split(":")
  if (!storedHash || !saltB64) return json(req, { error: "Invalid credentials" }, 401)

  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0))
  const check = await hashPassword(password, salt)
  if (check !== storedHash) return json(req, { error: "Invalid credentials" }, 401)

  const session = await createSessionToken(user.id, env.SESSION_SECRET)
  return json(req, { ok: true }, 200, { "Set-Cookie": makeSessionCookie(session) })
}

// POST /logout
export async function logout(req: Request) {
  return json(req, { ok: true }, 200, { "Set-Cookie": clearSessionCookie() })
}

// GET /me
export async function me(req: Request, env: Env) {
  const userId = await getSessionUserId(req, env.SESSION_SECRET)
  if (!userId) return json(req, { error: "Not authenticated" }, 401)

  const u = await env.saas_tss_db
    .prepare("SELECT credits FROM users WHERE id = ?")
    .bind(userId)
    .first<{ credits: number } | null>()

  return json(req, { credits: u?.credits ?? 0 }, 200)
}
