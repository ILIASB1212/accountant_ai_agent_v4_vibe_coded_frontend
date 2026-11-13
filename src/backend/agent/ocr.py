"""Temporary-file adapter for the existing OCR tool. No document persistence."""
from pathlib import Path
from tempfile import TemporaryDirectory
import warnings

from PIL import Image, UnidentifiedImageError
import fitz

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_EXTRACTED_CHARACTERS = 16000
SUPPORTED_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg"}


class DocumentError(ValueError):
    """A document cannot be processed as supplied."""


def extract_document(data: bytes, suffix: str) -> str:
    if suffix not in SUPPORTED_SUFFIXES:
        raise DocumentError("Formats acceptés : PDF, PNG et JPEG.")
    if not data:
        raise DocumentError("Le fichier est vide.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise DocumentError("Le fichier dépasse la limite de 10 Mo.")
    with TemporaryDirectory(prefix="accountant-ocr-") as directory:
        path = Path(directory) / ("document" + suffix)
        path.write_bytes(data)
        if suffix == ".pdf":
            try:
                with fitz.open(stream=data, filetype="pdf") as document:
                    if not document.is_pdf or document.needs_pass:
                        raise DocumentError("Le PDF est protégé ou non valide. Importez un PDF lisible sans mot de passe.")
                    if document.page_count > 20:
                        raise DocumentError("Le PDF dépasse la limite de 20 pages. Importez un extrait plus court.")
            except DocumentError:
                raise
            except Exception as error:
                raise DocumentError("Le fichier PDF est endommagé ou non valide.") from error
        else:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("error", Image.DecompressionBombWarning)
                    with Image.open(path) as image:
                        expected = "PNG" if suffix == ".png" else "JPEG"
                        if image.format != expected:
                            raise DocumentError("Le contenu du fichier ne correspond pas à son extension.")
                        if image.width * image.height > 25_000_000:
                            raise DocumentError("L'image est trop grande. Réduisez-la à 25 mégapixels maximum.")
                        image.verify()
            except DocumentError:
                raise
            except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombWarning, Image.DecompressionBombError) as error:
                raise DocumentError("L'image est endommagée ou non valide.") from error

        # Import lazily: OCR dependencies do not affect ordinary chat startup.
        from src.tools.groq_ocr import ocr_document
        text = ocr_document(str(path))
        if not isinstance(text, str) or not text.strip():
            raise DocumentError("Aucun texte exploitable trouvé. Pour un PDF scanné, importez ses pages en images PNG ou JPEG.")
        text = text.strip()
        if len(text) > MAX_EXTRACTED_CHARACTERS:
            raise DocumentError("Le texte dépasse 16 000 caractères. Importez un document plus court.")
        return text
