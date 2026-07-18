# backend/app/services/email_service.py
import asyncio
import html as _html
import resend
from pathlib import Path

from app.core.config import settings

# ---------------------------------------------------------------------------
# Template loader
# ---------------------------------------------------------------------------

_TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "email"


def _load_template(name: str) -> str:
    return (_TEMPLATES_DIR / name).read_text(encoding="utf-8")


def _render(template_name: str, **kwargs) -> str:
    """
    Load a template and interpolate it, HTML-escaping every value first.
    Use this (never _load_template(...).format(...) directly) for anything
    containing user-controlled strings (names, task titles, etc.) — a value
    that's already a safe, pre-rendered HTML fragment should be passed
    through _load_template(...).format(...) directly instead, with each of
    its own inputs escaped individually before assembly.
    """
    safe_kwargs = {k: (_html.escape(str(v)) if v is not None else "") for k, v in kwargs.items()}
    return _load_template(template_name).format(**safe_kwargs)


def _is_configured() -> bool:
    return bool(settings.resend_api_key)


async def _send(*, to: str, subject: str, html: str) -> None:
    """Resend's Python SDK is sync-only — offload it so it doesn't block the event loop."""
    resend.api_key = settings.resend_api_key
    await asyncio.to_thread(
        resend.Emails.send,
        {
            "from": f"{settings.emails_from_name} <{settings.emails_from_address}>",
            "to": [to],
            "subject": subject,
            "html": html,
        },
    )


# ---------------------------------------------------------------------------
# Invite email
# ---------------------------------------------------------------------------

async def send_invite_email(
    *,
    to: str,
    name: str,
    invited_by: str,
    role: str,
    invite_url: str,
) -> None:
    if not _is_configured():
        print(f"[EMAIL] Resend not configured — skipping invite email to {to}")
        print(f"[EMAIL] Invite URL: {invite_url}")
        return

    html = _render(
        "invite.html",
        name=name or to,
        invited_by=invited_by,
        role=role.capitalize(),
        invite_url=invite_url,
    )
    await _send(to=to, subject="You've been invited to LegalOps", html=html)
    print(f"[EMAIL] Invite sent to {to}")


# ---------------------------------------------------------------------------
# Password reset email
# ---------------------------------------------------------------------------

async def send_password_reset_email(
    *,
    to: str,
    name: str,
    reset_url: str,
) -> None:
    if not _is_configured():
        print(f"[EMAIL] Resend not configured — skipping password reset email to {to}")
        print(f"[EMAIL] Reset URL: {reset_url}")
        return

    html = _render(
        "password_reset.html",
        name=name or to,
        reset_url=reset_url,
    )
    await _send(to=to, subject="Reset your LegalOps password", html=html)
    print(f"[EMAIL] Password reset sent to {to}")
