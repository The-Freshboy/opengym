# openGym operations runbook

## Release rule

Deploy immutable image tags (a Git commit SHA or release version), never `latest`. Record the previous tag before changing `OPENGYM_TAG`; it is the rollback target.

## Before deployment

1. Export an in-app JSON backup from Settings.
2. Stop writes briefly and back up the entire host `data` directory, including `db.json`, `secret`, state files, Coach configuration and `data/codex` credentials.
3. Confirm the backup archive can be listed and copied off the Docker host.
4. Record the current image tag and Compose configuration.

The server data and `secret` must be restored together. Restoring data without its matching secret invalidates every session and can make encrypted Coach credentials unreadable.

## Deploy and verify

Deploy the full Git SHA, wait for both container health checks, then verify:

```sh
curl --fail --silent --show-error https://gym.netfresh.site/api/health
curl --fail --silent --show-error --head https://gym.netfresh.site/
```

Smoke-test these user flows after a security release:

- sign in with an existing passkey;
- add a second passkey, sign out, and sign back in with it;
- sync a harmless setting between two browsers;
- export a backup and validate that it can be selected for import without applying it;
- start and stop a Coach job, confirming no proposal is applied;
- as admin, load users, invites, Coach status and Security activity;
- enable and disable a test user, confirming existing sessions are revoked;
- send a test push notification where supported.

## Rollback

Set `OPENGYM_TAG` back to the recorded tag and redeploy. Do not restore the data backup unless the new version changed or damaged stored data; application rollback and data rollback are separate decisions.

## Monitoring

Monitor `GET /api/health` every minute from outside the Docker host. Alert after three consecutive failures and also alert on repeated container restarts. Keep Dockhand behind authentication and restrict its management interface to the management VLAN or Tailscale; the application health endpoint is not a substitute for management-plane access control.

## Backup schedule

Take a daily encrypted backup of the host `data` directory, retain at least 7 daily and 4 weekly copies, and keep one copy off the Docker host. Test a restore quarterly into an isolated temporary stack with a different hostname and no outbound Coach credentials.
