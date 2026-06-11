from __future__ import annotations

import re
from collections import OrderedDict
from typing import Iterable

from models import AnalysisRow, OddsEntry


SCORE_PATTERN = re.compile(r"^\s*(\d{1,2})\s*[:：\-]\s*(\d{1,2})\s*$")


def normalize_score(value: str) -> str:
    match = SCORE_PATTERN.match(str(value or ""))
    if not match:
        raise ValueError(f"无效比分：{value}")
    home, away = match.groups()
    return f"{int(home)}:{int(away)}"


def parse_odds_value(value: str | float | int) -> float:
    try:
        odds = float(str(value).strip())
    except (TypeError, ValueError):
        raise ValueError(f"无效赔率：{value}") from None
    if odds <= 1:
        raise ValueError(f"赔率必须大于 1：{value}")
    return odds


def parse_manual_entries(text: str) -> list[OddsEntry]:
    entries: list[OddsEntry] = []
    if not text or not text.strip():
        return entries

    for line_number, line in enumerate(text.splitlines(), start=1):
        clean = line.strip()
        if not clean:
            continue
        if _looks_like_header(clean):
            continue

        parts = re.split(r"[\s,\t]+", clean)
        if len(parts) < 2:
            raise ValueError(f"第 {line_number} 行格式错误，应为：比分 赔率")

        entries.append(
            OddsEntry(score=normalize_score(parts[0]), odds=parse_odds_value(parts[1]))
        )
    return entries


def merge_entries(manual_entries: Iterable[OddsEntry], csv_entries: Iterable[OddsEntry]) -> list[OddsEntry]:
    merged: OrderedDict[str, OddsEntry] = OrderedDict()
    for entry in list(manual_entries) + list(csv_entries):
        merged[entry.score] = entry
    return list(merged.values())


def analyze_odds(
    lottery_entries: Iterable[OddsEntry],
    foreign_entries: Iterable[OddsEntry],
    ev_threshold: float | None = 0,
    sort_by: str = "ev",
    probability_mode: str = "raw",
    selection_order: list[str] | None = None,
) -> tuple[list[AnalysisRow], dict[str, float]]:
    lottery_by_score = {entry.score: entry for entry in lottery_entries}
    foreign_by_score = {entry.score: entry for entry in foreign_entries}
    raw_probabilities = {
        score: 1 / entry.odds for score, entry in foreign_by_score.items()
    }
    raw_total = sum(raw_probabilities.values())

    common_scores = sorted(
        set(lottery_by_score).intersection(foreign_by_score),
        key=_selection_sort_key(selection_order),
    )
    if not common_scores or raw_total <= 0:
        return [], {
            "foreign_raw_total": raw_total,
            "matched_scores": 0,
            "value_count": 0,
            "best_ev": 0,
            "best_kelly": 0,
        }

    all_rows: list[AnalysisRow] = []
    for score in common_scores:
        lottery_odds = lottery_by_score[score].odds
        foreign_odds = foreign_by_score[score].odds
        raw_probability = raw_probabilities[score]
        fair_probability = (
            raw_probability / raw_total
            if probability_mode == "devig"
            else raw_probability
        )
        ev = (fair_probability * lottery_odds) - 1
        full_kelly = max(
            ((lottery_odds * fair_probability) - 1) / (lottery_odds - 1),
            0,
        )
        all_rows.append(
            AnalysisRow(
                score=score,
                lottery_odds=lottery_odds,
                foreign_odds=foreign_odds,
                raw_probability=raw_probability,
                fair_probability=fair_probability,
                ev=ev,
                full_kelly=full_kelly,
                half_kelly=full_kelly / 2,
                quarter_kelly=full_kelly / 4,
                is_value=ev > 0,
            )
        )

    rows = _sort_rows(
        [
            row
            for row in all_rows
            if ev_threshold is None or row.ev > ev_threshold
        ],
        sort_by,
    )
    stats = {
        "foreign_raw_total": raw_total,
        "matched_scores": len(all_rows),
        "value_count": sum(1 for row in all_rows if row.ev > 0),
        "best_ev": max((row.ev for row in all_rows), default=0),
        "best_kelly": max((row.full_kelly for row in all_rows), default=0),
        "probability_mode": probability_mode,
    }
    return rows, stats


def _looks_like_header(line: str) -> bool:
    lowered = line.lower()
    return "score" in lowered or "比分" in lowered or "odds" in lowered or "赔率" in lowered


def _score_sort_key(score: str) -> tuple[int, int]:
    home, away = score.split(":")
    return int(home), int(away)


def _selection_sort_key(selection_order: list[str] | None):
    if selection_order:
        order_map = {selection: index for index, selection in enumerate(selection_order)}
        return lambda selection: (order_map.get(selection, len(order_map)), selection)
    return _score_sort_key


def _sort_rows(rows: list[AnalysisRow], sort_by: str) -> list[AnalysisRow]:
    if sort_by == "market_order":
        return rows

    sorters = {
        "ev": lambda row: row.ev,
        "kelly": lambda row: row.full_kelly,
        "probability": lambda row: row.fair_probability,
        "lottery_odds": lambda row: row.lottery_odds,
    }
    key = sorters.get(sort_by, sorters["ev"])
    return sorted(rows, key=key, reverse=True)
