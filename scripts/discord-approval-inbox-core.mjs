export const repositoryUrl =
  process.env.PRODUCT_COUNCIL_REPOSITORY_URL ||
  "https://github.com/walkermoz/premium-remodel-app";

export const implementationSelect =
  "id,recommendation_id,spec_version_id,status,pr_url,pr_number,branch_name,head_sha,preview_url,codex_model,checks,servicebuddy_product_recommendations(title,summary),servicebuddy_product_spec_versions!servicebuddy_product_implementations_spec_version_id_fkey(spec)";

function one(value) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function implementationTask(row) {
  const recommendation = one(row.servicebuddy_product_recommendations);
  if (!recommendation)
    throw new Error("The approved recommendation is missing.");
  const spec = one(row.servicebuddy_product_spec_versions)?.spec;
  if (!spec)
    throw new Error("The locked recommendation specification is missing.");
  return {
    id: row.id,
    title: recommendation.title,
    summary: recommendation.summary,
    spec,
    repositoryUrl,
    startingRef: "main",
  };
}

export function parsePullRequestUrl(value) {
  const parsed = new URL(value);
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (
    parsed.origin !== "https://github.com" ||
    parts.length !== 4 ||
    parts[0] !== "walkermoz" ||
    parts[1] !== "premium-remodel-app" ||
    parts[2] !== "pull"
  )
    throw new Error("The pull request is outside the configured repository.");
  const number = Number(parts[3]);
  if (!Number.isInteger(number) || number < 1)
    throw new Error("The pull request URL is invalid.");
  return number;
}
