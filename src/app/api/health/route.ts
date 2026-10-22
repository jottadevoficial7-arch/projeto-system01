import { checkDatabase } from "@/lib/db";
import { handleError, json } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return json(await checkDatabase());
  } catch (error) {
    return handleError(error, request);
  }
}
