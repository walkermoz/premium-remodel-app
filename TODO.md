# Premium Remodel to-do list

- [ ] **Antivirus scanning — deferred by request (September 13, 2026).** The integration is prepared locally but is not deployed or active. The live app continues to use strict file validation. No scanner subscription or key is needed while this is deferred.
  - When resumed, connect the scanner and verify clean-file acceptance and EICAR rejection against the real service.
  - Scan existing attachments, deploy the integration, and apply its storage restriction.
  - Verify uploads, downloads, and direct-storage access before marking this complete.

The deferred implementation, migration, tests, and activation guide are preserved in `deferred/antivirus/`. They are excluded from active code and deployments. Resume by reviewing its README and merging its patch with subsequent app changes.
