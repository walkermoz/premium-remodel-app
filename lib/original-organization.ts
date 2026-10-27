/** Legacy integrations whose credentials or legal copy still belong to the first company. */
export function isOriginalOrganization(organizationId: string) {
  return Boolean(
    process.env.SUPABASE_ORGANIZATION_ID &&
    organizationId === process.env.SUPABASE_ORGANIZATION_ID,
  );
}
