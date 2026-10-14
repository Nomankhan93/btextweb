# BulkText Web 0.20.8 — Campaign Wizard Simplification

This release converts campaign creation into a true one-step-at-a-time wizard and reduces mobile/recipient-preparation friction without changing the confirmation/send safety model introduced in 0.20.7.

## What changed

- Campaign creation now has explicit wizard state: Campaign → Recipients → Message → Review.
- Only the active editable step is rendered; completed steps no longer remain as full forms above the current step.
- Restored drafts reopen at the safest relevant step: Campaign, Recipients, or Message.
- Campaign Review continues the same four-step progress with Review active.
- Mobile `/campaigns/new` and `/campaigns/review/:id` use a focused shell: global top bar and bottom navigation are hidden and replaced with a compact wizard header.
- Mobile Back/Continue actions stay reachable with safe-area-aware sticky actions.
- Draft status is concise (`Draft saved`, time, browser availability) instead of exposing IndexedDB commit language.
- Draft conflict/local-authority exception states remain explicit so browser-draft reliability and server authorization boundaries are not weakened.
- Recipient file upload uses a compact custom surface; file byte size is no longer emphasized.
- Recipient validation is compressed to a single rows/valid/duplicates/invalid summary.
- Successful smart detection is shortened to `Phone column detected`; uncertain detection still opens/highlights Advanced column mapping.
- Advanced mapping remains collapsed by default when detection is confident.
- Optional consent reference is collapsed behind `Add consent reference (optional)`.
- Consent text is shorter while retaining automatic do-not-send exclusion.
- Recipient CTA is now `Continue to message` rather than system-oriented unique-number wording.
- Repeated `Safety stays automatic` warning is replaced by one concise safety line on the recipient step.
- Draft discard now uses the shared branded ActionDialog instead of a native browser confirm.

## Apply

Apply this patch to BulkText Web `0.20.7`:

```bash
bash /path/to/bulktext-web-0.20.8-patch/apply.sh /home/noman/projects/bulktext-web-0.4.0
cd /home/noman/projects/bulktext-web-0.4.0
npm ci
npm run certify:0208
git diff --check
```

The patch installer verifies the 0.20.7 baseline hashes for replaced files and creates a timestamped backup before writing.

## Safety boundary

0.20.8 does **not** merge confirmation with sending and does not alter recipient eligibility, consent/suppression, exact-SIM checks, authorization, durable queueing, delivery callbacks, or recovery behavior.

The authoritative sequence remains:

1. Campaign
2. Recipients
3. Message
4. Review
5. Confirm campaign — nothing is sent yet
6. Final phone/SIM check and send confirmation
7. Start sending

## Database / Android

No new migration. Backend contract remains `0.18.5`. No Android change is included.

## Deployment check

After frontend deployment and controlled PWA update, verify in desktop and mobile browsers:

- only one campaign-editing step is visible at a time;
- Back/Continue keeps entered data intact;
- prepared recipients can be revisited without automatically repeating import/consent writes;
- mobile global navigation is hidden only during creation/review and returns after exit;
- recipient upload/validation remains understandable at 360–400 px;
- confident mapping/evidence controls stay collapsed by default;
- offline/local-authority/conflict states remain explicit;
- Review still states that confirmation sends nothing;
- 0.20.7 final-send safety UX is unchanged.
