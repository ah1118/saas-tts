export async function uploadVideo(req: Request, env: Env) {
  const form = await req.formData()
  const file = form.get("video") as File

  if (!file) {
    return new Response(JSON.stringify({ error: "No file" }), { status: 400 })
  }

  const userId = "demo-user" // replace with real auth later
  const jobId = crypto.randomUUID()

  const r2Path = `video/${userId}/${jobId}/original.mp4`

  // 1️⃣ Upload to R2
  await env.VIDEO_BUCKET.put(r2Path, file.stream(), {
    httpMetadata: { contentType: file.type },
  })

  // 2️⃣ Create DB job (simplified)
  await env.DB.prepare(
    `INSERT INTO video_jobs (id, user_id, status) VALUES (?, ?, ?)`
  ).bind(jobId, userId, "queued").run()

  // 3️⃣ Call Modal
  await fetch(env.MODAL_VIDEO_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.MODAL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      job_id: jobId,
      r2_path: r2Path,
    }),
  })

  return new Response(
    JSON.stringify({
      message: "Video uploaded. Job started.",
      jobId,
    }),
    { headers: { "Content-Type": "application/json" } }
  )
}
