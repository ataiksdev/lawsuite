# backend/scripts/seed.py
"""
Seed script — populates the database with demo data for local development.

Creates:
  - 1 admin org (your platform admin account)
  - 1 demo firm with 2 users (admin + member)
  - 3 clients, 4 matters, 8 tasks, several activity logs

Run with: make seed
Requires: DATABASE_URL in .env pointing to a running Postgres instance.

After running:
  1. Copy the "Platform admin org" ID printed below into .env as PLATFORM_ADMIN_ORG_ID
  2. Restart the server
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone, date

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.config import settings
from app.core.database import Base
from app.core.security import hash_password
from app.models.organisation import Organisation
from app.models.user import User, OrganisationMember, UserRole
from app.models.client import Client
from app.models.matter import Matter, MatterStatus, MatterType
from app.models.task import Task, TaskStatus, TaskPriority
from app.models.activity_log import ActivityLog
import app.models  # noqa — register all models


engine = create_async_engine(settings.database_url, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        now = datetime.now(timezone.utc)
        trial_ends = now + timedelta(days=30)

        # ── Platform admin org (your account) ─────────────────────────────
        admin_org = Organisation(
            id=uuid.uuid4(),
            name="LegalOps Platform",
            slug="legalops-platform",
            plan="agency",
            trial_ends_at=None,
            trial_used=True,
            is_active=True,
        )
        db.add(admin_org)

        admin_user = User(
            id=uuid.uuid4(),
            email="admin@legalops.ng",
            hashed_password=hash_password("AdminPass123"),
            full_name="Platform Admin",
            is_active=True,
            is_verified=True,
        )
        db.add(admin_user)

        db.add(OrganisationMember(
            organisation_id=admin_org.id,
            user_id=admin_user.id,
            role=UserRole.admin,
        ))

        # ── Demo firm ──────────────────────────────────────────────────────
        demo_org = Organisation(
            id=uuid.uuid4(),
            name="Okafor & Associates",
            slug="okafor-associates",
            plan="free",
            trial_ends_at=trial_ends,
            trial_used=False,
            is_active=True,
        )
        db.add(demo_org)

        firm_admin = User(
            id=uuid.uuid4(),
            email="emeka@okafor.ng",
            hashed_password=hash_password("DemoPass123"),
            full_name="Emeka Okafor",
            is_active=True,
            is_verified=True,
        )
        db.add(firm_admin)
        db.add(OrganisationMember(
            organisation_id=demo_org.id,
            user_id=firm_admin.id,
            role=UserRole.admin,
        ))

        firm_member = User(
            id=uuid.uuid4(),
            email="ada@okafor.ng",
            hashed_password=hash_password("DemoPass123"),
            full_name="Adaeze Nwosu",
            is_active=True,
            is_verified=True,
        )
        db.add(firm_member)
        db.add(OrganisationMember(
            organisation_id=demo_org.id,
            user_id=firm_member.id,
            role=UserRole.member,
        ))

        await db.flush()

        # ── Clients ────────────────────────────────────────────────────────
        clients = [
            Client(organisation_id=demo_org.id, name="Zenith Enterprises Ltd",
                   email="legal@zenith.ng", phone="+234 801 000 0001"),
            Client(organisation_id=demo_org.id, name="Lagos State Government",
                   email="solicitor@lasgov.ng"),
            Client(organisation_id=demo_org.id, name="Dr. Funmi Adeyemi",
                   email="funmi@gmail.com", phone="+234 802 000 0002"),
        ]
        for c in clients:
            db.add(c)
        await db.flush()

        # ── Matters ────────────────────────────────────────────────────────
        matters_data = [
            dict(title="Zenith — Nigeria Tax Act 2025 Compliance Review",
                 matter_type=MatterType.compliance, status=MatterStatus.open,
                 client_id=clients[0].id, assigned_to=firm_admin.id,
                 description="Full compliance audit under the new Nigeria Tax Act 2025."),
            dict(title="Lagos State — Land Acquisition Dispute",
                 matter_type=MatterType.litigation, status=MatterStatus.in_review,
                 client_id=clients[1].id, assigned_to=firm_member.id,
                 description="Compulsory acquisition challenge at the Federal High Court."),
            dict(title="Dr. Adeyemi — Employment Contract Drafting",
                 matter_type=MatterType.drafting, status=MatterStatus.open,
                 client_id=clients[2].id, assigned_to=firm_admin.id),
            dict(title="Zenith — Series A Investment Agreement",
                 matter_type=MatterType.advisory, status=MatterStatus.intake,
                 client_id=clients[0].id),
        ]

        matters = []
        for i, md in enumerate(matters_data):
            m = Matter(
                organisation_id=demo_org.id,
                reference_no=f"OKA-2025-{i+1:04d}",
                opened_at=now - timedelta(days=30 - i * 5),
                target_close_at=now + timedelta(days=60 + i * 10),
                **md,
            )
            db.add(m)
            matters.append(m)
        await db.flush()

        # ── Tasks ──────────────────────────────────────────────────────────
        tasks_data = [
            dict(matter_id=matters[0].id, title="Review CITA provisions", priority=TaskPriority.high,
                 status=TaskStatus.done, assigned_to=firm_admin.id),
            dict(matter_id=matters[0].id, title="Draft compliance memo", priority=TaskPriority.high,
                 status=TaskStatus.in_progress, due_date=date.today() + timedelta(days=3),
                 assigned_to=firm_admin.id),
            dict(matter_id=matters[0].id, title="Client presentation prep", priority=TaskPriority.medium,
                 status=TaskStatus.todo, due_date=date.today() + timedelta(days=7)),
            dict(matter_id=matters[1].id, title="File originating summons", priority=TaskPriority.high,
                 status=TaskStatus.done, assigned_to=firm_member.id),
            dict(matter_id=matters[1].id, title="Prepare witness statements", priority=TaskPriority.high,
                 status=TaskStatus.in_progress, due_date=date.today() + timedelta(days=14),
                 assigned_to=firm_member.id),
            dict(matter_id=matters[2].id, title="Draft initial contract", priority=TaskPriority.medium,
                 status=TaskStatus.in_progress, assigned_to=firm_admin.id),
            dict(matter_id=matters[2].id, title="Send for client review", priority=TaskPriority.low,
                 status=TaskStatus.todo, due_date=date.today() + timedelta(days=5)),
            dict(matter_id=matters[3].id, title="Receive investment term sheet", priority=TaskPriority.high,
                 status=TaskStatus.todo),
        ]

        for td in tasks_data:
            db.add(Task(organisation_id=demo_org.id, **td))

        # ── Activity logs ──────────────────────────────────────────────────
        for i, matter in enumerate(matters):
            db.add(ActivityLog(
                matter_id=matter.id, organisation_id=demo_org.id,
                actor_id=firm_admin.id, event_type="matter_created",
                payload={"title": matter.title},
                created_at=now - timedelta(days=30 - i * 5),
            ))
            if matter.status != MatterStatus.intake:
                db.add(ActivityLog(
                    matter_id=matter.id, organisation_id=demo_org.id,
                    actor_id=firm_admin.id, event_type="status_changed",
                    payload={"from": "intake", "to": matter.status.value},
                    created_at=now - timedelta(days=25 - i * 5),
                ))

        await db.commit()

        print("\n" + "="*60)
        print("  LegalOps seed data created successfully")
        print("="*60)
        print(f"\n  Platform admin org ID: {admin_org.id}")
        print(f"  → Add to .env:  PLATFORM_ADMIN_ORG_ID={admin_org.id}")
        print(f"\n  Platform admin login:")
        print(f"    email:    admin@legalops.ng")
        print(f"    password: AdminPass123")
        print(f"\n  Demo firm login:")
        print(f"    email:    emeka@okafor.ng  (admin)")
        print(f"    email:    ada@okafor.ng    (member)")
        print(f"    password: DemoPass123  (both)")
        print(f"\n  Demo firm trial ends: {trial_ends.strftime('%Y-%m-%d')}")
        print("="*60 + "\n")


if __name__ == "__main__":
    asyncio.run(seed())
