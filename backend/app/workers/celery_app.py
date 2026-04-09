# backend/app/workers/celery_app.py
from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "legalops",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        # Phase 6: renew Drive webhook channels before they expire (daily at 03:00 UTC)
        "renew-webhook-channels-daily": {
            "task": "tasks.renew_expiring_webhook_channels",
            "schedule": crontab(hour=3, minute=0),
        },
        # Phase 9: generate monthly reports (1st of each month at 08:00 UTC)
        "generate-monthly-reports": {
            "task": "tasks.generate_scheduled_reports",
            "schedule": crontab(day_of_month=1, hour=8, minute=0),
        },
    },
)
