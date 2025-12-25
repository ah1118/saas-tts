const ALLOWED_ORIGINS = new Set([
  "https://saas-tts.pages.dev",
  "http://localhost:3000",
])

export function cors(req: Request) {
  const origin = req.headers.get("Origin") || ""
  const allowOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://saas-tts.pages.dev"

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    // Added 'Authorization' to headers
    "Access-Control-Allow-Headers": "Content-Type, Authorization", 
    // FIXED: Added 'PUT' to allowed methods
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS", 
    "Vary": "Origin",
  }
}