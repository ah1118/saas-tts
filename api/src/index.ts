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

    // Handle Preflight for all routes
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors(req) })
    }

    // Routing
    if (url.pathname === "/api/video/upload") return uploadVideo(req, env)
    if (url.pathname === "/api/signup") return signup(req, env)
    if (url.pathname === "/api/login") return login(req, env)
    if (url.pathname === "/api/logout") return logout(req)
    if (url.pathname === "/api/me") return me(req, env)
    if (url.pathname === "/api/tts") return tts(req, env)
    if (url.pathname === "/api/jobs/status") return jobStatus(req, env)

    return text(req, `Path ${url.pathname} not found`, 404, cors(req))
  },
}