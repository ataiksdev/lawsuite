import pytest
import re
from playwright.sync_api import Page, expect

def test_create_client(login_user: Page):
    """Verify that a new client can be created."""
    page = login_user
    
    # 1. Navigate to Clients page via Sidebar
    # Using exact=False to be more resilient to icons/formatting
    page.get_by_role("button", name="Clients", exact=False).click()
    expect(page).to_have_url(re.compile(r".*/clients$"))
    
    # 2. Click 'Add Client' button
    page.get_by_role("button", name="Add Client").click()
    
    # 3. Fill the form
    client_name = f"Acme Corp E2E {re.sub(r'[^0-9]', '', str(re.findall(r'\d+', str(re.search(r'\d+', '12345').group(0)))[0]))}" # Add some randomness
    client_name = f"Acme Corp E2E Test"
    page.get_by_label("Name").fill(client_name)
    page.get_by_label("Email").fill("e2e@acme.com")
    page.get_by_label("Phone").fill("+234 812 345 6789")
    
    # 4. Submit
    page.get_by_role("button", name="Create Client").click()
    
    # 5. Verify success
    page.wait_for_url(re.compile(r".*/clients$"))
    expect(page.get_by_text(client_name)).to_be_visible()

def test_view_client_details(login_user: Page):
    """Verify that we can view a client's detail page."""
    page = login_user
    page.get_by_role("button", name="Clients", exact=False).click()
    
    # Click on the first client in the list
    # Assuming clients are in a table or list
    first_client = page.locator("table tbody tr").first
    first_client.wait_for(state="visible")
    first_client.click()
    
    # Should navigate to details
    expect(page).to_have_url(re.compile(r".*/clients/[a-f0-9-]+$"))
