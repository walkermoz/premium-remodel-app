"use client";
import { ArrowRight } from "lucide-react";
import { activityHeadline, workspaceActivities } from "@/lib/activity";
import type { Workspace } from "@/lib/types";
import { Avatar } from "./ui";

export default function RecentActivity({
  workspace,
  onProject,
  onShowMore,
}: {
  workspace: Workspace;
  onProject: (projectId: string) => void;
  onShowMore: () => void;
}) {
  const entries = workspaceActivities(workspace);
  return (
    <section
      className="recent-activity"
      aria-labelledby="recent-activity-title"
    >
      <div className="recent-activity-heading">
        <div>
          <h2 id="recent-activity-title">Latest activity</h2>
          <p>Across all projects</p>
        </div>
        <button className="text-button link" onClick={onShowMore}>
          View all activity <ArrowRight size={15} />
        </button>
      </div>
      {entries.length ? (
        <ol className="recent-activity-list">
          {entries.slice(0, 5).map(({ entry }) => (
            <li key={entry.id}>
              <button
                className="recent-activity-row"
                onClick={() => onProject(entry.projectId)}
              >
                <Avatar name={entry.actorName} />
                <span className="recent-activity-body">
                  <strong>{activityHeadline(entry)}</strong>
                  {entry.activityType !== "Work completed" && (
                    <span className="recent-activity-summary">
                      {entry.summary}
                    </span>
                  )}
                  <span className="recent-activity-context">
                    <span>
                      {workspace.projects.find((p) => p.id === entry.projectId)
                        ?.name || "Project"}
                    </span>
                    <span>{entry.activityType}</span>
                  </span>
                </span>
                <time dateTime={entry.occurredAt}>
                  {new Date(entry.occurredAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="recent-activity-empty">
          No activity yet. Logged payments, deliveries, updates, and completed
          work will appear here.
        </p>
      )}
    </section>
  );
}
