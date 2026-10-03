# Student Org Demo Login and Mobile My Events Design

## Goal

Make the Student Org demonstration account easy to select from the login form
and remove the duplicate event-creation action while preserving a clear,
usable mobile layout.

## Scope

- Keep the empty-state `Create event` action centered in `StudentMyEventsPage`.
- Remove the duplicate header-level `New event` action from that page.
- Keep the empty-state action usable at narrow mobile widths without horizontal
  overflow or collision with the mobile bottom navigation.
- Present a `Demo Student Org` option in the existing demonstration-account
  selector when demo login is enabled and the org credentials exist in the
  ignored `.env.local` file.
- Use `DEMOSTUDENTORG@plv.edu.ph` and `DEMOSTUDENTORG` as the local demo
  account values supplied by the developer.

## Design and data flow

The login page already builds its selector from `DEMO_ACCOUNTS`, so the change
will reuse that list rather than add a separate hardcoded button. The local
`.env.local` file will contain:

```ini
VITE_ENABLE_DEMO_LOGIN=true
VITE_DEMO_ORG_STUDENT_EMAIL=DEMOSTUDENTORG@plv.edu.ph
VITE_DEMO_ORG_STUDENT_PASSWORD=DEMOSTUDENTORG
```

The existing Supabase sign-in path remains unchanged: selecting the option
only fills the email and password fields, and the user still presses `Sign In`.
The account must already exist in Supabase with the same password.

The My Events page will expose one creation entry point when there are no
proposals: the centered empty-state button. The button will retain its current
visual hierarchy and receive mobile-safe sizing/alignment only if needed by the
existing layout.

## Error handling and safety

- The demo option remains hidden unless `VITE_ENABLE_DEMO_LOGIN` is exactly
  `true` and both org credential values are non-empty.
- No production auth, role checks, or Supabase verification behavior will be
  bypassed.
- `.env.local` is already ignored by Git; no credential values will be added
  to tracked source files.

## Testing

- Add a focused page test proving the Student Org empty state renders exactly
  one event-creation button and does not render the removed header button.
- Keep the existing demo-account configuration tests and cover the requested
  credentials through the same pure configuration helper.
- Run the focused tests, the full Vitest suite, and the production build.

