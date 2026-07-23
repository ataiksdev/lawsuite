# backend/app/services/email_service.py
import asyncio
import html as _html
import smtplib
import resend
from email.mime.text import MIMEText
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


def _smtp_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_user and settings.smtp_password)


def _is_configured() -> bool:
    return _smtp_configured() or bool(settings.resend_api_key)


def _send_via_smtp(*, to: str, subject: str, html: str) -> None:
    """Blocking SMTP send — call through asyncio.to_thread, never directly."""
    message = MIMEText(html, "html")
    message["Subject"] = subject
    message["From"] = f"{settings.emails_from_name} <{settings.emails_from_address or settings.smtp_user}>"
    message["To"] = to

    if settings.smtp_port == 465:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port) as server:
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)


def _send_via_resend(*, to: str, subject: str, html: str) -> None:
    resend.api_key = settings.resend_api_key
    resend.Emails.send(
        {
            "from": f"{settings.emails_from_name} <{settings.emails_from_address}>",
            "to": [to],
            "subject": subject,
            "html": html,
        }
    )


async def _send(*, to: str, subject: str, html: str) -> None:
    """Both the smtplib and Resend clients are sync-only — offload so the event loop isn't blocked.

    SMTP is preferred when configured (e.g. a Gmail App Password for local/dev
    testing); Resend is used otherwise. Switching providers later is just an
    env var change, no code change.
    """
    if _smtp_configured():
        await asyncio.to_thread(_send_via_smtp, to=to, subject=subject, html=html)
    else:
        await asyncio.to_thread(_send_via_resend, to=to, subject=subject, html=html)


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
        print(f"[EMAIL] No email backend configured — skipping invite email to {to}")
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
        print(f"[EMAIL] No email backend configured — skipping password reset email to {to}")
        print(f"[EMAIL] Reset URL: {reset_url}")
        return

    html = _render(
        "password_reset.html",
        name=name or to,
        reset_url=reset_url,
    )
    await _send(to=to, subject="Reset your LegalOps password", html=html)
    print(f"[EMAIL] Password reset sent to {to}")


# ---------------------------------------------------------------------------
# Matter update email
# ---------------------------------------------------------------------------

async def send_matter_update_email(
    *,
    to: str,
    name: str,
    matter_title: str,
    matter_ref: str,
    change_summary: str,
    matter_url: str,
) -> None:
    if not _is_configured():
        print(f"[EMAIL] No email backend configured — skipping matter update email to {to}")
        return

    html = _render(
        "matter_update.html",
        name=name or to,
        matter_title=matter_title,
        matter_ref=matter_ref,
        change_summary=change_summary,
        matter_url=matter_url,
    )
    await _send(to=to, subject=f"Matter updated: {matter_title}", html=html)
    print(f"[EMAIL] Matter update sent to {to}")


# ---------------------------------------------------------------------------
# Task assigned email
# ---------------------------------------------------------------------------

async def send_task_assigned_email(
    *,
    to: str,
    name: str,
    task_title: str,
    matter_title: str,
    matter_ref: str,
    priority: str,
    task_url: str,
) -> None:
    if not _is_configured():
        print(f"[EMAIL] No email backend configured — skipping task assigned email to {to}")
        return

    html = _render(
        "task_assigned.html",
        name=name or to,
        task_title=task_title,
        matter_title=matter_title,
        matter_ref=matter_ref,
        priority=priority.capitalize(),
        task_url=task_url,
    )
    await _send(to=to, subject=f"Task assigned to you: {task_title}", html=html)
    print(f"[EMAIL] Task assigned sent to {to}")


# ---------------------------------------------------------------------------
# Document shared email
# ---------------------------------------------------------------------------

async def send_document_shared_email(
    *,
    to: str,
    name: str,
    document_name: str,
    matter_title: str,
    matter_ref: str,
    uploaded_by_name: str,
    matter_url: str,
    version_label: str = "",
) -> None:
    if not _is_configured():
        print(f"[EMAIL] No email backend configured — skipping document shared email to {to}")
        return

    html = _render(
        "document_shared.html",
        name=name or to,
        document_name=document_name,
        matter_title=matter_title,
        matter_ref=matter_ref,
        uploaded_by_name=uploaded_by_name,
        matter_url=matter_url,
        version_label=version_label,
    )
    await _send(to=to, subject=f"New document: {document_name}", html=html)
    print(f"[EMAIL] Document shared sent to {to}")


