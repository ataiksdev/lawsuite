# backend/app/services/task_service.py
import uuid
import math
from datetime import datetime, date, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.models.task import Task, TaskStatus
from app.models.matter import Matter
from app.schemas.task import TaskCreate, TaskUpdate
from app.services.activity_service import ActivityService


class TaskService:

    def __init__(self, db: AsyncSession):
        self.db = db
        self.activity = ActivityService(db)

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

    async def _get_task(
        self, task_id: uuid.UUID, matter_id: uuid.UUID, org_id: uuid.UUID
    ) -> Task:
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

        # Handle completion timestamp
        new_status = update_data.get("status")
        if new_status == TaskStatus.done and old_status != TaskStatus.done:
            task.completed_at = datetime.now(timezone.utc)
            await self.activity.log(
                matter_id=matter_id,
                org_id=org_id,
                actor_id=user_id,
                event_type="task_completed",
                payload={
                    "task_id": str(task.id),
                    "task_title": task.title,
                },
            )
        elif new_status and new_status != TaskStatus.done and old_status == TaskStatus.done:
            task.completed_at = None

        if changed and new_status != TaskStatus.done:
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

        query = (
            query.order_by(Task.due_date.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
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
