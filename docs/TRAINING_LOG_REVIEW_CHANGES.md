# Training-log review improvements

Implemented locally 30 August 2026. No clinical training doses or live account data are changed by these features.

- Insights selects actual maximum records, reads the real `r` rep field, separates weighted records by exercise/unit, and excludes warm-ups.
- Session-effort workload never imputes intensity. The optional `sessionRpe` field takes precedence over activity intensity. Coverage is displayed; change percentages are withheld unless both windows have complete duration/effort records. This is descriptive, not injury prediction.
- A set-number button toggles `type: 'warmup'`; missing type remains a legacy working set. Warm-ups remain in history/PDF and total performed volume, but are omitted from working-set records, 1RM, effort and muscle-set analyses. Personal progression compares working sets only; adding warm-ups does not disable otherwise comparable strength progression.
- Timed-set expiry or early stop opens an explicit confirmation. Nothing is completed merely because the clock elapsed. Cancelling leaves the set unchanged and available for manual correction.
- Timed exercise entries can store optional `hangContext` (hold, grip, support, elbow). No assistance kilograms are guessed. Context is shown in recent history and exported only when notes are included. Assisted history does not generate automatic progression or carry assisted loads forward.
- Session feedback optionally records tingling/numbness/weakness as not-recorded/no/yes, plus site and timing. Positive feedback suppresses personal progression suggestions; this is not diagnosis or clearance. PDF inclusion requires feedback opt-in. No health feedback is sent to an AI provider by these UI components.
- Selected equipment settings are copied into `trainingContext.equipmentProfile` when a session starts, with planned minutes separately. Profiles do not substitute exercises or change loads. Progression does not carry loads across profile snapshots. Full/short choice remains explicit and mandatory exercises stay.

Verification: frontend unit tests and production build. Real-device testing remains necessary for timed confirmation sheets, screen reader/set-number controls, background timers and PDF layout with long context/feedback. API sanitisation and integration field allowlists should be reviewed separately before release.

Follow-up improvements: copying completed history requires explicit confirmation and a nonfuture date; copied history is excluded from progression and its session feedback is not copied. Repetition conventions can be selected in exercise configuration and labelled in workout/history/PDF without converting numbers. PDF sharing defaults can be explicitly remembered/reset and a saved EP date provides a reporting shortcut. Training blocks can be edited/archived/restored. Insights uses the shared retained programme snapshots for past adherence, and the PDF can list retained change timestamps.

Not implemented in this focused batch: graph-by-equipment filters; automatically comparable assisted-hang progression; per-set nerve symptoms; default recurring hang dose; neurological diagnosis; future-programme effective-date UI; advanced warm-up calculation. Existing untagged historical data is not reclassified.
