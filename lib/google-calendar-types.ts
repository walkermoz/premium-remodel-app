export interface GoogleCalendarStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  calendarName: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}
