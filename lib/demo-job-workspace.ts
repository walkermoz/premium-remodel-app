import { demoWorkspace } from "./demo";
import type { Quote } from "./types";

/** Synthetic review data only; this route never loads a live customer workspace. */
export function jobWorkspaceDemo() {
  const workspace = demoWorkspace();
  const at = new Date().toISOString();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const project = workspace.projects.find((item) => item.id === "p1")!;
  project.clientEmail = "miller@example.com";
  project.clientPhone = "(919) 555-0142";
  project.quoteNumber = "148";
  const task = workspace.tasks.find(
    (item) => item.projectId === project.id && item.status !== "Done",
  );
  if (task) {
    task.dueDate = date;
    task.startTime = "09:00";
    task.endTime = "11:00";
  }
  workspace.activities = [
    {
      id: "sample-job-payment",
      projectId: project.id,
      createdAt: at,
      updatedAt: at,
      activityType: "Payment received",
      actorId: "demo",
      actorName: "Alex Morgan",
      authorId: "demo",
      authorName: "Alex Morgan",
      occurredAt: at,
      summary: "Initial project payment",
      notes: "Sample payment for the job workspace preview.",
      amount: 24250,
      party: "The Miller family",
      paymentMethod: "Check",
      contractorId: "",
      attachmentIds: [],
    },
  ];
  const quote: Quote = {
    id: "994b20d1-54dd-47fa-9fb2-8a6651c647b1",
    createdAt: at,
    updatedAt: at,
    name: "Cary kitchen renovation",
    client: "Jordan Lee",
    clientEmail: "jordan@example.com",
    clientPhone: "(919) 555-0156",
    address: "221 Willowbrook Drive, Cary, NC",
    status: "Draft",
    startDate: "",
    endDate: "",
    description:
      "Replace cabinetry and countertops, update lighting, and install a tile backsplash.",
    category: "Kitchen",
    cover: "",
    quoteNumber: "149",
    priceDisplay: "total",
  };
  workspace.quotes = [quote];
  workspace.scope.push(
    ...workspace.scope
      .filter((item) => item.projectId === project.id)
      .slice(0, 3)
      .map((item, index) => ({
        ...item,
        id: `994b20d1-54dd-47fa-9fb2-8a6651c647b${index + 2}`,
        projectId: quote.id,
        position: index,
        createdAt: at,
        updatedAt: at,
      })),
  );
  return workspace;
}
