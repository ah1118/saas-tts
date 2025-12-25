import { cors } from "./cors"

export function json(
  req: Request,
  obj: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  })
}

export function text(
  req: Request,
  body: string,
  status = 200,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(body, {
    status,
    headers: {
      ...cors(req),
      ...extraHeaders,
    },
  })
}

export async function safeJson(req: Request): Promise<any> {
  try {
    return await req.json()
  } catch {
    return {}
  }
}
