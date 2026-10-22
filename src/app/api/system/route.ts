import {
  createSession,
  findSession,
  handleError,
  json,
  sessionCookie,
} from "@/lib/auth";
import { createDemo, getState } from "@/lib/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await findSession(request);
    let userId = user?.id;
    let token: string | null = null;
    if (!userId) {
      userId = await createDemo();
      token = await createSession(userId);
    }
    const state = await getState(userId);
    return json(
      state,
      200,
      token ? { "Set-Cookie": sessionCookie(request, token) } : {},
    );
  } catch (error) {
    return handleError(error, request);
  }
}
