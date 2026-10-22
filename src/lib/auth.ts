import {
  createHash,
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { getDb, StorageError, type UserRow } from "./db";
export const SESSION_COOKIE = "system_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function hashPassword(
  password: string,
  salt = randomBytes(24).toString("hex"),
) {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}
export function verifyPassword(
  password: string,
  salt: string,
  expected: string,
): boolean {
  const actual = scryptSync(password, salt, 64);
  const stored = Buffer.from(expected, "hex");
  return stored.length === actual.length && timingSafeEqual(stored, actual);
}
function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
function requestToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") || "";
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const token = value?.slice(SESSION_COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export async function findSession(request: Request): Promise<UserRow | null> {
  const token = requestToken(request);
  if (!token) return null;
  return (
    ((await getDb()
      .prepare(
        `SELECT users.* FROM users JOIN sessions ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
      )
      .get(tokenHash(token), Date.now())) as UserRow | undefined) ?? null
  );
}
export async function requireUser(request: Request): Promise<UserRow> {
  const user = await findSession(request);
  if (!user)
    throw new ApiError(
      401,
      "Sua sessão expirou. Entre novamente para continuar.",
    );
  return user;
}
export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  await db
    .prepare("DELETE FROM sessions WHERE expires_at <= ?")
    .run(Date.now());
  await db
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    )
    .run(tokenHash(token), userId, Date.now() + SESSION_SECONDS * 1000);
  return token;
}
export async function revokeSession(request: Request) {
  const token = requestToken(request);
  if (token)
    await getDb()
      .prepare("DELETE FROM sessions WHERE token_hash = ?")
      .run(tokenHash(token));
}
export function sessionCookie(request: Request, token: string | null): string {
  const secure =
    new URL(request.url).protocol === "https:" ||
    process.env.APP_ORIGIN?.startsWith("https://") ||
    process.env.COOKIE_SECURE === "true";
  return `${SESSION_COOKIE}=${token || ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}${secure ? "; Secure" : ""}`;
}
/** Browser mutations must originate from this application, including authenticated demos. */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configured = process.env.APP_ORIGIN;
  // Next can use the listen address (0.0.0.0) in Request.url. The Host header
  // carries the address the browser actually requested. Public deployments
  // should pin APP_ORIGIN; forwarded host headers are deliberately not trusted.
  const publicUrl = new URL(request.url);
  const host = request.headers.get("host");
  if (!configured && host) publicUrl.host = host;
  const expected = configured ? new URL(configured).origin : publicUrl.origin;
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    origin !== expected
  ) {
    throw new ApiError(403, "Origem da solicitação não permitida.");
  }
}
export async function rateLimit(key: string, limit: number, windowMs: number) {
  const db = getDb();
  const now = Date.now();
  const id = createHash("sha256").update(key).digest("hex");
  const row = (await db
    .prepare(
      `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN rate_limits.expires_at <= ? THEN 1 ELSE LEAST(rate_limits.count + 1, ?) END,
        expires_at = CASE WHEN rate_limits.expires_at <= ? THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END
      RETURNING count`,
    )
    .get(id, now + windowMs, now, limit + 1, now)) as { count: number };
  if (row.count > limit)
    throw new ApiError(
      429,
      "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    );
}
export async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(415, "Envie os dados no formato JSON.");
  }
  if (Number(request.headers.get("content-length")) > 20000)
    throw new ApiError(413, "Solicitação muito grande.");
  if (!request.body)
    throw new ApiError(400, "Os dados enviados não são válidos.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 20000) {
      await reader.cancel();
      throw new ApiError(413, "Solicitação muito grande.");
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(body);
  } catch {
    throw new ApiError(400, "Os dados enviados não são válidos.");
  }
}
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
export function handleError(error: unknown, request?: Request): Response {
  if (error instanceof ApiError)
    return json({ error: error.message }, error.status);
  const requestId = randomUUID();
  const storage = error instanceof StorageError;
  console.error("[THE SYSTEM] request_failed", {
    requestId,
    method: request?.method,
    path: request
      ? new URL(request.url).pathname.replace(
          /\/[0-9a-f-]{36}(?=\/|$)/gi,
          "/:id",
        )
      : undefined,
    code: storage ? error.code : "INTERNAL_ERROR",
    operation: storage ? error.operation : "request",
  });
  return json(
    {
      error: storage
        ? "Armazenamento indisponível. Tente novamente em instantes."
        : "O sistema encontrou um problema. Tente novamente em instantes.",
      requestId,
    },
    storage ? 503 : 500,
    { "X-Request-ID": requestId },
  );
}
