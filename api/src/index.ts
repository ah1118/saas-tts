export interface Env {
  AUDIO_BUCKET: R2Bucket
  saas_tss_db: D1Database
}

const MODAL_TTS_URL =
  "https://oussamalger6-main2--saas-tts-pipeline-fastapi-app.modal.run/tts"

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)

    const headers = {
      ...cors(),
      "Content-Type": "application/json",
    }

    // ===========================
    // CORS PREFLIGHT
    // ===========================
    if (req.method === "OPTIONS") {
      return new Response(null, { headers })
    }

    // ===========================
    // CREATE API KEY (ONE TIME)
    // ===========================
    if (req.method === "POST" && url.pathname === "/create-key") {
      const userId = crypto.randomUUID()
      const apiKey = makeApiKey()
      const apiKeyHash = await sha256Hex(apiKey)

      const starterCredits = 20_000

      await env.saas_tss_db
        .prepare(
          `INSERT INTO users (id, api_key_hash, credits, created_at)
           VALUES (?, ?, ?, ?)`
        )
        .bind(userId, apiKeyHash, starterCredits, new Date().toISOString())
        .run()

      return new Response(
        JSON.stringify({
          userId,
          apiKey, // SHOWN ONCE
          credits: starterCredits,
        }),
        { headers }
      )
    }

    // ===========================
    // TTS (CREDIT PROTECTED)
    // ===========================
    if (req.method === "POST" && url.pathname === "/tts") {
      const apiKey = getApiKey(req)
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Missing API key" }),
          { status: 401, headers }
        )
      }

      const apiKeyHash = await sha256Hex(apiKey)

      const user = await env.saas_tss_db
        .prepare("SELECT id, credits FROM users WHERE api_key_hash = ?")
        .bind(apiKeyHash)
        .first<{ id: string; credits: number }>()

      if (!user) {
        return new Response(
          JSON.stringify({ error: "Invalid API key" }),
          { status: 401, headers }
        )
      }

      const { text } = await req.json<{ text: string }>()
      const chars = text.length

      if (user.credits < chars) {
        return new Response(
          JSON.stringify({
            error: "Insufficient credits",
            remaining: user.credits,
            needed: chars,
          }),
          { status: 402, headers }
        )
      }

      // ===========================
      // CALL MODAL (RAW audio/wav)
      // ===========================
      const modalRes = await fetch(MODAL_TTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })

      if (!modalRes.ok) {
        return new Response(
          JSON.stringify({ error: "Modal TTS failed" }),
          { status: 502, headers }
        )
      }

      // 🔑 RAW WAV BYTES (NO BASE64)
      const audioBuffer = await modalRes.arrayBuffer()
      const audioBytes = new Uint8Array(audioBuffer)

      // ===========================
      // STORE IN R2 (PRIVATE)
      // ===========================
      const audioId = crypto.randomUUID()
      const key = `users/${user.id}/${audioId}.wav`

      await env.AUDIO_BUCKET.put(key, audioBytes, {
        httpMetadata: { contentType: "audio/wav" },
      })

      // ===========================
      // DEDUCT CREDITS
      // ===========================
      await env.saas_tss_db
        .prepare("UPDATE users SET credits = credits - ? WHERE id = ?")
        .bind(chars, user.id)
        .run()

      // ===========================
      // LOG USAGE
      // ===========================
      await env.saas_tss_db
        .prepare(
          `INSERT INTO usage_log (id, user_id, chars, created_at)
           VALUES (?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          chars,
          new Date().toISOString()
        )
        .run()

      // ===========================
      // SIGNED URL (10 MIN)
      // ===========================
      const signedUrl = await env.AUDIO_BUCKET.createSignedUrl(key, {
        expiresIn: 600,
      })

      return new Response(
        JSON.stringify({
          audioId,
          url: signedUrl,
        }),
        { headers }
      )
    }

    return new Response("Not found", { status: 404 })
  },
}

// ===========================
// HELPERS
// ===========================

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

function getApiKey(req: Request) {
  const h = req.headers.get("Authorization")
  if (!h) return null
  const m = h.match(/^Bearer (.+)$/i)
  return m ? m[1].trim() : null
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  )
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function makeApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, "")
}
