# Restricted training integration

This is a separate account-scoped access path, not a passkey bypass or an AI provider.
It does not start paid API calls or create a scheduled review. The existing Coach remains
unchanged. An authorised client can read training context, and optionally submit proposals;
only a signed-in person can approve a proposal in Settings → Restricted integrations.

## Deployment boundary

External access is **off by default**. Set `INTEGRATIONS_ENABLED=true` on the API only after
reviewing the network path. Prefer a Tailscale-only HTTPS reverse-proxy route to
`/api/integration/v1/`, denying that path on the public listener. Keep the account-management
routes `/api/integrations` and `/api/integrations/...` on the normal same-origin app path.
Do not expose the API container port directly. Do not trust a client-supplied forwarded-IP
header as proof of Tailscale membership. Verify the rule from both a tailnet device and a
non-tailnet connection before enabling. Application credentials are still required over
Tailscale. This change does not itself install or alter firewall/proxy/ACL rules.

Deployment rollback: restore the previous API and web image tags and remove/disable
`INTEGRATIONS_ENABLED`. Preserve the data directory and its recovery snapshots. Disabling
the feature prevents requests without deleting credentials or workout data.

## Credential handling

Create a named credential while signed in with your passkey. Default permission is read-only;
enable proposals only if needed. Choose the shortest useful expiry (default 30 days,
maximum 90). The secret is displayed only at creation; the server stores its hash.
Keep it in a password manager or owner-only local file, outside the repository and cloud
sync folders. On Windows restrict the file's ACL to your user and necessary system accounts;
the helper cannot validate Windows ACLs. Never paste it into chats, URLs, logs or commands.
Revocation and signing out everywhere invalidate access. A stolen read-only token can still
disclose sensitive training notes, so read-only is not risk-free.

## Local helper

Requires Node 22+ and a verified HTTPS route. It does not accept browser session cookies,
follow redirects, approve changes, or read an API token from a command-line argument.

```powershell
node scripts/training-integration.mjs context --url https://gym.example --token-file C:\Private\opengym-token.txt
node scripts/training-integration.mjs propose --url https://gym.example --token-file C:\Private\opengym-token.txt --proposal-file proposal.json
```

The `context` response contains sensitive training information: protect any saved output.
Use its current revision when submitting a proposal. A proposal is advisory until reviewed
and approved in the app; changed state causes a conflict rather than overwriting newer data.
Follow the supported change schema exposed by the integration; do not send a full backup or
arbitrary state update. Unsupported changes must be made through the ordinary programme UI.

## Security rationale

Separate bearer authentication, narrow permissions and account ownership checks reduce the
impact compared with handing an agent a full signed-in session. Same-origin checks protect
cookie-authenticated management actions. Expiry, revocation, request limits, secret hashing,
metadata-only audit records and recovery copies provide additional safeguards; none replace
careful review of a proposed exercise change or independent security testing.

References: [OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html),
[OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## Context v2 and proposal additions (30 August 2026)

Connection creation accepts optional `categories: ["goals", "readiness", "instructions"]`.
The default is an empty list, including existing credentials. These categories add goals/test
results, readiness/nerve-symptom fields, and routine/exercise instructions/hang context,
respectively. Existing base training comments remain part of disclosed read access. Categories
are recorded on the credential and returned as `sharedCategories` with context version 2.
Warm-up set tags and session RPE are preserved in training context. No missing baseline is invented.

New proposal types, still owner-approved and revision-checked:

- `day-plan`: `target: {date: "2026-09-07"}`, `after: ["existing-routine-id"]`.
  An empty array means explicit rest; null removes the dated override and restores weekly fallback.
- `add-custom-exercise`: `target: {routineId: "existing-routine-id"}`, with
  `after: {exercise: {id: "custom_supported_hold", n: "Supported hold", bp: "other", eq: "hangboard", desc: "..."}, prescription: {mode: "time", sets: 2, sec: 5, note: "...", restSec: 90}}`.
  Repetition mode accepts `reps` instead of `sec`. New custom exercises are always optional and
  progression-off. Existing mandatory exercises are not removed or unprotected.

For a date-only addition, include `target.date` on `add-custom-exercise`. That date must
already contain the target routine (weekly fallback or dated override). Approval clones the
routine to a deterministic new ID, adds the optional exercise to that copy, and replaces only
the matching session on that date; other sessions and all other dates remain unchanged.
The proposal exposes `affectedDate` and `scope: "dated-copy"`. Without `target.date`, the
operation has `scope: "shared-routine"` and changes the routine wherever it is used. A separate
`day-plan` operation does not make a shared routine edit date-limited. Arbitrary state
replacement and arbitrary new routine creation remain unsupported.

Each change should explain `why`. Returned changes include routine/exercise names for display;
audit records include the connection name. Approval retries after a lost response return
`alreadyApplied: true` without incrementing the revision again. A durable applied-operation
marker repairs a state-committed/audit-not-saved interruption.

## Compatibility and operations

- Existing state files stay readable by the Coach. A pending redo journal, fsynced before the
  state/meta pair, repairs interrupted writes when the store is read. Back up the whole data
  directory, including pending journals. New snapshots carry an integrity checksum; legacy
  snapshots remain readable. A corrupt file fails closed instead of appearing as empty data.
- Updating existing state requires an integer `baseRevision`; missing/stale revision returns
  conflict with current data. Initial creation remains compatible.
- Browser mutation requests require JSON and exact configured Origin for session cookies.
  Native/specialised cookie clients must be checked before deployment; bearer-only integration
  requests retain their separate auth boundary. Do not widen Origin just to suppress an error.
- Login limits ignore forwarded headers unless `TRUST_PROXY=true`. Only set it when ingress is
  restricted to a reverse proxy that overwrites untrusted forwarding headers.
- Push delivery requires public HTTPS destinations on port 443 and validates/pins DNS at each
  connection. Private-host custom Web Push services are intentionally unsupported by this
  policy; ntfy's explicitly configured internal service is separate and unchanged.
- `GET /api/diagnostics` is authenticated and shows profile sync/snapshot/reviewer/notifier
  status without credentials. `build` is null unless `APP_BUILD` is explicitly supplied; it
  must not be interpreted as proof of a deployed revision or network boundary.
- Dedicated review timezone is `coach.cadence.weekly.timezone`; legacy fallback remains
  `reminder.tz`, then UTC. Weekly reviews catch up later on their scheduled day, not after a
  whole-day outage. Persisted job history suppresses repeated scheduled attempts that day;
  manual retry remains available. Daily caps are explicitly UTC.
- Weekly ntfy is a reminder to review, not a claim that an AI review completed. It remains
  Sunday 19:00 Canberra with same-day catch-up; no secrets or clinical content appear in it.

Before enabling/deploying, verify cookie/passkey login, proposal review, two-device conflicts,
push delivery and public/Tailscale route separation. Roll back application images and disable
integrations if needed; do not delete state, journals, credentials or snapshots.

**Rollback with a pending journal:** old images do not know how to replay the new
`state-*.pending.json` records. Before switching to an old image, stop writes, let this version
open/recover every affected profile and verify that no pending records remain. Preserve an
independent full-directory backup. If recovery cannot complete, restore a consistent verified
backup with its matching metadata rather than deleting a journal. Normal state/meta files
remain backward-readable once recovery has completed.
