import type { Env } from "../types"
import { json } from "../lib/response"
import { getSessionUserId } from "../lib/session"

export async function jobStatus(req: Request, env: Env) {
  const userId = await getSessionUserId(req, env.SESSION_SECRET)
  if (!userId) return json(req, { error: "Unauthorized" }, 401)

  const url = new URL(req.url)
  const jobId = url.searchParams.get("id")
  if (!jobId) return json(req, { error: "Missing job id" }, 400)

  const job = await env.saas_tss_db
    .prepare(
      `SELECT id, type, status, r2_key, error
       FROM jobs
       WHERE id = ? AND user_id = ?`
    )
    .bind(jobId, userId)
    .first<
      | {
          id: string
          type: string
          status: string
          r2_key: string | null
          error: string | null
        }
      | null
    >()

  if (!job) return json(req, { error: "Job not found" }, 404)

  return json(req, {
    id: job.id,
    type: job.type,
    status: job.status,
    r2_key: job.r2_key,
    error: job.error,
  })
}
