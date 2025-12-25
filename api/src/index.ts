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

    // ================= CORS (Preflight) =================
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors(req) })
    }

    // ================= AUTH =================
    if (req.method === "POST" && url.pathname === "/api/signup")
      return signup(req, env)

    if (req.method === "POST" && url.pathname === "/api/login")
      return login(req, env)

    if (req.method === "POST" && url.pathname === "/api/logout")
      return logout(req)

    if (req.method === "GET" && url.pathname === "/api/me")
      return me(req, env)

    // ================= TTS ==================
    if (req.method === "POST" && url.pathname === "/api/tts")
      return tts(req, env)

    // ================= VIDEO =================
    // FIX: Added /api and handles PUT
    if (req.method === "PUT" && url.pathname === "/api/video/upload")
      return uploadVideo(req, env)

    // ================= JOBS ==================
    if (req.method === "GET" && url.pathname === "/api/jobs/status")
      return jobStatus(req, env)

    // ================= FALLBACK =================
    return text(req, `Path ${url.pathname} not found`, 404, cors(req))
  },
}