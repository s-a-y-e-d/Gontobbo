# Revision push reminders

Opt-in revision push notifications default to **08:00** and an optional **19:00**
second reminder in **Asia/Dhaka (UTC+6)**. Both can be set independently to any
time from 00:00 to 23:59, in either order. Matching times produce one combined
notification. The stored morning/evening field names remain for compatibility;
they identify reminder slots without restricting their time of day.

## Enable on a device

1. Open Settings → Notifications (`/settings?section=notifications`).
2. Name the device and choose “এই ডিভাইসে চালু করুন”. Grant browser permission.
3. Send a test notification. Refresh delivery history to see its outcome.
4. Review reminder time and lock-screen privacy preferences and save changes.

Each message combines today's due and overdue concepts. Empty queues stay silent.
The sender follows the existing Revision queue: valid owned subject/chapter,
in-term chapter, automatic revision enabled, and a scheduled review date. Upcoming
reviews are excluded. No progress, review date, or study log is changed.

Notifications show counts by default. Opting into details adds up to three subject
and concept names. Tapping opens `/revision`. Supporting browsers also offer a
one-hour snooze action. Snooze affects the account, preserves review dates, and
can be canceled in Settings. It can create an additional user-requested reminder;
the two-message daily limit applies to regular morning/evening messages.

Up to ten devices can be connected and removed remotely. Removing the last device
(including an expired subscription) disables reminders. Signing out clears the
worker's account binding and closes old-account notifications. Switching accounts
requires opting in for that account; transferring an existing browser subscription
requires possession of its matching subscription keys.

## Deployment configuration

Configure on the intended Convex deployment:

- `VAPID_PUBLIC_KEY`: public key from `web-push`'s `generateVAPIDKeys()`.
- `VAPID_PRIVATE_KEY`: matching private key, stored only as a deployment secret.
- `VAPID_SUBJECT`: contact `mailto:` or HTTPS URL; defaults to `CONVEX_SITE_URL`.

Use a protected temporary environment file with `convex env set --from-file`,
specify the deployment explicitly, and remove the temporary file afterward. Never
log private keys or subscription endpoints. Preserve existing keys: rotating the
pair requires devices to reconnect with the new public key.

Deploy the Convex configuration, schema, functions and frontend together. The
frontend serves `/sw.js` without stale caching. This worker never caches private
pages. HTTPS is required outside localhost. iPhone/iPad users may need to install
the app to their Home Screen before browser push becomes available.

Development configuration does not deploy the production frontend or backend.
Production deployment and production secret configuration require explicit
authorization for that target.

## Delivery behavior

Each enabled account owns one cancelable scheduled job for its next regular slot.
Updating preferences cancels old jobs and increments a generation token, also
invalidating queued messages. Snooze owns one separate cancelable job. Disabled
accounts require no polling or study-data scans.

Unique account/device/day/slot keys prevent duplicate jobs. Workpool limits push
action parallelism to four. Explicit provider 429/5xx responses retry at most three
times with backoff. Ambiguous network failures are not retried, because delivery
may already have succeeded. Stable push topics/tags collapse matching visible
notifications. Push delivery cannot guarantee exactly-once or exact-time arrival.

The sender checks current preferences, device ownership, snooze and expiry before
sending and rereads the due queue for each attempt. Regular messages delayed into
another Dhaka day or by over two hours are skipped. Offline deliveries can reflect
the queue at send time; opening the app shows current work. HTTP 404/410 removes
expired subscriptions. Delivery history is retained for 30 days, cleaned in batches
of 100. Provider acceptance in history does not prove the device displayed it.

Background snooze uses a random device-specific capability token. It can only
snooze an existing recent delivery, cannot read account data or send arbitrary
pushes, and is omitted from public Settings responses. Push-provider hosts are
allowlisted to prevent requests to arbitrary server URLs.

## Bandwidth and invalidation

- Settings has a separate snapshot query: one user lookup, one preferences row,
  at most ten devices and ten history rows. It reads no study items or concepts.
  Hidden desktop/mobile versions skip their queries.
- A scheduled job reads preferences, its user, and at most ten devices. It never
  scans all users or any study table.
- A send reads the user's due `concepts` index in pages targeting 100 rows and a
  1 MB scan budget. Chapter/subject lookups are cached per page. Only counts and up
  to three names return from each page. No `studyItems` scan occurs.
- A user with 1,000+ study items pays only for due concepts during delivery.
  Counts deliberately refresh for each connected device. The bounded fanout is
  ten devices and two regular slots daily. If many users/devices increase usage,
  evaluate sharing an account-level digest per slot.
- Only a designated legacy owner reads undefined-userId concepts to match the
  existing queue. Other users never use that compatibility path.
- Writes stay in reminder-specific tables and scheduled functions; existing Todo,
  dashboard and syllabus subscriptions gain no new invalidation paths.
- Watch `revisionReminders:duePage`, `revisionPush:send`, and
  `revisionReminders:getSettings` after deployment.

## Verification

Regression tests cover scheduling/day boundaries, deduplication, opt-out, account
ownership/transfer, expiry, request limits, snooze tokens, preserving review dates,
paused/out-of-term/future exclusion, pagination, legacy access, queue rechecks,
provider failure handling, worker account binding, sign-out privacy, local-only
notification navigation and background snooze fallback.

The component can be visually inspected with synthetic data in light/dark themes
and mobile/desktop layouts. Release still needs a real-device smoke test after
granting permission: receive a test push; close the app and receive a due reminder;
snooze; clear due reviews and confirm the follow-up is silent; remove a device;
sign out or switch accounts. Automated provider mocks are not real push delivery.
