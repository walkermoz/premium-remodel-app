export const workflowFile = "workflow-worker.yml";
export const minimumSyncIntervalMs = 5 * 60 * 1000;

export function parseWorkflowRuns(value) {
  const parsed = JSON.parse(value || "[]");
  if (!Array.isArray(parsed)) throw new Error("GitHub run output is invalid.");
  return parsed;
}

export function workflowNeedsDispatch(
  runs,
  now = Date.now(),
  minimumInterval = minimumSyncIntervalMs,
) {
  const latest = runs[0];
  if (!latest) return true;
  if (["queued", "in_progress", "waiting", "requested"].includes(latest.status))
    return false;
  const createdAt = Date.parse(latest.createdAt || "");
  return !Number.isFinite(createdAt) || now - createdAt >= minimumInterval;
}

export async function requestProductionSync(execFileAsync, options = {}) {
  if (process.env.DISCORD_COMMAND_INBOX_SYNC === "0")
    return { requested: false, active: false };

  try {
    const { stdout } = await execFileAsync(
      "gh",
      [
        "run",
        "list",
        "--workflow",
        workflowFile,
        "--limit",
        "1",
        "--json",
        "createdAt,status",
      ],
      { windowsHide: true },
    );
    const runs = parseWorkflowRuns(stdout);
    const active = ["queued", "in_progress", "waiting", "requested"].includes(
      runs[0]?.status,
    );
    if (!workflowNeedsDispatch(runs, options.now, options.minimumIntervalMs))
      return { requested: false, active };

    await execFileAsync("gh", ["workflow", "run", workflowFile], {
      windowsHide: true,
    });
    return { requested: true, active: true };
  } catch (error) {
    if (process.env.DISCORD_COMMAND_INBOX_REQUIRE_SYNC === "1") throw error;
    return { requested: false, active: false };
  }
}
