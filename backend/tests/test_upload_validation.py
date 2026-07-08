# backend/tests/test_upload_validation.py
import pytest
from fastapi import HTTPException

from app.core.upload_validation import validate_upload

PDF_BYTES = b"%PDF-1.4\n%%EOF"
DOCX_BYTES = b"PK\x03\x04" + b"\x00" * 20  # OOXML zip signature
LEGACY_DOC_BYTES = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 20
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 20
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
TEXT_BYTES = b"Plain text memo contents.\nLine two."
EXE_BYTES = b"MZ\x90\x00\x03\x00\x00\x00"  # Windows PE executable signature
HTML_BYTES = b"<html><script>alert(1)</script></html>"


def test_accepts_real_pdf():
    validate_upload("brief.pdf", PDF_BYTES)  # should not raise


def test_accepts_real_docx():
    validate_upload("contract.docx", DOCX_BYTES)


def test_accepts_legacy_doc():
    validate_upload("contract.doc", LEGACY_DOC_BYTES)


def test_accepts_jpeg_and_png():
    validate_upload("exhibit.jpg", JPEG_BYTES)
    validate_upload("scan.png", PNG_BYTES)


def test_accepts_plain_text():
    validate_upload("notes.txt", TEXT_BYTES)


def test_rejects_unsupported_extension():
    with pytest.raises(HTTPException) as exc:
        validate_upload("payload.exe", EXE_BYTES)
    assert exc.value.status_code == 415


def test_rejects_exe_disguised_as_pdf():
    """The core case this exists for: wrong extension is easy to catch, but
    an attacker renaming a .exe to .pdf must also fail on content mismatch."""
    with pytest.raises(HTTPException) as exc:
        validate_upload("totally-a-brief.pdf", EXE_BYTES)
    assert exc.value.status_code == 415


def test_rejects_html_disguised_as_docx():
    with pytest.raises(HTTPException) as exc:
        validate_upload("memo.docx", HTML_BYTES)
    assert exc.value.status_code == 415


def test_rejects_binary_disguised_as_txt():
    with pytest.raises(HTTPException) as exc:
        validate_upload("notes.txt", EXE_BYTES)
    assert exc.value.status_code == 415


def test_rejects_no_extension():
    with pytest.raises(HTTPException):
        validate_upload("noextension", PDF_BYTES)
