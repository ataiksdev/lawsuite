# backend/tests/api/test_reports.py
import uuid
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.schemas.report import ClientActivity, DocumentSummary, MatterActivity, ReportData, TaskSummary
from app.services.report_service import _build_doc_requests, _matter_type_label, _report_title

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

    m = await client.post(
        "/matters/",
        json={
            "title": "Tax Compliance Matter",
            "matter_type": "compliance",
            "client_id": client_id,
        },
        headers=headers,
    )
    matter_id = m.json()["id"]

    # Move to open
    await client.patch(
        f"/matters/{matter_id}/status",
        json={"status": "open"},
        headers=headers,
    )

    # Create tasks
    await client.post(
        f"/matters/{matter_id}/tasks",
        json={
            "title": "Draft memo",
            "priority": "high",
        },
        headers=headers,
    )

    t2 = await client.post(
        f"/matters/{matter_id}/tasks",
        json={
            "title": "Client call",
            "priority": "medium",
            "due_date": str(date.today() + timedelta(days=5)),
        },
        headers=headers,
    )

    # Complete one task
    await client.patch(
        f"/matters/{matter_id}/tasks/{t2.json()['id']}",
        json={"status": "done"},
        headers=headers,
    )

    # Link a document
    await client.post(
        f"/matters/{matter_id}/documents",
        json={
            "name": "Engagement Letter",
            "drive_file_id": "fake-file-id",
            "drive_url": "https://docs.google.com/fake",
            "doc_type": "engagement_letter",
        },
        headers=headers,
    )

    return token


# ─── Generate (no Drive export) ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_generate_report_monthly_no_drive(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/reports/generate",
        json={
            "period_type": "monthly",
            "export_to_drive": False,
            "send_email": False,
        },
        headers=headers,
    )

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

    resp = await client.post(
        "/reports/generate",
        json={
            "period_type": "weekly",
            "export_to_drive": False,
        },
        headers=headers,
    )

    assert resp.status_code == 201
    body = resp.json()
    assert "Week of" in body["report"]["period_label"]


