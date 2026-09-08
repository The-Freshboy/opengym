# Deploy and test checklist

This bundle is intentionally **not deployed**. Use it first in a test checkout/container.

## 1. Before applying

- Use the `reshuffle-multiple-routines` branch.
- Confirm `git status` is clean.
- Back up the OpenGym `data` directory, including `db.json`, state files, `secret`, Coach config/auth data and any existing recovery snapshots.
- Record the currently deployed immutable image tag/commit for rollback.

## 2. Dry-run the patch

```bash
python3 /path/to/opengym-deploy-later-2026-09-08/apply_all.py /path/to/opengym --dry-run
```

The dry run checks the expected code anchors and writes nothing.

## 3. Apply locally

```bash
python3 /path/to/opengym-deploy-later-2026-09-08/apply_all.py /path/to/opengym
```

The script patches/copies files, runs Node syntax checks, and runs the three included feature test files. On an apply/check failure it attempts to restore the original files.

## 4. Review before committing

```bash
git status --short
git diff --check
git diff
```

Pay particular attention to:

- `api/server.js`
- `api/coach/routes.js`
- `api/coach/jobs.js`
- `api/coach/payload.js`
- `api/coach/prompts/review.md`
- `api/training-features.js`
- `api/coach-context*.js`

## 5. Full automated tests

```bash
cd api
npm test
cd ../frontend
npm test
npm run build
```

Do not deploy if the pre-existing suite regresses.

## 6. Manual API/behaviour tests

### Existing training-feature backend

- Create a human-coach invite with only `workouts`; confirm the coach cannot read readiness/measurements or create a plan proposal.
- Accept a `plans` relationship; submit a proposal and confirm the client's state file does **not** change before explicit client approval.
- Accept/reject a proposal and verify the returned `applyChanges` payload is the only change hand-off.
- Upload valid JPEG/PNG/WebP progress photos; reject a MIME/signature mismatch.
- Confirm another user/coach cannot retrieve progress photos.
- Delete a test account and confirm its photo directory and coaching relationships are cleaned up.

### Context-aware Coach chat

1. Generate a review that reports low adherence.
2. Send a chat message explaining the reason, with no structured context. Confirm the Coach can explain/reconsider the current review, but no permanent absence dates are invented.
3. Save an explicit travel context that overlaps missed planned sessions.
4. Re-run/chat the review. Confirm the payload/science reports both raw and adjusted adherence.
5. Confirm only planned **missed** days are excluded; workouts completed during travel still count normally.
6. If adjusted adherence crosses 70%, confirm `adherence-low` is no longer an action finding and `adherence-explained` is informational.
7. Confirm any changed programme recommendation still appears as a pending proposal and requires Apply.
8. Delete the context and verify subsequent reviews no longer adjust for it.
9. Use Coach Forget and verify conversation/context data is removed.

## 7. Frontend/UI test when wired later

- Review screen shows **Talk to Coach / Add context**.
- Chat clearly distinguishes user vs Coach messages.
- Structured context asks for reason + date range and makes "affects adherence" visible/understandable.
- Review shows observed vs adjusted adherence rather than replacing the raw value.
- Search bars, substitution UI, set tags, notes, multiple sessions/day, measurements/photos and PT screens are wired to the backend/state contracts described in the other docs.

## 8. Deploy only after review

Build immutable images from the reviewed commit. Follow the repository's existing operations runbook, smoke test passkey login/sync/Coach/admin/push flows, then test the new endpoints on a non-critical profile before using real data.
