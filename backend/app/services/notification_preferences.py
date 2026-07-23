# backend/app/services/notification_preferences.py
"""
Per-user email notification preferences.

Stored as a JSONB blob on User.notification_email_preferences (None until the
user has ever changed anything). Only known keys are ever read back — an
unrecognised key in the stored dict (e.g. left over from a removed
preference) is silently ignored rather than surfaced.
"""
from app.models.user import User

DEFAULT_EMAIL_PREFERENCES: dict[str, bool] = {
    "matter_updates": True,
    "task_assigned": True,
    "task_due_soon": True,
    "calendar_event_due": True,
    "document_shared": True,
    "weekly_digest": False,
    "marketing_emails": False,
}


def get_all_preferences(user: User) -> dict[str, bool]:
    """Merge the user's stored overrides over the defaults."""
    stored = user.notification_email_preferences or {}
    return {
        **DEFAULT_EMAIL_PREFERENCES,
        **{k: v for k, v in stored.items() if k in DEFAULT_EMAIL_PREFERENCES},
    }


def should_send(user: User, key: str) -> bool:
    return get_all_preferences(user).get(key, DEFAULT_EMAIL_PREFERENCES.get(key, False))


def merge_preferences(existing: dict | None, updates: dict[str, bool | None]) -> dict:
    """Shallow-merge a partial update into the stored dict, ignoring unset (None) fields."""
    merged = dict(existing or {})
    merged.update({k: v for k, v in updates.items() if v is not None})
    return merged
