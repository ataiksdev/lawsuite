import re
import os
from playwright.sync_api import sync_playwright

def debug_sidebar():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Login
        page.goto("http://localhost:3000/login")
        page.get_by_label("Email address").fill("emeka@okafor.ng")
        page.get_by_label("Password").fill("DemoPass123")
        page.get_by_role("button", name="Sign in").click()
        
        # Wait for dashboard
        page.wait_for_url("http://localhost:3000/")
        
        # Take a screenshot
        page.screenshot(path="dashboard_screenshot.png")
        
        # Print all buttons
        buttons = page.get_by_role("button").all()
        print(f"Found {len(buttons)} buttons:")
        for b in buttons:
            print(f" - {b.get_attribute('aria-label') or b.inner_text()}")
            
        browser.close()

if __name__ == "__main__":
    debug_sidebar()
