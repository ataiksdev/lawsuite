# backend/tests/test_role_permissions.py
"""
Verifies the Viewer/Member/Admin gate added to matters/clients/tasks/documents
actually rejects Viewers on write routes and still lets Members read+write.

No existing test caught the original gap: every test in this suite registers
a brand-new org, which always makes the registering user an "admin" -- so
the Viewer-can-write bug was invisible to the whole suite. These tests mint
a viewer-role token for an otherwise-real user/org (bypassing the invite/
accept-invite email flow, which is exercised separately in test_admin.py)
so we can hit routes with each role directly.
"""
import pytest
from httpx import AsyncClient

from app.core.security import create_access_token

REGISTER = {
    "org_name": "Role Test Firm",
    "full_name": "Ngozi Balogun",
    "email": "ngozi@roletest.ng",
    "password": "TestPass123",
}


async def _register(client: AsyncClient) -> tuple[str, str, str]:
    """Returns (admin_token, user_id, org_id) for a fresh org."""
    reg = await client.post("/auth/register", json=REGISTER)
    body = reg.json()
    return body["tokens"]["access_token"], body["user"]["id"], body["organisation"]["id"]


def _headers_as(user_id: str, org_id: str, role: str) -> dict:
    token = create_access_token(subject=user_id, org_id=org_id, role=role)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_viewer_blocked_from_creating_client(client: AsyncClient):
    _, user_id, org_id = await _register(client)
    viewer_headers = _headers_as(user_id, org_id, "viewer")

    resp = await client.post(
        "/clients/", json={"name": "Should Not Be Created"}, headers=viewer_headers
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_can_still_list_and_read_clients(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    created = await client.post("/clients/", json={"name": "Real Client"}, headers=admin_headers)
    client_id = created.json()["id"]

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    list_resp = await client.get("/clients/", headers=viewer_headers)
    assert list_resp.status_code == 200
    get_resp = await client.get(f"/clients/{client_id}", headers=viewer_headers)
    assert get_resp.status_code == 200


@pytest.mark.asyncio
async def test_viewer_blocked_from_creating_matter(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    cl = await client.post("/clients/", json={"name": "Matter Test Client"}, headers=admin_headers)
    client_id = cl.json()["id"]

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.post(
        "/matters/",
        json={"title": "Should Not Be Created", "matter_type": "compliance", "client_id": client_id},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_creating_task(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    cl = await client.post("/clients/", json={"name": "Task Test Client"}, headers=admin_headers)
    client_id = cl.json()["id"]
    m = await client.post(
        "/matters/",
        json={"title": "Task Test Matter", "matter_type": "compliance", "client_id": client_id},
        headers=admin_headers,
    )
    matter_id = m.json()["id"]

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.post(
        f"/matters/{matter_id}/tasks",
        json={"title": "Should Not Be Created"},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_deleting_matter(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    cl = await client.post("/clients/", json={"name": "Delete Test Client"}, headers=admin_headers)
    client_id = cl.json()["id"]
    m = await client.post(
        "/matters/",
        json={"title": "Delete Test Matter", "matter_type": "compliance", "client_id": client_id},
        headers=admin_headers,
    )
    matter_id = m.json()["id"]

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.delete(f"/matters/{matter_id}", headers=viewer_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_member_role_can_still_write(client: AsyncClient):
    """Sanity check: the gate is is_member (admin OR member), not is_admin-only."""
    _, user_id, org_id = await _register(client)
    member_headers = _headers_as(user_id, org_id, "member")

    resp = await client.post("/clients/", json={"name": "Member Can Create"}, headers=member_headers)
    assert resp.status_code == 201


async def _setup_matter_with_task(client: AsyncClient, admin_headers: dict) -> tuple[str, str]:
    """Returns (matter_id, task_id) for a fresh client/matter/task."""
    cl = await client.post("/clients/", json={"name": "Sub-resource Client"}, headers=admin_headers)
    m = await client.post(
        "/matters/",
        json={"title": "Sub-resource Matter", "matter_type": "compliance", "client_id": cl.json()["id"]},
        headers=admin_headers,
    )
    matter_id = m.json()["id"]
    t = await client.post(
        f"/matters/{matter_id}/tasks", json={"title": "Sub-resource Task"}, headers=admin_headers
    )
    return matter_id, t.json()["id"]


@pytest.mark.asyncio
async def test_viewer_blocked_from_updating_client(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    cl = await client.post("/clients/", json={"name": "Update Test Client"}, headers=admin_headers)
    client_id = cl.json()["id"]

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.patch(
        f"/clients/{client_id}", json={"name": "Renamed By Viewer"}, headers=viewer_headers
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_archiving_client(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    cl = await client.post("/clients/", json={"name": "Archive Test Client"}, headers=admin_headers)
    client_id = cl.json()["id"]

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.delete(f"/clients/{client_id}", headers=viewer_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_updating_matter(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    matter_id, _ = await _setup_matter_with_task(client, admin_headers)

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.patch(
        f"/matters/{matter_id}", json={"title": "Renamed By Viewer"}, headers=viewer_headers
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_changing_matter_status(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    matter_id, _ = await _setup_matter_with_task(client, admin_headers)

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.patch(
        f"/matters/{matter_id}/status", json={"status": "open"}, headers=viewer_headers
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_updating_task(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    matter_id, task_id = await _setup_matter_with_task(client, admin_headers)

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.patch(
        f"/matters/{matter_id}/tasks/{task_id}",
        json={"title": "Renamed By Viewer"},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_deleting_task(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    matter_id, task_id = await _setup_matter_with_task(client, admin_headers)

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.delete(f"/matters/{matter_id}/tasks/{task_id}", headers=viewer_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_adding_comment(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    matter_id, task_id = await _setup_matter_with_task(client, admin_headers)

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.post(
        f"/matters/{matter_id}/tasks/{task_id}/comments",
        json={"body": "Viewer should not be able to post this"},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_deleting_comment(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    matter_id, task_id = await _setup_matter_with_task(client, admin_headers)
    comment = await client.post(
        f"/matters/{matter_id}/tasks/{task_id}/comments",
        json={"body": "Admin's comment"},
        headers=admin_headers,
    )
    comment_id = comment.json()["id"]

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.delete(
        f"/matters/{matter_id}/tasks/{task_id}/comments/{comment_id}", headers=viewer_headers
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_adding_watcher(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    matter_id, task_id = await _setup_matter_with_task(client, admin_headers)

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.post(
        f"/matters/{matter_id}/tasks/{task_id}/watchers",
        json={"user_id": user_id},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_removing_watcher(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    matter_id, task_id = await _setup_matter_with_task(client, admin_headers)
    await client.post(
        f"/matters/{matter_id}/tasks/{task_id}/watchers",
        json={"user_id": user_id},
        headers=admin_headers,
    )

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.delete(
        f"/matters/{matter_id}/tasks/{task_id}/watchers/{user_id}", headers=viewer_headers
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_adding_document_link(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    matter_id, task_id = await _setup_matter_with_task(client, admin_headers)
    doc = await client.post(
        f"/matters/{matter_id}/documents",
        json={
            "name": "Linked Doc",
            "drive_file_id": "some-drive-file-id",
            "drive_url": "https://docs.google.com/document/d/some-drive-file-id/edit",
        },
        headers=admin_headers,
    )
    doc_id = doc.json()["id"]

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.post(
        f"/matters/{matter_id}/tasks/{task_id}/document-links",
        json={"document_id": doc_id},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_blocked_from_removing_document_link(client: AsyncClient):
    admin_token, user_id, org_id = await _register(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    matter_id, task_id = await _setup_matter_with_task(client, admin_headers)
    doc = await client.post(
        f"/matters/{matter_id}/documents",
        json={
            "name": "Linked Doc",
            "drive_file_id": "some-drive-file-id-2",
            "drive_url": "https://docs.google.com/document/d/some-drive-file-id-2/edit",
        },
        headers=admin_headers,
    )
    doc_id = doc.json()["id"]
    await client.post(
        f"/matters/{matter_id}/tasks/{task_id}/document-links",
        json={"document_id": doc_id},
        headers=admin_headers,
    )

    viewer_headers = _headers_as(user_id, org_id, "viewer")
    resp = await client.delete(
        f"/matters/{matter_id}/tasks/{task_id}/document-links/{doc_id}", headers=viewer_headers
    )
    assert resp.status_code == 403
