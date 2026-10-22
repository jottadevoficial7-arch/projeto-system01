import {
  assertSameOrigin,
  handleError,
  json,
  readBody,
  requireUser,
} from "@/lib/auth";
import { updateProfile } from "@/lib/service";
export const runtime = "nodejs";
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await updateProfile(user.id, await readBody(request));
    return json({ ok: true });
  } catch (error) {
    return handleError(error, request);
  }
}
