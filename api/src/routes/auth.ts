import { json, safeJson } from "../lib/response";
// Corrected to match your crypto.ts file
import { isValidEmail, isValidPassword, hashPassword, verifyPassword, sha256Hex } from "../lib/crypto";
// Corrected to match your session.ts file
import { createSessionToken, makeSessionCookie } from "../lib/session";
import type { Env } from "../types";

// 1. SIGNUP
export async function signup(req: Request, env: Env) {
  const body = await safeJson(req);
  const emailRaw = body?.email;
  const password = body?.password;

  if (!emailRaw || !password) {
    return json(req, { error: "Missing email or password" }, 400);
  }

  const email = emailRaw.trim().toLowerCase();

  if (!isValidEmail(email) || !isValidPassword(password)) {
    return json(req, { error: "Invalid input" }, 400);
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  const saltB64 = btoa(String.fromCharCode(...salt));
  const password_hash = `${hash}:${saltB64}`;

  const userId = crypto.randomUUID();
  const apiKey = crypto.randomUUID();
  const apiKeyHash = await sha256Hex(apiKey);

  try {
    await env.saas_tss_db
      .prepare(
        `INSERT INTO users (id, email, password_hash, api_key_hash, credits, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(userId, email, password_hash, apiKeyHash, 20000, new Date().toISOString())
      .run();
  } catch (e: any) {
    return json(req, { error: "Database error", detail: e.message }, 500);
  }

  const session = await createSessionToken(userId, env.SESSION_SECRET);
  return json(req, { ok: true }, 200, { "Set-Cookie": makeSessionCookie(session) });
}

// 2. LOGIN
export async function login(req: Request, env: Env) {
  const body = await safeJson(req);
  const { email, password } = body;

  if (!email || !password) {
    return json(req, { error: "Email and password required" }, 400);
  }

  const user = await env.saas_tss_db
    .prepare("SELECT * FROM users WHERE email = ?")
    .bind(email.trim().toLowerCase())
    .first();

  if (!user) {
    return json(req, { error: "User not found" }, 401);
  }

  const isValid = await verifyPassword(password, user.password_hash as string);
  if (!isValid) {
    return json(req, { error: "Invalid password" }, 401);
  }

  const session = await createSessionToken(user.id as string, env.SESSION_SECRET);
  return json(req, { ok: true }, 200, { "Set-Cookie": makeSessionCookie(session) });
}

// 3. LOGOUT
export async function logout(req: Request) {
  return json(req, { ok: true }, 200, { 
    "Set-Cookie": "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" 
  });
}

// 4. ME
export async function me(req: Request, env: Env) {
  // This verifies the user is actually logged in
  const cookieHeader = req.headers.get("Cookie") || "";
  const token = cookieHeader.split(";").find(c => c.trim().startsWith("session="))?.split("=")[1];

  if (!token) {
    return json(req, { error: "Not authenticated" }, 401);
  }

  return json(req, { status: "authenticated" }, 200);
}