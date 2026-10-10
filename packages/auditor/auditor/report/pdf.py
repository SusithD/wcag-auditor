from __future__ import annotations

from pathlib import Path


def render_pdf(html_path: Path, pdf_path: Path, timeout_s: float = 120) -> Path:
    """Print the self-contained report with Chromium (Playwright page.pdf)."""
    from auditor import browser as shared

    pw = shared.acquire()
    try:
        browser = pw.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            page.set_default_timeout(timeout_s * 1000)
            page.set_content(html_path.read_text(encoding="utf-8"), wait_until="load")
            page.pdf(
                path=str(pdf_path),
                format="A4",
                print_background=True,
                margin={"top": "14mm", "bottom": "14mm", "left": "12mm", "right": "12mm"},
            )
        finally:
            browser.close()
    finally:
        shared.release()
    return pdf_path
