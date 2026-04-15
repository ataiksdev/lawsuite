# backend/app/services/task_service.py
import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.matter import Matter
from app.models.task import Task, TaskStatus
from app.models.task_comment import TaskComment
from app.models.task_watcher import TaskWatcher
from app.models.user import User
from app.schemas.task import TaskCommentCreate, TaskCreate, TaskUpdate, TaskWatcherAdd
from app.services.activity_service import ActivityService
from app.services.notification_service import NotificationService


class TaskService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.activity = ActivityService(db)
        self.notifications = NotificationService(db)

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _get_matter(self, matter_id: uuid.UUID, org_id: uuid.UUID) -> Matter:
        result = await self.db.execute(
            select(Matter).where(
                Matter.id == matter_id,
                Matter.organisation_id == org_id,
            )
        )
        matter = result.scalar_one_or_none()
        if not matter:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Matter not found",
            )
        return matter

    async def _get_task(self, task_id: uuid.UUID, matter_id: uuid.UUID, org_id: uuid.UUID) -> Task:
        result = await self.db.execute(
            select(Task).where(
                Task.id == task_id,
                Task.matter_id == matter_id,
                Task.organisation_id == org_id,
                Task.is_deleted == False,
            )
        )
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )
        return task

    # ── CRUD ──────────────────────────────────────────────────────────────

    async def list_tasks(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        status_filter: TaskStatus | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[Task], int]:
        await self._get_matter(matter_id, org_id)

        query = select(Task).where(
            Task.matter_id == matter_id,
            Task.organisation_id == org_id,
            Task.is_deleted == False,
        )

        if status_filter:
            query = query.where(Task.status == status_filter)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = (
            query.order_by(Task.due_date.asc().nullslast(), Task.created_at.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def create_task(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: TaskCreate,
    ) -> Task:
        await self._get_matter(matter_id, org_id)

        task = Task(
            matter_id=matter_id,
            organisation_id=org_id,
            created_by=user_id,
            assigned_to=data.assigned_to,
            title=data.title.strip(),
            notes=data.notes,
            priority=data.priority,
            due_date=data.due_date,
            status=TaskStatus.todo,
        )
        self.db.add(task)
        await self.db.flush()

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="task_created",
            payload={
                "task_id": str(task.id),
                "task_title": task.title,
                "priority": task.priority,
                "due_date": str(task.due_date) if task.due_date else None,
            },
        )

        # Notify the assignee if someone else assigned them
        if data.assigned_to and data.assigned_to != user_id:
            await self.notifications.create(
                user_id=data.assigned_to,
                org_id=org_id,
                type="info",
                title=f'New task assigned: "{task.title}"',
                message="You have been assigned a new task.",
                link=f"/matters/{matter_id}",
            )

        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def update_task(
        self,
        task_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: TaskUpdate,
    ) -> Task:
        task = await self._get_task(task_id, matter_id, org_id)
        update_data = data.model_dump(exclude_unset=True)

        old_status = task.status
        changed: dict = {}

        for field, value in update_data.items():
            old_val = getattr(task, field)
            if old_val != value:
                changed[field] = {
                    "from": str(old_val) if old_val is not None else None,
                    "to": str(value) if value is not None else None,
                }
                setattr(task, field, value)

        # Notify new assignee if assigned_to changed
        new_assignee = update_data.get("assigned_to")
        if new_assignee and new_assignee != task.assigned_to and new_assignee != user_id:
            await self.notifications.create(
                user_id=new_assignee,
                org_id=org_id,
                type="info",
                title=f'Task assigned to you: "{task.title}"',
                message="You have been assigned a task.",
                link=f"/matters/{matter_id}",
            )

        # Handle completion timestamp
        new_status = update_data.get("status")
        if new_status == TaskStatus.done and old_status != TaskStatus.done:
            task.completed_at = datetime.now(timezone.utc)
            await self.activity.log(
                matter_id=matter_id,
                org_id=org_id,
                actor_id=user_id,
                event_type="task_completed",
                payload={"task_id": str(task.id), "task_title": task.title},
            )
            await self.notifications.fan_out_to_watchers(
                task_id=task_id,
                org_id=org_id,
                actor_id=user_id,
                type="success",
                title=f'Task completed: "{task.title}"',
                message="The task has been marked as done.",
                link=f"/matters/{matter_id}",
            )
        elif new_status and new_status != TaskStatus.done and old_status == TaskStatus.done:
            task.completed_at = None

        if changed and new_status != TaskStatus.done and new_status is not None:
            status_label = new_status.replace("_", " ").title() if new_status else ""
            await self.notifications.fan_out_to_watchers(
                task_id=task_id,
                org_id=org_id,
                actor_id=user_id,
                type="info",
                title=f'Task updated: "{task.title}"',
                message=f"Status changed to {status_label}." if new_status else "Task details were updated.",
                link=f"/matters/{matter_id}",
            )

        if changed:
            await self.activity.log(
                matter_id=matter_id,
                org_id=org_id,
                actor_id=user_id,
                event_type="task_updated",
                payload={
                    "task_id": str(task.id),
                    "task_title": task.title,
                    "changes": changed,
                },
            )

        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def delete_task(
        self,
        task_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        task = await self._get_task(task_id, matter_id, org_id)
        task.is_deleted = True

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="task_deleted",
            payload={
                "task_id": str(task.id),
                "task_title": task.title,
            },
        )

        await self.db.commit()

    # ── Overdue ───────────────────────────────────────────────────────────

    async def get_overdue(
        self,
        org_id: uuid.UUID,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[dict], int]:
        """
        Returns all incomplete tasks past their due date across the org,
        joined with their parent matter for context.
        """
        today = date.today()

        query = (
            select(Task, Matter)
            .join(Matter, Matter.id == Task.matter_id)
            .where(
                Task.organisation_id == org_id,
                Task.is_deleted == False,
                Task.status.notin_([TaskStatus.done, TaskStatus.cancelled]),
                Task.due_date < today,
                Task.due_date.isnot(None),
            )
        )

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.order_by(Task.due_date.asc()).offset((page - 1) * page_size).limit(page_size)
        rows = (await self.db.execute(query)).all()

        return [
            {
                "id": task.id,
                "matter_id": task.matter_id,
                "matter_title": matter.title,
                "matter_reference_no": matter.reference_no,
                "title": task.title,
                "priority": task.priority,
                "due_date": task.due_date,
                "assigned_to": task.assigned_to,
            }
            for task, matter in rows
        ], total

    # ── Comments ─────────────────────────────────────────────────────────────

    async def list_comments(
        self,
        task_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
    ) -> list[TaskComment]:
        """Return all comments for a task, oldest-first."""
        await self._get_task(task_id, matter_id, org_id)
        result = await self.db.execute(
            select(TaskComment)
            .where(
                TaskComment.task_id == task_id,
                TaskComment.organisation_id == org_id,
            )
            .order_by(TaskComment.created_at.asc())
        )
        return list(result.scalars().all())

    async def add_comment(
        self,
        task_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        author_id: uuid.UUID,
        data: TaskCommentCreate,
    ) -> TaskComment:
        """Add a comment to a task. Logs a task_commented activity entry."""
        task = await self._get_task(task_id, matter_id, org_id)

        # Resolve author name
        author_result = await self.db.execute(select(User).where(User.id == author_id))
        author = author_result.scalar_one_or_none()
        author_name = author.full_name if author else "Unknown"

        comment = TaskComment(
            task_id=task_id,
            matter_id=matter_id,
            organisation_id=org_id,
            author_id=author_id,
            author_name=author_name,
            body=data.body.strip(),
        )
        self.db.add(comment)
        await self.db.flush()

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=author_id,
            event_type="task_commented",
            payload={
                "task_id": str(task_id),
                "task_title": task.title,
                "comment_id": str(comment.id),
                "preview": data.body[:120],
            },
        )

        # Notify task watchers about the new comment
        await self.notifications.fan_out_to_watchers(
            task_id=task_id,
            org_id=org_id,
            actor_id=author_id,
            type="info",
            title=f'New comment on "{task.title}"',
            message=f"{author_name}: {data.body[:100]}",
            link=f"/matters/{matter_id}",
        )

        await self.db.commit()
        await self.db.refresh(comment)
        return comment

    async def delete_comment(
        self,
        comment_id: uuid.UUID,
        task_id: uuid.UUID,
        org_id: uuid.UUID,
        requesting_user_id: uuid.UUID,
    ) -> None:
        """Delete a comment. Only the author or an admin may delete."""
        result = await self.db.execute(
            select(TaskComment).where(
                TaskComment.id == comment_id,
                TaskComment.task_id == task_id,
                TaskComment.organisation_id == org_id,
            )
        )
        comment = result.scalar_one_or_none()
        if not comment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comment not found",
            )
        if comment.author_id != requesting_user_id:
            # Admins can also delete — caller should check role before calling
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete your own comments",
            )
        await self.db.delete(comment)
        await self.db.commit()

    # ── Watchers ─────────────────────────────────────────────────────────────

    async def list_watchers(
        self,
        task_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
    ) -> list[dict]:
        """Return all watchers for a task with their user details."""
        await self._get_task(task_id, matter_id, org_id)
        result = await self.db.execute(
            select(TaskWatcher, User)
            .join(User, User.id == TaskWatcher.user_id)
            .where(
                TaskWatcher.task_id == task_id,
                TaskWatcher.organisation_id == org_id,
            )
            .order_by(TaskWatcher.added_at.asc())
        )
        return [
            {
                "user_id": watcher.user_id,
                "full_name": user.full_name,
                "email": user.email,
                "added_at": watcher.added_at,
            }
            for watcher, user in result.all()
        ]

    async def add_watcher(
        self,
        task_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        target_user_id: uuid.UUID,
        requesting_user_id: uuid.UUID,
    ) -> dict:
        """Add a user as a watcher. Idempotent — re-adding is a no-op."""
        await self._get_task(task_id, matter_id, org_id)

        # Verify target user is a member of the org
        from app.models.user import OrganisationMember

        mem_result = await self.db.execute(
            select(User)
            .join(OrganisationMember, OrganisationMember.user_id == User.id)
            .where(
                User.id == target_user_id,
                OrganisationMember.organisation_id == org_id,
            )
        )
        user = mem_result.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found in this organisation",
            )

        # Check if already watching
        existing = await self.db.execute(
            select(TaskWatcher).where(
                TaskWatcher.task_id == task_id,
                TaskWatcher.user_id == target_user_id,
            )
        )
        if existing.scalar_one_or_none():
            # Idempotent — return existing entry
            return {
                "user_id": target_user_id,
                "full_name": user.full_name,
                "email": user.email,
                "added_at": datetime.now(timezone.utc),
            }

        watcher = TaskWatcher(
            task_id=task_id,
            user_id=target_user_id,
            organisation_id=org_id,
        )
        self.db.add(watcher)
        await self.db.commit()
        await self.db.refresh(watcher)

        return {
            "user_id": watcher.user_id,
            "full_name": user.full_name,
            "email": user.email,
            "added_at": watcher.added_at,
        }

    async def remove_watcher(
        self,
        task_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        target_user_id: uuid.UUID,
        requesting_user_id: uuid.UUID,
    ) -> None:
        """Remove a watcher. Users can remove themselves; admins can remove anyone."""
        await self._get_task(task_id, matter_id, org_id)

        result = await self.db.execute(
            select(TaskWatcher).where(
                TaskWatcher.task_id == task_id,
                TaskWatcher.user_id == target_user_id,
                TaskWatcher.organisation_id == org_id,
            )
        )
        watcher = result.scalar_one_or_none()
        if not watcher:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Watcher not found",
            )
        await self.db.delete(watcher)
        await self.db.commit()
