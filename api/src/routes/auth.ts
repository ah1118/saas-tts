// api/src/routes/auth.ts

export async function signup(req: Request, env: Env) {
  const body = await safeJson(req);
  const emailRaw = body?.email;
  const password = body?.password;

  // 0. Hard guard (CRITICAL)
  if (!emailRaw || !password) {
    return json(req, { error: "Missing email or password" }, 400);
  }

  const email = emailRaw.trim().toLowerCase();

  // 1. Validation
  if (!isValidEmail(email) || !isValidPassword(password)) {
    return json(req, { error: "Invalid input" }, 400);
  }

  // 2. Hash password
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  const saltB64 = Buffer.from(salt).toString("base64");
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
      .bind(
        userId,
        email,
        password_hash,
        apiKeyHash,
        20000,
        new Date().toISOString()
      )
      .run();
  } catch (e: any) {
    // UNIQUE constraint / SQL errors become visible
    return json(
      req,
      { error: "Database error", detail: e.message },
      500
    );
  }

  // 3. Create session
  const session = await createSessionToken(userId, env.SESSION_SECRET);

  return json(
    req,
    { ok: true },
    200,
    { "Set-Cookie": makeSessionCookie(session) }
  );
}
