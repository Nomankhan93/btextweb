# PWA Install & Update Experience — Web 0.20.1

## Goals

1. Offer installation only when the browser says BulkText is genuinely installable.
2. Never show install UI in installed standalone mode.
3. Avoid nagging users after **Not now**.
4. Download/check for updates in the background without forcing a mid-work reload.
5. Let the user choose when a waiting update activates.
6. Preserve the 0.20.0 service-worker safety boundary and offline shell behavior.

## Install lifecycle

`PwaProvider` captures `beforeinstallprompt` and prevents the browser's uncontrolled mini-infobar so BulkText can present a branded action. `canInstall` remains the source of truth for manual actions.

The global automatic prompt uses a separate `installPromptVisible` state. Selecting **Not now** stores only a dismissal-until timestamp under:

`bulktext:pwa-install-dismissed-until:v1`

The suppression window is three days. This timestamp contains no account, recipient, campaign, message or authentication data.

The public landing navigation shows **Install App** whenever `canInstall` remains true, even when the automatic card was dismissed.

`appinstalled` clears the stored dismissal and transitions the provider to installed state. Standalone display mode is detected on load, so installed PWA sessions do not expose install actions.

## Update lifecycle

BulkText registers `/service-worker.js` without forced activation.

Update checks occur:
- immediately after registration;
- when connectivity returns;
- on window focus, subject to a 15-minute minimum interval;
- when the document becomes visible, subject to the same interval.

When a newer service worker reaches `waiting`, a global **BulkText update ready** card is shown.

**Later** suppresses that same worker's card for the current page session. A genuinely different waiting worker can surface again.

**Update now** posts:

`{ type: 'SKIP_WAITING' }`

The waiting worker then activates. The page reloads once after `controllerchange`, and only when BulkText initiated that activation.

## Safety boundaries preserved

- no `skipWaiting()` in the service-worker `install` event;
- no forced mid-session reload;
- no background SMS sending or Background Sync introduction;
- no API/auth/queue/gateway response caching;
- same-origin static shell/assets only;
- existing immutable versioned shell and lazy-route precache remain;
- no database or backend contract change.

## UI placement

The install/update card is global so it can appear on:
- public landing;
- auth pages;
- authenticated workspace.

On narrow screens it sits above the mobile bottom-navigation/browser-safe area. It does not trap focus and does not behave as a modal.

The public hamburger navigation also exposes **Install App** only while the browser reports genuine installability.
