import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/auth";

// Preserve custom email templates while leaving token consumption to a user click.
export async function GET(request: Request) {
  const source = new URL(request.url);
  const destination = new URL("/auth/accept", requestOrigin(request));
  for (const key of ["token_hash", "type", "code"]) {
    const value = source.searchParams.get(key);
    if (value) destination.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
