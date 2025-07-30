# VBallStatApp

VBallStatApp is a volleyball match statistics tracking and analysis application. It provides tools for managing match data, analyzing video footage, and storing synchronized stats in a Supabase backend.

## Features

- **Video-Linked Statistics** – Connects in-game stats to specific video timestamps for precise playback and review.
- **Custom Video Player** – Includes rally-based navigation, zoom/pan, overlays, score tracking, and auto-skip to highlights.
- **Dynamic Filtering & Sorting** – Filter and sort plays by player, action type, result, and more — instantly reflected in the video feed.
- **Editable Stats Table** – Admins can edit stats inline with automatic recalculations for scores and possessions.
- **Team & Game Management** – Supports multiple teams and games, with persistent local settings and easy switching.
- **Statistical Summaries** – Provides aggregated stats, assist tracking, and outcome analysis by player, action, and result.
- **Column Customization** – Toggle visibility for stat fields and sub-metrics to focus on what matters most.
- **Secure Editing** – Token-based login for secure stat editing and saving.

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
