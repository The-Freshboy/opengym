# Security review remediation — September 2026

This document maps the read-only review against `e534fc20` to this hardening branch.

## Implemented

- Fork deployment provenance: Compose images, clone/self-host links, in-app repository links and private advisory links now point to `The-Freshboy/opengym`. Upstream attribution remains intact.
- WebAuthn requires biometric/PIN user verification for registration and authentication.
- Unsafe HTTP methods require the exact configured `ORIGIN` and JSON content type.
- Authentication endpoints have per-client and global throttles; the challenge store has a hard cap and predictable oldest-entry eviction.
- Public health output is limited to `{"ok":true}`.
- Web Push endpoints are restricted to HTTPS endpoints at recognised browser push services, validated both on subscription and immediately before send.
- Disabled users are excluded from reminders and Coach cadence; their timers and Coach work are cancelled.
- Coach consent withdrawal removes queued work, aborts supported running adapters and prevents stale results recreating state.
- Raw provider failure output is no longer persisted for user-data jobs; model identifiers are restricted to a conservative argument-safe format.
- Sensitive atomic writes use mode `0600` and the data directory remains `0700`.
- The shipped nginx server adds CSP, framing, MIME-sniffing, referrer and permissions protections. HSTS remains the responsibility of the HTTPS edge.
- Android cloud backup is disabled and FileProvider access is limited to app cache.
- Web builds now fail if `npm ci` fails. Compose uses this fork's configurable image tag and pins the exercise dataset commit.
- API CI now performs a clean install and production dependency audit.
- Full-backup import now has a 5 MB limit, structural checks and bounded record counts.

## Deliberately not changed in this branch

- **API process UID:** the API currently needs root only to launch Coach providers as the distinct unprivileged `coach` UID. Dropping the API UID without a narrowly scoped privileged broker would either break providers or run them as the API account, which can read `/data`. Preserving Coach isolation is safer. A future sidecar or minimal audited launcher should address this.
- **Capacitor app ID:** `ch.duartesantos.opengym` is retained to preserve Android/iOS upgrade and signing compatibility.
- **HSTS:** must be set by the real HTTPS reverse proxy, not the localhost HTTP container.
- **Base-image and GitHub Action SHA pins:** require a separately reviewed dependency-only change with digest/SHA provenance and automated update policy. Mutable media dataset content and application image ownership were fixed here.

## Migration notes

- Existing passkeys backed by authenticators that cannot perform user verification may need to be replaced with a PIN/biometric-capable passkey.
- Prebuilt images now come from `ghcr.io/the-freshboy/opengym-*`. Set `OPENGYM_TAG` to a reviewed version tag in production; `latest` remains the compatibility default.
- Android backups are intentionally disabled because they contain training and bodyweight data.
- Custom browser/server clients must send `Origin` matching `ORIGIN` and `Content-Type: application/json` for unsafe API methods.
- With an additional reverse proxy, overwrite `X-Real-IP`; do not forward an untrusted client-supplied value.
- Withdrawing Coach consent cannot recall data already sent to an external provider, but it now stops queued work, aborts supported active work and prevents local result persistence.

## Manual GitHub settings

The following cannot be truthfully enabled by source changes and must be checked in repository settings:

- Enable Private Vulnerability Reporting.
- Add a `main` ruleset requiring pull requests and successful test/build checks.
- Block force pushes and branch deletion for `main`.
- Enable secret scanning and push protection where available.
- Enable Dependabot alerts and security updates.
- Enable CodeQL/code scanning if available.
- Remove or correct any repository homepage that still points to the upstream live demo.

## Verification limitations

The Windows host used for this change did not have Docker, gitleaks/trufflehog, a container scanner, or GitHub CLI installed. Container builds, runtime UID/mode checks, history scanning, image scanning and repository-setting changes therefore remain mandatory before merge.
