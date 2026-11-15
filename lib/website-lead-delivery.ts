// This is the existing Premium Remodel destination, never a caller-supplied URL.
export const WEBSITE_LEAD_GHL_URL =
  "https://services.leadconnectorhq.com/hooks/agXjSOKxwsf6Q0ZTUVdd/webhook-trigger/6b560993-57f6-44a6-b567-ed434ec1b622";

export type WebsiteLeadDeliveryJob = {
  id: string;
  organization_id: string;
  claim_token: string;
  attempt_count: number;
  payload: Record<string, unknown>;
};

export type WebsiteLeadDeliveryOutcome = {
  status: "delivered" | "retry_wait" | "needs_attention";
  error?: string;
  availableAt?: string;
};

export function requestsBackgroundLeadDelivery(input: {
  url: string;
  origin: string;
  organizationId: string;
  primaryOrganizationId?: string;
  fromPortal: boolean;
}) {
  return (
    new URL(input.url).searchParams.get("background_delivery") === "1" &&
    !input.fromPortal &&
    Boolean(input.primaryOrganizationId) &&
    input.organizationId === input.primaryOrganizationId &&
    (input.origin === "https://www.premiumremodel.com" ||
      input.origin === "https://premiumremodel.com" ||
      /^https:\/\/plhi(?:-[a-z0-9-]+)?-walkermozs-projects\.vercel\.app$/.test(
        input.origin,
      ))
  );
}

export async function deliverWebsiteLeadCopy(
  job: WebsiteLeadDeliveryJob,
  options: {
    primaryOrganizationId?: string;
    request?: typeof fetch;
    timeoutMs?: number;
    now?: () => number;
  },
): Promise<WebsiteLeadDeliveryOutcome> {
  if (
    !options.primaryOrganizationId ||
    job.organization_id !== options.primaryOrganizationId
  )
    return {
      status: "needs_attention",
      error:
        "Delivery organization does not match the configured website organization.",
    };

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 8_000,
  );
  try {
    const response = await (options.request ?? fetch)(WEBSITE_LEAD_GHL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `website-lead:${job.id}`,
      },
      body: JSON.stringify(job.payload),
      signal: controller.signal,
      redirect: "error",
    });
    if (response.ok) return { status: "delivered" };
    // Only an explicit rate-limit rejection is retried. A timeout or 5xx can
    // follow successful remote processing; automatically replaying it could
    // send duplicate messages. Keep those outcomes for operator review.
    if (response.status === 429 && job.attempt_count < 3) {
      const now = (options.now ?? Date.now)();
      const retryAfter = response.headers.get("Retry-After");
      const requestedSeconds =
        retryAfter && /^\d+$/.test(retryAfter)
          ? Number(retryAfter)
          : retryAfter
            ? (Date.parse(retryAfter) - now) / 1000
            : 0;
      const seconds = Math.min(
        3600,
        Math.max(
          60 * 2 ** (job.attempt_count - 1),
          Number.isFinite(requestedSeconds) ? requestedSeconds : 0,
        ),
      );
      return {
        status: "retry_wait",
        error: "GoHighLevel rate limited the request.",
        availableAt: new Date(now + seconds * 1000).toISOString(),
      };
    }
    return {
      status: "needs_attention",
      error: `GoHighLevel returned HTTP ${response.status}; review before resending.`,
    };
  } catch {
    return {
      status: "needs_attention",
      error:
        "GoHighLevel delivery outcome is unknown; review before resending.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
