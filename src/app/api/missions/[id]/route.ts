import {
  assertSameOrigin,
  handleError,
  json,
  readBody,
  requireUser,
} from "@/lib/auth";
import { deleteMission, updateMission } from "@/lib/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const { id } = await context.params;
    updateMission(user.id, id, await readBody(request));
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const { id } = await context.params;
    deleteMission(user.id, id);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
