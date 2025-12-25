import { cors } from "../lib/cors";

/**
 * Handles video upload by forwarding raw bytes to Modal GPU.
 * Uses streaming to stay within Cloudflare Worker memory limits.
 */
export async function uploadVideo(req: Request, env: any) {
  const MODAL_ENDPOINT = "https://oussamalger6--video-translate-subtitles-api.modal.run/video-translate";

  // 1. Check if body exists
  if (!req.body) {
    return new Response(JSON.stringify({ error: "No video data received" }), {
      status: 400,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }

  try {
    // 2. Forward the stream to Modal
    const modalResponse = await fetch(MODAL_ENDPOINT, {
      method: "POST", 
      headers: {
        "Content-Type": req.headers.get("Content-Type") || "video/mp4",
      },
      body: req.body,
      // @ts-ignore - Required for streaming in Cloudflare Workers
      duplex: "half",
    });

    const result = await modalResponse.json();

    // 3. Return Modal's job_id to the frontend
    return new Response(JSON.stringify(result), {
      status: modalResponse.status,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ 
      error: "Gateway Error", 
      message: "Worker could not reach Modal GPU service",
      details: err.message 
    }), {
      status: 502,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }
}