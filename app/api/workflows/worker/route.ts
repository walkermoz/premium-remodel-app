import { timingSafeEqual } from "node:crypto";
import {
  processWorkflowOutbox,
  resumeDueWorkflowWaits,
} from "@/lib/workflows/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!secret || !provided) return false;
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

async function runWorker(request: Request) {
  if (!authorized(request))
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  const results = await processWorkflowOutbox({
    worker: `api-worker-${crypto.randomUUID()}`,
    limit: 20,
  });
  const waits = await resumeDueWorkflowWaits({
    worker: `api-waits-${crypto.randomUUID()}`,
    limit: 20,
  });
  return Response.json(
    {
      processed: results.length,
      completed: results.filter((item) => item.status === "completed").length,
      failed: results.filter((item) => item.status === "failed").length,
      results,
      scheduled: results.scheduled,
      waits: {
        processed: waits.length,
        failed: waits.filter((item) => item.status === "failed").length,
        results: waits,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET(request: Request) {
  return runWorker(request);
}

export async function POST(request: Request) {
  return runWorker(request);
}
