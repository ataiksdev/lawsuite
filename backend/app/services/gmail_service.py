# backend/app/services/gmail_service.py
import base64
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import HTTPException, status
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


class GmailService:
    """
    Wraps the Gmail API (gmail.googleapis.com/gmail/v1).

    Used for:
      - Fetching thread metadata (subject, snippet) when linking to a matter
      - Sending report emails to the consultant
      - Reading the inbox for potential matter-link suggestions (Phase 8)

    Requires scopes:
      https://www.googleapis.com/auth/gmail.readonly
      https://www.googleapis.com/auth/gmail.send
    """

    def __init__(self, credentials: Credentials):
        self.credentials = credentials
        self._client = None

    @property
    def client(self):
        if not self._client:
            self._client = build("gmail", "v1", credentials=self.credentials)
        return self._client

    # ── Thread operations ─────────────────────────────────────────────────

    async def get_thread(self, thread_id: str) -> dict:
        """
        Fetch metadata for a Gmail thread by its ID.
        Returns a normalised dict with subject, snippet, message count,
        and the first sender.
        """
        try:
            thread = (
                self.client.users()
                .threads()
                .get(
                    userId="me",
                    id=thread_id,
                    format="metadata",
                    metadataHeaders=["Subject", "From", "Date"],
                )
                .execute()
            )
        except HttpError as e:
            if e.resp.status == 404:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Gmail thread {thread_id} not found",
                )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gmail API error: {e.reason}",
            )

        messages = thread.get("messages", [])
        subject = None
        sender = None
        date = None

        if messages:
            headers = messages[0].get("payload", {}).get("headers", [])
            header_map = {h["name"]: h["value"] for h in headers}
            subject = header_map.get("Subject")
            sender = header_map.get("From")
            date = header_map.get("Date")

        return {
            "thread_id": thread_id,
            "subject": subject or "(no subject)",
            "snippet": thread.get("snippet", ""),
            "message_count": len(messages),
            "sender": sender,
            "date": date,
        }

    async def list_recent_threads(self, max_results: int = 20) -> list[dict]:
        """
        List the most recent threads in the inbox.
        Used to surface threads the consultant can link to a matter.
        """
        try:
            result = (
                self.client.users()
                .threads()
                .list(
                    userId="me",
                    maxResults=max_results,
                    labelIds=["INBOX"],
                )
                .execute()
            )
        except HttpError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gmail API error listing threads: {e.reason}",
            )

        threads = result.get("threads", [])
        enriched = []
        for t in threads:
            try:
                enriched.append(await self.get_thread(t["id"]))
            except HTTPException:
                continue  # Skip threads we can't read
        return enriched

    async def search_threads(self, query: str, max_results: int = 10) -> list[dict]:
        """
        Search Gmail threads using Gmail's query syntax.
        e.g. query="from:client@acme.ng subject:contract"
        """
        try:
            result = (
                self.client.users()
                .threads()
                .list(
                    userId="me",
                    q=query,
                    maxResults=max_results,
                )
                .execute()
            )
        except HttpError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gmail API error searching threads: {e.reason}",
            )

        threads = result.get("threads", [])
        enriched = []
        for t in threads:
            try:
                enriched.append(await self.get_thread(t["id"]))
            except HTTPException:
                continue
        return enriched

    # ── Send email ────────────────────────────────────────────────────────

    async def send_email(
        self,
        to: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
    ) -> dict:
        """
        Send an email from the authenticated user's Gmail account.
        Used by the report generator to deliver periodic reports.
        """
        message = MIMEMultipart("alternative")
        message["to"] = to
        message["subject"] = subject

        if body_text:
            message.attach(MIMEText(body_text, "plain"))
        message.attach(MIMEText(body_html, "html"))

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

        try:
            sent = self.client.users().messages().send(userId="me", body={"raw": raw}).execute()
            return {"message_id": sent.get("id"), "thread_id": sent.get("threadId")}
        except HttpError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to send email: {e.reason}",
            )

    async def send_report_email(
        self,
        recipient: str,
        report_title: str,
        doc_url: str,
        period: str,
    ) -> dict:
        """
        Convenience wrapper for sending a periodic report notification email.
        Called by the Celery beat task in Phase 9.
        """
        subject = f"LegalOps Report: {report_title} — {period}"
        body_html = f"""
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a18;">Your LegalOps Activity Report is Ready</h2>
          <p>Your <strong>{period}</strong> activity report has been generated.</p>
          <p>
            <a href="{doc_url}"
               style="background: #1D9E75; color: white; padding: 10px 20px;
                      text-decoration: none; border-radius: 6px; display: inline-block;">
              View Report in Google Docs
            </a>
          </p>
          <p style="color: #888; font-size: 13px; margin-top: 24px;">
            LegalOps — {report_title}
          </p>
        </div>
        """
        body_text = f"Your {period} LegalOps activity report is ready.\n\n" f"View it here: {doc_url}"
        return await self.send_email(
            to=recipient,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
        )
