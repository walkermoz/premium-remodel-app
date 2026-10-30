export const DEFAULT_QUOTE_PROJECT_NAME = "Project #1";

/** Rows with this marker remain on the quote without a project heading. */
export const UNGROUPED_SCOPE_PROJECT_ID = "ungrouped";

/**
 * The default project name helps organize the quote builder, but it is not
 * meaningful customer-facing copy. Only explicitly named sections are shown
 * on the client quote and PDF.
 */
export function customerQuoteSectionName(name: string | undefined) {
  const normalized = name?.trim() || "";
  return normalized.toLocaleLowerCase() ===
    DEFAULT_QUOTE_PROJECT_NAME.toLocaleLowerCase()
    ? ""
    : normalized;
}
