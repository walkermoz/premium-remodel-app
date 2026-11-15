import { z } from "zod";

const capturedWebsiteLead = z
  .object({
    contactId: z.uuid(),
    eventId: z.uuid(),
    deliveryId: z.uuid().optional(),
    goHighLevelQueued: z.literal(true).optional(),
  })
  .refine(
    (capture) =>
      Boolean(capture.deliveryId) === Boolean(capture.goHighLevelQueued),
    "The delivery receipt must match its saved job.",
  );

export function parseCapturedWebsiteLead(value: unknown) {
  return capturedWebsiteLead.parse(value);
}

type CaptureResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

export async function captureWebsiteLead(
  args: Record<string, unknown>,
  deliveryPayload: Record<string, unknown> | undefined,
  capture: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<CaptureResult>,
) {
  if (deliveryPayload) {
    const result = await capture("remodel_capture_website_lead_with_delivery", {
      ...args,
      p_delivery_payload: deliveryPayload,
    });
    // Only a missing RPC is safe to fall back from: it did not execute. Never
    // retry a timeout or another ambiguous failure using a second capture path.
    if (result.error?.code !== "PGRST202") return result;
  }
  return capture("remodel_capture_workflow_website_lead", args);
}

export async function runCapturedLeadFollowups(
  capture: { eventId: string; deliveryId?: string },
  handlers: {
    workflow: (eventId: string) => Promise<unknown>;
    delivery: (deliveryId: string) => Promise<unknown>;
    report: (message: string) => void;
  },
) {
  // Both jobs are already durable. Start independently after the response so
  // a slow email/SMS workflow cannot delay the marketing copy, or vice versa.
  const results = await Promise.allSettled([
    Promise.resolve().then(() => handlers.workflow(capture.eventId)),
    ...(capture.deliveryId
      ? [Promise.resolve().then(() => handlers.delivery(capture.deliveryId!))]
      : []),
  ]);
  results.forEach((result, index) => {
    if (result.status === "rejected")
      handlers.report(
        index === 0
          ? "Website lead workflow remains queued for recovery."
          : "Website lead delivery remains saved for recovery or review.",
      );
  });
}
