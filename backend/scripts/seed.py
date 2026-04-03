"""
Seed script — creates a test organisation, admin user, and sample data.
Run with: make seed

Creates:
  - 1 organisation: "Demo Law Firm"
  - 1 admin user:   admin@demolaw.com / password: DemoPass123!
  - 2 clients
  - 3 matters (one per status: intake, open, pending)
  - 2 tasks per matter
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models import (
    Organisation,
    User,
    OrganisationMember,
    Client,
    Matter,
    MatterStatus,
    MatterType,
    Task,
    TaskStatus,
    TaskPriority,
    ActivityLog,
)


async def main() -> None:
    async with AsyncSessionLocal() as db:
        # ── Check if already seeded ──────────────────────────────────────
        existing = await db.execute(
            select(Organisation).where(Organisation.slug == "demo-law-firm")
        )
        if existing.scalar_one_or_none():
            print("Database already seeded — skipping.")
            return

        print("Seeding database...")

        # ── Organisation ─────────────────────────────────────────────────
        org = Organisation(
            id=uuid.uuid4(),
            name="Demo Law Firm",
            slug="demo-law-firm",
            plan="pro",
        )
        db.add(org)

        # ── Admin user ───────────────────────────────────────────────────
        admin = User(
            id=uuid.uuid4(),
            email="admin@demolaw.com",
            hashed_password=hash_password("DemoPass123!"),
            full_name="Admin User",
            is_active=True,
            is_verified=True,
        )
        db.add(admin)

        member = User(
            id=uuid.uuid4(),
            email="member@demolaw.com",
            hashed_password=hash_password("DemoPass123!"),
            full_name="Team Member",
            is_active=True,
            is_verified=True,
        )
        db.add(member)

        await db.flush()

        # ── Organisation memberships ─────────────────────────────────────
        db.add(OrganisationMember(
            organisation_id=org.id,
            user_id=admin.id,
            role="admin",
        ))
        db.add(OrganisationMember(
            organisation_id=org.id,
            user_id=member.id,
            role="member",
        ))

        # ── Clients ──────────────────────────────────────────────────────
        client_a = Client(
            id=uuid.uuid4(),
            organisation_id=org.id,
            name="Acme Industries Ltd",
            email="legal@acmeindustries.ng",
            phone="+234 801 234 5678",
        )
        client_b = Client(
            id=uuid.uuid4(),
            organisation_id=org.id,
            name="Meridian Holdings",
            email="info@meridianholdings.ng",
            phone="+234 802 987 6543",
        )
        db.add_all([client_a, client_b])
        await db.flush()

        # ── Matters ──────────────────────────────────────────────────────
        now = datetime.now(timezone.utc)

        matter_1 = Matter(
            id=uuid.uuid4(),
            organisation_id=org.id,
            client_id=client_a.id,
            assigned_to=admin.id,
            title="Nigeria Tax Act 2025 Compliance Review",
            reference_no="MAT-2025-0001",
            matter_type=MatterType.compliance,
            status=MatterStatus.open,
            description="Review client operations for compliance with the Nigeria Tax Act 2025 effective January 2026.",
            opened_at=now - timedelta(days=10),
            target_close_at=now + timedelta(days=20),
        )
        matter_2 = Matter(
            id=uuid.uuid4(),
            organisation_id=org.id,
            client_id=client_a.id,
            assigned_to=member.id,
            title="Supply Contract Drafting — Q1 2026",
            reference_no="MAT-2025-0002",
            matter_type=MatterType.drafting,
            status=MatterStatus.pending,
            description="Draft and review supply agreements for Q1 2026 procurement cycle.",
            opened_at=now - timedelta(days=5),
            target_close_at=now + timedelta(days=14),
        )
        matter_3 = Matter(
            id=uuid.uuid4(),
            organisation_id=org.id,
            client_id=client_b.id,
            assigned_to=admin.id,
            title="Employment Dispute Advisory",
            reference_no="MAT-2025-0003",
            matter_type=MatterType.advisory,
            status=MatterStatus.intake,
            description="Initial advisory on employee termination dispute.",
            opened_at=now - timedelta(days=1),
        )
        db.add_all([matter_1, matter_2, matter_3])
        await db.flush()

        # ── Tasks ────────────────────────────────────────────────────────
        tasks = [
            Task(
                matter_id=matter_1.id,
                organisation_id=org.id,
                assigned_to=admin.id,
                created_by=admin.id,
                title="Review VAT provisions under Chapter Six",
                status=TaskStatus.done,
                priority=TaskPriority.high,
                due_date=(now - timedelta(days=3)).date(),
                completed_at=now - timedelta(days=3),
            ),
            Task(
                matter_id=matter_1.id,
                organisation_id=org.id,
                assigned_to=admin.id,
                created_by=admin.id,
                title="Draft compliance gap analysis memo",
                status=TaskStatus.in_progress,
                priority=TaskPriority.high,
                due_date=(now + timedelta(days=5)).date(),
            ),
            Task(
                matter_id=matter_2.id,
                organisation_id=org.id,
                assigned_to=member.id,
                created_by=admin.id,
                title="Review client's existing contract templates",
                status=TaskStatus.done,
                priority=TaskPriority.medium,
                due_date=(now - timedelta(days=2)).date(),
                completed_at=now - timedelta(days=2),
            ),
            Task(
                matter_id=matter_2.id,
                organisation_id=org.id,
                assigned_to=member.id,
                created_by=admin.id,
                title="Send draft supply agreement for client review",
                status=TaskStatus.todo,
                priority=TaskPriority.high,
                due_date=(now + timedelta(days=2)).date(),
            ),
            Task(
                matter_id=matter_3.id,
                organisation_id=org.id,
                assigned_to=admin.id,
                created_by=admin.id,
                title="Schedule initial consultation with client",
                status=TaskStatus.todo,
                priority=TaskPriority.medium,
                due_date=(now + timedelta(days=1)).date(),
            ),
            Task(
                matter_id=matter_3.id,
                organisation_id=org.id,
                assigned_to=admin.id,
                created_by=admin.id,
                title="Request employment records from client",
                status=TaskStatus.todo,
                priority=TaskPriority.low,
                due_date=(now + timedelta(days=3)).date(),
            ),
        ]
        db.add_all(tasks)

        # ── Activity log entries ─────────────────────────────────────────
        activity_entries = [
            ActivityLog(
                matter_id=matter_1.id,
                organisation_id=org.id,
                actor_id=admin.id,
                event_type="matter_created",
                payload={"title": matter_1.title, "type": matter_1.matter_type},
                created_at=matter_1.opened_at,
            ),
            ActivityLog(
                matter_id=matter_1.id,
                organisation_id=org.id,
                actor_id=admin.id,
                event_type="status_changed",
                payload={"from": "intake", "to": "open"},
                created_at=matter_1.opened_at + timedelta(hours=1),
            ),
            ActivityLog(
                matter_id=matter_2.id,
                organisation_id=org.id,
                actor_id=admin.id,
                event_type="matter_created",
                payload={"title": matter_2.title, "type": matter_2.matter_type},
                created_at=matter_2.opened_at,
            ),
            ActivityLog(
                matter_id=matter_2.id,
                organisation_id=org.id,
                actor_id=member.id,
                event_type="status_changed",
                payload={"from": "open", "to": "pending", "reason": "Awaiting client signature on draft"},
                created_at=matter_2.opened_at + timedelta(days=3),
            ),
            ActivityLog(
                matter_id=matter_3.id,
                organisation_id=org.id,
                actor_id=admin.id,
                event_type="matter_created",
                payload={"title": matter_3.title, "type": matter_3.matter_type},
                created_at=matter_3.opened_at,
            ),
        ]
        db.add_all(activity_entries)

        await db.commit()

        print("Seed complete.")
        print("")
        print("  Organisation : Demo Law Firm")
        print("  Admin login  : admin@demolaw.com / DemoPass123!")
        print("  Member login : member@demolaw.com / DemoPass123!")
        print(f"  Matters      : {matter_1.reference_no}, {matter_2.reference_no}, {matter_3.reference_no}")


if __name__ == "__main__":
    asyncio.run(main())
