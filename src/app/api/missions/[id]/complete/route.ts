import { assertSameOrigin, handleError, json, requireUser } from "@/lib/auth";
import { completeMission } from "@/lib/service";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    return json(await completeMission(user.id, id));
  } catch (error) {
    return handleError(error, request);
  }
}
