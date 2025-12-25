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

    // ================= CORS =================
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors(req) })
    }

    // ================= AUTH =================
    if (req.method === "POST" && url.pathname === "/signup")
      return signup(req, env)

    if (req.method === "POST" && url.pathname === "/login")
      return login(req, env)

    if (req.method === "POST" && url.pathname === "/logout")
      return logout(req)

    if (req.method === "GET" && url.pathname === "/me")
      return me(req, env)

    // ================= TTS ==================
    if (req.method === "POST" && url.pathname === "/tts")
      return tts(req, env)

    // ================= VIDEO =================
    if (req.method === "PUT" && url.pathname === "/video/upload")
      return uploadVideo(req, env)

    // ================= JOBS ==================
    if (req.method === "GET" && url.pathname === "/jobs/status")
      return jobStatus(req, env)

    // ================= FALLBACK =================
    return text(req, "Not found", 404, cors(req))
  },
}
