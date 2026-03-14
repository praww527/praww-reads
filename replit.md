# PRaww Reads

A literary community platform for readers and writers. Features include story sharing with chapter support, social interactions (likes, comments, follows), a book marketplace for buying/selling/swapping physical books, and user profiles.

## Architecture

**Full-stack application:**
- **Frontend**: React (Create React App + CRACO), Tailwind CSS, shadcn/ui components
- **Backend**: FastAPI (Python), MongoDB (via Motor async driver)
- **Auth**: JWT tokens stored in localStorage

Everything runs on a **single port (5000)**. FastAPI serves both the `/api/` routes and the React frontend static files. API calls use relative URLs (`/api/...`) so there are no CORS issues.

## Project Structure

```
backend/       - FastAPI server (server.py) with all API routes + static file serving
frontend/      - React application
  src/pages/   - Page components (Home, Marketplace, Write, StoryDetail, Profile, etc.)
  src/components/ - Reusable UI components
  src/hooks/   - AuthContext, use-toast
  src/lib/     - API utilities (api.js uses relative URLs)
  build/       - Production build served by FastAPI
memory/        - PRD.md and CHANGELOG.md
```

## Workflow

- **Start application**: `cd backend && uvicorn server:app --host 0.0.0.0 --port 5000 --reload` (port 5000, webview)

> After changing frontend code, run `cd frontend && CI=false npm run build` and restart the workflow.

## Environment

- **Backend**: `backend/.env` contains `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- **Frontend**: `frontend/.env` has `REACT_APP_BACKEND_URL=` (empty — uses relative paths)

## Security Features

- **Email verification on signup**: Registration is a two-step flow — user submits details, receives a 6-digit code by email (expires in 15 min), then enters the code to complete account creation. Codes stored in `pending_registrations` collection.
- **Username uniqueness**: Enforced at both registration (auto-suffix) and profile update (409 if taken).
- **Username change cooldown**: Users can only change their username once every 30 days. The `username_changed_at` field tracks this. The profile edit UI shows a lock icon with days remaining when locked.

## Key Files

- `backend/server.py` - All API routes, business logic, and static file serving
- `frontend/src/lib/api.js` - Fetch utility (relative URL base)
- `frontend/src/hooks/AuthContext.js` - Auth state management

## Database (MongoDB Atlas)

Collections: `users`, `stories`, `chapters`, `story_likes`, `story_favorites`, `story_progress`, `story_comments`, `comment_likes`, `books`, `messages`, `follows`, `book_favorites`, `story_views`

## Recent Features Added

- **Story view tracking**: Every visit to a story is tracked in `story_views` (unique per user/IP). View counts shown on story cards (Home) and story detail page.
- **Author avatars in stories**: Story detail shows author profile image next to their name. Comment avatars use real profile images when available.
- **Settings page** (`/settings`): Accessible from the user dropdown. Includes change password functionality and account info.
- **Change password endpoint**: `POST /api/auth/change-password` (requires current_password + new_password).
- **Duplicate email registration fix**: Handles "already exists" errors during verification/resend steps — shows login prompt instead of raw error.

## Build Instructions

After changing frontend code:
```bash
cd frontend && CI=false node_modules/.bin/craco build
```
Then restart the workflow.
