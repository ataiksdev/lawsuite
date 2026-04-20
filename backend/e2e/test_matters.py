import pytest
import re
from playwright.sync_api import Page, expect

def test_create_matter(login_user: Page):
    """Verify that a new legal matter can be created."""
    page = login_user
    
    # 1. Navigate to Matters
    page.get_by_role("button", name="Matters", exact=False).click()
    
    # 2. Click New Matter
    page.get_by_role("button", name="New Matter").click()
    
    # 3. Fill details
    matter_title = "E2E Test Matter - Property Dispute"
    page.get_by_label("Title").fill(matter_title)
    
    # Select a client
    page.get_by_text("Select client").click()
    # Pick the first option from the dropdown
    page.get_by_role("option").first.click()
    
    # Select matter type
    page.get_by_text("Select type").click()
    page.get_by_role("option", name="Litigation").click()
    
    # 4. Save
    page.get_by_role("button", name="Create Matter").click()
    
    # 5. Verify
    expect(page.get_by_text(matter_title)).to_be_visible()

def test_matter_search(login_user: Page):
    """Verify the global search functionality."""
    page = login_user
    
    # 1. Open search palette by clicking the search button
    page.get_by_role("button", name="Search", exact=False).click()
    
    # 2. Fill search input (placeholder matches actual UI text)
    search_input = page.get_by_placeholder("Search matters, clients", exact=False)
    search_input.fill("Zenith")
    
    # 3. Check if results appear
    expect(page.get_by_text("Zenith bank", exact=False)).to_be_visible()
