const endpoint = (
  process.env.PRODUCT_COUNCIL_API_URL ||
  "https://servicebuddy-ui.vercel.app/api/product-lab/runner"
).replace(/\/$/, "");
const secret = process.env.CRON_SECRET?.trim();
if (!secret) throw new Error("CRON_SECRET is required.");

const mode = process.env.PRODUCT_COUNCIL_REPORT_MODE;
let body;
if (mode === "preview") {
  if (!process.env.PR_URL || !process.env.PREVIEW_URL) {
    console.log("No PR or preview URL is available; product evidence was skipped.");
    process.exit(0);
  }
  body = {
    action: "ci_evidence",
    prUrl: process.env.PR_URL,
    headSha: process.env.HEAD_SHA,
    previewUrl: process.env.PREVIEW_URL,
    branchName: process.env.BRANCH_NAME,
    checks: {
      quality: process.env.QUALITY_RESULT,
      preview: process.env.PREVIEW_RESULT,
      workflowRun: process.env.WORKFLOW_RUN_URL,
    },
  };
} else if (mode === "production") {
  body = {
    action: "deployment_finished",
    mergeSha: process.env.HEAD_SHA,
    success:
      process.env.QUALITY_RESULT === "success" &&
      process.env.PRODUCTION_RESULT === "success",
    productionUrl: process.env.PRODUCTION_URL || undefined,
    summary:
      process.env.QUALITY_RESULT === "success" &&
      process.env.PRODUCTION_RESULT === "success"
        ? "Production checks passed and the approved implementation is live."
        : "Production checks or deployment failed. Open the linked CI run for details.",
  };
} else {
  throw new Error("PRODUCT_COUNCIL_REPORT_MODE must be preview or production.");
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(60_000),
});
const result = await response.json().catch(() => ({}));
if (!response.ok)
  throw new Error(
    result.error || `Product council API returned HTTP ${response.status}.`,
  );
console.log(
  result.matched === false
    ? "This build is not associated with a product-council implementation."
    : "Product-council evidence reported.",
);
