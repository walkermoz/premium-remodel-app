import "server-only";

import { z } from "zod";
import {
  clientPortalEmailTag,
  createClientEmailTokenExpiringAt,
  parseClientPortalAccess,
} from "./client-portal";
import { quoteAcceptanceSchema } from "./quote-signature";
import { supabaseAdmin } from "./supabase/server";
import type { MsaAgreement, Project, Quote, ScopeItem } from "./types";
import {
  readClientProjectSchedule,
  type ClientScheduleItem,
} from "./client-project-schedule";

const quoteSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  client: z.string(),
  clientEmail: z.union([z.email(), z.literal("")]).optional(),
  address: z.string(),
  category: z.string(),
  status: z.string(),
  quoteNumber: z.string().optional(),
  revisedDate: z.string().optional(),
  clientPhone: z.string().optional(),
  preparedBy: z.string().optional(),
  preparedByPhone: z.string().optional(),
  quoteSentAt: z.string().optional(),
  quoteAcceptedAt: z.string().optional(),
  quoteNotes: z.string().optional(),
  priceDisplay: z.enum(["itemized", "project", "total"]).optional(),
  quotePhotos: z
    .array(
      z.object({
        attachmentId: z.uuid(),
        kind: z.enum(["before", "example", "concept"]),
        caption: z.string().max(120),
      }),
    )
    .max(8)
    .optional(),
  updatedAt: z.string(),
});

const itemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  details: z.string().optional(),
  estimate: z.number().finite(),
  sectionId: z.string().optional(),
  sectionName: z.string().optional(),
  position: z.number().optional(),
  customerVisible: z.boolean().optional(),
});

const snapshotSchema = z.object({
  quote: quoteSchema
    .extend({
      status: z.literal("Sent"),
      createdAt: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      description: z.string(),
      cover: z.enum([
        "",
        "/images/kitchen.jpg",
        "/images/bathroom.jpg",
        "/images/basement.jpg",
        "/images/outdoor.jpg",
        "/images/home.jpg",
      ]),
    })
    .passthrough(),
  items: z
    .array(
      itemSchema
        .extend({
          projectId: z.uuid(),
          createdAt: z.string().optional(),
          updatedAt: z.string().optional(),
          quantity: z.number().finite().optional(),
          unit: z.string().optional(),
          subCost: z.number().finite().optional(),
          materialCost: z.number().finite().optional(),
          contractorId: z.string().optional(),
          status: z.enum(["To do", "In progress", "Done"]).optional(),
        })
        .passthrough(),
    )
    .max(500),
});

export type ClientQuoteItem = z.infer<typeof itemSchema>;
export type { ClientScheduleItem } from "./client-project-schedule";
export type ClientPortalProject = {
  id: string;
  name: string;
  address: string;
  category: string;
  status: string;
  url: string;
  current: boolean;
};
export type ClientPortalScheduleItem = ClientScheduleItem & {
  projectId: string;
  projectName: string;
};
export type ClientQuoteView = {
  quote: z.infer<typeof quoteSchema>;
  items: ClientQuoteItem[];
  total: number;
  approved: boolean;
  acceptance?: Pick<
    z.infer<typeof quoteAcceptanceSchema>,
    "signedName" | "signedAt" | "signatureStrokes"
  >;
  msa?: MsaAgreement;
};

export function isValidClientQuoteSnapshot(value: unknown) {
  return snapshotSchema.safeParse(value).success;
}

