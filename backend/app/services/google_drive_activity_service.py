# backend/app/services/google_drive_activity_service.py
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


class GoogleDriveActivityService:
    """
    Wraps the Drive Activity API (driveactivity.googleapis.com/v2).

    This is a SEPARATE API from the Drive API.
    It requires the scope: https://www.googleapis.com/auth/drive.activity.readonly

    Used exclusively by the Celery task that processes webhook events —
    the webhook itself only gives us a file_id; this API gives us who
    changed it and how.
    """

    def __init__(self, credentials: Credentials):
        self.credentials = credentials
        self._client = None

    @property
    def client(self):
        if not self._client:
            # NOTE: build() with driveactivity requires google-api-python-client
            self._client = build("driveactivity", "v2", credentials=self.credentials)
        return self._client

    async def get_file_activity(self, file_id: str) -> list[dict]:
        """
        Fetch the most recent activity events for a Drive file.

        Returns a list of activity records, each shaped like:
        {
            "editor_name":   "Chidi Okeke",
            "editor_email":  "chidi@firm.ng",
            "change_type":   "edit" | "comment" | "rename" | "move" | "permission_change",
            "timestamp":     "2025-06-15T14:32:00Z",
        }

        Drive Activity API docs:
        https://developers.google.com/drive/activity/v2/reference/rest/v2/activity/query
        """
        try:
            response = (
                self.client.activity()
                .query(
                    body={
                        "itemName": f"items/{file_id}",
                        "pageSize": 10,  # most recent 10 events
                    }
                )
                .execute()
            )
        except HttpError:
            # Non-fatal — webhook processing should continue even if
            # activity fetch fails (e.g. permission error on the file)
            return []

        activities = response.get("activities", [])
        return [_parse_activity(a) for a in activities if _parse_activity(a)]

    async def get_latest_activity(self, file_id: str) -> dict | None:
        """Return just the single most recent activity event, or None."""
        events = await self.get_file_activity(file_id)
        return events[0] if events else None


def _parse_activity(activity: dict) -> dict | None:
    """
    Normalise a raw Drive Activity API response record into a flat dict.

    The Activity API response is deeply nested — this flattens it into
    the shape the activity log payload expects.
    """
    try:
        # Actor — who made the change
        actors = activity.get("actors", [])
        editor_name = None
        editor_email = None

        if actors:
            actor = actors[0]
            known_user = actor.get("user", {}).get("knownUser", {})
            # personName is a People API resource name e.g. "people/1234"
            # In practice the display name comes from the drive file metadata
            # The email is more reliable for our activity log
            editor_name = known_user.get("personName", "Unknown user")
            # isCurrentUser flag is available but email requires a People API call
            # For now store the personName resource — can be resolved later
            if actor.get("user", {}).get("unknownUser"):
                editor_name = "Unknown user"

        # Action — what type of change
        actions = activity.get("actions", [])
        change_type = "unknown"

        if actions:
            detail = actions[0].get("detail", {})
            if "edit" in detail:
                change_type = "edit"
            elif "comment" in detail:
                change_type = "comment"
            elif "rename" in detail:
                change_type = "rename"
            elif "move" in detail:
                change_type = "move"
            elif "permissionChange" in detail:
                change_type = "permission_change"
            elif "create" in detail:
                change_type = "create"
            elif "delete" in detail:
                change_type = "delete"

        # Timestamp
        timestamp = activity.get("timestamp") or activity.get("timeRange", {}).get("endTime")

        return {
            "editor_name": editor_name,
            "editor_email": editor_email,
            "change_type": change_type,
            "timestamp": timestamp,
        }

    except Exception:
        return None
