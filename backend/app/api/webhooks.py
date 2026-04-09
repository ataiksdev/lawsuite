# backend/app/api/webhooks.py
import json

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response, status
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.organisation import Organisation

router = APIRouter()


# ─── Google Drive webhook ─────────────────────────────────────────────────────


@router.post("/google-drive")
async def google_drive_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Receives push notifications from the Google Drive API.

    Google sends change metadata in HTTP headers, not the body.
    We must respond with 200 within a few seconds or Google will retry.
    Heavy work (Drive Activity API call, DB write) is deferred to Celery.

    Relevant headers:
      x-goog-channel-id      — our channel ID (encodes org_id)
      x-goog-resource-id     — the Drive resource that changed (file ID)
      x-goog-resource-state  — "sync" (initial ping) or "change"
      x-goog-changed         — what changed: "content", "properties", etc.
    """
    resource_state = request.headers.get("x-goog-resource-state")
    channel_id = request.headers.get("x-goog-channel-id", "")
    resource_id = request.headers.get("x-goog-resource-id", "")

    if resource_state == "sync":
        return Response(status_code=200)

    if resource_state == "change" and channel_id and resource_id:
        background_tasks.add_task(
            _enqueue_drive_change,
            channel_id=channel_id,
            resource_id=resource_id,
        )

    return Response(status_code=200)


async def _enqueue_drive_change(channel_id: str, resource_id: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Organisation).where(Organisation.drive_webhook_channel_id == channel_id))
        org = result.scalar_one_or_none()
        if not org:
            return

    from app.workers.tasks import process_drive_change

    process_drive_change.delay(
        file_id=resource_id,
        org_id=str(org.id),
    )


# ─── Paystack webhook ─────────────────────────────────────────────────────────


@router.post("/paystack")
async def paystack_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Receives event notifications from Paystack.

    Security:
      - Signature is verified using HMAC SHA512 with the Paystack secret key
      - The raw request body is used for signing (not re-serialised JSON)
      - We return 200 immediately; heavy DB work is done in a background task

    Key events handled:
      charge.success        — payment completed, activate plan
      subscription.create   — new subscription created
      subscription.disable  — subscription cancelled or payment failed → downgrade
      invoice.payment_failed — payment failed (informational)

    Paystack retries failed webhooks every 3 minutes for the first 4 attempts,
    then hourly for up to 72 hours. Idempotency is handled by the event handlers.

    See: https://paystack.com/docs/payments/webhooks/
    """
    payload = await request.body()
    signature = request.headers.get("x-paystack-signature", "")

    # Always verify before processing
    from app.services.billing_service import verify_paystack_signature

    if not verify_paystack_signature(payload, signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Paystack signature",
        )

    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )

    event_type = event.get("event")
    event_data = event.get("data", {})

    background_tasks.add_task(
        _handle_paystack_event,
        event_type=event_type,
        event_data=event_data,
    )

    # Respond quickly — Paystack expects 200 within 30 seconds
    return Response(status_code=200)


async def _handle_paystack_event(event_type: str, event_data: dict) -> None:
    """
    Process a Paystack webhook event asynchronously.
    Runs as a FastAPI BackgroundTask after the 200 response is sent.
    """
    from app.services.billing_service import BillingService

    async with AsyncSessionLocal() as db:
        service = BillingService(db)

        if event_type == "charge.success":
            await service.handle_charge_success(event_data)

        elif event_type == "subscription.create":
            await service.handle_subscription_create(event_data)

        elif event_type == "subscription.disable":
            await service.handle_subscription_disable(event_data)

        elif event_type == "invoice.payment_failed":
            # Informational — log but don't downgrade immediately
            # Paystack will send subscription.disable if payment fails repeatedly
            pass

        # Other events (transfer.success etc.) are ignored for now
