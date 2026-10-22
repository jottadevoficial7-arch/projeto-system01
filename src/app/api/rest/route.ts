import { z } from "zod";
import {
  ApiError,
  assertSameOrigin,
  handleError,
  json,
  readBody,
  requireUser,
} from "@/lib/auth";
import { setRest } from "@/lib/service";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const data = z
      .object({ rest: z.boolean() })
      .strict()
      .safeParse(await readBody(request));
    if (!data.success)
      throw new ApiError(400, "Informe se deseja descansar hoje.");
    setRest(user.id, data.data.rest);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
