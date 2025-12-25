import type { Env } from "./types"
import { cors } from "./lib/cors"
import { text } from "./lib/response"

import { signup, login, logout, me } from "./routes/auth"
import { tts } from "./routes/tts"
import { uploadVideo } from "./routes/video"
import { jobStatus } from "./routes/jobs"

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)

    // 1. Handle CORS Preflight for EVERYTHING
    if (req.method === "OPTIONS") {
      return new Response(null, { 
        headers: {
          ...cors(req),
          "Access-Control-Max-Age": "86400",
        } 
      })
    }

    // 2. Video Upload (PUT)
    if (url.pathname === "/api/video/upload") {
      return uploadVideo(req, env)
    }

    // 3. Auth Routes
    if (url.pathname === "/api/signup") return signup(req, env)
    if (url.pathname === "/api/login") return login(req, env)
    if (url.pathname === "/api/logout") return logout(req)
    if (url.pathname === "/api/me") return me(req, env)

    // 4. TTS & Jobs
    if (url.pathname === "/api/tts") return tts(req, env)
    if (url.pathname === "/api/jobs/status") return jobStatus(req, env)

    // 5. Fallback - Useful for debugging
    return text(req, `Worker Error: Route ${url.pathname} not found. Method: ${req.method}`, 404, cors(req))
  },
}