async function customerProjectsForEmail(input: {
  organizationId: string;
  email: string;
  emailTag: string;
  expiresAt: number;
  currentProjectId: string;
  currentToken: string;
}) {
  const admin = supabaseAdmin();
  const linksResult = await admin
    .from("remodel_client_links")
    .select("id,project_id,kind,quote_snapshot,created_at")
    .eq("organization_id", input.organizationId)
    .in("kind", ["project", "quote"])
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (linksResult.error) throw linksResult.error;

  const projectIds = [
    ...new Set(linksResult.data.map((link) => link.project_id)),
  ];
  if (!projectIds.length) return [];
  const recordsResult = await admin
    .from("remodel_records")
    .select("id,kind,data,updated_at")
    .eq("organization_id", input.organizationId)
    .in("id", projectIds);
  if (recordsResult.error) throw recordsResult.error;
  const records = new Map(
    recordsResult.data.map((record) => [record.id, record]),
  );
  const normalizedEmail = input.email.trim().toLowerCase();
  const selected = new Map<string, (typeof linksResult.data)[number]>();

  for (const link of linksResult.data) {
    const record = records.get(link.project_id);
    if (!record || !record.data || typeof record.data !== "object") continue;
    if (record.kind !== "project") continue;
    const data = record.data as Record<string, unknown>;
    const email = typeof data.clientEmail === "string" ? data.clientEmail : "";
    if (
      email.trim().toLowerCase() !== normalizedEmail ||
      clientPortalEmailTag(email) !== input.emailTag
    )
      continue;
    const snapshot = snapshotSchema.safeParse(link.quote_snapshot);
    const validQuoteLink =
      link.kind === "quote" &&
      snapshot.success &&
      snapshot.data.quote.id === link.project_id &&
      snapshot.data.quote.clientEmail?.trim().toLowerCase() ===
        normalizedEmail &&
      snapshot.data.items.every((item) => item.projectId === link.project_id) &&
      typeof data.quoteAcceptedAt === "string";
    const validProjectLink =
      link.kind === "project" && record.kind === "project";
    if (!validQuoteLink && !validProjectLink) continue;
    const existing = selected.get(link.project_id);
    if (!existing || (link.kind === "project" && existing.kind !== "project"))
      selected.set(link.project_id, link);
  }

  return [...selected.entries()]
    .map(([projectId, link]) => {
      const record = records.get(projectId)!;
      const data = record.data as Record<string, unknown>;
      const current = projectId === input.currentProjectId;
      const siblingToken = current
        ? input.currentToken
        : createClientEmailTokenExpiringAt(
            link.id,
            input.email,
            input.expiresAt,
          );
      return {
        id: projectId,
        name: typeof data.name === "string" ? data.name : "Project",
        address: typeof data.address === "string" ? data.address : "",
        category: typeof data.category === "string" ? data.category : "Project",
        status: typeof data.status === "string" ? data.status : "Active",
        url: `/client/${encodeURIComponent(siblingToken)}/quote`,
        current,
        updatedAt: record.updated_at as string,
      };
    })
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    })
    .map((project) => ({
      id: project.id,
      name: project.name,
      address: project.address,
      category: project.category,
      status: project.status,
      url: project.url,
      current: project.current,
    }));
}

