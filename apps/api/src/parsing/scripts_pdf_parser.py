import json
import os
import re
import sys

import pdfplumber


SECTION_RE = re.compile(r"^\s*(1\.\d+(?:\.\d+)*)\s+(.+?)\s*$")


def parse_date_from_filename(file_name: str) -> str:
    match = re.search(r"(\d{2})(\d{2})(\d{4})", file_name)
    if not match:
        return ""

    month, day, year = match.groups()
    return f"{year}-{month}-{day}"


def normalize_cell(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\n{2,}", "\n", value).strip()


def extract_section(page) -> tuple[str, str] | None:
    text = page.extract_text(layout=True) or ""
    for raw_line in text.splitlines():
        line = raw_line.strip()
        match = SECTION_RE.match(line)
        if match and "contents" not in match.group(2).lower():
            return match.group(1), match.group(2).strip()
    return None


def make_entry(section_code: str, section_title: str, page_number: int, row: list[str]) -> dict:
    scenario = normalize_cell(row[0] if len(row) > 0 else "")
    script = normalize_cell(row[1] if len(row) > 1 else "")
    notes = normalize_cell(row[2] if len(row) > 2 else "")
    scenario_key = re.sub(r"[^a-z0-9]+", "-", scenario.lower()).strip("-")[:60]

    return {
        "id": f"{section_code}:{page_number}:{scenario_key or 'row'}",
        "sectionCode": section_code,
        "sectionTitle": section_title,
        "pageStart": page_number,
        "pageEnd": page_number,
        "scenarioText": scenario,
        "scriptText": script,
        "notesText": notes,
    }


def append_continuation(entry: dict, row: list[str], page_number: int):
    if len(row) > 1 and row[1]:
        entry["scriptText"] = normalize_cell(f"{entry['scriptText']}\n{row[1]}")
    if len(row) > 2 and row[2]:
        entry["notesText"] = normalize_cell(f"{entry['notesText']}\n{row[2]}")
    entry["pageEnd"] = page_number


def parse_scripts_pdf(file_path: str) -> dict:
    pdf = pdfplumber.open(file_path)
    entries = []
    current_entry = None
    current_section = ("1.0", "Unknown Section")

    for page_index, page in enumerate(pdf.pages, start=1):
        section = extract_section(page)
        if section:
            current_section = section

        tables = page.extract_tables() or []

        for table in tables:
            for row in table:
                cells = [normalize_cell(cell) for cell in row]
                if not any(cells):
                    continue

                joined = " ".join(cells).lower()
                if joined == "scenario script notes":
                    continue

                if len(cells) < 3:
                    cells = cells + [""] * (3 - len(cells))

                if cells[0].startswith("Note:") and not cells[1] and not cells[2]:
                    continue

                if cells[0]:
                    current_entry = make_entry(current_section[0], current_section[1], page_index, cells)
                    entries.append(current_entry)
                    continue

                if current_entry is not None:
                    append_continuation(current_entry, cells, page_index)

    file_name = os.path.basename(file_path)
    return {
        "fileName": file_name,
        "documentDate": parse_date_from_filename(file_name),
        "entries": entries,
    }


if __name__ == "__main__":
    result = parse_scripts_pdf(sys.argv[1])
    print(json.dumps(result))
