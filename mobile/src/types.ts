export type DoorOutcome =
  | "Not home"
  | "Spoke — follow up"
  | "Interested"
  | "Not interested"
  | "Lead captured";

export type DoorVisit = {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  visitedAt: string;
  outcome: DoorOutcome;
  notes: string;
  canvasserName: string;
  leadId?: string;
};

export type Lead = {
  id: string;
  name: string;
  project: string;
  projectDescription: string;
  status: string;
  quoteDate?: string;
  quoteStartTime?: string;
  quoteEndTime?: string;
  quoteNotes?: string;
  canvasserName?: string;
  contactId: string;
};

export type Contact = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
};

export type Member = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: string;
};

export type VisitDraft = {
  address: string;
  latitude: number;
  longitude: number;
  outcome: DoorOutcome;
  notes: string;
  createLead: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  zip: string;
  project: string;
  projectDescription: string;
  scheduleQuote: boolean;
  quoteDate: string;
  quoteStartTime: string;
  quoteEndTime: string;
  quoteNotes: string;
};
