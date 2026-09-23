export interface TwilioConnection {
  configured: boolean;
  account: {
    sid: string;
    name: string;
    status: "active" | "suspended" | "closed";
    type: "Trial" | "Full";
  } | null;
  numbers: {
    sid: string;
    number: string;
    name: string;
    voice: boolean;
    sms: boolean;
    mms: boolean;
  }[];
  hasMoreNumbers: boolean;
  tollFreeVerification: {
    number: string;
    status: "approved" | "unverified" | "pending" | "rejected" | "unknown";
  } | null;
  checkedAt: string | null;
}
