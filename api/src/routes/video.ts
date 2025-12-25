import { cors } from "../lib/cors";

export async function uploadVideo(req: Request, env: any) {
  const MODAL_ENDPOINT = "https://oussamalger6--video-translate-subtitles-api.modal.run/video-translate";

  // 1. Validate body
  if (!req.body) {
    return new Response(JSON.stringify({ error: "No video data received" }), {
      status: 400,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }

  try {
    // 2. Stream directly to Modal
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

    return new Response(JSON.stringify(result), {
      status: modalResponse.status,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }
}