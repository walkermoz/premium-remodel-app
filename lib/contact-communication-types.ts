export type ContactCommunicationChannel = "email" | "sms";

export type ContactCommunication = {
  id: string;
  contactId: string;
  channel: ContactCommunicationChannel;
  direction: "outbound";
  status: "sent";
  recipient: string;
  sender?: string;
  subject?: string;
  body: string;
  relatedKind?: "lead" | "quote" | "agreement" | "client_portal";
  relatedId?: string;
  providerId?: string;
  sentAt: string;
};

export type ContactCommunicationPage = {
  items: ContactCommunication[];
  hasMore: boolean;
};
