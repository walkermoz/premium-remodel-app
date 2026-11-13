import { timingSafeEqual } from "node:crypto";
import { processDueProjectSmsReminders } from "@/lib/task-sms-reminders.server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (
    !secret ||
    !provided ||
    Buffer.byteLength(secret) !== Buffer.byteLength(provided) ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
  )
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return Response.json(await processDueProjectSmsReminders(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Schedule reminder worker failed", error);
    return Response.json(
      { error: "Could not process schedule reminders." },
      { status: 500 },
    );
  }
}
