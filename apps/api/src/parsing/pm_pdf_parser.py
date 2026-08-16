import json
import os
import re
import sys

import pdfplumber


SECTION_RE = re.compile(r"^\s*((?:\d+\.)+\d*|\d+)\s+(.+?)\s*$")


def parse_date_from_filename(file_name: str) -> str:
    match = re.search(r"(\d{2})(\d{2})(\d{4})", file_name)
    if not match:
        return ""

    month, day, year = match.groups()
    return f"{year}-{month}-{day}"


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\n{2,}", "\n", value).strip()


def extract_section(text: str, current_section: tuple[str, str]) -> tuple[str, str]:
    for raw_line in text.splitlines():
        line = raw_line.strip()
        match = SECTION_RE.match(line)
        if not match:
            continue
        title = match.group(2).strip()
        if title.lower().startswith("table of contents"):
            continue
        return match.group(1), title
    return current_section


def parse_pm_pdf(file_path: str) -> dict:
    pdf = pdfplumber.open(file_path)
    references = []
    current_section = ("1", "Introduction")

    for page_index, page in enumerate(pdf.pages, start=1):
        text = normalize_text(page.extract_text(layout=True))
        if not text:
            continue

        current_section = extract_section(text, current_section)
        preview = text[:1600]
        if len(preview.strip()) < 60 and len(page.images) == 0:
            continue

        references.append(
            {
                "sectionCode": current_section[0],
                "sectionTitle": current_section[1],
                "page": page_index,
                "text": preview,
                "imageCount": len(page.images),
            }
        )

    file_name = os.path.basename(file_path)
    return {
        "fileName": file_name,
        "documentDate": parse_date_from_filename(file_name),
        "references": references,
    }


if __name__ == "__main__":
    result = parse_pm_pdf(sys.argv[1])
    print(json.dumps(result))
