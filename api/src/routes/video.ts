import type { Env } from "../types"
import { json } from "../lib/response"
import { getSessionUserId } from "../lib/session"

// Modal endpoint
const MODAL_VIDEO_ENDPOINT =
  "https://oussamalger6--video-translate-subtitles-api.modal.run/video-translate"

// PUT /video/upload  (Cloudflare-safe raw stream upload)
export async function uploadVideo(req: Request, env: Env) {
  if (req.method !== "PUT") {
    return json(req, { error: "Method not allowed" }, 405)
  }

  const userId = await getSessionUserId(req, env.SESSION_SECRET)
  if (!userId) return json(req, { error: "Unauthorized" }, 401)

  if (!req.body) {
    return json(req, { error: "No request body" }, 400)
  }

  const contentType =
    req.headers.get("content-type") || "video/mp4"

  const jobId = crypto.randomUUID()
  const key = `video/${userId}/${jobId}/original.mp4`

  // stream directly to R2 (NO formData)
  await env.VIDEO_BUCKET.put(key, req.body, {
    httpMetadata: { contentType },
  })

  // create job
  await env.saas_tss_db
    .prepare(
      `INSERT INTO video_jobs (id, user_id, status, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(jobId, userId, "queued", new Date().toISOString())
    .run()

  // notify Modal
  await fetch(MODAL_VIDEO_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: jobId,
      r2_key: key,
      user_id: userId,
    }),
  })

  return json(
    req,
    { ok: true, jobId, message: "Video uploaded and job started" },
    200
  )
}
