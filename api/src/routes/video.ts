import type { Env } from "../types"
import { json } from "../lib/response"
import { getSessionUserId } from "../lib/session"

// TODO: set to your real Modal endpoint for video pipeline
const MODAL_VIDEO_ENDPOINT =
  "https://oussamalger6-main2--video-translate.modal.run"

// POST /video/upload  (upload to R2 then notify Modal)
export async function uploadVideo(req: Request, env: Env) {
  const userId = await getSessionUserId(req, env.SESSION_SECRET)
  if (!userId) return json(req, { error: "Unauthorized" }, 401)

  const form = await req.formData()
  const file = form.get("video") as File | null

  if (!file) return json(req, { error: "No video provided" }, 400)

  // example guard
  if (file.size > 500 * 1024 * 1024) {
    return json(req, { error: "Video too large" }, 413)
  }

  const jobId = crypto.randomUUID()
  const key = `video/${userId}/${jobId}/original.mp4`

  await env.VIDEO_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "video/mp4" },
  })

  await env.saas_tss_db
    .prepare(
      `INSERT INTO video_jobs (id, user_id, status, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(jobId, userId, "queued", new Date().toISOString())
    .run()

  await fetch(MODAL_VIDEO_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: jobId, r2_key: key, user_id: userId }),
  })

  return json(req, { ok: true, jobId, message: "Video uploaded and job started" }, 200)
}
