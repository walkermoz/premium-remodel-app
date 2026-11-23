import "server-only";
import { HttpError } from "./auth";
import { supabaseAdmin } from "./supabase/server";
import {
  defaultOperatingSettings,
  operatingSettingsSchema,
  type OperatingSection,
  type OperatingSettings,
  validateOperatingChange,
} from "./operating-settings";
import type { WorkspaceUser } from "./auth";
import { recordAuditEvent } from "./audit-server";
import { applyOperatingRecord } from "./operating-records";
import { invoiceDefaultsSchema, type FieldValue } from "./operating-settings";

/** System capture keeps an incomplete inbound record rather than losing a lead.
 * Typed defaults, hours, form history and closeout rules still apply. */
export async function applySystemOperatingRecord(
  organizationId: string,
  kind: string,
  input: Record<string, unknown>,
  current: Record<string, unknown> | null = null,
  actor = "System",
  sourceQuote?: Record<string, unknown>,
) {
  const settings = await getOperatingSettings(organizationId);
  let parent = sourceQuote;
  if (
    !parent &&
    (kind === "quote" || kind === "project") &&
    typeof input.contactId === "string"
  ) {
    const result = await supabaseAdmin()
      .from("remodel_records")
      .select("data")
      .eq("organization_id", organizationId)
      .eq("kind", "contact")
      .eq("id", input.contactId)
      .maybeSingle();
    if (result.error) throw result.error;
    parent = result.data?.data;
  }
  const inherited = invoiceDefaultsSchema.safeParse(
    sourceQuote
      ? sourceQuote.invoiceDefaults || defaultOperatingSettings().invoices
      : undefined,
  );
  return applyOperatingRecord(
    settings,
    kind,
    input,
    current,
    actor,
    new Date().toISOString(),
    parent?.customValues as Record<string, FieldValue> | undefined,
    {
      requireCustomFields: current !== null,
      ...(inherited.success
        ? { inheritedInvoiceDefaults: inherited.data }
        : {}),
    },
  );
}

function missingTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
export async function readOperatingSettings(organizationId: string) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_operating_settings")
    .select("settings,revision")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error && !missingTable(error)) throw error;
  const defaults = defaultOperatingSettings();
  const saved = data?.settings || {};
  return {
    settings: operatingSettingsSchema.parse({ ...defaults, ...saved }),
    revision: Number(data?.revision || 0),
    storageReady: !missingTable(error),
  };
}
export async function getOperatingSettings(
  organizationId: string,
): Promise<OperatingSettings> {
  return (await readOperatingSettings(organizationId)).settings;
}
export async function saveOperatingSection(
  user: WorkspaceUser,
  section: OperatingSection,
  value: unknown,
  revision: number,
) {
  const current = await readOperatingSettings(user.organizationId);
  if (!current.storageReady)
    throw new HttpError(
      503,
      "Apply the operating settings database migration before saving these settings.",
    );
  if (current.revision !== revision)
    throw new HttpError(
      409,
      "Settings changed in another session. Reload before saving.",
    );
  let settings: OperatingSettings;
  try {
    settings = validateOperatingChange(current.settings, section, value);
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : "Invalid settings.",
    );
  }
  const row = {
    organization_id: user.organizationId,
    settings,
    revision: revision + 1,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  const result =
    revision === 0
      ? await supabaseAdmin()
          .from("remodel_operating_settings")
          .insert(row)
          .select("revision")
      : await supabaseAdmin()
          .from("remodel_operating_settings")
          .update(row)
          .eq("organization_id", user.organizationId)
          .eq("revision", revision)
          .select("revision");
  if (result.error?.code === "23505" || (!result.error && !result.data?.length))
    throw new HttpError(
      409,
      "Settings changed in another session. Reload before saving.",
    );
  if (result.error) throw result.error;
  await recordAuditEvent(user, {
    action: "updated",
    entityKind: "setting",
    entityId: user.organizationId,
    subject: `Operating settings: ${section}`,
    beforeData: { section, revision },
    afterData: { section, revision: revision + 1 },
  });
  return { settings, revision: revision + 1, storageReady: true };
}
export async function requirePortalFeature(
  organizationId: string,
  feature: keyof OperatingSettings["portal"],
) {
  const settings = await getOperatingSettings(organizationId);
  if (!settings.portal[feature])
    throw new HttpError(
      403,
      "This section is not enabled in the customer portal.",
    );
}
