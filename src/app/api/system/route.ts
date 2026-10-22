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
    const user = findSession(request);
    let userId = user?.id;
    let token: string | null = null;
    if (!userId) {
      userId = createDemo();
      token = createSession(userId);
    }
    const state = getState(userId);
    return json(
      state,
      200,
      token ? { "Set-Cookie": sessionCookie(request, token) } : {},
    );
  } catch (error) {
    return handleError(error);
  }
}
