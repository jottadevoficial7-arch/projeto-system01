import {
  assertSameOrigin,
  handleError,
  json,
  readBody,
  requireUser,
} from "@/lib/auth";
import { deleteMission, updateMission } from "@/lib/service";
export const runtime = "nodejs";
type Context = {
  params: Promise<{
    id: string;
  }>;
};
export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    await updateMission(user.id, id, await readBody(request));
    return json({ ok: true });
  } catch (error) {
    return handleError(error, request);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    await deleteMission(user.id, id);
    return json({ ok: true });
  } catch (error) {
    return handleError(error, request);
  }
}
