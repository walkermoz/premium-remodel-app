import { spawnSync } from "node:child_process";

// Expo SDK 57 still depends on these reviewed upstream advisories. Keep the
// existing risk visible while blocking any unreviewed advisory.
const knownAdvisories = new Set([
  "https://github.com/advisories/GHSA-86w9-cpqp-85rv",
  "https://github.com/advisories/GHSA-mrhx-c7xc-m3w5",
  // Low-severity deepmerge issue via Expo config; no patched release available.
  "https://github.com/advisories/GHSA-gcqx-w48m-w2h4",
]);

const onWindows = process.platform === "win32";
const result = spawnSync(
  onWindows ? process.env.ComSpec || "cmd.exe" : "npm",
  onWindows
    ? ["/d", "/s", "/c", "npm audit --omit=dev --json --prefix mobile"]
    : ["audit", "--omit=dev", "--json", "--prefix", "mobile"],
  { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 },
);

if (result.error) throw result.error;
let audit;
try {
  audit = JSON.parse(result.stdout);
} catch {
  console.error(
    result.stderr || result.stdout || "Mobile audit did not return JSON.",
  );
  process.exit(1);
}
if (audit.error || !audit.metadata?.vulnerabilities || !audit.vulnerabilities) {
  console.error(
    "Mobile audit failed:",
    audit.error?.message || audit.error || "Incomplete npm audit result.",
  );
  process.exit(1);
}

const advisories = new Set();
for (const vulnerability of Object.values(audit.vulnerabilities || {})) {
  for (const via of vulnerability.via || []) {
    if (typeof via !== "string" && via.url) advisories.add(via.url);
  }
}
const unexpected = [...advisories].filter((url) => !knownAdvisories.has(url));
if (audit.metadata?.vulnerabilities?.critical || unexpected.length) {
  console.error("New mobile dependency advisories require review:", unexpected);
  process.exit(1);
}
console.log(
  `Mobile audit: ${audit.metadata?.vulnerabilities?.high || 0} high-severity dependency paths from ${advisories.size} tracked upstream advisories; no new advisories.`,
);