# ---------------------------------------------------------------------------
# Task due soon email
# ---------------------------------------------------------------------------

async def send_task_due_soon_email(
    *,
    to: str,
    name: str,
    task_title: str,
    matter_title: str,
    matter_ref: str,
    due_date: str,
    priority: str,
    matter_url: str,
) -> None:
    if not _is_configured():
        print(f"[EMAIL] No email backend configured — skipping task due soon email to {to}")
        return

    html = _render(
        "task_due.html",
        assignee_name=name or to,
        task_title=task_title,
        matter_title=matter_title,
        matter_ref=matter_ref,
        due_date=due_date,
        priority=priority.capitalize(),
        matter_url=matter_url,
    )
    await _send(to=to, subject=f"Task due soon: {task_title}", html=html)
    print(f"[EMAIL] Task due soon sent to {to}")


# ---------------------------------------------------------------------------
# Calendar event due-soon email
# ---------------------------------------------------------------------------

async def send_calendar_event_due_email(
    *,
    to: str,
    name: str,
    event_title: str,
    matter_title: str,
    starts_at: str,
    calendar_url: str,
    location: str = "",
) -> None:
    if not _is_configured():
        print(f"[EMAIL] No email backend configured — skipping calendar event email to {to}")
        return

    location_line = (
        f'<p style="margin:0;font-size:13px;color:#7c5c47;">Location: <strong>{_html.escape(location)}</strong></p>'
        if location
        else ""
    )
    html = _load_template("calendar_event_due.html").format(
        recipient_name=_html.escape(name or to),
        event_title=_html.escape(event_title),
        matter_title=_html.escape(matter_title),
        starts_at=_html.escape(starts_at),
        location_line=location_line,
        calendar_url=_html.escape(calendar_url),
    )
    await _send(to=to, subject=f"Upcoming: {event_title}", html=html)
    print(f"[EMAIL] Calendar event reminder sent to {to}")


# ---------------------------------------------------------------------------
# Weekly digest email
# ---------------------------------------------------------------------------

def _digest_section(title: str, tasks: list[dict]) -> str:
    """
    Build a pre-escaped HTML fragment for one digest section. Each task
    field is escaped individually before assembly — the fragment as a
    whole is then passed through _load_template(...).format() directly
    (never _render, which would re-escape and mangle the markup).
    """
    if not tasks:
        return ""

    rows = "".join(
        f"""
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e8d5c4;">
            <p style="margin:0 0 4px;font-size:14px;font-weight:bold;color:#3b1f0e;">{_html.escape(str(t['title']))}</p>
            <p style="margin:0;font-size:12px;color:#7c5c47;">{_html.escape(str(t['matter_title']))} &nbsp;·&nbsp; Ref: {_html.escape(str(t['matter_reference_no']))} &nbsp;·&nbsp; Due: {_html.escape(str(t['due_date']))}</p>
          </td>
        </tr>"""
        for t in tasks
    )

    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f5;border:1px solid #e8d5c4;border-radius:6px;margin-bottom:20px;">
      <tr>
        <td style="padding:16px 20px 4px;">
          <p style="margin:0;font-size:13px;font-weight:bold;color:#7c3a1e;text-transform:uppercase;letter-spacing:0.5px;">{_html.escape(title)} ({len(tasks)})</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 20px 12px;">
          <table width="100%" cellpadding="0" cellspacing="0">{rows}</table>
        </td>
      </tr>
    </table>"""


async def send_weekly_digest_email(
    *,
    to: str,
    name: str,
    overdue: list[dict],
    due_soon: list[dict],
    tasks_url: str,
) -> None:
    if not _is_configured():
        print(f"[EMAIL] No email backend configured — skipping weekly digest email to {to}")
        return

    html = _load_template("weekly_digest.html").format(
        name=_html.escape(name or to),
        overdue_section=_digest_section("Overdue", overdue),
        due_soon_section=_digest_section("Due this week", due_soon),
        tasks_url=_html.escape(tasks_url),
    )
    await _send(to=to, subject="Your weekly task digest", html=html)
    print(f"[EMAIL] Weekly digest sent to {to}")
