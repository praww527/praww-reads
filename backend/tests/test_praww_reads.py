"""
PRaww Reads - Comprehensive Backend API Tests
Tests: Auth, Profile, Stories, Marketplace, Messaging, Inbox
"""
import pytest
import requests
import os
import time
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

TEST_EMAIL = "test@praww.com"
TEST_PASSWORD = "password123"
NEW_TEST_EMAIL = f"tester_test_{int(time.time())}@praww.com"
NEW_TEST_PASSWORD = "password456"

# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def session():
    """Requests session - no auth"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s

@pytest.fixture(scope="module")
def auth_session():
    """Authenticated session for test@praww.com"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    resp = s.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    if resp.status_code != 200:
        pytest.skip(f"Auth failed for {TEST_EMAIL}: {resp.text}")
    return s

@pytest.fixture(scope="module")
def auth_session2():
    """Authenticated session for tester2@praww.com (created fresh)"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Register fresh user
    resp = s.post(f"{BASE_URL}/api/auth/register", json={
        "email": NEW_TEST_EMAIL, "password": NEW_TEST_PASSWORD,
        "first_name": "Test", "last_name": "User2"
    })
    if resp.status_code not in (200, 409):
        pytest.skip(f"Could not create test user 2: {resp.text}")
    # Login if already exists
    if resp.status_code == 409:
        resp = s.post(f"{BASE_URL}/api/auth/login", json={"email": NEW_TEST_EMAIL, "password": NEW_TEST_PASSWORD})
        if resp.status_code != 200:
            pytest.skip("Could not login as test user 2")
    return s

# ── Health Check ─────────────────────────────────────────────────────────────

class TestHealth:
    """Health check tests"""

    def test_api_root(self, session):
        """API root should return 200"""
        resp = session.get(f"{BASE_URL}/api/")
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        print(f"API root: {data}")

# ── Authentication ────────────────────────────────────────────────────────────

class TestAuth:
    """Authentication endpoint tests"""

    def test_register_new_user(self, session):
        """Register a brand new user"""
        unique_email = f"register_test_{int(time.time())}@praww.com"
        resp = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "test1234",
            "first_name": "Register",
            "last_name": "Test"
        })
        assert resp.status_code == 200, f"Register failed: {resp.text}"
        data = resp.json()
        # Verify auto-generated username from email
        assert "username" in data, "Username should be auto-generated"
        assert "id" in data, "User ID should be present"
        assert data["email"] == unique_email
        assert "password_hash" not in data, "Password hash should not be exposed"
        print(f"Registered user with username: {data['username']}, id: {data['id']}")

    def test_register_duplicate_email(self, session):
        """Registering same email should return 409"""
        resp = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_EMAIL, "password": "newpass123"
        })
        assert resp.status_code == 409, f"Expected 409, got {resp.status_code}"

    def test_login_success(self, session):
        """Login with valid credentials"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL, "password": TEST_PASSWORD
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        data = resp.json()
        assert data["email"] == TEST_EMAIL
        assert "id" in data
        assert "password_hash" not in data
        # Check cookie is set
        assert "praww_token" in s.cookies, f"praww_token cookie not set. Cookies: {dict(s.cookies)}"
        print(f"Login success, cookie set: {bool(s.cookies.get('praww_token'))}")

    def test_login_wrong_password(self, session):
        """Wrong password should return 401"""
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL, "password": "wrongpassword"
        })
        assert resp.status_code == 401

    def test_get_current_user(self, auth_session):
        """Authenticated user should get their info"""
        resp = auth_session.get(f"{BASE_URL}/api/auth/user")
        assert resp.status_code == 200, f"Get user failed: {resp.text}"
        data = resp.json()
        assert data["email"] == TEST_EMAIL
        assert "password_hash" not in data
        print(f"Current user: {data.get('username')} (id: {data.get('id')})")

    def test_get_user_unauthenticated(self):
        """Unauthenticated user should get 401 (fresh session with no cookies)"""
        fresh = requests.Session()
        fresh.headers.update({"Content-Type": "application/json"})
        resp = fresh.get(f"{BASE_URL}/api/auth/user")
        assert resp.status_code == 401

    def test_logout(self):
        """Logout should clear cookie"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        # Login first
        s.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        assert "praww_token" in s.cookies
        # Logout
        resp = s.post(f"{BASE_URL}/api/auth/logout")
        assert resp.status_code == 200
        # Verify user endpoint returns 401
        resp2 = s.get(f"{BASE_URL}/api/auth/user")
        assert resp2.status_code == 401

# ── Profile ───────────────────────────────────────────────────────────────────

class TestProfile:
    """Profile endpoint tests"""

    def test_get_my_profile(self, auth_session):
        """Get own profile via /profile/me"""
        resp = auth_session.get(f"{BASE_URL}/api/profile/me")
        assert resp.status_code == 200, f"Get my profile failed: {resp.text}"
        data = resp.json()
        assert data["email"] == TEST_EMAIL
        assert "id" in data
        assert "stories" in data
        assert "follower_count" in data
        assert "following_count" in data
        assert "password_hash" not in data
        # Check short user ID format
        short_id = f"#{data['id'][:8].upper()}"
        print(f"Profile loaded. User ID: {data['id']}, Short ID: {short_id}")

    def test_get_profile_by_id(self, auth_session):
        """Get profile by user ID"""
        # First get own profile to get ID
        me_resp = auth_session.get(f"{BASE_URL}/api/profile/me")
        user_id = me_resp.json()["id"]
        
        resp = auth_session.get(f"{BASE_URL}/api/profile/{user_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == user_id

    def test_get_nonexistent_profile(self, session):
        """Non-existent profile returns 404"""
        resp = session.get(f"{BASE_URL}/api/profile/nonexistent-id-12345")
        assert resp.status_code == 404

    def test_update_profile(self, auth_session):
        """Update profile bio and name"""
        new_bio = f"Test bio updated at {int(time.time())}"
        resp = auth_session.patch(f"{BASE_URL}/api/profile", json={
            "bio": new_bio,
            "first_name": "TestFirst",
            "last_name": "TestLast"
        })
        assert resp.status_code == 200, f"Update profile failed: {resp.text}"
        data = resp.json()
        assert data["bio"] == new_bio
        assert data["first_name"] == "TestFirst"
        
        # Verify persistence with GET
        get_resp = auth_session.get(f"{BASE_URL}/api/profile/me")
        assert get_resp.status_code == 200
        assert get_resp.json()["bio"] == new_bio
        print(f"Profile updated: bio='{new_bio}'")

# ── Stories ───────────────────────────────────────────────────────────────────

class TestStories:
    """Story CRUD and interaction tests"""
    
    created_story_id = None

    def test_list_stories(self, session):
        """List stories - no auth required"""
        resp = session.get(f"{BASE_URL}/api/stories")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"Stories count: {len(data)}")

    def test_create_story(self, auth_session):
        """Create a new story"""
        resp = auth_session.post(f"{BASE_URL}/api/stories", json={
            "title": "TEST_Story Playwright Test",
            "content": "This is a test story content for automated testing. " * 10,
            "description": "A test story description"
        })
        assert resp.status_code == 200, f"Create story failed: {resp.text}"
        data = resp.json()
        assert data["title"] == "TEST_Story Playwright Test"
        assert "id" in data
        assert "author_id" in data
        TestStories.created_story_id = data["id"]
        print(f"Created story ID: {data['id']}")

    def test_get_story(self, session):
        """Get story by ID"""
        assert TestStories.created_story_id, "No story created yet"
        resp = session.get(f"{BASE_URL}/api/stories/{TestStories.created_story_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == TestStories.created_story_id
        assert "like_count" in data
        assert "author_name" in data

    def test_like_toggle(self, auth_session):
        """Like toggle - like then unlike"""
        assert TestStories.created_story_id
        story_id = TestStories.created_story_id
        
        # First like
        resp1 = auth_session.post(f"{BASE_URL}/api/stories/{story_id}/like")
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1["liked"] == True
        count_after_like = data1["count"]
        
        # Second like (toggle off)
        resp2 = auth_session.post(f"{BASE_URL}/api/stories/{story_id}/like")
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["liked"] == False
        count_after_unlike = data2["count"]
        
        # Count should be lower after unlike
        assert count_after_unlike < count_after_like or count_after_unlike == 0
        print(f"Like toggle: liked={count_after_like}, unliked={count_after_unlike}")

    def test_favorite_toggle(self, auth_session):
        """Favorite toggle"""
        assert TestStories.created_story_id
        story_id = TestStories.created_story_id
        
        # Favorite
        resp1 = auth_session.post(f"{BASE_URL}/api/stories/{story_id}/favorite")
        assert resp1.status_code == 200
        assert resp1.json()["favorited"] == True
        
        # Unfavorite
        resp2 = auth_session.post(f"{BASE_URL}/api/stories/{story_id}/favorite")
        assert resp2.status_code == 200
        assert resp2.json()["favorited"] == False
        print("Favorite toggle works correctly")

    def test_comment_on_story(self, auth_session):
        """Add comment to story"""
        assert TestStories.created_story_id
        resp = auth_session.post(
            f"{BASE_URL}/api/stories/{TestStories.created_story_id}/comments",
            json={"content": "TEST_Comment - this is a test comment"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["content"] == "TEST_Comment - this is a test comment"
        assert "id" in data
        assert "author_name" in data

    def test_story_progress(self, auth_session):
        """Update and get story progress"""
        assert TestStories.created_story_id
        story_id = TestStories.created_story_id
        
        # Update progress
        resp = auth_session.post(
            f"{BASE_URL}/api/stories/{story_id}/progress",
            json={"progress": 50}
        )
        assert resp.status_code == 200
        assert resp.json()["progress"] == 50
        
        # Get progress
        get_resp = auth_session.get(f"{BASE_URL}/api/stories/{story_id}/progress")
        assert get_resp.status_code == 200
        assert get_resp.json()["progress"] == 50

    def test_create_chapter(self, auth_session):
        """Create chapter for story"""
        assert TestStories.created_story_id
        resp = auth_session.post(
            f"{BASE_URL}/api/stories/{TestStories.created_story_id}/chapters",
            json={"title": "Chapter 1 - The Beginning", "content": "Chapter content here...", "order_index": 0}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Chapter 1 - The Beginning"
        assert "id" in data

    def test_delete_story(self, auth_session):
        """Delete created test story"""
        assert TestStories.created_story_id
        resp = auth_session.delete(f"{BASE_URL}/api/stories/{TestStories.created_story_id}")
        assert resp.status_code == 200
        
        # Verify deleted
        get_resp = auth_session.get(f"{BASE_URL}/api/stories/{TestStories.created_story_id}")
        assert get_resp.status_code == 404
        print("Story deleted and verified 404")

# ── Marketplace / Books ──────────────────────────────────────────────────────

class TestMarketplace:
    """Book marketplace tests"""
    
    created_book_id = None

    def test_list_books(self, session):
        """List books - no auth needed"""
        resp = session.get(f"{BASE_URL}/api/books")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        print(f"Books count: {len(resp.json())}")

    def test_create_book(self, auth_session):
        """Create a book listing"""
        resp = auth_session.post(f"{BASE_URL}/api/books", json={
            "title": "TEST_Book: Python Automation Testing",
            "author": "Test Author",
            "price": 150.00,
            "condition": "good",
            "allow_swap": False
        })
        assert resp.status_code == 200, f"Create book failed: {resp.text}"
        data = resp.json()
        assert data["title"] == "TEST_Book: Python Automation Testing"
        assert data["price"] == 150.00
        assert data["is_sold"] == False
        assert "id" in data
        TestMarketplace.created_book_id = data["id"]
        print(f"Created book ID: {data['id']}")

    def test_get_book(self, session):
        """Get book by ID"""
        assert TestMarketplace.created_book_id
        resp = session.get(f"{BASE_URL}/api/books/{TestMarketplace.created_book_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == TestMarketplace.created_book_id
        assert "seller_name" in data

    def test_mark_book_sold(self, auth_session):
        """Mark book as sold - toggle"""
        assert TestMarketplace.created_book_id
        book_id = TestMarketplace.created_book_id
        
        # Mark as sold
        resp = auth_session.post(f"{BASE_URL}/api/books/{book_id}/sold")
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_sold"] == True, f"Expected is_sold=True, got {data['is_sold']}"
        print(f"Book marked as sold: {data['is_sold']}")
        
        # Toggle back
        resp2 = auth_session.post(f"{BASE_URL}/api/books/{book_id}/sold")
        assert resp2.status_code == 200
        assert resp2.json()["is_sold"] == False

    def test_update_book(self, auth_session):
        """Update book listing"""
        assert TestMarketplace.created_book_id
        resp = auth_session.patch(f"{BASE_URL}/api/books/{TestMarketplace.created_book_id}", json={
            "price": 200.00,
            "condition": "new"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["price"] == 200.00
        assert data["condition"] == "new"

    def test_delete_book(self, auth_session):
        """Delete book listing"""
        assert TestMarketplace.created_book_id
        resp = auth_session.delete(f"{BASE_URL}/api/books/{TestMarketplace.created_book_id}")
        assert resp.status_code == 200
        
        # Verify deleted
        get_resp = auth_session.get(f"{BASE_URL}/api/books/{TestMarketplace.created_book_id}")
        assert get_resp.status_code == 404

# ── Messaging ─────────────────────────────────────────────────────────────────

class TestMessaging:
    """Messaging endpoint tests"""
    
    book_id_for_msg = None
    seller_user_id = None

    def test_setup_book_for_messaging(self, auth_session):
        """Create a book to test messaging"""
        resp = auth_session.post(f"{BASE_URL}/api/books", json={
            "title": "TEST_Book for Messaging",
            "price": 100.00,
            "condition": "good"
        })
        assert resp.status_code == 200
        TestMessaging.book_id_for_msg = resp.json()["id"]
        # Get seller ID
        me_resp = auth_session.get(f"{BASE_URL}/api/auth/user")
        TestMessaging.seller_user_id = me_resp.json()["id"]
        print(f"Messaging test book: {TestMessaging.book_id_for_msg}, seller: {TestMessaging.seller_user_id}")

    def test_send_message_as_buyer(self, auth_session2):
        """Buyer sends message to seller"""
        assert TestMessaging.book_id_for_msg
        assert TestMessaging.seller_user_id
        
        resp = auth_session2.post(f"{BASE_URL}/api/messages", json={
            "book_id": TestMessaging.book_id_for_msg,
            "receiver_id": TestMessaging.seller_user_id,
            "content": "TEST_Message: Is this book still available?"
        })
        assert resp.status_code == 200, f"Send message failed: {resp.text}"
        data = resp.json()
        assert data["content"] == "TEST_Message: Is this book still available?"
        assert data["book_id"] == TestMessaging.book_id_for_msg
        print(f"Message sent: {data['id']}")

    def test_get_book_messages(self, auth_session):
        """Seller gets messages for book"""
        assert TestMessaging.book_id_for_msg
        resp = auth_session.get(f"{BASE_URL}/api/messages/book/{TestMessaging.book_id_for_msg}")
        assert resp.status_code == 200
        msgs = resp.json()
        assert isinstance(msgs, list)
        assert len(msgs) > 0, "No messages found"
        assert "sender_name" in msgs[0]
        print(f"Messages for book: {len(msgs)}")

    def test_inbox(self, auth_session2):
        """Buyer inbox shows conversation threads"""
        resp = auth_session2.get(f"{BASE_URL}/api/messages/inbox")
        assert resp.status_code == 200
        threads = resp.json()
        assert isinstance(threads, list)
        assert len(threads) > 0, "No inbox threads found"
        thread = threads[0]
        assert "book_title" in thread
        assert "other_user_name" in thread
        assert "last_message" in thread
        print(f"Inbox threads: {len(threads)}, first: book='{thread['book_title']}'")

    def test_inbox_unauthorized(self):
        """Inbox requires auth (fresh session with no cookies)"""
        fresh = requests.Session()
        fresh.headers.update({"Content-Type": "application/json"})
        resp = fresh.get(f"{BASE_URL}/api/messages/inbox")
        assert resp.status_code == 401

    def test_cleanup_messaging_book(self, auth_session):
        """Cleanup the test book"""
        if TestMessaging.book_id_for_msg:
            auth_session.delete(f"{BASE_URL}/api/books/{TestMessaging.book_id_for_msg}")

# ── Follow ────────────────────────────────────────────────────────────────────

class TestFollow:
    """Follow/unfollow tests"""

    def test_follow_user(self, auth_session, auth_session2):
        """User 1 follows User 2"""
        # Get user 2 ID
        me2 = auth_session2.get(f"{BASE_URL}/api/auth/user").json()
        user2_id = me2["id"]
        
        resp = auth_session.post(f"{BASE_URL}/api/follow/{user2_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["following"] == True
        assert "follower_count" in data
        print(f"Following user2. Follower count: {data['follower_count']}")

    def test_unfollow_user(self, auth_session, auth_session2):
        """User 1 unfollows User 2"""
        me2 = auth_session2.get(f"{BASE_URL}/api/auth/user").json()
        user2_id = me2["id"]
        
        resp = auth_session.delete(f"{BASE_URL}/api/follow/{user2_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["following"] == False

    def test_cannot_follow_self(self, auth_session):
        """User cannot follow themselves"""
        me = auth_session.get(f"{BASE_URL}/api/auth/user").json()
        resp = auth_session.post(f"{BASE_URL}/api/follow/{me['id']}")
        assert resp.status_code == 400
