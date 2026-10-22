import { z } from "zod";
import {
  ApiError,
  assertSameOrigin,
  createSession,
  handleError,
  json,
  rateLimit,
  readBody,
  revokeSession,
  sessionCookie,
} from "@/lib/auth";
import { login, register } from "@/lib/service";

export const runtime = "nodejs";
const authSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("register"),
      name: z.string(),
      email: z.string(),
      password: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal("login"),
      email: z.string(),
      password: z.string(),
    })
    .strict(),
  z.object({ action: z.literal("logout") }).strict(),
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = authSchema.safeParse(await readBody(request));
    if (!parsed.success)
      throw new ApiError(400, "Preencha os campos da sua conta.");
    const data = parsed.data;
    if (data.action === "logout") {
      revokeSession(request);
      return json({ ok: true }, 200, {
        "Set-Cookie": sessionCookie(request, null),
      });
    }
    rateLimit(`auth:${data.email.trim().toLowerCase()}`, 10, 15 * 60 * 1000);
    const id =
      data.action === "register"
        ? register({
            name: data.name,
            email: data.email,
            password: data.password,
          })
        : login({ email: data.email, password: data.password });
    revokeSession(request);
    const token = createSession(id);
    return json({ ok: true }, 200, {
      "Set-Cookie": sessionCookie(request, token),
    });
  } catch (error) {
    return handleError(error);
  }
}
