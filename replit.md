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

## Monetization System

### Writer Wallet
- Each user document includes `wallet_balance` and `total_earnings` fields (default 0.0)
- Platform takes **30%** commission; writer receives **70%** of every donation/sale

### Donations
- Readers can donate R5, R10, R20, or R50 to any story they don't own
- `POST /api/stories/{id}/donate` — immediately credits writer wallet and stores in `donations` collection

### Paid Stories
- Writers can mark stories as paid (isPaid + price) when publishing via Write page
- `POST /api/stories/{id}/purchase` — creates a record in `story_purchases` and credits writer
- `GET /api/stories/{id}/purchase-status` — checks if current user has purchased

### Earnings Dashboard (`/earnings`)
- Shows wallet balance, total earnings, donations received, story sales
- Withdrawal requests when balance ≥ R100 (`POST /api/wallet/withdraw`)
- History of donations, sales, and withdrawals

### Guest User System
- Unauthenticated users see trending stories, story titles, cover images, likes, and read counts
- Clicking a story shows first ~600 chars with "Create a free account to continue reading" wall
- Cannot read full stories, donate, unlock paid stories, comment, follow, or write
- Guest CTA prompts on home page and story page

## Database (MongoDB Atlas)

Collections: `users`, `stories`, `chapters`, `story_likes`, `story_favorites`, `story_progress`, `story_comments`, `comment_likes`, `books`, `messages`, `follows`, `book_favorites`, `story_views`, `donations`, `story_purchases`, `withdrawals`, `platform_revenue`

### Story Fields Added
- `is_paid` (bool), `price` (float), `total_donations` (float), `total_sales` (int)

### User Fields Added
- `wallet_balance` (float), `total_earnings` (float)

## Render.com Deployment

A `render.yaml` file is included at the root of the project. To deploy:

1. Push the repo to GitHub/GitLab
2. Create a new account or log in at [render.com](https://render.com)
3. Click **New > Blueprint** and connect your repository
4. Render will detect `render.yaml` automatically
5. Set the **MONGO_URL** secret in the Render dashboard (Environment > Secret Files or Environment Variables)
6. Deploy — `DB_NAME` defaults to `prawwreads` and `JWT_SECRET` is auto-generated

The build command installs Python dependencies. The pre-built React frontend (in `frontend/build/`) is served directly by FastAPI, so no Node.js build step is needed on Render.

> **Important**: Render's free tier spins down after inactivity. Upgrading to a paid plan keeps the server always-on.

## Recent Features Added

- **Story view tracking**: Every visit to a story is tracked in `story_views` (unique per user/IP). View counts shown on story cards (Home) and story detail page.
- **Author avatars in stories**: Story detail shows author profile image next to their name. Comment avatars use real profile images when available.
- **Settings page** (`/settings`): Accessible from the user dropdown. Includes change password functionality and account info.
- **Change password endpoint**: `POST /api/auth/change-password` (requires current_password + new_password).
- **Duplicate email registration fix**: Handles "already exists" errors during verification/resend steps — shows login prompt instead of raw error.

## Build Instructions

After changing frontend code, ensure node_modules are installed first then build:
```bash
cd frontend && npm install && CI=false node_modules/.bin/craco build
```
Then restart the workflow.

## Bug Fixes Applied (March 2026 — Round 2)

- **Verification code expiry**: Changed ALL verification code expiry from 60 seconds to **10 minutes** across all flows (registration, email change, phone verify, password change, password reset). Updated all email templates to show "10 minutes".
- **Verification resend countdown**: Registration page now shows a **90-second countdown timer** on the "Resend code" button to prevent code flooding. Button is disabled during cooldown with a live countdown display.
- **AI detection threshold raised to 80**: Content scoring 80+ is now a hard block (was 75). The `likely_ai` verdict threshold in the backend and the `isHardBlock` logic in the frontend both use 80. Scores 40–79 show a warning but allow publishing.
- **PayFast name field bug fixed**: `current_user.get("name")` doesn't exist — replaced with `first_name + last_name` in both donation and purchase initiation endpoints.
- **Rate limiting added to verification code endpoints**: `request-email-change`, `request-phone-verify`, and `request-password-change-code` now have per-user rate limits (3 per 10 min) to prevent code flooding.
- **Rate limiting on AI check endpoint**: Limited to 20 AI checks per user per 10 minutes.
- **Content length validation added**: Story titles (200 chars), descriptions (2000 chars), content (500,000 chars), chapter titles (200 chars), chapter content (500,000 chars), and comments (2000 chars) are all validated server-side.
- **Paid story price validation**: Backend enforces minimum R5 and maximum R9999 price for paid stories.

## Bug Fixes Applied (March 2026)

- **Settings page crash**: Fixed null-reference crash on `phoneStatus.days_left` when phone status hadn't loaded yet (now uses optional chaining `phoneStatus?.days_left`)
- **Route ordering bug**: Moved `/api/profile/username-status` route before the `/api/profile/{user_id}` catch-all route in `server.py` — previously FastAPI was treating "username-status" as a user ID
- **Verification code expiry**: Changed from 60 seconds to 10 minutes across all email verification flows (registration, email change, phone verify, password change, password reset) — 60 seconds was too short for email delivery
- **Deployment build command**: Updated to `npm install && CI=false node_modules/.bin/craco build` to ensure dependencies are installed before building
- **httpx missing**: Backend crashed on startup because `httpx` (needed for PayFast ITN validation) was not installed. Added to requirements.txt and installed.
- **APP_URL stale fallback**: PayFast return/notify URLs used a hardcoded old Replit domain. Now computed dynamically from `REPLIT_DEV_DOMAIN` env var (or `APP_URL` env var if set for production).
