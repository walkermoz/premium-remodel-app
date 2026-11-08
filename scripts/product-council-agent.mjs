import { Agent, CursorAgentError } from "@cursor/sdk";

const apiUrl = (
  process.env.PRODUCT_COUNCIL_API_URL ||
  "https://servicebuddy-ui.vercel.app/api/product-lab/runner"
).replace(/\/$/, "");
const cronSecret = process.env.CRON_SECRET?.trim();
if (!cronSecret) throw new Error("CRON_SECRET is required.");

async function productApi(body) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cronSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : `Product council API returned HTTP ${response.status}.`,
    );
  return result;
}

function implementationPrompt(task) {
  return `You are the dedicated ServiceBuddy implementation agent for an approved product specification.

Repository: ${task.repositoryUrl}
Approved feature: ${task.title}
Summary: ${JSON.stringify(task.summary, null, 2)}
Locked specification: ${JSON.stringify(task.spec, null, 2)}

Requirements:
1. Read AGENTS.md before changing files. This is Next.js 16; read the relevant installed Next.js documentation before writing Next.js code.
2. Preserve all existing Premium Remodel workflows and defaults. The feature must remain organization-scoped and configurable for future organizations.
3. Implement the complete approved specification with production-quality code, migrations where required, and focused regression tests.
4. Run the relevant lint, typecheck, build, and tests. Fix failures caused by your work.
5. Do not merge or deploy. Open a pull request only. The separate Discord evidence gate controls merging.
6. In the final response, summarize changed behavior, tests run, known limitations, and any configuration an administrator must provide.
`;
}

function recommendationPrompt(task) {
  return `Act as ServiceBuddy's product council. Analyze the connected repository as it exists now and the authenticated operator evidence below.

Operator evidence:
${task.signals.map((signal, index) => `${index + 1}. ${signal.body}`).join("\n")}

Create exactly four prioritized recommendations that build naturally on the current modular architecture and preserve Premium Remodel's existing behavior. Do not edit code and do not open a pull request. Avoid repeating features already implemented. Each recommendation must include concrete repository evidence and a specification that another Codex agent can implement without guessing.

Return only valid JSON between these exact markers:
SERVICEBUDDY_RECOMMENDATIONS_START
[
  {
    "title": "...",
    "problem": "...",
    "outcome": "...",
    "evidence": "...",
    "competitorGap": "...",
    "integration": "...",
    "value": "High or Medium",
    "effort": "Small, Medium, or Large",
    "risk": "Low, Medium, or High",
    "confidence": "High or Medium",
    "spec": {
      "objects": ["..."],
      "surfaces": ["..."],
      "permissions": "...",
      "tenancy": "...",
      "rollout": "...",
      "observability": "...",
      "acceptanceCriteria": ["..."],
      "nonGoals": ["..."]
    }
  }
]
SERVICEBUDDY_RECOMMENDATIONS_END`;
}

function extractRecommendations(result) {
  const startMarker = "SERVICEBUDDY_RECOMMENDATIONS_START";
  const endMarker = "SERVICEBUDDY_RECOMMENDATIONS_END";
  const start = result.indexOf(startMarker);
  const end = result.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start)
    throw new Error("Codex did not return the required recommendation JSON markers.");
  return JSON.parse(result.slice(start + startMarker.length, end).trim());
}

