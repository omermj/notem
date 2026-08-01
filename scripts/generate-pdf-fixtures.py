# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pypdf==6.14.2",
#   "reportlab==5.0.0",
# ]
# ///

"""Generate deterministic PDF viewer fixtures for manual and automated testing."""

from pathlib import Path
import shutil

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
TEMP = ROOT / "tmp" / "pdfs"
OUTPUT = ROOT / "src-tauri" / "tests" / "fixtures" / "vault" / "attachments" / "pdf-fixtures"


def create_guide(path: Path) -> None:
    pdf = canvas.Canvas(str(path), pagesize=letter, invariant=1)
    width, height = letter
    for page in range(1, 4):
        pdf.bookmarkPage(f"page-{page}")
        pdf.setTitle("NoteM PDF Viewer Fixture")
        pdf.setFont("Helvetica-Bold", 22)
        pdf.drawString(54, height - 70, "NoteM PDF Viewer")
        pdf.setFont("Helvetica", 11)
        pdf.drawString(54, height - 94, f"Deterministic fixture - page {page} of 3")
        pdf.setStrokeColor(colors.HexColor("#6c63ff"))
        pdf.line(54, height - 106, width - 54, height - 106)
        pdf.setFillColor(colors.HexColor("#222222"))
        lines = [
            "This document verifies canvas rendering, selectable text, and search.",
            "Search phrase: local-first knowledge base.",
            "The colored boxes exercise vector graphics and page scaling.",
        ]
        for index, text in enumerate(lines):
            pdf.drawString(54, height - 142 - index * 20, text)
        for index, color in enumerate(("#6c63ff", "#22a06b", "#e56b6f")):
            pdf.setFillColor(colors.HexColor(color))
            pdf.roundRect(54 + index * 118, height - 290, 96, 64, 8, fill=1, stroke=0)
        pdf.setFillColor(colors.HexColor("#222222"))
        if page < 3:
            pdf.drawString(54, 82, "Internal link: next page")
            pdf.linkRect(
                "",
                f"page-{page + 1}",
                (50, 72, 190, 96),
                relative=0,
                thickness=1,
            )
        pdf.drawRightString(width - 54, 42, str(page))
        pdf.showPage()
    pdf.save()


def create_unicode(path: Path) -> None:
    font_path = (
        ROOT
        / "node_modules"
        / "pdfjs-dist"
        / "standard_fonts"
        / "LiberationSans-Regular.ttf"
    )
    if not font_path.is_file():
        raise FileNotFoundError(
            "Liberation Sans is missing; run `pnpm install --frozen-lockfile` first"
        )
    pdfmetrics.registerFont(TTFont("LiberationSans", str(font_path)))
    font = "LiberationSans"
    pdf = canvas.Canvas(str(path), pagesize=letter, invariant=1)
    pdf.setTitle("NoteM Unicode PDF Fixture")
    pdf.setFont(font, 20)
    pdf.drawString(54, 720, "Unicode text rendering")
    pdf.setFont(font, 13)
    pdf.drawString(54, 680, "English - Français - Español - Ελληνικά")
    pdf.drawString(54, 650, "Português - Deutsch - Русский")
    pdf.drawString(54, 610, "Search phrase: multilingual reference")
    pdf.save()


def create_large(path: Path) -> None:
    pdf = canvas.Canvas(str(path), pagesize=letter, invariant=1, pageCompression=1)
    for page in range(1, 81):
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(54, 730, f"Virtualization fixture - page {page}")
        pdf.setFont("Helvetica", 10)
        for row in range(28):
            pdf.drawString(
                54,
                700 - row * 21,
                f"Page {page:02d}, row {row + 1:02d}: render only visible and nearby pages.",
            )
        pdf.showPage()
    pdf.save()


def create_password_protected(source: Path, path: Path) -> None:
    reader = PdfReader(source)
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    writer.add_metadata({"/Title": "NoteM Password PDF Fixture"})
    writer.encrypt("notem")
    with path.open("wb") as stream:
        writer.write(stream)


def main() -> None:
    shutil.rmtree(TEMP, ignore_errors=True)
    TEMP.mkdir(parents=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)

    guide = TEMP / "viewer-guide.pdf"
    create_guide(guide)
    create_unicode(TEMP / "unicode.pdf")
    create_large(TEMP / "large-80-pages.pdf")
    create_password_protected(guide, TEMP / "password-notem.pdf")
    (TEMP / "corrupt.pdf").write_bytes(b"%PDF-1.7\ntruncated fixture\n")

    for fixture in TEMP.iterdir():
        shutil.copy2(fixture, OUTPUT / fixture.name)
    shutil.rmtree(TEMP)


if __name__ == "__main__":
    main()
