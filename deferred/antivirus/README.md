# Deferred antivirus integration

Deferred at the user’s request. No scanner is active in production.

`implementation.patch` preserves the prepared change against the app state on September 16, 2026, before Twilio settings. `snapshot/` contains exact copies with `.txt` suffixes so they are never compiled or run as migrations. Do not blindly restore whole files over newer work; merge the patch and resolve subsequent changes. The snapshot of README.md contains provider verification, existing-file scanning, and deployment instructions. Keep the integration out of deployments until the user resumes it.
