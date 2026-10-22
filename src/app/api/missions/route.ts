import {
  assertSameOrigin,
  handleError,
  json,
  readBody,
  requireUser,
} from "@/lib/auth";
import { createMission } from "@/lib/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const id = await createMission(user.id, await readBody(request));
    return json({ ok: true, id }, 201);
  } catch (error) {
    return handleError(error, request);
  }
}
