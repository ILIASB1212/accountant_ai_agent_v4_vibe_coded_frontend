"""Actual multipart API + OCR adapter tests, without a database or graph startup."""
import io
import os
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont
import pytest

import src.test.test_backend_flow as flow
from src.test.test_backend_flow import api  # noqa: F401 - shared isolated API fixture


def active_client(api):
    client, _, _ = api
    response = client.post(f"{flow.REG}/company", json={"company_name": "OCR Test"}, headers=flow.h("alice"))
    assert response.status_code == 201
    return client


def pdf_bytes(text="FACTURE TEST - Total: 1200.00 MAD", pages=1):
    with fitz.open() as document:
        for _ in range(pages):
            page = document.new_page()
            if text:
                page.insert_text((72, 72), text)
        return document.tobytes()


def image_bytes():
    image = Image.new("RGB", (900, 420), "white")
    draw = ImageDraw.Draw(image)
    draw.text((40, 45), "FACTURE TEST OCR-2026-001\n\nFournisseur: Societe Exemple\nTotal: 1200.00 MAD", fill="black", font=ImageFont.load_default(size=28), spacing=15)
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


def test_pdf_uses_existing_tool_and_leaves_no_document_on_disk(api, monkeypatch):
    client = active_client(api)
    from src.tools import groq_ocr
    original = groq_ocr.ocr_document
    paths = []
    def track(path):
        paths.append(Path(path))
        assert Path(path).exists()
        return original(path)
    monkeypatch.setattr(groq_ocr, "ocr_document", track)
    response = client.post(f"{flow.AG}/ocr", files={"file": ("facture.pdf", pdf_bytes(), "application/pdf")}, headers=flow.h("alice"))
    assert response.status_code == 200
    assert response.json()["filename"] == "facture.pdf"
    assert "1200.00 MAD" in response.json()["text"]
    assert paths and all(not path.exists() for path in paths)


def test_image_routes_through_existing_groq_function(api, monkeypatch):
    client = active_client(api)
    from src.tools import groq_ocr
    calls = []
    def read_image(image_path):
        calls.append(Path(image_path))
        return "Facture extraite : total 1200 MAD"
    monkeypatch.setattr(groq_ocr, "read_image", read_image)
    response = client.post(f"{flow.AG}/ocr", files={"file": ("facture.png", image_bytes(), "image/png")}, headers=flow.h("alice"))
    assert response.status_code == 200
    assert "1200 MAD" in response.json()["text"]
    assert len(calls) == 1 and not calls[0].exists()


@pytest.mark.parametrize("filename,data,status", [
    ("notes.txt", b"not an image", 415),
    ("empty.pdf", b"", 422),
    ("fake.png", b"not an image", 422),
    ("fake.pdf", b"not a PDF", 422),
    ("scan.pdf", pdf_bytes(text=""), 422),
    ("long.pdf", pdf_bytes(pages=21), 422),
    ("wrong.jpg", image_bytes(), 422),
])
def test_invalid_documents_are_rejected(api, filename, data, status):
    client = active_client(api)
    response = client.post(f"{flow.AG}/ocr", files={"file": (filename, data)}, headers=flow.h("alice"))
    assert response.status_code == status


def test_oversize_and_long_extraction_are_rejected(api, monkeypatch):
    client = active_client(api)
    import src.backend.agent.endpoint as endpoint
    monkeypatch.setattr(endpoint, "MAX_UPLOAD_BYTES", 20)
    response = client.post(f"{flow.AG}/ocr", files={"file": ("large.pdf", pdf_bytes())}, headers=flow.h("alice"))
    assert response.status_code == 413
    monkeypatch.setattr(endpoint, "MAX_UPLOAD_BYTES", 10 * 1024 * 1024)
    from src.tools import groq_ocr
    monkeypatch.setattr(groq_ocr, "ocr_document", lambda _: "x" * 16001)
    response = client.post(f"{flow.AG}/ocr", files={"file": ("long.png", image_bytes())}, headers=flow.h("alice"))
    assert response.status_code == 422


def test_upload_requires_an_active_cabinet_member(api):
    client = active_client(api)
    assert client.post(f"{flow.AG}/ocr", files={"file": ("test.pdf", pdf_bytes())}).status_code in {401, 403}
    response = client.post(f"{flow.AG}/ocr", files={"file": ("test.pdf", pdf_bytes())}, headers=flow.h("bob"))
    assert response.status_code == 403


def test_provider_failure_does_not_leak_details_and_cleans_temporary_file(api, monkeypatch):
    client = active_client(api)
    from src.tools import groq_ocr
    paths = []
    def broken(path):
        paths.append(Path(path))
        raise RuntimeError("private-provider-diagnostic")
    monkeypatch.setattr(groq_ocr, "ocr_document", broken)
    response = client.post(f"{flow.AG}/ocr", files={"file": ("test.png", image_bytes())}, headers=flow.h("alice"))
    assert response.status_code == 502
    assert "private-provider" not in response.text
    assert paths and all(not path.exists() for path in paths)


@pytest.mark.skipif(os.getenv("RUN_LIVE_OCR") != "1", reason="explicit live-provider opt-in")
def test_live_groq_synthetic_invoice(api):
    client = active_client(api)
    response = client.post(f"{flow.AG}/ocr", files={"file": ("synthetic-invoice.png", image_bytes(), "image/png")}, headers=flow.h("alice"))
    assert response.status_code == 200, response.text
    assert "1200" in response.json()["text"].replace(",", "").replace(" ", "")