async function runCodexTask(task) {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  const modelId = process.env.CURSOR_PRODUCT_MODEL?.trim() || "auto";
  if (!apiKey)
    throw new Error(
      "The product-council API returned a Codex task without a configured CURSOR_API_KEY.",
    );

  let agent;
  try {
    agent = await Agent.create({
      apiKey,
      model: { id: modelId },
      name: `ServiceBuddy product council · ${task.type}`,
      idempotencyKey: `servicebuddy-product-${task.id}`,
      cloud: {
        repos: [{ url: task.repositoryUrl, startingRef: task.startingRef }],
        autoCreatePR: task.type === "implementation",
        skipReviewerRequest: true,
        metadata: {
          servicebuddy_task_id: task.id,
          servicebuddy_task_type: task.type,
        },
      },
    });
    const prompt =
      task.type === "implementation"
        ? implementationPrompt(task)
        : recommendationPrompt(task);
    const run = await agent.send(prompt);
    await productApi({
      action: "started",
      taskType: task.type,
      taskId: task.id,
      agentId: agent.agentId,
      runId: run.id,
      modelId,
    });
    console.log(`Codex agent ${agent.agentId}; run ${run.id}.`);
    const result = await run.wait();
    if (result.status !== "finished")
      throw new Error(
        result.error?.message || `Codex run ended with status ${result.status}.`,
      );

    if (task.type === "recommendations") {
      await productApi({
        action: "generation_finished",
        generationId: task.id,
        recommendations: extractRecommendations(result.result || ""),
        resultSummary: result.result?.slice(0, 4000),
      });
      return;
    }

    const branch = result.git?.branches?.find(
      (item) => item.repoUrl === task.repositoryUrl,
    ) || result.git?.branches?.[0];
    if (!branch?.prUrl)
      throw new Error("Codex finished without opening the required pull request.");
    await productApi({
      action: "implementation_finished",
      implementationId: task.id,
      prUrl: branch.prUrl,
      branchName: branch.branch || "codex-generated",
      resultSummary: result.result?.slice(0, 4000),
    });
  } catch (error) {
    const message =
      error instanceof CursorAgentError
        ? `Codex could not start: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unknown Codex product-council failure.";
    await productApi({
      action: "failed",
      taskType: task.type,
      taskId: task.id,
      status: "failed",
      message,
    }).catch(() => undefined);
    throw error;
  } finally {
    if (agent) await agent[Symbol.asyncDispose]();
  }
}

function parsePullRequestUrl(value) {
  const url = new URL(value);
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    url.origin !== "https://github.com" ||
    parts.length !== 4 ||
    parts[2] !== "pull"
  )
    throw new Error("The approved pull request URL is invalid.");
  return { owner: parts[0], repo: parts[1], number: Number(parts[3]) };
}

async function githubRequest(path, init = {}) {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("GITHUB_TOKEN is unavailable to the merge runner.");
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      result.message || `GitHub returned HTTP ${response.status}.`,
    );
  return result;
}

async function mergeApprovedTask(task) {
  try {
    const pr = parsePullRequestUrl(task.prUrl);
    const current = await githubRequest(
      `/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`,
    );
    if (current.state !== "open")
      throw new Error("The approved pull request is no longer open.");
    if (current.head?.sha !== task.headSha)
      throw new Error(
        "The pull request changed after approval. Fresh checks and approval are required.",
      );
    const merged = await githubRequest(
      `/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/merge`,
      {
        method: "PUT",
        body: JSON.stringify({
          sha: task.headSha,
          merge_method: "squash",
          commit_title: task.title,
        }),
      },
    );
    if (!merged.merged || !merged.sha)
      throw new Error(merged.message || "GitHub did not merge the pull request.");
    await productApi({
      action: "merge_finished",
      implementationId: task.id,
      mergeSha: merged.sha,
      prUrl: task.prUrl,
    });
  } catch (error) {
    await productApi({
      action: "failed",
      taskType: "merge",
      taskId: task.id,
      status: "failed",
      message: error instanceof Error ? error.message : "Unknown merge failure.",
    });
    throw error;
  }
}

const claimed = await productApi({
  action: "claim",
  canRunCodex: Boolean(process.env.CURSOR_API_KEY?.trim()),
  canRunImplementations:
    process.env.PRODUCT_COUNCIL_IMPLEMENTATION_RUNNER !== "codex-chat",
});
if (!claimed.task) {
  console.log("No product-council task is ready.");
} else if (claimed.task.type === "merge") {
  await mergeApprovedTask(claimed.task);
} else {
  await runCodexTask(claimed.task);
}
