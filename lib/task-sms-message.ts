import type { Contact, Project, Task } from "./types";
import { timeLabel } from "./work";

function compact(value: string, limit: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function homeownerScheduleSmsMessage(
  tasks: Task[],
  project: Project,
  recipient: Contact,
  businessName: string,
) {
  if (!tasks.length)
    throw new Error("A schedule text needs at least one item.");
  const firstName = compact(recipient.firstName || recipient.name, 40).split(
    " ",
  )[0];
  const address = compact(project.address || "", 120);
  const greeting = `Hi ${firstName || "there"}, ${compact(businessName, 80)} has `;
  const footer = "Reply if you have a question.";
  if (tasks.length === 1) {
    const task = tasks[0];
    const time = task.startTime ? ` at ${timeLabel(task.startTime)}` : "";
    return `${greeting}${compact(task.title, 100)} scheduled for today${time}${address ? ` at ${address}` : ""}. ${footer}`;
  }
  const heading = `${greeting}these items scheduled for today${address ? ` at ${address}` : ""}:`;
  const lines: string[] = [];
  for (const [index, task] of tasks.entries()) {
    const line = `- ${compact(task.title, 100)}${task.startTime ? ` (${timeLabel(task.startTime)})` : ""}`;
    const remaining = tasks.length - index - 1;
    const overflow = remaining
      ? `\n- ${remaining} more scheduled item${remaining === 1 ? "" : "s"}`
      : "";
    if (
      `${heading}\n${[...lines, line].join("\n")}${overflow}\n${footer}`
        .length > 1500
    ) {
      lines.push(`- ${tasks.length - index} more scheduled items`);
      break;
    }
    lines.push(line);
  }
  return `${heading}\n${lines.join("\n")}\n${footer}`;
}
