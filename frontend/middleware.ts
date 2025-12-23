import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(req: NextRequest) {
  const isTTS = req.nextUrl.pathname.startsWith("/tts")
  const hasSession = req.cookies.get("session")

  if (isTTS && !hasSession) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/tts/:path*"],
}