/** The shared token only grants access to this one quote and its public scope. */
export async function readClientQuoteSource(
  token: string,
  options: { recordView?: boolean; includeCombinedSchedule?: boolean } = {},
) {
  const access = parseClientPortalAccess(token);
  if (!access || access.expired) return null;
  const id = access.id;

  const admin = supabaseAdmin();
  const { data: link, error: linkError } = await admin
    .from("remodel_client_links")
    .select("id,organization_id,project_id,kind,quote_snapshot")
    .eq("id", id)
    .in("kind", ["project", "quote"])
    .is("revoked_at", null)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) return null;

  const quoteResult = await admin
    .from("remodel_records")
    .select("kind,data,updated_at")
    .eq("organization_id", link.organization_id)
    .eq("id", link.project_id)
    .maybeSingle();
  if (quoteResult.error) throw quoteResult.error;

  const record = quoteResult.data;
  const projectPortal = link.kind === "project";
  let snapshotValue = link.quote_snapshot;
  if (projectPortal && record?.kind === "project") {
    const scopeResult = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", link.organization_id)
      .eq("project_id", link.project_id)
      .eq("kind", "scope")
      .order("updated_at", { ascending: true })
      .limit(500);
    if (scopeResult.error) throw scopeResult.error;
    snapshotValue = {
      quote: {
        ...(record.data as Project),
        status: "Sent",
      },
      items: scopeResult.data.map((row) => row.data),
    };
  }
  const snapshot = snapshotSchema.safeParse(snapshotValue);
  const currentEmail =
    record?.data &&
    typeof record.data === "object" &&
    "clientEmail" in record.data &&
    typeof record.data.clientEmail === "string"
      ? record.data.clientEmail
      : "";
  if (
    !record ||
    !snapshot.success ||
    snapshot.data.quote.id !== link.project_id ||
    snapshot.data.quote.status !== "Sent" ||
    (access.emailTag !== null &&
      (!snapshot.data.quote.clientEmail ||
        clientPortalEmailTag(snapshot.data.quote.clientEmail) !==
          access.emailTag ||
        clientPortalEmailTag(currentEmail) !== access.emailTag))
  )
    return null;
  if (snapshot.data.items.some((item) => item.projectId !== link.project_id))
    return null;
  const acceptedAt = z
    .object({ quoteAcceptedAt: z.string() })
    .safeParse(record.data);
  const parsedAcceptance = quoteAcceptanceSchema.safeParse(
    z.object({ quoteAcceptance: z.unknown() }).safeParse(record.data).data
      ?.quoteAcceptance,
  );
  const quoteApproved =
    acceptedAt.success &&
    (record.kind === "project" ||
      (record.kind === "quote" &&
        (record.data as { status?: string }).status === "Accepted" &&
        parsedAcceptance.success));
  const approved = projectPortal || quoteApproved;
  const acceptance =
    quoteApproved && parsedAcceptance.success
      ? parsedAcceptance.data
      : undefined;
  if (record.kind !== "quote" && !approved) return null;
  if (record.kind === "quote" && !approved) {
    const liveStatus = z
      .object({ status: z.literal("Sent") })
      .safeParse(record.data);
    if (!liveStatus.success) return null;
  }

  const items = snapshot.data.items
    .map((item) => itemSchema.parse(item))
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
  const view: ClientQuoteView = {
    quote: {
      ...quoteSchema.parse(snapshot.data.quote),
      quoteAcceptedAt: quoteApproved
        ? acceptedAt.data.quoteAcceptedAt
        : undefined,
    },
    items,
    total: items.reduce((sum, item) => sum + item.estimate, 0),
    approved,
    acceptance: acceptance
      ? {
          signedName: acceptance.signedName,
          signedAt: acceptance.signedAt,
          signatureStrokes: acceptance.signatureStrokes,
        }
      : undefined,
    msa:
      approved &&
      record.data &&
      typeof record.data === "object" &&
      "msaAgreement" in record.data &&
      ["sent", "signed"].includes(
        (record.data as { msaAgreement?: MsaAgreement }).msaAgreement?.status ||
          "",
      )
        ? (record.data as { msaAgreement: MsaAgreement }).msaAgreement
        : undefined,
  };

  const schedule: ClientScheduleItem[] = approved
    ? await readClientProjectSchedule(link.organization_id, link.project_id)
    : [];
  const customerProjects: ClientPortalProject[] =
    access.emailTag !== null && currentEmail
      ? await customerProjectsForEmail({
          organizationId: link.organization_id,
          email: currentEmail,
          emailTag: access.emailTag,
          expiresAt: access.expiresAt,
          currentProjectId: link.project_id,
          currentToken: token,
        })
      : [];
  const combinedSchedule: ClientPortalScheduleItem[] =
    options.includeCombinedSchedule && customerProjects.length > 1
      ? (
          await Promise.all(
            customerProjects.map(async (project) =>
              (
                await readClientProjectSchedule(
                  link.organization_id,
                  project.id,
                )
              ).map((item) => ({
                ...item,
                projectId: project.id,
                projectName: project.name,
              })),
            ),
          )
        )
          .flat()
          .sort((a, b) =>
            `${a.dueDate} ${a.startTime || ""} ${a.title}`.localeCompare(
              `${b.dueDate} ${b.startTime || ""} ${b.title}`,
            ),
          )
      : [];

  if (options.recordView !== false)
    await admin.rpc("remodel_note_client_portal_view", { target_link: id });
  return {
    view,
    organizationId: link.organization_id as string,
    schedule,
    customerProjects,
    combinedSchedule,
    currentQuote: record.data as Quote,
    recordUpdatedAt: record.updated_at as string,
    // Kept on the server for the same customer-facing PDF used in the dashboard.
    pdfQuote: {
      ...snapshot.data.quote,
      quoteAcceptance: acceptance,
      quoteAcceptedAt: quoteApproved
        ? acceptedAt.data.quoteAcceptedAt
        : undefined,
    } as Quote,
    pdfItems: snapshot.data.items.map((item) => ({
      ...item,
      createdAt: item.createdAt || snapshot.data.quote.createdAt,
      updatedAt: item.updatedAt || snapshot.data.quote.updatedAt,
      quantity: item.quantity ?? 1,
      unit: item.unit || "job",
      subCost: item.subCost ?? 0,
      contractorId: item.contractorId || "",
      status: item.status || "To do",
    })) as ScopeItem[],
    projectPortal,
  };
}

export async function readClientQuote(token: string) {
  return (await readClientQuoteSource(token))?.view || null;
}
