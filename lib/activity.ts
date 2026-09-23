import type { Activity, Task, User, Workspace } from "./types";

export function workspaceActivities(workspace: Workspace): {
  kind: "activity" | "comment";
  entry: Activity;
}[] {
  const activities = (workspace.activities || []).map((entry) => ({
    kind: "activity" as const,
    entry,
  }));
  const comments = workspace.comments.map((comment) => ({
    kind: "comment" as const,
    entry: {
      ...comment,
      activityType: "General update",
      actorId: comment.authorId,
      actorName: comment.authorName,
      occurredAt: comment.createdAt,
      summary: comment.body,
      notes: "",
      amount: null,
      party: "",
      contractorId: "",
      paymentMethod: "",
      attachmentIds: comment.attachmentIds || [],
    } satisfies Activity,
  }));
  return [...activities, ...comments].sort(
    (a, b) =>
      Date.parse(b.entry.occurredAt) - Date.parse(a.entry.occurredAt) ||
      Date.parse(b.entry.createdAt) - Date.parse(a.entry.createdAt),
  );
}

export const activityMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export const paymentMethods = [
  "Check",
  "Cash",
  "Bank transfer",
  "Card",
  "Other",
] as const;
export function isPayment(type: string) {
  return type === "Payment received" || type === "Subcontractor paid";
}
export function activityTotals(activities: Activity[]) {
  const total = (type: string) =>
    activities
      .filter((item) => item.activityType === type)
      .reduce((sum, item) => sum + Math.round((item.amount || 0) * 100), 0) /
    100;
  return {
    received: total("Payment received"),
    paid: total("Subcontractor paid"),
  };
}
export function activityHeadline(item: Activity) {
  if (item.activityType === "Payment received")
    return `${item.actorName} received ${activityMoney(item.amount || 0)} from ${item.party}`;
  if (item.activityType === "Subcontractor paid")
    return `${item.actorName} paid ${item.party} ${activityMoney(item.amount || 0)}`;
  if (item.activityType === "Materials delivered")
    return `${item.actorName} delivered materials${item.party ? ` to ${item.party}` : ""}`;
  if (item.activityType === "Work completed")
    return `${item.actorName} completed ${item.summary}`;
  return `${item.actorName} posted an update`;
}
export function completedWorkActivity(task: Task): Activity | null {
  if (!task.completion) return null;
  const { id, at, byId, byName } = task.completion;
  return {
    id,
    projectId: task.projectId,
    activityType: "Work completed",
    actorId: byId,
    actorName: byName,
    authorId: byId,
    authorName: byName,
    occurredAt: at,
    createdAt: at,
    updatedAt: at,
    summary: task.title,
    notes: "",
    amount: null,
    party: "",
    paymentMethod: "",
    contractorId: task.contractorId,
    attachmentIds: [],
    sourceTaskId: task.id,
  };
}
export function demoActivityMembers(user: User): User[] {
  return [
    user,
    {
      id: "demo-jordan",
      name: "Jordan Lee",
      email: "jordan@example.com",
      role: "member",
      group: "crew",
    },
  ];
}
export function localDateTime(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}T${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}
