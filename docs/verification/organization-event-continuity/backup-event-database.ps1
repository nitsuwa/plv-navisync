# User-run, read-only database exports. Never applies migrations or restores data.
$ErrorActionPreference = 'Stop'
$locationChanged = $false
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Install and open Docker Desktop first.'
    }
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw 'pnpm is unavailable in this PowerShell window.'
    }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop must be running before backup.' }

    $backupTemplate = Read-Host 'Paste Session pooler URI with [YOUR-PASSWORD] still present'
    if ($backupTemplate -notmatch '^postgres(ql)?://' -or -not $backupTemplate.Contains('[YOUR-PASSWORD]')) {
        throw 'Copy the URI from Connect > Session pooler and leave [YOUR-PASSWORD] in it.'
    }
    $backupSecret = Read-Host 'Database password (input is hidden)' -AsSecureString
    $backupPassword = [System.Net.NetworkCredential]::new('', $backupSecret).Password
    if ([string]::IsNullOrEmpty($backupPassword)) { throw 'A database password is required.' }
    $backupConnection = $backupTemplate.Replace('[YOUR-PASSWORD]', [Uri]::EscapeDataString($backupPassword))

    $backupParent = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Supabase-Backups'
    $backupDirectory = Join-Path $backupParent ('event-before-continuity-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backupDirectory -ErrorAction Stop | Out-Null
    Push-Location -LiteralPath $backupDirectory
    $locationChanged = $true

    pnpm dlx supabase db dump --db-url "$backupConnection" -f roles.sql --role-only
    if ($LASTEXITCODE -ne 0) { throw 'Roles export failed. The backup is incomplete.' }
    pnpm dlx supabase db dump --db-url "$backupConnection" -f schema.sql
    if ($LASTEXITCODE -ne 0) { throw 'Schema export failed. The backup is incomplete.' }
    pnpm dlx supabase db dump --db-url "$backupConnection" -f data.sql --data-only --use-copy -x 'storage.buckets_vectors' -x 'storage.vector_indexes'
    if ($LASTEXITCODE -ne 0) { throw 'Data export failed. The backup is incomplete.' }

    foreach ($backupFile in @('roles.sql', 'schema.sql', 'data.sql')) {
        if (-not (Test-Path -LiteralPath $backupFile) -or (Get-Item -LiteralPath $backupFile).Length -eq 0) {
            throw "Missing or empty export: $backupFile. The backup is incomplete."
        }
    }
    Get-FileHash -LiteralPath roles.sql, schema.sql, data.sql -Algorithm SHA256 |
        Select-Object @{Name='File';Expression={Split-Path -Leaf $_.Path}}, Hash |
        Export-Csv -LiteralPath 'dump-checksums.csv' -NoTypeInformation -Encoding UTF8
    Write-Host 'Three database dumps completed. This is not a completed recovery test.'
    Write-Host 'Next: save backup-preflight-and-storage.sql results and poster files in this folder.'
    Write-Host "Backup folder: $backupDirectory"
} finally {
    if ($locationChanged) { Pop-Location }
    Remove-Variable backupConnection, backupPassword, backupSecret, backupTemplate -ErrorAction SilentlyContinue
}
