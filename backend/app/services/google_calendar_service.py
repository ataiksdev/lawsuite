from datetime import timedelta, timezone

from fastapi import HTTPException, status
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.models.calendar_event import CalendarEvent
from app.models.matter import Matter


class GoogleCalendarService:
    def __init__(self, credentials: Credentials):
        self.credentials = credentials
        self._client = None

    @property
    def client(self):
        if not self._client:
            self._client = build("calendar", "v3", credentials=self.credentials)
        return self._client

    def _serialize_event(self, event: CalendarEvent, matter: Matter) -> dict:
        description_parts = [f"Matter: {matter.reference_no} - {matter.title}"]
        if event.description:
            description_parts.append(event.description)

        payload: dict[str, object] = {
            "summary": event.title,
            "description": "\n\n".join(description_parts),
            "location": event.location or None,
        }

        if event.all_day:
            start_date = event.starts_at.date().isoformat()
            end_source = event.ends_at or (event.starts_at + timedelta(days=1))
            end_date = end_source.date().isoformat()
            if end_date <= start_date:
                end_date = (event.starts_at + timedelta(days=1)).date().isoformat()
            payload["start"] = {"date": start_date}
            payload["end"] = {"date": end_date}
        else:
            start_value = event.starts_at
            end_value = event.ends_at or (event.starts_at + timedelta(hours=1))
            if start_value.tzinfo is None:
                start_value = start_value.replace(tzinfo=timezone.utc)
            if end_value.tzinfo is None:
                end_value = end_value.replace(tzinfo=timezone.utc)
            payload["start"] = {"dateTime": start_value.isoformat()}
            payload["end"] = {"dateTime": end_value.isoformat()}
        return payload

    async def push_event(self, event: CalendarEvent, matter: Matter) -> dict:
        body = self._serialize_event(event, matter)
        try:
            if event.google_event_id:
                result = (
                    self.client.events()
                    .update(calendarId="primary", eventId=event.google_event_id, body=body)
                    .execute()
                )
            else:
                result = self.client.events().insert(calendarId="primary", body=body).execute()
        except HttpError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Google Calendar API error: {exc.reason}",
            )
        return {"id": result.get("id"), "htmlLink": result.get("htmlLink")}

    async def delete_remote_event(self, google_event_id: str) -> None:
        try:
            self.client.events().delete(calendarId="primary", eventId=google_event_id).execute()
        except HttpError as exc:
            if getattr(exc.resp, "status", None) == 404:
                return
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Google Calendar API error: {exc.reason}",
            )
