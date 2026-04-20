import pytest
import re
from playwright.sync_api import Page, expect

@pytest.fixture
def login_user(page: Page, base_url: str):
    """Fixture to log in a demo user before each test."""
    page.goto("/")
    
    # If already logged in (e.g. session persistence), we might not see the login page
    # But usually for tests we start fresh.
    
    if page.url.endswith("/login") or "Login" in page.title() or page.locator("#login-email").is_visible():
        page.fill("#login-email", "emeka@okafor.ng")
        page.fill("#login-password", "DemoPass123")
        page.click('button[type="submit"]')
        
        # Wait for navigation to complete
        expect(page).not_to_have_url(re.compile(r".*/login$"))
    
    return page
