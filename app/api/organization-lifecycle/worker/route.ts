import { timingSafeEqual } from "node:crypto";
import { processDueOrganizationDeletions } from "@/lib/organization-lifecycle";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim() || "";
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return (
    expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}

async function run(request: Request) {
  if (!authorized(request))
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  const results = await processDueOrganizationDeletions();
  return Response.json(
    {
      processed: results.length,
      completed: results.filter((result) => result.status === "completed").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
