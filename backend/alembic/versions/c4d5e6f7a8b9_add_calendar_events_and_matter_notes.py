"""add calendar events and matter notes

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-04-13 13:55:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


calendar_event_type = sa.Enum("court_date", "deadline", "meeting", "reminder", "other", name="calendareventtype")
calendar_sync_status = sa.Enum("never_synced", "synced", "sync_error", name="calendarsyncstatus")
matter_note_type = sa.Enum("typed", "handwritten", "mixed", name="matternotetype")


def upgrade() -> None:
    # calendar_event_type.create(op.get_bind(), checkfirst=True)
    # calendar_sync_status.create(op.get_bind(), checkfirst=True)
    # matter_note_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "calendar_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("matter_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("matters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("event_type", calendar_event_type, nullable=False),
        sa.Column("location", sa.String(length=255)),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("all_day", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("google_event_id", sa.String(length=255)),
        sa.Column("google_event_url", sa.Text()),
        sa.Column("google_sync_status", calendar_sync_status, nullable=False, server_default="never_synced"),
        sa.Column("google_synced_at", sa.DateTime(timezone=True)),
        sa.Column("google_last_error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_calendar_events_matter_id", "calendar_events", ["matter_id"])
    op.create_index("ix_calendar_events_organisation_id", "calendar_events", ["organisation_id"])
    op.create_index("ix_calendar_events_starts_at", "calendar_events", ["starts_at"])
    op.create_index("ix_calendar_events_event_type", "calendar_events", ["event_type"])
    op.create_index("ix_calendar_events_google_event_id", "calendar_events", ["google_event_id"])

    op.create_table(
        "matter_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("matter_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("matters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("calendar_events.id", ondelete="SET NULL")),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column(
            "created_from_task_comment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("task_comments.id", ondelete="SET NULL"),
        ),
        sa.Column("author_name", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text()),
        sa.Column("svg_content", sa.Text()),
        sa.Column("note_type", matter_note_type, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_matter_notes_matter_id", "matter_notes", ["matter_id"])
    op.create_index("ix_matter_notes_event_id", "matter_notes", ["event_id"])
    op.create_index("ix_matter_notes_organisation_id", "matter_notes", ["organisation_id"])
    op.create_index("ix_matter_notes_note_type", "matter_notes", ["note_type"])
    op.create_index(
        "ix_matter_notes_created_from_task_comment_id",
        "matter_notes",
        ["created_from_task_comment_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_matter_notes_created_from_task_comment_id", table_name="matter_notes")
    op.drop_index("ix_matter_notes_note_type", table_name="matter_notes")
    op.drop_index("ix_matter_notes_organisation_id", table_name="matter_notes")
    op.drop_index("ix_matter_notes_event_id", table_name="matter_notes")
    op.drop_index("ix_matter_notes_matter_id", table_name="matter_notes")
    op.drop_table("matter_notes")

    op.drop_index("ix_calendar_events_google_event_id", table_name="calendar_events")
    op.drop_index("ix_calendar_events_event_type", table_name="calendar_events")
    op.drop_index("ix_calendar_events_starts_at", table_name="calendar_events")
    op.drop_index("ix_calendar_events_organisation_id", table_name="calendar_events")
    op.drop_index("ix_calendar_events_matter_id", table_name="calendar_events")
    op.drop_table("calendar_events")

    matter_note_type.drop(op.get_bind(), checkfirst=True)
    calendar_sync_status.drop(op.get_bind(), checkfirst=True)
    calendar_event_type.drop(op.get_bind(), checkfirst=True)
