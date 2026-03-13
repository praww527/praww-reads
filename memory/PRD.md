# PRaww Reads — Product Requirements Document

## Original Problem Statement
Fix and extend "PRawwreads", a literary community platform, with the following requirements:
1. Reading progress bar on story reader pages only (not marketplace)
2. Image uploads compressed to <2MB
3. Profile page must work for logged-in users (critical bug)
4. Marketplace for physical books: buy, sell, message sellers
5. Remove likes/favorites from marketplace
6. Stories with chapter structure + favorites
7. Auto-generate user ID on registration
8. Email validation on registration
9. Full buy/sell/message system for marketplace

## Architecture

### Tech Stack (Rebuilt)
- **Frontend**: React (CRA), Tailwind CSS, Lucide React icons, date-fns
- **Backend**: FastAPI (Python), Motor (async MongoDB)
- **Database**: MongoDB (via MONGO_URL env var)
- **Auth**: HTTP-only cookies (`praww_token`) with JWT

### Directory Structure
```
/app/frontend/           # React CRA frontend
  src/
    App.js               # Routes for all pages
    lib/api.js           # apiFetch helper
    hooks/AuthContext.js # Auth context (login/register/logout)
    components/Navbar.js # Navigation bar
    pages/
      Login.js           # Login + Register forms
      Home.js            # Home page with stories
      StoryDetail.js     # Story reader with chapters/likes/comments/progress
      Write.js           # Story writing with chapters
      Marketplace.js     # Book listings (buy/sell)
      BookDetail.js      # Book detail + messaging
      Profile.js         # User profile + edit
      Favorites.js       # Saved stories
      Inbox.js           # Message inbox

/app/backend/
  server.py              # FastAPI backend (675 lines, all API routes)
  .env                   # MONGO_URL, DB_NAME, JWT_SECRET, CORS_ORIGINS
```

### MongoDB Collections
- `users`: id, email, password_hash, first_name, last_name, username, bio, profile_image_url
- `stories`: id, title, content, description, cover_image_url, author_id, created_at
- `chapters`: id, story_id, title, content, order_index
- `story_likes`: story_id, user_id (toggle, not increment)
- `story_favorites`: story_id, user_id
- `story_progress`: story_id, user_id, progress (%)
- `story_comments`: id, story_id, user_id, content, parent_id
- `comment_likes`: comment_id, user_id
- `books`: id, title, author, price, condition, allow_swap, swap_for, image_url, seller_id, is_sold
- `messages`: id, book_id, sender_id, receiver_id, content, is_read
- `follows`: follower_id, following_id
- `book_favorites`: book_id, user_id

## What's Been Implemented

### MVP (March 8, 2026) — Complete Rebuild
- [x] User registration with email validation, auto-generated username from email
- [x] Auto-generated UUID user ID shown in profile as #XXXXXXXX
- [x] Login/logout with HTTP-only cookie sessions
- [x] User profile page (FIXED - no more "Profile not found" bug)
- [x] Edit profile: name, bio, username, profile picture (compressed <2MB)
- [x] Follow/unfollow other users
- [x] Story creation with cover image upload (compressed <2MB)
- [x] Chapter-based story structure (optional)
- [x] Story reader with progress bar tracking
- [x] Story likes (toggle - click once to like, again to unlike)
- [x] Story favorites (save for later)
- [x] Story comments with nested replies
- [x] Home page with recent and trending stories
- [x] Marketplace for physical books
- [x] Sell books with photo, author, price, condition
- [x] "Mark as Sold" toggle for sellers
- [x] Buy Now button sends pre-filled message to seller
- [x] Direct messaging between buyers and sellers per book
- [x] Inbox with conversation threads
- [x] Favorites page for saved stories
- [x] All protected routes redirect to login

## API Endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/user
- GET /api/profile/me
- GET /api/profile/{user_id}
- PATCH /api/profile
- POST /api/follow/{user_id}
- DELETE /api/follow/{user_id}
- GET /api/stories
- GET /api/stories/trending
- GET /api/stories/favorites
- GET /api/stories/{id}
- POST /api/stories
- PATCH /api/stories/{id}
- DELETE /api/stories/{id}
- POST /api/stories/{id}/like (toggle)
- POST /api/stories/{id}/favorite (toggle)
- GET/POST /api/stories/{id}/progress
- GET/POST /api/stories/{id}/comments
- GET /api/books
- GET /api/books/{id}
- POST /api/books
- PATCH /api/books/{id}
- DELETE /api/books/{id}
- POST /api/books/{id}/sold (toggle)
- POST /api/messages
- GET /api/messages/book/{book_id}
- GET /api/messages/inbox

## P0/P1/P2 Remaining Backlog

### P0 (Critical)
- None currently known

### P1 (Important)
- Premium/Upgrade subscription system (button exists, no functionality)
- Email verification sending (requires email service like Resend/SendGrid)
- Search functionality (search stories and books)

### P2 (Nice to have)
- Story genres/tags/categories
- Author pages with biography
- Reading lists (collections of stories)
- Book reviews after purchase
- Swap request system for books
- Notifications system
- Admin panel for content moderation
