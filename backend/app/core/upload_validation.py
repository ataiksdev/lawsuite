# backend/app/core/upload_validation.py
"""
Validates uploaded files by extension + magic-byte signature, not just the
client-supplied Content-Type header (which is trivially spoofable). Used by
both the per-matter document upload and firm-wide template upload routes in
app/api/documents.py.

This is a practical bar against uploading disguised executables/HTML/SVG
into a legal document store -- it is not a full content/structure validator
(e.g. it won't catch a booby-trapped macro inside an otherwise-valid .docx)
and is not a substitute for antivirus scanning.
"""
from fastapi import HTTPException, status

_PDF = (b"%PDF-",)
_OLE = (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",)  # legacy .doc / .xls / .ppt
_OOXML = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")  # .docx / .xlsx / .pptx (zip-based)
_JPEG = (b"\xff\xd8\xff",)
_PNG = (b"\x89PNG\r\n\x1a\n",)
_RTF = (b"{\\rtf",)

# extension -> accepted magic-byte signatures, or None if the type has no
# reliable signature (validated separately, see _looks_like_text below).
ALLOWED_EXTENSIONS: dict[str, tuple[bytes, ...] | None] = {
    ".pdf": _PDF,
    ".doc": _OLE,
    ".xls": _OLE,
    ".ppt": _OLE,
    ".docx": _OOXML,
    ".xlsx": _OOXML,
    ".pptx": _OOXML,
    ".rtf": _RTF,
    ".jpg": _JPEG,
    ".jpeg": _JPEG,
    ".png": _PNG,
    ".txt": None,
}


def _looks_like_text(file_bytes: bytes) -> bool:
    sample = file_bytes[:65536]
    if b"\x00" in sample:
        return False
    try:
        sample.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


def validate_upload(filename: str, file_bytes: bytes) -> None:
    """Raises HTTPException(415) if the file's extension isn't on the
    allowlist, or its content doesn't match what that extension claims."""
    name = (filename or "").lower()
    ext = "." + name.rsplit(".", 1)[-1] if "." in name else ""

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported file type '{ext or 'unknown'}'. "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            ),
        )

    signatures = ALLOWED_EXTENSIONS[ext]
    if signatures is None:
        if not _looks_like_text(file_bytes):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="File content doesn't look like a plain text file.",
            )
        return

    if not any(file_bytes.startswith(sig) for sig in signatures):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File content doesn't match its '{ext}' extension.",
        )
