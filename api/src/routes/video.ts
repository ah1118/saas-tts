import { cors } from "../lib/cors";

export async function uploadVideo(req: Request, env: any) {
  const MODAL_ENDPOINT = "https://oussamalger6--video-translate-subtitles-api.modal.run/video-translate";

  if (!req.body) {
    return new Response(JSON.stringify({ error: "No video data" }), {
      status: 400,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }

  // Get language from frontend headers, default to 'en'
  const targetLang = req.headers.get("x-target-lang") || "en";

  try {
    const modalResponse = await fetch(MODAL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-target-lang": targetLang, // SENDING THIS TO MODAL
      },
      body: req.body,
      // @ts-ignore
      duplex: "half",
    });

    if (!modalResponse.ok) {
      const errorText = await modalResponse.text();
      return new Response(JSON.stringify({ error: "Modal Error", details: errorText }), {
        status: modalResponse.status,
        headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    const result = await modalResponse.json();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Worker failed to reach GPU", message: err.message }), {
      status: 502,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }
}