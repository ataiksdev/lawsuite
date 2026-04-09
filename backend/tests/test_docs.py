# backend/tests/api/test_docs.py
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "Docs Test Firm",
    "full_name": "Bola Adeyemi",
    "email": "bola@docstest.ng",
    "password": "TestPass123",
}


async def setup(client: AsyncClient) -> tuple[str, str]:
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    cl = await client.post("/clients/", json={"name": "Docs Client"}, headers=headers)
    m = await client.post(
        "/matters/",
        json={
            "title": "Docs Matter",
            "matter_type": "drafting",
            "client_id": cl.json()["id"],
        },
        headers=headers,
    )
    return token, m.json()["id"]


def mock_google_creds():
    from app.core.deps import get_google_credentials
    from app.main import app

    fake_creds = MagicMock()
    app.dependency_overrides[get_google_credentials] = lambda: fake_creds
    return fake_creds


# ─── Generate from template ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_generate_from_template(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    mock_google_creds()

    with patch(
        "app.services.google_docs_service.GoogleDocsService.create_from_template",
        new_callable=AsyncMock,
    ) as mock_create:
        mock_create.return_value = {
            "file_id": "generated-file-id-001",
            "drive_url": "https://docs.google.com/document/d/generated-file-id-001/edit",
            "title": "Engagement Letter — Docs Client",
        }

        resp = await client.post(
            f"/matters/{matter_id}/documents/from-template",
            json={
                "template_file_id": "template-file-id-abc",
                "document_name": "Engagement Letter — Docs Client",
                "doc_type": "engagement_letter",
                "extra_substitutions": {"{{custom_field}}": "Custom Value"},
            },
            headers=headers,
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Engagement Letter — Docs Client"
    assert body["drive_file_id"] == "generated-file-id-001"
    assert body["doc_type"] == "engagement_letter"
    assert body["current_version"] == 1

    # Verify substitutions were called with standard fields
    call_kwargs = mock_create.call_args.kwargs
    assert "{{client_name}}" in call_kwargs["substitutions"]
    assert "{{matter_ref}}" in call_kwargs["substitutions"]
    assert "{{custom_field}}" in call_kwargs["substitutions"]
    assert call_kwargs["substitutions"]["{{custom_field}}"] == "Custom Value"


@pytest.mark.asyncio
async def test_generate_from_template_logs_document_added(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    mock_google_creds()

    with patch(
        "app.services.google_docs_service.GoogleDocsService.create_from_template",
        new_callable=AsyncMock,
        return_value={
            "file_id": "gen-id-002",
            "drive_url": "https://docs.google.com/document/d/gen-id-002/edit",
            "title": "Test Doc",
        },
    ):
        await client.post(
            f"/matters/{matter_id}/documents/from-template",
            json={
                "template_file_id": "tmpl-xyz",
                "document_name": "Test Doc",
            },
            headers=headers,
        )

    activity = await client.get(f"/matters/{matter_id}/activity", headers=headers)
    event_types = [e["event_type"] for e in activity.json()["items"]]
    assert "document_added" in event_types


# ─── List templates ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_templates(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    mock_google_creds()

    with patch(
        "app.services.google_docs_service.GoogleDocsService.get_or_create_templates_folder",
        new_callable=AsyncMock,
        return_value="folder-id-abc",
    ), patch(
        "app.services.google_docs_service.GoogleDocsService.list_templates",
        new_callable=AsyncMock,
        return_value=[
            {
                "id": "t1",
                "name": "Engagement Letter",
                "webViewLink": "https://docs.google.com/t1",
                "modifiedTime": "2025-06-01T10:00:00Z",
            },
            {
                "id": "t2",
                "name": "NDA Template",
                "webViewLink": "https://docs.google.com/t2",
                "modifiedTime": "2025-05-15T09:00:00Z",
            },
        ],
    ):
        resp = await client.get(
            f"/matters/{matter_id}/templates",
            headers=headers,
        )

    assert resp.status_code == 200
    templates = resp.json()
    assert len(templates) == 2
    assert templates[0]["name"] == "Engagement Letter"
    assert templates[1]["name"] == "NDA Template"
    assert "file_id" in templates[0]
    assert "web_view_link" in templates[0]
