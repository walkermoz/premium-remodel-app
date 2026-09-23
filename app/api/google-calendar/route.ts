import { apiError, checkOrigin, limitAttempts, requireUser } from "@/lib/auth";
import {
  disconnectGoogleCalendar,
  GoogleCalendarError,
  googleCalendarStatus,
  syncUserGoogleCalendar,
} from "@/lib/google-calendar";

export const runtime = "nodejs";
export const maxDuration = 60;

function calendarError(error: unknown) {
  return error instanceof GoogleCalendarError
    ? Response.json({ error: error.message }, { status: 502 })
    : apiError(error);
}

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await googleCalendarStatus(user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return calendarError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await limitAttempts(`google-calendar-sync:${user.id}`, 30);
    return Response.json(await syncUserGoogleCalendar(request, user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return calendarError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await limitAttempts(`google-calendar-disconnect:${user.id}`, 10);
    return Response.json(await disconnectGoogleCalendar(user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return calendarError(error);
  }
}
