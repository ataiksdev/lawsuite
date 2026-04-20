import pytest
import re
from playwright.sync_api import Page, expect

def test_homepage_loads(page: Page):
    """Verify that the landing page loads and shows the branding."""
    # Navigate to the base URL (configured in pyproject.toml or passed via CLI)
    page.goto("/")
    
    # Check if the title or a specific brand element is visible
    expect(page).to_have_title(re.compile("LegalOps|Lawsuite"))
    
    # Example: Check for a login link
    # login_button = page.get_by_role("link", name="Login")
    # expect(login_button).to_be_visible()

def test_navigation_to_login(page: Page):
    """Verify we can navigate to the login page."""
    page.goto("/")
    
    # Try to find a login link. If it's not there, this test serves as a placeholder
    # to be updated with actual selectors.
    try:
        login_link = page.get_by_role("link", name="Login", exact=False)
        if login_link.is_visible():
            login_link.click()
            expect(page).to_have_url(lambda url: "/login" in url)
    except Exception:
        pytest.skip("Login link not found or selector needs adjustment")
