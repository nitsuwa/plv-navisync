# Event UI polish and submission summary

Scope: themed 12-hour scheduling, event card action hierarchy, compact history controls, and submission totals. Database storage and lifecycle commands remain unchanged; no migration required for this increment.

The custom time popover displays AM/PM and provides hour/minute buttons. It retains the existing HH:mm service contract, including midnight/noon conversion. Date and time fields stack on narrow viewports. My Events uses compact next-step guidance, one withdrawal action in the footer, an emphasized editor link, and hides unavailable detail/delete actions for pending/approved proposals. History has an icon button and concise edit timestamp. Admin creator identifiers are expandable and the duplicate preview action is removed.

Submission review now includes total maps, assets and labels, distinguishes blocking required fixes from advisory design hints, links to each location, and shows a submitting spinner. Footer stacks on mobile; dismissal is blocked while submitting.

Verification: five related suites passed (26 tests), including midnight/noon/PM display, canonical time callback, submission blocking, location navigation, history loading/failure, withdrawal and next-step guidance. Production build passed with the existing chunk-size warning. Final card/duplicate-link cleanup is additionally checked by the dashboard/modal suites. Browser visual and live end-to-end verification remain manual.

Manual checks:
1. Student Org → My Events: check Draft/Pending/Needs Revision cards and action hierarchy. Pending has a single withdrawal action and no detail/delete buttons.
2. Expand/collapse history, then withdraw using the confirmation dialog. Saved assets should remain in Draft.
3. Editor → Review & submit: verify totals across two locations; Review location returns to the selected map. Critical issues block submission; advisory hints do not.
4. Admin → Review submission: select dates, open time, choose hour/minute/AM/PM, then Done. Confirm 12 AM is midnight, 12 PM noon and 5 PM evening. Approval persists the correct Asia/Manila time.
5. Repeat at 390px width, desktop, dark mode and keyboard-only navigation. Check popover scrolling, visible actions and dialog footer.

No live backend write, deployment, commit or push performed for this increment.
