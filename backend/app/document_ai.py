"""Local-first document extraction. OCR results are suggestions and require human verification."""
from pathlib import Path
import re


def extract_document(path: Path, content_type: str) -> tuple[str, str, float]:
    text = ""
    engine = "none"
    if content_type == "application/pdf":
        try:
            from pypdf import PdfReader
            text = "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
            engine = "pypdf"
        except Exception:
            text = ""
    if not text.strip() and content_type.startswith("image/") or (content_type == "application/pdf" and not text.strip()):
        try:
            import pytesseract
            from PIL import Image
            if content_type == "application/pdf":
                from pdf2image import convert_from_path
                images = convert_from_path(str(path), first_page=1, last_page=3)
                text = "\n".join(pytesseract.image_to_string(image, lang="eng+kan") for image in images)
            else:
                text = pytesseract.image_to_string(Image.open(path), lang="eng+kan")
            engine = "tesseract"
        except Exception as exc:
            raise RuntimeError("OCR engine is unavailable. Install Tesseract with English/Kannada language data and PDF rendering support.") from exc
    if not text.strip():
        raise RuntimeError("No readable text found. Upload a clearer scan or image.")
    return text, engine, 0.55 if engine == "pypdf" else 0.45


def normalize(value: str) -> str:
    return re.sub(r"[^\w\s]", "", value, flags=re.UNICODE).strip().lower()


def extract_fields(text: str) -> tuple[str, dict]:
    patterns = {
        "survey_number": [r"(?:survey\s*(?:number|no\.?)?|sy\.?\s*no\.?|survey)\s*[:#-]?\s*([\w/-]+)"],
        "village": [r"\b(?:village|grama?)\b\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{1,60})"],
        "taluk": [r"(?:taluk|tehsil)\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{1,60})"],
        "extent": [r"(?:extent|area)\s*[:#-]?\s*([\d.]+\s*(?:acre|acres|ha|hectare|gunta|sq\.?\s*ft)?)"],
        "beneficiary_name": [r"(?:beneficiary|applicant|owner|name)\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{1,80})"],
        "document_number": [r"(?:document|registration|reference)\s*(?:no\.?|number)?\s*[:#-]?\s*([A-Z0-9/-]{3,30})"],
    }
    fields = {}
    for key, choices in patterns.items():
        for pattern in choices:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                value = re.sub(r"\s+", " ", match.group(1)).strip(" .,:;-")
                if key in {"village", "taluk", "beneficiary_name"}:
                    value = value.splitlines()[0].strip()
                fields[key] = value[:100]
                break
    lower = text.lower()
    if any(term in lower for term in ["rtc", "record of rights", "pahani", "survey number", "survey no"]):
        doc_type = "land_record"
    elif any(term in lower for term in ["sanction", "pmay", "awaas"]):
        doc_type = "scheme_sanction"
    elif any(term in lower for term in ["bank", "loan", "account"]):
        doc_type = "financial_document"
    else:
        doc_type = "unknown"
    # Never persist raw Aadhaar or full phone numbers in extracted fields.
    fields.pop("aadhaar", None)
    return doc_type, fields


def compare_case(fields: dict, case: dict) -> list[dict]:
    checks = []
    for key in ("beneficiary_name", "village", "taluk"):
        extracted = fields.get(key)
        expected = case.get(key)
        if extracted and expected:
            match = normalize(extracted) == normalize(expected)
            checks.append({"field": key, "status": "match" if match else "mismatch", "extracted": extracted, "case_value": expected, "severity": "review" if not match else "info"})
    if not fields:
        checks.append({"field": "extraction", "status": "insufficient_data", "severity": "warning", "message": "No supported fields were extracted; manual review required."})
    return checks
