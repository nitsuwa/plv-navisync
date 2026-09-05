# Preview Run Doc — Booking System

## Project
- **Location:** `C:\Users\Rj\Documents\GitHub\booking-system` (sibling of this workspace)
- **Framework:** Vite + React + TypeScript + Tailwind CSS
- **Package manager:** npm

## How to reproduce artifacts
1. Dependencies should already be installed (`node_modules` exists). If not:
   ```
   cd C:\Users\Rj\Documents\GitHub\booking-system && npm install
   ```
2. No `.env` copy needed — `.env` already exists in the project with Firebase config.

## How to start the dev server
From the booking-system directory, run Vite dev on port 5199:

```powershell
cd C:\Users\Rj\Documents\GitHub\booking-system
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev','--','--port','5199' -RedirectStandardOutput '<log>' -RedirectStandardError '<log>.err' -WindowStyle Hidden -PassThru).Id"
```

- Server URL: `http://localhost:5199/`
- Port: 5199 (default Vite port, free)
- Log: see `.freebuff/preview-*.log`
