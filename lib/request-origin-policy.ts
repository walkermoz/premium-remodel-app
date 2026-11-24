/** Explicit browser origins for cookie-authenticated mutations; never a host suffix. */
export function allowedBrowserOrigin(
  origin: string | null,
  canonicalOrigin: string,
  additionalOrigins = "",
) {
  if (!origin || origin === "null") return false;
  if (origin === canonicalOrigin) return true;
  return additionalOrigins.split(",").some((entry) => {
    try {
      const url = new URL(entry.trim());
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.hostname.includes("*") &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        origin === url.origin
      );
    } catch {
      return false;
    }
  });
}
