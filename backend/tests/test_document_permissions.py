# backend/tests/test_document_permissions.py
"""
Role-check coverage for app/api/documents.py -- the one router with both
MemberUser (per-matter document CRUD) and AdminUser (firm-wide templates)
gates, and the only one of the four RLS/role-check routers that had zero
test coverage after that change.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token

REGISTER = {
    "org_name": "Doc Permissions Firm",
    "full_name": "Femi Adisa",
    "email": "femi@docpermtest.ng",
    "password": "TestPass123",
}

LINK_PAYLOAD = {
    "name": "Engagement Letter",
    "drive_file_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74",
    "drive_url": "https://docs.google.com/document/d/1BxiMVs0XRA5/edit",
    "doc_type": "engagement_letter",
    "label": "unsigned draft",
}

PDF_BYTES = b"%PDF-1.4\n%%EOF"


def _headers_as(user_id: str, org_id: str, role: str) -> dict:
    token = create_access_token(subject=user_id, org_id=org_id, role=role)
    return {"Authorization": f"Bearer {token}"}


def _mock_google_creds():
    from app.core.deps import get_google_credentials
    from app.main import app

    app.dependency_overrides[get_google_credentials] = lambda: MagicMock()


async def _setup(client: AsyncClient) -> tuple[str, str, str, str]:
    """Register, create a client + matter + one linked document.
    Returns (admin_token, user_id, org_id, matter_id)."""
    reg = await client.post("/auth/register", json=REGISTER)
    body = reg.json()
    admin_token = body["tokens"]["access_token"]
    user_id = body["user"]["id"]
    org_id = body["organisation"]["id"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    cl = await client.post("/clients/", json={"name": "Doc Perm Client"}, headers=admin_headers)
    m = await client.post(
        "/matters/",
        json={"title": "Doc Perm Matter", "matter_type": "drafting", "client_id": cl.json()["id"]},
        headers=admin_headers,
    )
    matter_id = m.json()["id"]
    return admin_token, user_id, org_id, matter_id


async def _link_a_document(client: AsyncClient, admin_headers: dict, matter_id: str) -> str:
    doc = await client.post(f"/matters/{matter_id}/documents", json=LINK_PAYLOAD, headers=admin_headers)
    return doc.json()["id"]


# ─── MemberUser-gated routes: viewers blocked ─────────────────────────────────


@pytest.mark.asyncio
async def test_viewer_blocked_from_link_document(client: AsyncClient):
    _, user_id, org_id, matter_id = await _setup(client)
    viewer_headers = _headers_as(user_id, org_id, "viewer")

    resp = await client.post(f"/matters/{matter_id}/documents", json=LINK_PAYLOAD, headers=viewer_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_add_document_version(client: AsyncClient):
    admin_token, user_id, org_id, matter_id = await _setup(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    doc_id = await _link_a_document(client, admin_headers, matter_id)

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.post(
        f"/matters/{matter_id}/documents/{doc_id}/versions",
        json={
            "drive_file_id": "signed-file-id",
            "drive_url": "https://docs.google.com/document/d/signed-file-id/edit",
            "label": "signed copy",
        },
        headers=viewer_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_updating_document_status(client: AsyncClient):
    admin_token, user_id, org_id, matter_id = await _setup(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    doc_id = await _link_a_document(client, admin_headers, matter_id)

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.patch(
        f"/matters/{matter_id}/documents/{doc_id}/status",
        json={"status": "signed"},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_deleting_document(client: AsyncClient):
    admin_token, user_id, org_id, matter_id = await _setup(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    doc_id = await _link_a_document(client, admin_headers, matter_id)

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.delete(f"/matters/{matter_id}/documents/{doc_id}", headers=viewer_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_uploading_document(client: AsyncClient):
    _, user_id, org_id, matter_id = await _setup(client)
    _mock_google_creds()
    viewer_headers = _headers_as(user_id, org_id, "viewer")

    resp = await client.post(
        f"/matters/{matter_id}/documents/upload",
        headers=viewer_headers,
        files={"file": ("brief.pdf", PDF_BYTES, "application/pdf")},
        data={"doc_type": "other"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_generate_from_template(client: AsyncClient):
    _, user_id, org_id, matter_id = await _setup(client)
    _mock_google_creds()
    viewer_headers = _headers_as(user_id, org_id, "viewer")

    resp = await client.post(
        f"/matters/{matter_id}/documents/from-template",
        json={"template_file_id": "tmpl-1", "document_name": "Generated Doc"},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_can_still_read_documents(client: AsyncClient):
    admin_token, user_id, org_id, matter_id = await _setup(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    doc_id = await _link_a_document(client, admin_headers, matter_id)

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    list_resp = await client.get(f"/matters/{matter_id}/documents", headers=viewer_headers)
    assert list_resp.status_code == 200
    versions_resp = await client.get(
        f"/matters/{matter_id}/documents/{doc_id}/versions", headers=viewer_headers
    )
    assert versions_resp.status_code == 200


# ─── AdminUser-gated routes: firm-wide templates ──────────────────────────────


@pytest.mark.asyncio
async def test_member_blocked_from_uploading_firm_template(client: AsyncClient):
    _, user_id, org_id, _ = await _setup(client)
    _mock_google_creds()
    member_headers = _headers_as(user_id, org_id, "member")

    resp = await client.post(
        "/documents/templates/upload",
        headers=member_headers,
        files={"file": ("template.docx", b"PK\x03\x04" + b"\x00" * 20, "application/octet-stream")},
        data={"template_name": "NDA Template"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_member_blocked_from_deleting_firm_template(client: AsyncClient):
    _, user_id, org_id, _ = await _setup(client)
    _mock_google_creds()
    member_headers = _headers_as(user_id, org_id, "member")

    resp = await client.delete("/documents/templates/some-file-id", headers=member_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_upload_firm_template(client: AsyncClient):
    admin_token, _, _, _ = await _setup(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    _mock_google_creds()

    with patch(
        "app.services.google_docs_service.GoogleDocsService.get_or_create_templates_folder",
        new_callable=AsyncMock,
        return_value="templates-folder-id",
    ), patch(
        "app.services.google_docs_service.GoogleDocsService.upload_template",
        new_callable=AsyncMock,
        return_value={
            "id": "new-template-id",
            "name": "NDA Template",
            "webViewLink": "https://drive.google.com/file/d/new-template-id/view",
            "modifiedTime": "2026-01-01T00:00:00Z",
        },
    ):
        resp = await client.post(
            "/documents/templates/upload",
            headers=admin_headers,
            files={"file": ("template.docx", b"PK\x03\x04" + b"\x00" * 20, "application/octet-stream")},
            data={"template_name": "NDA Template"},
        )

    assert resp.status_code == 201
    assert resp.json()["file_id"] == "new-template-id"
