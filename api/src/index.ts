import { cors } from "./lib/cors"
import { text } from "./lib/response"
import { signup, login, logout, me } from "./routes/auth"
import { tts } from "./routes/tts"
import { uploadVideo } from "./routes/video"
import { jobStatus } from "./routes/jobs"

export default {
  async fetch(req: Request, env: any) {
    const url = new URL(req.url)

    // Handle Preflight (CORS)
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors(req) })
    }

    // Routing Logic
    try {
      if (url.pathname === "/api/video/upload") return await uploadVideo(req, env)
      if (url.pathname === "/api/signup") return await signup(req, env)
      if (url.pathname === "/api/login") return await login(req, env)
      if (url.pathname === "/api/logout") return await logout(req)
      if (url.pathname === "/api/me") return await me(req, env)
      if (url.pathname === "/api/tts") return await tts(req, env)
      if (url.pathname === "/api/jobs/status") return await jobStatus(req, env)

      return text(req, `Path ${url.pathname} not found`, 404, cors(req))
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, 
        headers: cors(req) 
      })
    }
  },
}