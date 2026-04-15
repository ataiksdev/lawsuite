# backend/app/services/notification_service.py
"""
Notification service — creates and delivers in-app notifications.

Architecture:
  - Notifications are written to the `notifications` DB table.
  - The frontend polls GET /notifications (or streams via SSE at /notifications/stream).
  - Watcher fan-out is triggered by the task_service / comment system.
  - The SSE stream sends a lightweight "ping" event whenever the user
    has new unread notifications; the frontend then fetches the full list.
"""
import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.task_watcher import TaskWatcher


class NotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Create ────────────────────────────────────────────────────────────

    async def create(
        self,
        user_id: uuid.UUID,
        org_id: uuid.UUID,
        type: str,
        title: str,
        message: str,
        link: str | None = None,
    ) -> Notification:
        notif = Notification(
            user_id=user_id,
            organisation_id=org_id,
            type=type,
            title=title,
            message=message,
            link=link,
        )
        self.db.add(notif)
        await self.db.flush()
        return notif

    async def fan_out_to_watchers(
        self,
        task_id: uuid.UUID,
        org_id: uuid.UUID,
        actor_id: uuid.UUID,
        type: str,
        title: str,
        message: str,
        link: str | None = None,
    ) -> int:
        """
        Send a notification to all watchers of a task, except the actor who
        triggered the event (they don't need to be notified of their own action).
        Returns the number of notifications created.
        """
        result = await self.db.execute(
            select(TaskWatcher).where(
                TaskWatcher.task_id == task_id,
                TaskWatcher.organisation_id == org_id,
                TaskWatcher.user_id != actor_id,
            )
        )
        watchers = result.scalars().all()

        count = 0
        for watcher in watchers:
            await self.create(
                user_id=watcher.user_id,
                org_id=org_id,
                type=type,
                title=title,
                message=message,
                link=link,
            )
            count += 1

        if count:
            await self.db.flush()

        return count

    async def fan_out_to_org_admins(
        self,
        org_id: uuid.UUID,
        actor_id: uuid.UUID,
        type: str,
        title: str,
        message: str,
        link: str | None = None,
    ) -> int:
        """
        Send a notification to all admin members of an org, excluding the actor.
        Used for org-wide events like billing changes.
        """
        result = await self.db.execute(
            select(OrganisationMember).where(
                OrganisationMember.organisation_id == org_id,
                OrganisationMember.role == UserRole.admin,
                OrganisationMember.user_id != actor_id,
            )
        )
        admins = result.scalars().all()

        count = 0
        for admin in admins:
            await self.create(
                user_id=admin.user_id,
                org_id=org_id,
                type=type,
                title=title,
                message=message,
                link=link,
            )
            count += 1

        if count:
            await self.db.flush()

        return count

    # ── Read ──────────────────────────────────────────────────────────────

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        org_id: uuid.UUID,
        unread_only: bool = False,
        limit: int = 50,
    ) -> list[Notification]:
        query = select(Notification).where(
            Notification.user_id == user_id,
            Notification.organisation_id == org_id,
        )
        if unread_only:
            query = query.where(Notification.is_read == False)
        query = query.order_by(Notification.created_at.desc()).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def unread_count(self, user_id: uuid.UUID, org_id: uuid.UUID) -> int:
        from sqlalchemy import func
        result = await self.db.execute(
            select(func.count()).where(
                Notification.user_id == user_id,
                Notification.organisation_id == org_id,
                Notification.is_read == False,
            )
        )
        return result.scalar_one()

    # ── Mark read ─────────────────────────────────────────────────────────

    async def mark_read(
        self,
        notification_id: uuid.UUID,
        user_id: uuid.UUID,
        org_id: uuid.UUID,
    ) -> Notification | None:
        result = await self.db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
                Notification.organisation_id == org_id,
            )
        )
        notif = result.scalar_one_or_none()
        if notif:
            notif.is_read = True
            await self.db.commit()
        return notif

    async def mark_all_read(self, user_id: uuid.UUID, org_id: uuid.UUID) -> int:
        result = await self.db.execute(
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.organisation_id == org_id,
                Notification.is_read == False,
            )
            .values(is_read=True)
        )
        await self.db.commit()
        return result.rowcount
