export interface Env {
  AUDIO_BUCKET: R2Bucket
  saas_tss_db: D1Database
  MODAL_CALLBACK_TOKEN: string
  SESSION_SECRET: string
}

const API_BASE = "https://api.oussamalger6.workers.dev"

const ALLOWED_ORIGINS = new Set([
  "https://saas-tts.pages.dev",
  "http://localhost:3000",
])

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors(req) })
    }

    /* ================= AUTH ================= */

    // POST /signup
    if (req.method === "POST" && url.pathname === "/signup") {
      const { email, password } = await safeJson(req)
      if (!isValidEmail(email) || !isValidPassword(password)) {
        return json(req, { error: "Invalid input" }, 400)
      }

      const salt = crypto.getRandomValues(new Uint8Array(16))
      const hash = await hashPassword(password, salt)
      const password_hash = `${hash}:${btoa(String.fromCharCode(...salt))}`

      const userId = crypto.randomUUID()
      const apiKeyHash = await sha256Hex(crypto.randomUUID())

      try {
        await env.saas_tss_db.prepare(
          `INSERT INTO users (id,email,password_hash,api_key_hash,credits,created_at)
           VALUES (?,?,?,?,?,?)`
        ).bind(
          userId,
          email,
          password_hash,
          apiKeyHash,
          20_000,
          new Date().toISOString()
        ).run()
      } catch {
        return json(req, { error: "Email already exists" }, 409)
      }

      const session = await createSessionToken(userId, env.SESSION_SECRET)
      return response(req, { ok: true }, session)
    }

    // POST /login
    if (req.method === "POST" && url.pathname === "/login") {
      const { email, password } = await safeJson(req)

      const user = await env.saas_tss_db
        .prepare("SELECT id,password_hash FROM users WHERE email=?")
        .bind(email)
        .first<any>()

      if (!user) return json(req, { error: "Invalid credentials" }, 401)

      const [storedHash, saltB64] = user.password_hash.split(":")
      const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0))
      const check = await hashPassword(password, salt)

      if (check !== storedHash) {
        return json(req, { error: "Invalid credentials" }, 401)
      }

      const session = await createSessionToken(user.id, env.SESSION_SECRET)
      return response(req, { ok: true }, session)
    }

    // POST /logout
    if (req.method === "POST" && url.pathname === "/logout") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          ...cors(req),
          "Set-Cookie": clearSessionCookie(),
          "Content-Type": "application/json",
        },
      })
    }

    // GET /me
    if (req.method === "GET" && url.pathname === "/me") {
      const userId = await getSessionUserId(req, env.SESSION_SECRET)
      if (!userId) return json(req, { error: "Not authenticated" }, 401)

      const u = await env.saas_tss_db
        .prepare("SELECT credits FROM users WHERE id=?")
        .bind(userId)
        .first<any>()

      return json(req, { userId, credits: u?.credits ?? 0 })
    }

    /* ================= TTS ================= */

    // POST /tts
    if (req.method === "POST" && url.pathname === "/tts") {
      const userId = await getSessionUserId(req, env.SESSION_SECRET)
      if (!userId) return json(req, { error: "Unauthorized" }, 401)

      const { text } = await safeJson(req)
      if (!text || typeof text !== "string") {
        return json(req, { error: "Invalid text" }, 400)
      }

      const chars = text.length

      const user = await env.saas_tss_db
        .prepare("SELECT credits FROM users WHERE id=?")
        .bind(userId)
        .first<any>()

      if (!user || user.credits < chars) {
        return json(req, { error: "Not enough credits" }, 402)
      }

      const jobId = crypto.randomUUID()
      const now = new Date().toISOString()

      await env.saas_tss_db.prepare(
        `INSERT INTO jobs (id,user_id,status,chars,created_at,updated_at)
         VALUES (?,?,?,?,?,?)`
      ).bind(jobId, userId, "queued", chars, now, now).run()

      await env.saas_tss_db.prepare(
        "UPDATE users SET credits = credits - ? WHERE id=?"
      ).bind(chars, userId).run()

      // 🔥 CALL MODAL (CHANGE THIS URL)
      await fetch("https://YOUR_MODAL_ENDPOINT", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          text,
          callback: `${API_BASE}/job-callback`,
          token: env.MODAL_CALLBACK_TOKEN,
        }),
      })

      return json(req, { jobId })
    }

    // GET /tts/:jobId
    if (req.method === "GET" && url.pathname.startsWith("/tts/")) {
      const userId = await getSessionUserId(req, env.SESSION_SECRET)
      if (!userId) return json(req, { error: "Unauthorized" }, 401)

      const jobId = url.pathname.split("/")[2]

      const job = await env.saas_tss_db
        .prepare("SELECT * FROM jobs WHERE id=? AND user_id=?")
        .bind(jobId, userId)
        .first<any>()

      if (!job) return json(req, { error: "Not found" }, 404)

      if (job.status === "done" && job.r2_key) {
        const signed = await env.AUDIO_BUCKET.createSignedUrl(
          job.r2_key,
          600
        )
        return json(req, { status: "done", url: signed })
      }

      return json(req, { status: job.status, error: job.error })
    }

    // POST /job-callback (Modal)
    if (req.method === "POST" && url.pathname === "/job-callback") {
      const auth = req.headers.get("Authorization")
      if (auth !== `Bearer ${env.MODAL_CALLBACK_TOKEN}`) {
        return new Response("Forbidden", { status: 403 })
      }

      const { jobId, success, audioBase64, error } = await safeJson(req)
      const now = new Date().toISOString()

      if (!success) {
        await env.saas_tss_db.prepare(
          "UPDATE jobs SET status='failed', error=?, updated_at=? WHERE id=?"
        ).bind(error || "failed", now, jobId).run()

        return json(req, { ok: true })
      }

      const audio = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
      const key = `tts/${jobId}.wav`

      await env.AUDIO_BUCKET.put(key, audio, {
        httpMetadata: { contentType: "audio/wav" },
      })

      await env.saas_tss_db.prepare(
        "UPDATE jobs SET status='done', r2_key=?, updated_at=? WHERE id=?"
      ).bind(key, now, jobId).run()

      return json(req, { ok: true })
    }

    return new Response("Not found", { status: 404, headers: cors(req) })
  },
}

