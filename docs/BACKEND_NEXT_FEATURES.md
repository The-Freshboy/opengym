# Backend foundation for the next OpenGym training features

This backend package is designed for the `reshuffle-multiple-routines` branch. It intentionally does **not** deploy anything and it does not put browser-only calculations on the server.

## What belongs in normal profile state

OpenGym already has revision-checked per-user JSON state, snapshots and conflict handling. The following features should stay in that state so they remain offline-capable and sync through the existing `/api/data` boundary:

- **Exercise substitutions and preferences** — `substitutionHistory` plus `exercisePreferences` can record preferred/avoided movements and prior replacements. The actual matching stays with the local exercise library.
- **Warm-up and set types** — each set may use `type`: `warmup`, `working`, `amrap`, `drop`, `failure`, or `backoff`. Warm-up calculations remain pure frontend logic.
- **Plate calculator** — pure frontend calculation; equipment profiles and available plates stay in profile state.
- **Exercise/workout notes** — persistent exercise notes can live in `exerciseNotes`; completed-workout notes remain attached to the workout record.
- **Multiple sessions per day** — the current branch already permits array-shaped schedule values; the backend simply preserves the state.
- **Readiness** — the existing `readiness` object remains user-owned state.
- **Body measurements** — `measurements` is now accepted and bounded by server state validation.
- **Percentage/training-max programming** — training-max configuration belongs on routines/exercises and is synced as normal state. The progression calculation remains testable frontend logic.
- **Search bars** — UI-only; no backend endpoint is needed.

The server validation adds bounded support for `measurements`, `substitutionHistory`, `sessionNotes`, `exerciseNotes`, and `exercisePreferences`. Existing states remain valid.

## New server-managed features

### Human coach relationships

Human coach access is separate from the administrator role. A user acting as a coach creates a 14-day invite and chooses requested scopes. The client previews the coach name and scopes and must explicitly accept.

Available scopes:

- `plans` — routine/schedule visibility and permission to submit plan proposals.
- `workouts` — completed workout visibility and workout-targeted comments.
- `readiness` — readiness/check-in visibility.
- `measurements` — bodyweight and body-measurement visibility.

There is deliberately **no progress-photo scope**. Photos remain visible only to their owner in this backend version.

A coach can create comments and proposals. A proposal is stored server-side and notified to the client, but **never mutates the client's profile state**. Even after the client accepts, the API only returns the approved change payload. The frontend must pass that payload through an explicit, allow-listed, revision-checked application path; it must not blindly execute arbitrary JSON Patch operations.

Relationships can be revoked by either side. Revocation immediately stops coach reads because every coach read checks for an active relationship.

### Private progress photos

Progress photos are deliberately kept out of `state-<user>.json`, so syncing normal profile state does not repeatedly move image blobs between devices.

- Stored under `DATA_DIR/progress-photos/<user-id>/` with mode `0600` where supported.
- Metadata is stored in `db.json`.
- Maximum raw image size is 3 MiB, keeping the base64 JSON upload below the existing 5 MiB HTTP body limit.
- JPEG, PNG and WebP are accepted and their file signatures are checked against the declared MIME type.
- Reads are authenticated and return `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
- Deleting an account removes its photo files, metadata, human-coach links and human-coach items.

## New API surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/training/features` | Capability/schema discovery and current coaching relationships |
| POST | `/api/training/coaching/invite` | Create a scoped coaching invite |
| POST | `/api/training/coaching/invite/preview` | Preview a coaching invite before accepting |
| POST | `/api/training/coaching/accept` | Client accepts a coaching relationship |
| GET | `/api/training/coaching/clients` | Coach lists active clients |
| GET | `/api/training/coaching/client?id=...` | Read only the client data covered by accepted scopes |
| POST | `/api/training/coaching/item` | Coach creates a comment or approval-only proposal |
| GET | `/api/training/coaching/items` | Client reads comments/proposals |
| POST | `/api/training/coaching/decision` | Client accepts/rejects a proposal; no silent state mutation |
| POST | `/api/training/coaching/revoke` | Either side revokes the relationship |
| GET | `/api/training/photos` | List the signed-in user's photo metadata |
| POST | `/api/training/photos` | Upload a JPEG/PNG/WebP as base64 JSON |
| GET | `/api/training/photo?id=...` | Stream one owned photo |
| POST | `/api/training/photo/delete` | Delete one owned photo |

All browser write routes remain behind OpenGym's existing same-origin/session/rate-limit boundary.

## Database compatibility

`db.json` gains three optional containers:

```json
{
  "coachLinks": [],
  "coachItems": [],
  "progressPhotos": {}
}
```

`loadDatabase()` fills these when an older database is opened. Invalid types fail closed rather than being silently replaced.

## Verification

The bundle includes tests for:

- legacy DB compatibility;
- new user-state validation bounds;
- coaching scope allow-listing;
- explicit invite/accept flow;
- denial of unshared data;
- denial of plan proposals without `plans` scope;
- proposal acceptance without direct programme mutation;
- progress-photo MIME/signature checking, private read headers and account cleanup.

After applying to a full checkout, run:

```bash
cd api
npm test
```

Before deployment, also follow the repository's existing backup, immutable-image and rollback runbook. The backend package does not alter those deployment controls.

## Context-aware AI Coach chat extension

The compiled bundle also adds a server-side conversation/context layer for the existing AI Coach. It is deliberately built on the existing review/proposal pipeline rather than giving chat a separate mutation path.

New routes:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/coach/chat` | Read the signed-in profile's Coach messages and structured contexts |
| POST | `/api/coach/chat` | Send a message, optionally attach structured context, and queue a context-aware review |
| POST | `/api/coach/context` | Save an explicit date-bounded context such as travel/work/illness |
| POST | `/api/coach/context/delete` | Remove one saved context |

Structured reasons are `travel`, `illness`, `work`, `injury`, `equipment`, `deload`, `schedule`, and `other`. Travel, illness, work, injury, deload and schedule default to affecting adherence; equipment and other do not unless explicitly marked. The server never converts free-text chat into a permanent context automatically.

When a saved context overlaps a review window, adherence is reported both as observed and context-adjusted. Only planned **missed** dates inside an explicit context are excluded. A completed workout is never removed from the denominator simply because it happened during travel. If the raw rate is below 70% but the adjusted rate is at or above 70%, the existing low-adherence action finding is replaced with an informational finding so raw attendance alone does not justify changing the weekly schedule.

Chat still uses the closed-list Coach review validator. A conversation can explain or revise a recommendation, but it cannot silently change the programme. Any resulting changes remain normal pending changes for explicit approval.
