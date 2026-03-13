# PRaww Reads — Changelog

## March 8, 2026 — Complete Rebuild + Profile Fix

### Complete App Rebuild
- Rebuilt entire app on FastAPI (Python) + MongoDB + React CRA stack
- Previous Express.js/PostgreSQL setup had PostgreSQL not installed in environment
- Auth: JWT tokens stored in localStorage + Authorization header (reliable across all browsers)
- All data cleared of test/mockery posts

### Profile Page Fixed (Recurring Bug Resolved)
- Root cause: cookie-based auth was unreliable; switched to localStorage + Bearer token
- Profile now loads correctly immediately after login/register
- User ID (#XXXXXXXX short hash) displayed in profile

### Mockery Posts Removed
- All test data (stories, books, users) cleared from database

### Features Delivered
- User registration with email validation + auto-generated username
- User profile with edit (name, bio, username, profile picture <2MB)
- Stories with chapters, likes (toggle), favorites, comments, progress bar
- Marketplace: sell books, mark as sold, buyer-seller messaging
- Inbox for conversation threads
- Original design restored: Playfair Display, warm creamy background
