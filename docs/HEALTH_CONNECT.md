# Health Connect companion

This change adds a free, self-hosted path from Garmin Connect on Android to OpenGym:

`Garmin Connect → Health Connect → OpenGym Health Sync → authenticated OpenGym API`

The existing browser app remains the primary OpenGym interface. The small native app only reads Health Connect and uploads records; it cannot read or change an OpenGym programme.

## Privacy and security

- No Garmin username, password, session, private API, or scraping is used.
- GPS routes are neither requested nor accepted by the server.
- The Android app requests read-only access. Android's Health Connect permission screen lets the user grant or deny each category.
- Raw continuous heart-rate samples are not read. The initial data set is Garmin-origin exercise sessions, resting heart rate, HRV, sleep, steps, distance, active calories, and weight. Records written by other apps are ignored.
- Mobile credentials have only `health:write`, are stored hashed on the server and encrypted with Android Keystore on the phone, expire, and can be revoked independently.
- The AI Coach receives no health data by default. If the user opts in, it receives daily aggregates for the last 14 days, not raw records, source IDs, or routes. Suggestions remain review-only.
- Server files use the existing protected data directory and per-user separation. Imports are limited to 250 records and 512 KiB per request.

## Server setup

No paid service is required. Deploy the normal API/frontend build after reviewing this branch. The feature has no new server dependency or environment variable.

In OpenGym, sign in and open **Settings → Health Connect**. Create a mobile credential and copy it once. The server must be reachable from the phone over trusted HTTPS. Tailscale HTTPS or an HTTPS reverse proxy on the home LAN are suitable; the companion deliberately refuses cleartext HTTP, even on a private address.

## Android build and setup

The Gradle project is in `health-connect-android/`. Open it in Android Studio, build the APK, and install it on the GrapheneOS phone. The app does not require Google Play Services; it uses the AndroidX client for the Health Connect provider available on the device.

1. Enter the HTTPS OpenGym base URL and one-time mobile credential.
2. Choose the initial history window. More than 30 days requests Android's separate historical-read permission when supported.
3. Open the Health Connect permission screen and approve only the categories wanted.
4. Tap **Sync now** for the first import.
5. For reliable hourly background work on GrapheneOS, allow background health access and set the app's battery use to **Unrestricted**. WorkManager still obeys Android scheduling and network availability, and uses exponential retry after transient failures.

Incremental sync stores a cursor per record category with a five-minute overlap. A cursor is advanced only after the server accepts that category. The overlap makes interrupted runs safe because the server upserts on `(type, Health Connect record ID)`.

## Retention and deletion

The current server keeps the newest 20,000 records per profile and 100 import receipts. Revoking a mobile credential stops new uploads but deliberately does not delete health history. A future UI should add an explicit, separately confirmed deletion operation before treating this as a general multi-user release.

## Known limitations

- Health Connect does not offer an instant new-data push to ordinary readers. WorkManager is best-effort; opening the app and choosing **Sync now** is the deterministic fallback.
- This first version uses per-type timestamp cursors plus server-side deduplication. It does not yet propagate Health Connect deletions.
- Daily step totals can overlap if several source apps write equivalent records. The companion preserves source attribution, but the web summary currently sums records. Prefer Garmin as the activity-priority source in Health Connect.
- Building a distributable signed APK and installing it are intentionally outside this repository change. Nothing here deploys to the live server.
