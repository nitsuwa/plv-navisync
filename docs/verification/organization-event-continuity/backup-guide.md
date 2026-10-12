# Backup bago ang Organization Event Continuity migration

Para ito sa Windows computer at kasalukuyang Supabase project. Ikaw ang magra-run ng backup; walang live migration na ginagawa ng guide o backup script.

Sakop: application table data, database definitions/access rules, custom roles, event poster policies/metadata, at hiwalay na poster files. Hindi ito isang kumpletong Supabase project clone: managed Auth/Storage definitions at platform settings may need separate recovery work. Actual Storage file bytes are not included in a database dump.

May mahalagang dagdag sa naunang three-command guide: hiwalay nating ise-save ang custom Storage poster policies. Supabase's default schema dump excludes managed schemas including Storage, and its restore guide calls out separate handling for managed-schema customizations. [CLI reference](https://supabase.com/docs/reference/cli/supabase-db-dump), [managed-schema restore notes](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore#schema-changes-to-auth-and-storage)

## 1. Pumili ng oras para sa backup

Huwag muna mag-create/edit/review ng events, upload/delete ng posters, o mag-run ng ibang schema query habang kinukuha ang backup at before-record snapshot. Magkahiwalay na commands ang exports; huwag hayaang magbago ang source sa pagitan nila. Hindi kailangang alisin ang existing records.

## 2. Install at buksan ang Docker Desktop

Gamitin ang [official Windows installation guide](https://docs.docker.com/desktop/setup/install/windows-install/). Sundin ang setup prompts at restart kung hinihingi. Buksan ang Docker Desktop at hintaying running ang engine.

Sa PowerShell, i-check:

```powershell
node --version
pnpm --version
docker version
```

Dapat available ang Node 20 or newer, pnpm, at parehong Docker Client/Server. Kung walang Server o may engine error, ayusin muna ang Docker startup. [Supabase CLI requirements](https://supabase.com/docs/guides/local-development/cli/getting-started)

## 3. Kunin ang tamang connection URI

Sa mismong Supabase project ng app, click **Connect**. Piliin ang **URI** at **Session pooler** connection. Ang Session pooler normally uses port **5432**; huwag piliin ang Transaction pooler na 6543 para sa guide na ito.

Copy ang URI na may literal `[YOUR-PASSWORD]` placeholder. Iwan muna ang placeholder; hiwalay at hidden ang password prompt ng script. Ang database password ang kailangan, hindi ang demo-admin/app-login password o public API key. Kung hindi mo alam ang database password, stop dito bago mag-reset; a reset can affect existing database clients.

Supabase recommends the Session pooler URI by default for this backup procedure. [Official backup steps](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

## 4. Run ang prepared backup script

Sa normal PowerShell window, paste:

```powershell
& 'C:\Users\Rj\Documents\GitHub\plv-navisync\docs\verification\organization-event-continuity\backup-event-database.ps1'
```

May dalawang prompts:

1. Paste ang Session pooler URI na may `[YOUR-PASSWORD]` pa, then Enter.
2. Enter ang database password sa hidden prompt, then Enter. Normal na walang readable password sa screen.

The script encodes the password for the URI, exports roles/schema/data with `pnpm dlx supabase db dump`, stops on any failed command, and checks that all three files exist and are nonempty. Supabase's CLI dump runs through Docker. [Backup command reference](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

Walang migration, restore, o SQL data mutation sa script. It makes a new folder under your Documents, outside the repository:

```text
Supabase-Backups\event-before-continuity-YYYYMMDD-HHMMSS\
```

Output:

- `roles.sql`
- `schema.sql`
- `data.sql`
- `dump-checksums.csv`

If PowerShell blocks the local script, send only the policy error; do not disable security settings as a workaround. If any export fails, its folder is incomplete. Do not proceed to installation.

## 5. Save ang before-record snapshot at custom poster policies

Open `backup-preflight-and-storage.sql` from this directory. Copy the complete SELECT into a **new** Supabase SQL Editor query, in the same project, and click Run.

Read-only ito. May isang result row named `backup_json`, including dependency results, protected event records/counts, the three original poster policies, poster bucket settings and object inventory. The `restoreSql` field is captured text; the SELECT does not execute it.

Export/download the result as CSV into the new backup folder, named:

```text
before-records-and-poster-policies.csv
```

Kung walang CSV export control na makita, copy the complete raw value of `backup_json` into a plain UTF-8 text file named `before-records-and-poster-policies.json` instead. Do not save a cropped screenshot or truncated cell preview as the backup.

Sa captured JSON dapat:

- `preflightReady`: `true`
- `storagePolicyCaptureReady`: `true`
- `missingPosterPolicies`: `[]`
- `posterPolicies`: all three expected entries

If any dependency or policy is missing, stop and report that result. Do not silently treat the backup as complete.

## 6. Save ang actual event poster images

Sa Supabase **Storage → event_posters**, open the folders and download the files. Sa backup folder, create `event_posters` and keep the original subfolder/file names. Use `posterObjects` in the captured JSON as the checklist: every listed path should have a corresponding downloaded file. Zero poster objects means an empty folder is expected.

Do not delete/move source Storage files while downloading. Database dumps and bucket metadata do not contain the image bytes. [Storage backup limitation](https://supabase.com/docs/guides/platform/backups)

## 7. Check at itago ang backup package

Expected folder contents:

```text
roles.sql
schema.sql
data.sql
dump-checksums.csv
before-records-and-poster-policies.csv  (or .json)
event_posters\...                     (all listed files, if any)
```

Sa `schema.sql`, search for `guard_event_overlay_review`, `review_event_layout`, `manage_event_publication`, `event_layout_revisions`, and `event_notification_receipts`. Sa `data.sql`, confirm that the exports include `map_elements`, `event_layout_revisions`, and `event_notification_receipts`. A missing expected definition/table means the backup needs review, even if the command returned success.

Keep the package private and make a second copy on your own protected drive/storage. These files can contain account and event information. Do not put them in this Git repository or a public bucket. Credentials and full backup contents do not need to be posted in chat.

## 8. Verify recovery before declaring the backup restore-ready

Successful exports, file sizes, and checksums establish that files were produced; they do not establish successful recovery. The prepared SELECT/policy reconstruction has been tested against disposable PostgreSQL fixtures; the live dump has not been restored.

Give the local backup folder path and sanitized command result so the actual dump can be reviewed and restoration checked in a separate local/disposable environment. Do not run a test restore over the live Supabase project. Restoring custom roles, managed-schema policies, and dependencies requires review; applying an entire old schema over new organization bindings would be an unsafe rollback.

Keep `apply-continuity.sql` on hold until the backup/recovery review and before-record checks are complete. There is no automatic migration step in this guide.