@pytest.mark.asyncio
async def test_generate_report_custom_period(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    date_from = str(date.today() - timedelta(days=30))
    date_to = str(date.today())

    resp = await client.post(
        "/reports/generate",
        json={
            "period_type": "custom",
            "date_from": date_from,
            "date_to": date_to,
            "export_to_drive": False,
        },
        headers=headers,
    )

    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_generate_report_custom_invalid_dates(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/reports/generate",
        json={
            "period_type": "custom",
            "date_from": str(date.today()),
            "date_to": str(date.today() - timedelta(days=5)),  # to < from
            "export_to_drive": False,
        },
        headers=headers,
    )

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_report_data_has_client_breakdown(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/reports/generate",
        json={
            "period_type": "custom",
            "date_from": str(date.today() - timedelta(days=7)),
            "date_to": str(date.today()),
            "export_to_drive": False,
        },
        headers=headers,
    )

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

    fake_creds = MagicMock()
    with patch("app.services.google_auth_service.GoogleAuthService.get_valid_credentials", return_value=fake_creds):
        with patch(
            "app.services.report_service.ReportService.export_to_doc",
            new_callable=AsyncMock,
            return_value=("drive-file-id-001", "https://docs.google.com/drive-file-id-001/edit"),
        ):
            resp = await client.post(
                "/reports/generate",
                json={
                    "period_type": "monthly",
                    "export_to_drive": True,
                    "send_email": False,
                },
                headers=headers,
            )

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
        await client.post(
            "/reports/generate",
            json={
                "period_type": period,
                "export_to_drive": False,
            },
            headers=headers,
        )

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

    gen = await client.post(
        "/reports/generate",
        json={
            "period_type": "monthly",
            "export_to_drive": False,
        },
        headers=headers,
    )
    report_id = gen.json()["report"]["id"]

    resp = await client.get(f"/reports/{report_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == report_id


@pytest.mark.asyncio
async def test_report_isolation(client: AsyncClient):
    """Org B cannot see Org A's reports."""
    token_a = await setup_with_data(client)
    gen = await client.post(
        "/reports/generate",
        json={
            "period_type": "monthly",
            "export_to_drive": False,
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    report_id = gen.json()["report"]["id"]

    reg_b = await client.post(
        "/auth/register", json={**REGISTER, "email": "orgb@reporttest.ng", "org_name": "Org B Reports"}
    )
    token_b = reg_b.json()["tokens"]["access_token"]

    resp = await client.get(
        f"/reports/{report_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_download_report_html(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Generate a report
    gen = await client.post(
        "/reports/generate",
        json={
            "period_type": "monthly",
            "export_to_drive": False,
        },
        headers=headers,
    )
    report_id = gen.json()["report"]["id"]

    # Download it as HTML
    resp = await client.get(
        f"/reports/{report_id}/download?format=html",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/html")
    assert "<!DOCTYPE html>" in resp.text
    assert "Activity Report" in resp.text
    assert "Report Test Firm" in resp.text


@pytest.mark.asyncio
async def test_download_report_invalid_format(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Generate a report
    gen = await client.post(
        "/reports/generate",
        json={
            "period_type": "monthly",
            "export_to_drive": False,
        },
        headers=headers,
    )
    report_id = gen.json()["report"]["id"]

    # Download it with invalid format
    resp = await client.get(
        f"/reports/{report_id}/download?format=pdf",
        headers=headers,
    )
    assert resp.status_code == 400
    assert "Unsupported format" in resp.text



@pytest.mark.asyncio
async def test_generate_report_with_filters(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Setup created one client and one matter for it.
    # Let's create a second client and matter to ensure filtering works.
    cl2 = await client.post("/clients/", json={"name": "Another Client"}, headers=headers)
    client_id_2 = cl2.json()["id"]

    m2 = await client.post(
        "/matters/",
        json={
            "title": "Unrelated Matter",
            "matter_type": "advisory",
            "client_id": client_id_2,
        },
        headers=headers,
    )
    matter_id_2 = m2.json()["id"]

    await client.patch(
        f"/matters/{matter_id_2}/status",
        json={"status": "open"},
        headers=headers,
    )

    # Generate report filtered to the new client
    resp = await client.post(
        "/reports/generate",
        json={
            "period_type": "custom",
            "date_from": str(date.today() - timedelta(days=7)),
            "date_to": str(date.today()),
            "export_to_drive": False,
            "client_id": client_id_2,
        },
        headers=headers,
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["report"]["client_id"] == client_id_2

    # The data should only contain "Another Client"
    data = body["data"]
    assert len(data["clients"]) == 1
    assert data["clients"][0]["client_id"] == client_id_2
    assert data["matters_active"] == 1
    assert data["clients"][0]["matters"][0]["matter_id"] == matter_id_2


# ─── Feature access re-checked on read, not just generation ──────────────────


@pytest.mark.asyncio
async def test_report_access_blocked_after_downgrade(client: AsyncClient, db_session):
    """
    Reports generated while on a paid/trial plan must stop being readable
    once the org is downgraded — history, single-report, and download all
    need to re-check billing, not just generation.
    """
    from sqlalchemy import select

    from app.models.organisation import Organisation

    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    gen = await client.post(
        "/reports/generate",
        json={"period_type": "monthly", "export_to_drive": False},
        headers=headers,
    )
    assert gen.status_code == 201
    report_id = gen.json()["report"]["id"]

    result = await db_session.execute(select(Organisation))
    org = result.scalar_one()
    org.trial_used = True
    await db_session.commit()

    resp = await client.post(
        "/reports/generate",
        json={"period_type": "monthly", "export_to_drive": False},
        headers=headers,
    )
    assert resp.status_code == 402

    resp = await client.get("/reports/history", headers=headers)
    assert resp.status_code == 402

    resp = await client.get(f"/reports/{report_id}", headers=headers)
    assert resp.status_code == 402

    resp = await client.get(f"/reports/{report_id}/download?format=html", headers=headers)
    assert resp.status_code == 402


# ─── Filter-aware report titles ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_report_title_uses_org_name_when_unfiltered(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/reports/generate",
        json={"period_type": "monthly", "export_to_drive": False},
        headers=headers,
    )
    body = resp.json()
    assert body["data"]["subject_label"] == "Report Test Firm"
    assert body["report"]["title"] == f"Report Test Firm Report for {body['report']['period_label']}"


@pytest.mark.asyncio
async def test_report_title_uses_client_name_when_filtered(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    cl2 = await client.post("/clients/", json={"name": "Zenith Holdings"}, headers=headers)
    client_id_2 = cl2.json()["id"]

    resp = await client.post(
        "/reports/generate",
        json={
            "period_type": "monthly",
            "export_to_drive": False,
            "client_id": client_id_2,
        },
        headers=headers,
    )
    body = resp.json()
    assert body["data"]["subject_label"] == "Zenith Holdings"
    assert body["report"]["title"] == f"Zenith Holdings Report for {body['report']['period_label']}"


@pytest.mark.asyncio
async def test_report_title_uses_matter_name_when_filtered(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    # setup_with_data already created "Tax Compliance Matter" — fetch its id.
    matters = await client.get("/matters/", headers=headers)
    matter_id = matters.json()["items"][0]["id"]

    resp = await client.post(
        "/reports/generate",
        json={
            "period_type": "monthly",
            "export_to_drive": False,
            "matter_id": matter_id,
        },
        headers=headers,
    )
    body = resp.json()
    assert body["data"]["subject_label"] == "Tax Compliance Matter"


@pytest.mark.asyncio
async def test_report_title_uses_category_when_filtered(client: AsyncClient):
    token = await setup_with_data(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/reports/generate",
        json={
            "period_type": "monthly",
            "export_to_drive": False,
            "matter_type": "compliance",
        },
        headers=headers,
    )
    body = resp.json()
    assert body["data"]["subject_label"] == "Compliance"


def test_matter_type_label_formats_and_special_cases_adr():
    assert _matter_type_label("compliance") == "Compliance"
    assert _matter_type_label("intellectual_property") == "Intellectual Property"
    assert _matter_type_label("adr") == "ADR"


# ─── Styled Google Doc export (pure function, no live Docs API call) ─────────


def _sample_report_data(**overrides) -> ReportData:
    defaults = dict(
        org_id=uuid.uuid4(),
        org_name="Adewale & Co.",
        subject_label="Acme Corp",
        period_label="Q3 2026",
        date_from=date(2026, 7, 1),
        date_to=date(2026, 9, 30),
        generated_at=datetime.now(timezone.utc),
        total_events=42,
        matters_active=1,
        matters_opened=1,
        matters_closed=0,
        clients=[
            ClientActivity(
                client_id=uuid.uuid4(),
                client_name="Acme Corp",
                matter_count=1,
                matters=[
                    MatterActivity(
                        matter_id=uuid.uuid4(),
                        matter_title="Loan Recovery",
                        reference_no="REF-001",
                        status="in_review",
                        event_count=10,
                        events_by_type={},
                        tasks=TaskSummary(total=4, completed=2, overdue=1),
                        documents=DocumentSummary(added=3, versioned=1, signed=1),
                    )
                ],
            )
        ],
    )
    defaults.update(overrides)
    return ReportData(**defaults)


def test_report_title_helper_combines_subject_and_period():
    data = _sample_report_data()
    assert _report_title(data) == "Acme Corp Report for Q3 2026"


def test_build_doc_requests_inserts_title_and_styles_matter_bullets():
    data = _sample_report_data()
    requests = _build_doc_requests(data)

    insert = requests[0]["insertText"]
    assert insert["location"]["index"] == 1
    full_text = insert["text"]
    assert _report_title(data) in full_text

    bullet_requests = [r["createParagraphBullets"] for r in requests if "createParagraphBullets" in r]
    assert len(bullet_requests) == 1  # one matter in the sample data
    start, end = bullet_requests[0]["range"]["startIndex"], bullet_requests[0]["range"]["endIndex"]
    bulleted_text = full_text[start - 1 : end - 1]
    assert "Events this period: 10" in bulleted_text
    assert "Tasks: 2/4 completed, 1 overdue" in bulleted_text
    assert "Documents: 3 added, 1 signed" in bulleted_text

    heading_styles = [
        r["updateParagraphStyle"]["paragraphStyle"]["namedStyleType"]
        for r in requests
        if "updateParagraphStyle" in r
    ]
    assert heading_styles.count("HEADING_1") == 1  # the title
    assert heading_styles.count("HEADING_2") == 2  # "Summary" + the one client section


def test_build_doc_requests_handles_no_activity():
    data = _sample_report_data(clients=[], matters_active=0, matters_opened=0, matters_closed=0)
    requests = _build_doc_requests(data)
    full_text = requests[0]["insertText"]["text"]
    assert "No activity recorded for this period." in full_text
    assert not [r for r in requests if "createParagraphBullets" in r]