/* ================= HELPERS ================= */

function cors(req: Request) {
  const origin = req.headers.get("Origin") || ""
  const allowOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://saas-tts.pages.dev"

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  }
}

function json(req: Request, obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  })
}

function response(req: Request, obj: unknown, session: string) {
  return new Response(JSON.stringify(obj), {
    headers: {
      ...cors(req),
      "Content-Type": "application/json",
      "Set-Cookie": makeSessionCookie(session),
    },
  })
}

async function safeJson(req: Request) {
  try {
    return await req.json()
  } catch {
    return {}
  }
}

function isValidEmail(email: any) {
  return typeof email === "string" && email.includes("@")
}

function isValidPassword(pw: any) {
  return typeof pw === "string" && pw.length >= 8
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("")
}

async function hashPassword(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  )

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    key,
    256
  )

  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}

async function createSessionToken(userId: string, secret: string) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  const payload = base64urlEncode(JSON.stringify({ uid: userId, exp }))
  const sig = await hmacSha256Base64Url(payload, secret)
  return `${payload}.${sig}`
}

async function getSessionUserId(req: Request, secret: string) {
  const token = readCookie(req, "session")
  if (!token) return null

  const [payload, sig] = token.split(".")
  if (!payload || !sig) return null

  const expected = await hmacSha256Base64Url(payload, secret)
  if (!timingSafeEqual(sig, expected)) return null

  const data = JSON.parse(base64urlDecode(payload))
  if (Date.now() / 1000 > data.exp) return null
  return data.uid
}

async function hmacSha256Base64Url(data: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  return base64urlFromBytes(new Uint8Array(sig))
}

function makeSessionCookie(token: string) {
  return `session=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=None; Secure`
}

function clearSessionCookie() {
  return `session=; HttpOnly; Path=/; Max-Age=0; SameSite=None; Secure`
}

function readCookie(req: Request, name: string) {
  const cookie = req.headers.get("Cookie") || ""
  const m = cookie.match(new RegExp(`${name}=([^;]+)`))
  return m ? m[1] : null
}

function base64urlEncode(s: string) {
  return base64urlFromBytes(new TextEncoder().encode(s))
}

function base64urlDecode(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/")
  return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))
}

function base64urlFromBytes(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}
