# BulkText Web 0.20.0 — Production Launch Baseline

## Frozen production contracts

- frontend release: `0.20.0`
- backend contract: `0.18.5`
- no Web 0.20.0 database migration
- SIM-backed delivery semantics unchanged
- 0.19.8 auth/session/workspace boundaries retained
- 0.19.7 sanitized diagnostics retained
- 0.19.9 accessibility/form semantics retained
- 0.19.6-r1 bootstrap split retained
- initial static JS budget remains `< 500 KiB`
- every emitted JS chunk remains `< 500,000 bytes`
- PWA lazy chunks remain covered by the build asset manifest and offline shell installation
- release ZIP remains deterministic and source/stage/extracted-preflight verified

## Automated certification

`npm run certify:0200` is the authoritative frontend runtime/build gate. A failure in any child gate fails certification.

The release packager is a second independent artifact gate and must pass after certification.

## Post-deploy launch checklist

These checks require a deployed build and therefore are **not** claimed PASS by the source ZIP:

- public landing loads in a fresh desktop browser
- sign in / sign out / protected return route works
- signed-in dashboard and workspace load correctly
- campaign draft can be created and restored
- recipient import/validation opens and remains keyboard usable
- installed PWA opens, scrolls and navigates after a cold offline start
- reconnect restores online behavior without losing the active draft
- mobile browser Tools dialog traps/restores focus correctly
- Technical diagnostics can be copied and contain no raw message/details/hint, tokens, full URLs or personal identifiers
- paired Android gateway appears in Phone & SIM
- one controlled test message uses the explicitly selected SIM and reaches the expected delivery state

Record deployment URL/build identifier and the date/operator alongside the smoke results outside the source repository.
