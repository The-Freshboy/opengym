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
