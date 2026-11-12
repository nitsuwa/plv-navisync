# Action confirmation verification

The feature adds confirmation before consequential actions and protects unfinished forms before dismissal, navigation, and logout.

## Browser smoke

Start Vite on localhost port 5174, then run:

```sh
node docs/verification/action-confirmations/run-smoke.mjs
```

Set `CONFIRMATION_SMOKE_URL` to use another local URL. The script uses headless Edge and the bundled Playwright runtime if no project Playwright installation exists.

Verified November 12, 2026 at 1440px and 390px: cancellation preserves the pending action, confirmation completes it, and failure retains the dialog for retry. All external requests are blocked. This isolated fixture exercises the shared confirmation component; role-specific flows are covered by component/router tests.

## Automated checks

Focused suites cover sign-out, event editor draft resolution, ordinary form guards, public mutation confirmation, report archive, and ending normal/SOS navigation. The production build has the existing large-chunk warning. Physical-device testing is not included.
