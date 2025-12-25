import type { Env } from "../types"
import { json } from "../lib/response"
import { getSessionUserId } from "../lib/session"

export async function jobStatus(req: Request, env: Env) {
  if (req.method !== "GET") {
    return json(req, { error: "Method not allowed" }, 405)
  }

  const userId = await getSessionUserId(req, env.SESSION_SECRET)
  if (!userId) return json(req, { error: "Unauthorized" }, 401)

  const url = new URL(req.url)
  const jobId = url.searchParams.get("id")
  if (!jobId) return json(req, { error: "Missing job id" }, 400)

  const job = await env.saas_tss_db
    .prepare(
      `SELECT id, status, r2_path, error
       FROM video_jobs
       WHERE id = ? AND user_id = ?`
    )
    .bind(jobId, userId)
    .first<
      | {
          id: string
          status: string
          r2_path: string | null
          error: string | null
        }
      | null
    >()

  if (!job) return json(req, { error: "Job not found" }, 404)

  return json(req, {
    id: job.id,
    status: job.status,
    r2_path: job.r2_path,
    error: job.error,
  })
}
