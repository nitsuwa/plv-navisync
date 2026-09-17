
  # Build PLV NaviSync App

  This is a code bundle for Build PLV NaviSync App. The original project is available at https://www.figma.com/design/JKsrOJBLNqkdNSv3u8702j/Build-PLV-NaviSync-App.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

## Theming note (dynamic branding + dark mode)

- **Light mode** — the brand colors (`--app-primary`, `--app-accent`, `--app-background`) come from Firestore as raw values and are applied verbatim.
- **Dark mode** — the primary color is automatically lightened (hue-preserving, via `src/lib/color.ts`) so brand-colored text/icons always hold **≥ 4.5:1** contrast against dark backgrounds. Colors that already pass are left untouched.
- **Admin settings** still shows the raw, original color — only the live CSS variable gets the dark-mode adjustment.
  