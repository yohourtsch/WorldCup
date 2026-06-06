from __future__ import annotations

import csv
import io
from typing import Iterable

from models import OddsEntry
from services.odds_calculator import normalize_score, parse_odds_value


SCORE_HEADERS = {"score", "比分", "correct_score", "result"}
ODDS_HEADERS = {"odds", "赔率", "price", "decimal_odds"}


def parse_odds_csv(file_storage) -> list[OddsEntry]:
    if not file_storage or not file_storage.filename:
        return []

    raw = file_storage.read()
    if not raw:
        return []

    text = raw.decode("utf-8-sig")
    sample = text[:1024]
    try:
        dialect = csv.Sniffer().sniff(sample)
    except csv.Error:
        dialect = csv.excel

    reader = csv.reader(io.StringIO(text), dialect)
    rows = [row for row in reader if any(cell.strip() for cell in row)]
    if not rows:
        return []

    data_rows = _rows_without_header(rows)
    return list(_entries_from_rows(data_rows))


def _rows_without_header(rows: list[list[str]]) -> list[list[str]]:
    first = [cell.strip().lower() for cell in rows[0]]
    has_score = any(cell in SCORE_HEADERS for cell in first)
    has_odds = any(cell in ODDS_HEADERS for cell in first)
    return rows[1:] if has_score or has_odds else rows


def _entries_from_rows(rows: Iterable[list[str]]) -> Iterable[OddsEntry]:
    for index, row in enumerate(rows, start=1):
        if len(row) < 2:
            raise ValueError(f"CSV第 {index} 行至少需要两列：比分,赔率")
        score = normalize_score(row[0])
        odds = parse_odds_value(row[1])
        yield OddsEntry(score=score, odds=odds)
