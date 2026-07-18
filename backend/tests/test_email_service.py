# backend/tests/api/test_email_service.py
"""
Direct unit tests for email_service.py — bypasses the HTTP layer entirely
since these are internal helpers, not routes. `mock_resend` (autouse in
conftest.py) patches resend.Emails.send, so these never hit the network.
"""
import pytest

from app.services import email_service


@pytest.mark.asyncio
async def test_render_escapes_html_in_interpolated_values():
    html = email_service._render(
        "invite.html",
        name="<script>alert(1)</script>",
        invited_by="Normal Name",
        role="Admin",
        invite_url="https://example.com/invite?token=abc",
    )
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html


@pytest.mark.asyncio
async def test_send_invite_email_escapes_malicious_inviter_name(mock_resend):
    await email_service.send_invite_email(
        to="victim@example.com",
        name="Victim",
        invited_by="<img src=x onerror=alert(1)>",
        role="member",
        invite_url="https://example.com/invite?token=abc",
    )

    assert mock_resend.called
    sent_html = mock_resend.call_args[0][0]["html"]
    assert "<img src=x onerror=alert(1)>" not in sent_html
    assert "&lt;img src=x onerror=alert(1)&gt;" in sent_html


@pytest.mark.asyncio
async def test_send_functions_are_awaitable_and_do_not_block(mock_resend):
    """
    Regression check for the sync-call-inside-async-def bug: _send is now
    `async def` and offloads the actual Resend call via asyncio.to_thread.
    """
    import inspect

    assert inspect.iscoroutinefunction(email_service._send)

    await email_service.send_password_reset_email(
        to="user@example.com",
        name="User",
        reset_url="https://example.com/reset?token=xyz",
    )
    assert mock_resend.called
