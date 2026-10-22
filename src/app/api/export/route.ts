import { handleError, json, requireUser } from "@/lib/auth";
import { exportUserData } from "@/lib/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return json(await exportUserData(user.id), 200, {
      "Content-Disposition": 'attachment; filename="the-system-dados.json"',
    });
  } catch (error) {
    return handleError(error, request);
  }
}
