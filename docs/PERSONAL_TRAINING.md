# Personal training features

## What changed

- Your training replaces the bottom Exercise library tab. The library remains in Settings and in workout exercise pickers.
- Opt-in goals record actual hang, beep-test, climbing and custom results. Templates are targets, not fabricated baselines. Beep results use separate level/shuttle fields; treadmill running is not converted into a shuttle score.
- Session comments, difficulty, energy and optional joint-discomfort feedback are stored with the workout. Recent exercise history appears while training.
- Progression suggestions need approval. Three comparable exposures on separate dates are required; mixed effort/results, incomplete/short sessions and reported joint concerns prevent an increase. No all-time maximum is used as a starting load.
- Full/short sessions omit only explicitly optional exercises. Mandatory base exercises cannot be removed by a Coach proposal or reviewed plan import. Existing exercises are not automatically classified: mark mandatory base exercises in the routine editor after checking the source programme.
- Full backup imports and server restores have previews, revision checks and pre-restore recovery copies. Server copies retain 10 recent and 30 daily snapshots, including quiet days. These are not a substitute for separate host/off-site backups.
- Your training > Export workouts to PDF prepares an A4 report locally with selected dates, completed sets and optional notes, feedback, tests and a separate current-plan appendix. It never exports account credentials or structured medication intake. Free-text notes can contain sensitive details if included. Legacy loads without a stored unit are labelled as assumed, not converted.
- Native form controls follow the chosen colour scheme. The reschedule date field uses the standard high-contrast field styling and rejects past destinations.

## Evidence and limitations

The three-exposure rule, 42-day comparison window and effort gates are conservative **product heuristics**, not validated clinical decision rules or guarantees of safety. The app does not diagnose joint symptoms or replace an Exercise Physiologist. Missing feedback does not mean no symptoms. An accepted suggestion is a user decision, not medical clearance.

Current guidance supports individualising resistance training to goals and capacity; movement control and stabiliser strength matter when managing hypermobility. These sources inform the conservative design, not the exact thresholds:

- [ACSM resistance training guidance update, 2026](https://acsm.org/resistance-training-guidelines-update-2026/)
- [The Ehlers-Danlos Society: physical therapy](https://www.ehlers-danlos.com/physical-therapy/) (general hypermobility-relevant principles; no diagnosis is inferred).

No new AI/API calls were added. The PDF is generated on-device, using a self-hosted font. New joint-discomfort/energy fields are not added to the Coach provider payload; existing consent-controlled session notes and difficulty retain their existing behaviour.

## Optional server ntfy configuration

Configure the API service with `NTFY_URL`, `NTFY_TOPIC_FILE` and `NTFY_TOKEN_FILE`. Mount only the required existing topic/token files read-only. Never put token contents into Compose, Git or browser-delivered config. Use a publish-only token restricted to the intended topic. HTTPS is preferred; plain HTTP is appropriate only on a trusted isolated service network.

`NTFY_PROFILE_ID` can scope the reminder to one account; without it, sending is allowed only when there is exactly one active account. The user must enable the weekly reminder in Your training. The server checks once per minute, Sundays from 19:00 Canberra time (`Australia/Sydney`), and records successful delivery to prevent repeats that day. Failed sends retry; a server offline for the entire Sunday evening does not send a belated Monday notification.

The notification says only that a weekly summary is ready. Opening the app shows the actual data. Device notification display still depends on ntfy subscription and phone permissions.

## Verification

Frontend: `npm test` and `npm run build`. API: `node --test test/*.test.js` from `api`.

Synthetic PDF layout fixture: run `node scripts/qa-physio-report.mjs` from `frontend`; render `tmp/pdfs/physio-qa.pdf` with Poppler. Never import this synthetic fixture into a live account.

Verify dark and light rescheduling, quick-date buttons, PDF privacy options and long-note pagination. Take a host backup before deployment; keep the prior image tags and Compose file for rollback. Do not remove persistent volumes.

Dependency audit on 30 August 2026: new PDF packages had no production advisories reported. The existing React Router 7.18.1 advisory GHSA-qwww-vcr4-c8h2 affects unstable React Server Components APIs; this app uses a client-side HashRouter, not those APIs. No broad dependency upgrade was folded into this feature change.
