export interface Env {
  AUDIO_BUCKET: R2Bucket
  saas_tss_db: D1Database
  MODAL_CALLBACK_TOKEN: string
  SESSION_SECRET: string
}

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)

    // CORS
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors() })
    }

    // ---------------------------
    // POST /signup (email + password)
    // ---------------------------
    if (req.method === "POST" && url.pathname === "/signup") {
      const { email, password } = await req.json<{
        email: string
        password: string
      }>()

      if (!email || !password || password.length < 8) {
        return json({ error: "Invalid input" }, 400)
      }

      // hash password
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const hash = await hashPassword(password, salt)
      const password_hash =
        `${hash}:${btoa(String.fromCharCode(...salt))}`

      const userId = crypto.randomUUID()

      // IMPORTANT: api_key_hash is NOT NULL in DB
      const apiKey = crypto.randomUUID()
      const apiKeyHash = await sha256Hex(apiKey)

      try {
        await env.saas_tss_db
          .prepare(
            `INSERT INTO users
             (id, email, password_hash, api_key_hash, credits, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(
            userId,
            email,
            password_hash,
            apiKeyHash,
            20_000,
            new Date().toISOString()
          )
          .run()
      } catch (err) {
        return json({ error: "Email already exists" }, 409)
      }

      const session = createSession(userId, env.SESSION_SECRET)

      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          ...cors(),
          "Content-Type": "application/json",
          "Set-Cookie": `session=${session}; HttpOnly; Path=/; SameSite=Lax`,
        },
      })
    }

    // ---------------------------
    // POST /login
    // ---------------------------
    if (req.method === "POST" && url.pathname === "/login") {
      const { email, password } = await req.json<{
        email: string
        password: string
      }>()

      const user = await env.saas_tss_db
        .prepare("SELECT id, password_hash FROM users WHERE email = ?")
        .bind(email)
        .first<{ id: string; password_hash: string }>()

      if (!user) {
        return json({ error: "Invalid credentials" }, 401)
      }

      const [storedHash, storedSaltB64] = user.password_hash.split(":")
      const salt = Uint8Array.from(
        atob(storedSaltB64),
        c => c.charCodeAt(0)
      )

      const hash = await hashPassword(password, salt)
      if (hash !== storedHash) {
        return json({ error: "Invalid credentials" }, 401)
      }

      const session = createSession(user.id, env.SESSION_SECRET)

      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          ...cors(),
          "Content-Type": "application/json",
          "Set-Cookie": `session=${session}; HttpOnly; Path=/; SameSite=Lax`,
        },
      })
    }

    // ---------------------------
    // GET /me
    // ---------------------------
    if (req.method === "GET" && url.pathname === "/me") {
      const userId = getSessionUserId(req, env.SESSION_SECRET)
      if (!userId) {
        return json({ error: "Not authenticated" }, 401)
      }

      const user = await env.saas_tss_db
        .prepare("SELECT credits FROM users WHERE id = ?")
        .bind(userId)
        .first<{ credits: number }>()

      return json({
        userId,
        credits: user?.credits ?? 0,
      })
    }

    return new Response("Not found", { status: 404 })
  },
}

// ---------------------------
// Helpers
// ---------------------------

function cors() {
  return {
    "Access-Control-Allow-Origin": "https://saas-tts.pages.dev",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  }
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors(), "Content-Type": "application/json" },
  })
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  )
  return [...new Uint8Array(buf)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

// Password hashing (PBKDF2)
async function hashPassword(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000, // ✅ Cloudflare Workers limit
      hash: "SHA-256",
    },
    key,
    256
  )

  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}


// Session helpers
function createSession(userId: string, secret: string) {
  return btoa(`${userId}.${secret}`)
}

function getSessionUserId(req: Request, secret: string) {
  const cookie = req.headers.get("Cookie") || ""
  const match = cookie.match(/session=([^;]+)/)
  if (!match) return null

  try {
    const decoded = atob(match[1])
    const [userId, sig] = decoded.split(".")
    if (sig !== secret) return null
    return userId
  } catch {
    return null
  }
}
