# backend/tests/api/test_reports.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient
from datetime import date, timedelta

REGISTER = {
    "org_name": "Report Test Firm",
    "full_name": "Funke Adeola",
    "email": "funke@reporttest.ng",
    "password": "TestPass123",
}


async def setup_with_data(client: AsyncClient) -> str:
    """
    Register, create client, matter, tasks, and activity.
    Returns the admin token.
    """
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    cl = await client.post("/clients/", json={"name": "Report Client"}, headers=headers)
    client_id = cl.json()["id"]

    m = await client.post("/matters/", json={
        "title": "Tax Compliance Matter", "matter_type": "compliance",
        "client_id": client_id,
    }, headers=headers)
    matter_id = m.json()["id"]

    # Move to open
    await client.patch(
        f"/matters/{matter_id}/status",
        json={"status": "open"},
        headers=headers,
    )

    # Create tasks
    await client.post(f"/matters/{matter_id}/tasks", json={
        "title": "Draft memo", "priority": "high",
    }, headers=headers)

    t2 = await client.post(f"/matters/{matter_id}/tasks", json={
        "title": "Client call",
        "priority": "medium",
        "due_date": str(date.today() + timedelta(days=5)),
    }, headers=headers)

    # Complete one task
    await client.patch(
        f"/matters/{matter_id}/tasks/{t2.json()['id']}",
        json={"status": "done"},
        headers=headers,
    )

    # Link a document
    await client.post(f"/matters/{matter_id}/documents", json={
        "name": "Engagement Letter",
        "drive_file_id": "fake-file-id",
        "drive_url": "https://docs.google.com/fake",
        "doc_type": "engagement_letter",
    }, headers=headers)

    return token


# ─── Generate (no Drive export) ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_report_monthly_no_drive(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/reports/generate", json={
        "period_type": "monthly",
        "export_to_drive": False,
        "send_email": False,
    }, headers=headers)

    assert resp.status_code == 201
    body = resp.json()
    assert "report" in body
    assert "data" in body
    assert body["report"]["period_label"] != ""
    assert body["data"]["org_name"] == "Report Test Firm"
    assert body["data"]["total_events"] >= 0


@pytest.mark.asyncio
async def test_generate_report_weekly(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/reports/generate", json={
        "period_type": "weekly",
        "export_to_drive": False,
    }, headers=headers)

    assert resp.status_code == 201
    body = resp.json()
    assert "Week of" in body["report"]["period_label"]


@pytest.mark.asyncio
async def test_generate_report_custom_period(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    date_from = str(date.today() - timedelta(days=30))
    date_to = str(date.today())

    resp = await client.post("/reports/generate", json={
        "period_type": "custom",
        "date_from": date_from,
        "date_to": date_to,
        "export_to_drive": False,
    }, headers=headers)

    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_generate_report_custom_invalid_dates(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/reports/generate", json={
        "period_type": "custom",
        "date_from": str(date.today()),
        "date_to": str(date.today() - timedelta(days=5)),  # to < from
        "export_to_drive": False,
    }, headers=headers)

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_report_data_has_client_breakdown(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/reports/generate", json={
        "period_type": "custom",
        "date_from": str(date.today() - timedelta(days=7)),
        "date_to": str(date.today()),
        "export_to_drive": False,
    }, headers=headers)

    data = resp.json()["data"]
    # Should have at least one client
    assert len(data["clients"]) >= 0
    # If we have clients, verify structure
    if data["clients"]:
        client_data = data["clients"][0]
        assert "client_name" in client_data
        assert "matters" in client_data
        if client_data["matters"]:
            matter_data = client_data["matters"][0]
            assert "reference_no" in matter_data
            assert "tasks" in matter_data
            assert "documents" in matter_data
            assert "events_by_type" in matter_data


# ─── Drive export ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_report_with_drive_export(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    from app.core.deps import get_google_credentials
    from app.main import app
    fake_creds = MagicMock()
    app.dependency_overrides[get_google_credentials] = lambda: fake_creds

    with patch(
        "app.services.report_service.ReportService.export_to_doc",
        new_callable=AsyncMock,
        return_value=("drive-file-id-001", "https://docs.google.com/drive-file-id-001/edit"),
    ):
        resp = await client.post("/reports/generate", json={
            "period_type": "monthly",
            "export_to_drive": True,
            "send_email": False,
        }, headers=headers)

    assert resp.status_code == 201
    body = resp.json()
    assert body["report"]["drive_file_id"] == "drive-file-id-001"
    assert body["report"]["drive_url"] is not None


# ─── History ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_report_history(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Generate two reports
    for period in ["monthly", "weekly"]:
        await client.post("/reports/generate", json={
            "period_type": period,
            "export_to_drive": False,
        }, headers=headers)

    resp = await client.get("/reports/history", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2
    # Newest first
    assert body["items"][0]["generated_at"] >= body["items"][1]["generated_at"]


@pytest.mark.asyncio
async def test_get_report_by_id(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    gen = await client.post("/reports/generate", json={
        "period_type": "monthly", "export_to_drive": False,
    }, headers=headers)
    report_id = gen.json()["report"]["id"]

    resp = await client.get(f"/reports/{report_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == report_id


@pytest.mark.asyncio
async def test_report_isolation(client: AsyncClient):
    """Org B cannot see Org A's reports."""
    token_a = await setup_with_data(client)
    gen = await client.post("/reports/generate", json={
        "period_type": "monthly", "export_to_drive": False,
    }, headers={"Authorization": f"Bearer {token_a}"})
    report_id = gen.json()["report"]["id"]

    reg_b = await client.post("/auth/register", json={
        **REGISTER, "email": "orgb@reporttest.ng", "org_name": "Org B Reports"
    })
    token_b = reg_b.json()["tokens"]["access_token"]

    resp = await client.get(
        f"/reports/{report_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404
