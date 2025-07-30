# VBallStatApp

VBallStatApp is a volleyball match statistics tracking and analysis application. It provides tools for managing match data, analyzing video footage, and storing synchronized stats in a Supabase backend.

## Features

- Match Stats Aggregation: Combines stats from multiple sets into a single game timeline.
- Video Sync Support: Associates stats with video timestamps for easy review.
- Supabase Integration: Uses Supabase for database storage and querying.
- Vite + Tailwind + React: Fast frontend stack with live development and flexible UI styling.
- Docker Support: Ships with a docker-compose.yml and Dockerfile for containerized dev environments.

## Project Structure

```
VBallStatApp_dev/
├── frontend/              # React frontend with Vite
│   ├── cert/              # Local HTTPS certs (ignored)
│   ├── public/            # Static assets
│   ├── src/               # React source code
│   ├── videos/            # Video files (ignored)
│   ├── .env               # Environment vars (ignored)
│   └── Dockerfile         # Frontend container build
├── supabase/              # Supabase CLI project folder
├── node_modules/          # Dependencies (ignored)
├── supabase.exe           # CLI binary (ignored)
├── combineSets.js         # Tool to merge match stats across sets
├── docker-compose.yml     # Docker orchestration
├── push_to_prod.sh        # Production deployment helper
└── VBallAppNotes.txt      # Development notes
```

## Sensitive Files (excluded via .gitignore)

- `.env` — Supabase keys
- `cert/` — HTTPS certs
- `videos/` — Large media files
- `node_modules/` — Local dependencies
- `supabase.exe` — Binary

## Purpose

This repository is publicly available for personal archival and demonstration purposes only. It is not intended for external use, support, or contributions.

## Author

Created and maintained by Stephen McKeon
