import { cors } from "../lib/cors";

export async function uploadVideo(req: Request, env: any) {
  const MODAL_ENDPOINT = "https://oussamalger6--video-translate-subtitles-api.modal.run/video-translate";

  if (!req.body) {
    return new Response(JSON.stringify({ error: "No video data received" }), {
      status: 400,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Forward to Modal (This triggers the .spawn() in Python)
    const modalResponse = await fetch(MODAL_ENDPOINT, {
      method: "POST", 
      headers: {
        "Content-Type": "application/octet-stream",
        "x-target-lang": req.headers.get("x-target-lang") || "en",
      },
      body: req.body,
      // @ts-ignore
      duplex: "half",
    });

    const result = await modalResponse.json();

    // 2. Save the pending job to your D1 Database
    if (result.job_id) {
      await env.saas_tss_db.prepare(
        "INSERT INTO video_jobs (id, status, created_at) VALUES (?, ?, ?)"
      )
      .bind(result.job_id, "processing", new Date().toISOString())
      .run();
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Worker failed", detail: err.message }), {
      status: 502,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }
}