export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "saas-tts-api",
          time: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Placeholder TTS endpoint
    if (url.pathname === "/tts" && request.method === "POST") {
      return new Response(
        JSON.stringify({
          message: "TTS endpoint ready",
          credits_used: 0,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Default 404
    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404 }
    );
  },
};
