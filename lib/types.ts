export type ProjectStatus =
  "Planning" | "In progress" | "On hold" | "Completed";
export type TaskStatus = "To do" | "In progress" | "Done";
export const workTypes = [
  "Task",
  "Inspection",
  "Delivery",
  "Contractor visit",
] as const;
export type WorkType = (typeof workTypes)[number];
export type EntityKind =
  | "project"
  | "quote"
  | "task"
  | "contractor"
  | "scope"
  | "comment"
  | "attachment"
  | "activity"
  | "alert"
  | "contact"
  | "lead"
  | "door_visit";
export interface Base {
  id: string;
  updatedAt: string;
  createdAt: string;
}
export type SignatureStroke = Array<[number, number]>;
export interface QuoteAcceptance {
  signedName: string;
  signedAt: string;
  signatureStrokes: SignatureStroke[];
  linkId: string;
  quoteUpdatedAt: string;
  quoteSnapshotSha256: string;
  agreementText: string;
  ip?: string;
  userAgent?: string;
}
export interface MsaPaymentStep {
  id: string;
  milestone: string;
  percent: number;
}
export interface AcceptedScopeItem {
  section: string;
  title: string;
  details: string;
  amount: number;
}
export interface MsaContractTerms {
  exclusions: string;
  allowances: string;
  retainage: string;
  buildersRisk: string;
  siteAccess: string;
  plans: string;
}
export type MsaPermitResponsibility =
  | "Owner obtains and pays"
  | "Premium Remodel obtains; owner pays fees"
  | "Premium Remodel obtains and pays";
export interface MsaSignature {
  name: string;
  title?: string;
  signedAt: string;
  signatureStrokes: SignatureStroke[];
  ip?: string;
  userAgent?: string;
}
export interface MsaAgreement {
  version: 1;
  status: "prepared" | "sent" | "signed";
  owner: string;
  ownerEmail: string;
  ownerPhone: string;
  projectName: string;
  address: string;
  quoteNumber: string;
  price: number;
  scope: AcceptedScopeItem[];
  paymentSchedule: MsaPaymentStep[];
  permitResponsibility: MsaPermitResponsibility;
  terms: MsaContractTerms;
  generalTerms: Array<{ style: string; text: string }>;
  estimatedStart: string;
  estimatedCompletion: string;
  termsSha256: string;
  staffUserId: string;
  staffSignature: MsaSignature;
  sentAt?: string;
  sendMessageId?: string;
  customerSignature?: MsaSignature;
  transactionDate?: string;
  cancellationDeadline?: string;
  depositCheckout?: { sessionId: string; url: string; expiresAt: string };
}
export interface Project extends Base {
  name: string;
  address: string;
  client: string;
  // Historical agreed amount, retained only to flag differences from the scope.
  contractPrice?: number;
  clientEmail?: string;
  clientPhone?: string;
  quoteSentAt?: string;
  quoteAcceptedAt?: string;
  quoteAcceptedBy?: string;
  quoteAcceptance?: QuoteAcceptance;
  quoteNumber?: string;
  acceptedQuoteScope?: AcceptedScopeItem[];
  msaPaymentSchedule?: MsaPaymentStep[];
  msaPermitResponsibility?: MsaPermitResponsibility;
  msaContractTerms?: MsaContractTerms;
  msaAgreement?: MsaAgreement;
  startDate: string;
  endDate: string;
  // Actual completion, separate from the target end date. Older jobs may omit it.
  completedDate?: string;
  status: ProjectStatus;
  description: string;
  category: string;
  cover: string;
  coverAttachmentId?: string;
}
export const quoteStatuses = ["Draft", "Sent", "Declined", "Expired"] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];
export interface Quote extends Omit<Project, "status" | "contractPrice"> {
  status: QuoteStatus;
  /** Original filename for a PDF-imported quote; the PDF itself stays on the user's device. */
  importedFrom?: string;
  importedSources?: string[];
  importedAt?: string;
  /** Optional linked sales lead. */
  leadId?: string;
  /** When status first became Declined or Expired. */
  outcomeAt?: string;
  /** Human-facing identifiers and copy used on the generated quote document. */
  quoteNumber?: string;
  revisedDate?: string;
  preparedBy?: string;
  preparedByPhone?: string;
  quoteNotes?: string;
}
export interface Task extends Base {
  completion?: { id: string; at: string; byId: string; byName: string };
  projectId: string;
  title: string;
  description: string;
  contractorId: string;
  dueDate: string;
  // Optional for tasks saved before scheduled work was introduced.
  workType?: WorkType;
  startTime?: string;
  endTime?: string;
  priority: "Low" | "Medium" | "High";
  status: TaskStatus;
}
export interface Contractor extends Base {
  name: string;
  company: string;
  trade: string;
  email: string;
  phone: string;
  notes: string;
}
export interface ScopeItem extends Base {
  projectId: string;
  /** Keeps related work together within a multi-project quote. */
  sectionId?: string;
  sectionName?: string;
  // Stable document/grid order. Older rows fall back to their loaded order.
  position?: number;
  title: string;
  /** Specifications and selections that belong with this priced row. */
  details?: string;
  quantity: number;
  unit: string;
  estimate: number;
  subCost: number;
  // Older scope items have no separately recorded material cost.
  materialCost?: number;
  contractorId: string;
  status: TaskStatus;
}
export interface Comment extends Base {
  projectId: string;
  body: string;
  authorId: string;
  authorName: string;
  attachmentIds?: string[];
}
export interface Attachment extends Base {
  projectId: string;
  name: string;
  mime: string;
  size: number;
  storage: "local" | "supabase";
  path: string;
  authorName: string;
  validationVersion?: number;
}
export const activityTypes = [
  "Payment received",
  "Materials delivered",
  "Subcontractor paid",
  "General update",
] as const;
export type ActivityType = (typeof activityTypes)[number] | "Work completed";
export interface Activity extends Base {
  projectId: string;
  activityType: ActivityType;
  actorId: string;
  actorName: string;
  authorId: string;
  authorName: string;
  occurredAt: string;
  summary: string;
  notes: string;
  amount: number | null;
  party: string;
  paymentMethod: string;
  contractorId: string;
  attachmentIds: string[];
  sourceTaskId?: string;
  /** Set only by the verified Stripe webhook. */
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  stripeGrossCents?: number;
  stripeRefundedCents?: number;
}
export const alertAudiences = [
  "administrators",
  "office",
  "crew",
  "field",
  "doorknocker",
] as const;
export type AlertAudience = (typeof alertAudiences)[number];
export interface WorkspaceAlert extends Base {
  message: string;
  audiences: AlertAudience[];
  durationMinutes: number;
  expiresAt: string;
  authorId: string;
  authorName: string;
  lastEditedById?: string;
  lastEditedByName?: string;
  lastEditedAt?: string;
}
export interface Contact extends Base {
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  zip: string;
  address: string;
  source: string;
}
export const leadStages = [
  "New",
  "Follow-up",
  "Quote drafted",
  "Quote sent",
  "Won",
  "Lost",
  "Stale",
] as const;
export type LeadStage = (typeof leadStages)[number];

