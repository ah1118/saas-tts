// api/src/video.ts

export async function createVideoUpload(req: Request, env: Env) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  const userId = "demo-user"
  const jobId = crypto.randomUUID()
  const r2Path = `video/${userId}/${jobId}/original.mp4`

  const upload = await env.VIDEO_BUCKET.createMultipartUpload(r2Path)

  await env.DB.prepare(
    `INSERT INTO video_jobs (id, user_id, status, r2_path)
     VALUES (?, ?, ?, ?)`
  )
    .bind(jobId, userId, "uploading", r2Path)
    .run()

  return new Response(
    JSON.stringify({
      jobId,
      r2Path,
      uploadId: upload.uploadId,
      key: r2Path,
    }),
    { headers: { "Content-Type": "application/json" } }
  )
}

export async function completeVideoUpload(req: Request, env: Env) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  const { jobId, r2Path } = await req.json()

  await env.DB.prepare(
    `UPDATE video_jobs SET status = ? WHERE id = ?`
  )
    .bind("queued", jobId)
    .run()

  await fetch(env.MODAL_VIDEO_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MODAL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      job_id: jobId,
      r2_path: r2Path,
    }),
  })

  return new Response(
    JSON.stringify({ ok: true, jobId }),
    { headers: { "Content-Type": "application/json" } }
  )
}
