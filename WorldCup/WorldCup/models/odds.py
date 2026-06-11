from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class OddsEntry:
    score: str
    odds: float


@dataclass(frozen=True)
class AnalysisRow:
    score: str
    lottery_odds: float
    foreign_odds: float
    raw_probability: float
    fair_probability: float
    ev: float
    full_kelly: float
    half_kelly: float
    quarter_kelly: float
    is_value: bool
