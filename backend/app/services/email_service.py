# backend/app/services/email_service.py
import resend
from pathlib import Path

from app.core.config import settings

# ---------------------------------------------------------------------------
# Template loader
# ---------------------------------------------------------------------------

_TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "email"


def _load_template(name: str) -> str:
    return (_TEMPLATES_DIR / name).read_text(encoding="utf-8")


def _is_configured() -> bool:
    return bool(settings.resend_api_key)


def _send(*, to: str, subject: str, html: str) -> None:
    """Synchronous Resend send — Resend's Python SDK is sync-only."""
    resend.api_key = settings.resend_api_key
    resend.Emails.send({
        "from": f"{settings.emails_from_name} <{settings.emails_from_address}>",
        "to": [to],
        "subject": subject,
        "html": html,
    })


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

    html = _load_template("invite.html").format(
        name=name or to,
        invited_by=invited_by,
        role=role.capitalize(),
        invite_url=invite_url,
    )
    _send(to=to, subject="You've been invited to LegalOps", html=html)
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

    html = _load_template("password_reset.html").format(
        name=name or to,
        reset_url=reset_url,
    )
    _send(to=to, subject="Reset your LegalOps password", html=html)
    print(f"[EMAIL] Password reset sent to {to}")
