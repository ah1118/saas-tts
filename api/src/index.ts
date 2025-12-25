import type { Env } from "./types"
import { cors } from "./lib/cors"
import { text } from "./lib/response"

// Auth & TTS routes
import { signup, login, logout, me } from "./routes/auth"
import { tts } from "./routes/tts"
import { jobStatus } from "./routes/jobs"

// VIDEO route - Corrected path to match api/src/routes/video.ts
import { uploadVideo } from "./routes/video" 

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)

    // ================= CORS (Preflight) =================
    // This handles the browser "handshake" before the PUT request
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors(req) })
    }

    // ================= AUTH =================
    if (url.pathname === "/api/signup") return signup(req, env)
    if (url.pathname === "/api/login") return login(req, env)
    if (url.pathname === "/api/logout") return logout(req)
    if (url.pathname === "/api/me") return me(req, env)

    // ================= TTS ==================
    if (url.pathname === "/api/tts") return tts(req, env)

    // ================= VIDEO (The Fix) =================
    // Matches your frontend PUT request to /api/video/upload
    if (url.pathname === "/api/video/upload") {
      return uploadVideo(req, env)
    }

    // ================= JOBS ==================
    if (url.pathname === "/api/jobs/status") return jobStatus(req, env)

    // ================= FALLBACK =================
    // If none of the above match, return 404
    return text(req, `Route ${url.pathname} not found`, 404, cors(req))
  },
}