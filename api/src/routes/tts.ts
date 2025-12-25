import type { Env } from "../types"
import { json, safeJson } from "../lib/response"
import { getSessionUserId } from "../lib/session"

const MODAL_ENDPOINT =
  "https://oussamalger6-main2--saas-tts-pipeline-tts.modal.run"

// POST /tts  (Modal → R2 → signed URL)
export async function tts(req: Request, env: Env) {
  const userId = await getSessionUserId(req, env.SESSION_SECRET)
  if (!userId) return json(req, { error: "Unauthorized" }, 401)

  const { text } = await safeJson(req)
  if (typeof text !== "string" || !text.trim()) {
    return json(req, { error: "Invalid text" }, 400)
  }

  const chars = text.length

  const user = await env.saas_tss_db
    .prepare("SELECT credits FROM users WHERE id = ?")
    .bind(userId)
    .first<{ credits: number } | null>()

  if (!user || user.credits < chars) {
    return json(req, { error: "Not enough credits" }, 402)
  }

  const modalRes = await fetch(MODAL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })

  if (!modalRes.ok) {
    const t = await modalRes.text().catch(() => "")
    return json(req, { error: "Modal TTS failed", detail: t.slice(0, 500) }, 502)
  }

  const wavBuf = await modalRes.arrayBuffer()
  const wavBytes = new Uint8Array(wavBuf)

  const key = `tts/${userId}/${crypto.randomUUID()}.wav`
  await env.AUDIO_BUCKET.put(key, wavBytes, {
    httpMetadata: { contentType: "audio/wav" },
  })

  await env.saas_tss_db
    .prepare("UPDATE users SET credits = credits - ? WHERE id = ?")
    .bind(chars, userId)
    .run()

  const signedUrl = await env.AUDIO_BUCKET.createSignedUrl(key, 600)
  return json(req, { url: signedUrl }, 200)
}
