import { demoWorkspace } from "./demo";
import type { Quote } from "./types";
import { initialJobOperations } from "./job-operations";
import { quoteProjectHandoffDemoWorkspace } from "./demo-quote-handoff";

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
  project.contractPrice = undefined;
  project.recordType = "job";
  project.job = initialJobOperations();
  project.job.appointments = [
    {
      id: "994b20d1-54dd-47fa-9fb2-8a6651c647e1",
      title: "Measure & selections visit",
      date,
      start: "09:00",
      end: "11:00",
      technician: "Alex Morgan",
      status: "Scheduled",
    },
  ];
  const parentId = "994b20d1-54dd-47fa-9fb2-8a6651c647f1";
  project.parentProjectId = parentId;
  workspace.projects.push({
    ...project,
    id: parentId,
    recordType: "project",
    parentProjectId: undefined,
    job: undefined,
    name: "Miller home renovation",
    description:
      "Kitchen and future renovation phases, grouped under one project.",
  });
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
    name: "Essential kitchen refresh",
    jobId: project.id,
    client: project.client,
    contactId: project.contactId,
    clientEmail: project.clientEmail,
    clientPhone: project.clientPhone,
    address: project.address,
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
  const enhanced: Quote = {
    ...quote,
    id: "994b20d1-54dd-47fa-9fb2-8a6651c647c1",
    name: "Complete traditional kitchen",
    quoteNumber: "150",
    recommended: true,
    description:
      "Full cabinet replacement, custom hood, quartz surfaces, and new lighting.",
  };
  workspace.scope.push(
    ...workspace.scope
      .filter((item) => item.projectId === quote.id)
      .map((item, index) => ({
        ...item,
        id: `994b20d1-54dd-47fa-9fb2-8a6651c648a${index}`,
        projectId: enhanced.id,
        estimate: item.estimate * 1.5,
      })),
  );
  const signed = quoteProjectHandoffDemoWorkspace();
  const sold: Quote = {
    ...signed.quotes![0],
    id: "994b20d1-54dd-47fa-9fb2-8a6651c647d1",
    jobId: project.id,
    client: project.client,
    contactId: project.contactId,
    address: project.address,
    clientEmail: project.clientEmail,
    clientPhone: project.clientPhone,
    name: "Selected kitchen renovation",
    quoteNumber: "151",
  };
  sold.quoteAcceptance = {
    ...sold.quoteAcceptance!,
    linkId: "994b20d1-54dd-47fa-9fb2-8a6651c647d2",
    quoteSnapshotSha256: "a".repeat(64),
  };
  sold.msaAgreement = {
    ...sold.msaAgreement!,
    owner: project.client,
    address: project.address,
    customerSignature: {
      ...sold.msaAgreement!.customerSignature!,
      name: project.client,
    },
  };
  workspace.scope.push(
    ...signed.scope
      .filter((item) => item.projectId === signed.quotes![0].id)
      .map((item, index) => ({
        ...item,
        id: `994b20d1-54dd-47fa-9fb2-8a6651c649b${index}`,
        projectId: sold.id,
      })),
  );
  workspace.scope = workspace.scope.filter(
    (item) => item.projectId !== project.id,
  );
  workspace.activities = signed
    .activities!.filter((item) => item.projectId === signed.quotes![0].id)
    .map((item) => ({
      ...item,
      id: "994b20d1-54dd-47fa-9fb2-8a6651c647a1",
      projectId: sold.id,
      party: project.client,
    }));
  workspace.quotes = [quote, enhanced, sold];
  return workspace;
}
