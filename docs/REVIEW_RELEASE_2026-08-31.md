# Review improvements — 31 August 2026

## Included

- Correct maximum/weighted records; measured session-effort workload with coverage.
- Immediate dirty tracking, revision-safe offline conflicts, visible sync errors, guarded proposal/restore installation, and unsynced sign-out protection.
- Warm-up tags, explicit timed-set confirmation, assisted-hold context, optional nerve-symptom follow-up and conservative progression safeguards.
- Equipment profiles captured per session; explicit per-side rep conventions without numeric conversion.
- Private-by-default physio report choices, saved preferences, since-EP reporting and completed-work CSV export.
- Confirmed-history copying, training-block edit/archive and bounded programme-version snapshots for observed planning intent.
- Consolidated review/delivery status, fixed-home versus travel reminder timezone, dedicated coach-review timezone.
- Opt-in additional integration context, readable rationale, date-scoped custom exercises, idempotent approvals, origin/size checks, restricted push destinations and durable state/revision recovery.

## Verification

API and frontend suites pass. Additional store tests exercise idle review normalisation, offline conflict, profile change, concurrent edits during approval, guarded restore and failed sign-out. Four-page synthetic PDF rendered and visually checked, including long symptom notes and hold context. Local browser checks cover equipment-profile save and review-status navigation. Real phone/background-timer behaviour still needs user-device confirmation.

## Not silently changed

No live training logs, starting loads, prescribed exercises, hangboarding dose, medication settings or clinical restrictions are migrated by this release. The current programme still requires a fresh signed-in export before applying the proposed training edits. The old 24 August plan is not a replacement for current account data.

External integration remains disabled until its public/private access boundary is verified. No firewall, DNS or authentication method is replaced. Existing notification schedules are not silently moved; new weekly coach schedules default to Canberra, while legacy settings remain visible and editable.

## Remaining optional enhancements

Treadmill interval templates, climbing grade-system selection, graph-by-equipment filters, advanced routine/block phase editing and broader accessibility/device testing remain follow-up work. Automatic assisted-hang progression, neurological diagnosis, PT/social features and paid API requirements are deliberately excluded.

## Rollback

Keep previous API/web images and a consistent full deployment backup. The new server can replay pending state journals; the old server cannot. Before reverting images, stop writes and verify no unrecovered pending journal remains (see RESTRICTED_INTEGRATION.md). Never delete workout data or journals to make a rollback appear successful.
