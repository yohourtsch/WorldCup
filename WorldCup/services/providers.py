from __future__ import annotations

from abc import ABC, abstractmethod

from models import OddsEntry
from services.odds_calculator import normalize_score, parse_odds_value


class ForeignOddsProvider(ABC):
    name = "base"

    @abstractmethod
    def fetch_correct_score_odds(self, match_id: str | None = None) -> list[OddsEntry]:
        """Return odds normalized as [{"score": "2:1", "odds": 9.5}]."""


class PlaceholderProvider(ForeignOddsProvider):
    name = "placeholder"

    def fetch_correct_score_odds(self, match_id: str | None = None) -> list[OddsEntry]:
        raise NotImplementedError("API接入已预留，请在具体Provider中实现。")


class StaticExampleProvider(ForeignOddsProvider):
    name = "example"

    def fetch_correct_score_odds(self, match_id: str | None = None) -> list[OddsEntry]:
        example = [
            {"score": "0:0", "odds": 8.1},
            {"score": "1:0", "odds": 6.5},
            {"score": "2:0", "odds": 12.5},
            {"score": "2:1", "odds": 9.2},
        ]
        return [
            OddsEntry(score=normalize_score(item["score"]), odds=parse_odds_value(item["odds"]))
            for item in example
        ]


PROVIDERS: dict[str, ForeignOddsProvider] = {
    "example": StaticExampleProvider(),
    "pinnacle": PlaceholderProvider(),
    "betfair": PlaceholderProvider(),
    "the-odds-api": PlaceholderProvider(),
    "odds-api-io": PlaceholderProvider(),
}


def get_provider(provider_name: str) -> ForeignOddsProvider:
    return PROVIDERS.get(provider_name, PROVIDERS["example"])