/** Side-door exits from the sales funnel — not stages; excluded from close rate. */
export const leadDispositions = [
  "Active",
  "Future",
  "Archive",
  "Junk",
  "Spam",
  "Test",
] as const;
export type LeadDisposition = (typeof leadDispositions)[number];
export const leadDispositionActions = [
  "Active",
  "Future",
  "Archive",
  "Junk",
] as const;
export type LeadDispositionAction = (typeof leadDispositionActions)[number];

export const leadApprovalStates = [
  "none",
  "awaiting_matthew",
  "approved",
  "rejected",
] as const;
export type LeadApprovalState = (typeof leadApprovalStates)[number];

export interface LeadDispositionEvent {
  at: string;
  byId: string;
  byName: string;
  from: LeadDisposition;
  to: LeadDisposition;
}

export interface Lead extends Base {
  contactId: string;
  name: string;
  project: string;
  projectDescription: string;
  /** Only explicit true from the website form grants category-specific SMS consent. */
  smsAppointmentOptIn?: boolean;
  smsMarketingOptIn?: boolean;
  /** Bounded, inert values from unrecognized website form fields. */
  otherSubmittedFields?: Record<string, string>;
  /** Delivery result for the transactional website lead acknowledgement. */
  emailAcknowledgement?: {
    status: "sent" | "failed" | "unknown" | "not_configured" | "skipped";
    attemptedAt: string;
    googleMessageId?: string;
    detail?: string;
  };
  /** Funnel stage. Legacy leads use "New". */
  status: LeadStage;
  /** Default Active when omitted (legacy leads). */
  disposition?: LeadDisposition;
  notes?: string;
  nextAction?: string;
  nextActionDue?: string;
  draftReply?: string;
  approvalState?: LeadApprovalState;
  dispositionHistory?: LeadDispositionEvent[];
  source: string;
  submittedAt: string;
  quoteDate?: string;
  quoteStartTime?: string;
  quoteEndTime?: string;
  quoteNotes?: string;
  canvasserId?: string;
  canvasserName?: string;
}
export const doorVisitOutcomes = [
  "Not home",
  "Spoke — follow up",
  "Interested",
  "Not interested",
  "Lead captured",
] as const;
export type DoorVisitOutcome = (typeof doorVisitOutcomes)[number];
export interface DoorVisit extends Base {
  address: string;
  latitude: number;
  longitude: number;
  visitedAt: string;
  outcome: DoorVisitOutcome;
  notes: string;
  canvasserId: string;
  canvasserName: string;
  leadId?: string;
}
export type Entity =
  | Project
  | Quote
  | Task
  | Contractor
  | ScopeItem
  | Comment
  | Attachment
  | Activity
  | WorkspaceAlert
  | Contact
  | Lead
  | DoorVisit;
export const workspaceGroups = [
  "owner",
  "admin",
  "office",
  "crew",
  "field",
  "doorknocker",
] as const;
export type WorkspaceGroup = (typeof workspaceGroups)[number];
export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  group: WorkspaceGroup;
}
export interface Workspace {
  alerts?: WorkspaceAlert[];
  quotes?: Quote[];
  activities?: Activity[];
  contacts: Contact[];
  leads: Lead[];
  doorVisits: DoorVisit[];
  projects: Project[];
  tasks: Task[];
  contractors: Contractor[];
  scope: ScopeItem[];
  comments: Comment[];
  attachments: Attachment[];
}
export const emptyWorkspace: Workspace = {
  alerts: [],
  quotes: [],
  activities: [],
  contacts: [],
  leads: [],
  doorVisits: [],
  projects: [],
  tasks: [],
  contractors: [],
  scope: [],
  comments: [],
  attachments: [],
};
export const kindKey: Record<EntityKind, keyof Workspace> = {
  alert: "alerts",
  quote: "quotes",
  activity: "activities",
  contact: "contacts",
  lead: "leads",
  door_visit: "doorVisits",
  project: "projects",
  task: "tasks",
  contractor: "contractors",
  scope: "scope",
  comment: "comments",
  attachment: "attachments",
};
