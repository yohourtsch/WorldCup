from __future__ import annotations

from flask import Blueprint, jsonify, render_template, request

from models import OddsEntry
from services.odds_calculator import (
    analyze_odds,
    merge_entries,
    normalize_score,
    parse_manual_entries,
    parse_odds_value,
)
from services.providers import get_provider
from utils.csv_parser import parse_odds_csv


main_bp = Blueprint("main", __name__)


LOTTERY_DEFAULT_SCORES = [
    "1:0",
    "2:0",
    "2:1",
    "3:0",
    "3:1",
    "3:2",
    "4:0",
    "4:1",
    "4:2",
    "5:0",
    "5:1",
    "5:2",
    "0:0",
    "1:1",
    "2:2",
    "3:3",
    "0:1",
    "0:2",
    "1:2",
    "0:3",
    "1:3",
    "2:3",
    "0:4",
    "1:4",
    "2:4",
    "0:5",
    "1:5",
    "2:5",
]

FOREIGN_DEFAULT_SCORES = [
    "0:0",
    "0:1",
    "0:2",
    "0:3",
    "1:0",
    "1:1",
    "1:2",
    "1:3",
    "2:0",
    "2:1",
    "2:2",
    "2:3",
    "3:0",
    "3:1",
    "3:2",
    "3:3",
    "4:0",
    "4:1",
    "4:2",
    "4:3",
    "5:0",
    "5:1",
]


@main_bp.route("/", methods=["GET", "POST"])
def index():
    context = _base_context()

    if request.method == "GET":
        context["lottery_table_rows"] = _default_entry_rows(LOTTERY_DEFAULT_SCORES)
        context["foreign_table_rows"] = _default_entry_rows(FOREIGN_DEFAULT_SCORES)
        return render_template("index.html", **context)

    try:
        lottery_manual = _parse_table_entries(
            request.form.getlist("lottery_scores[]"),
            request.form.getlist("lottery_odds_values[]"),
            "体彩赔率",
        )
        foreign_manual = _parse_table_entries(
            request.form.getlist("foreign_scores[]"),
            request.form.getlist("foreign_odds_values[]"),
            "国外赔率",
        )
        lottery_manual.extend(parse_manual_entries(request.form.get("lottery_odds", "")))
        foreign_manual.extend(parse_manual_entries(request.form.get("foreign_odds", "")))
        lottery_csv = parse_odds_csv(request.files.get("lottery_csv"))
        foreign_csv = parse_odds_csv(request.files.get("foreign_csv"))

        lottery_entries = merge_entries(lottery_manual, lottery_csv)
        foreign_entries = merge_entries(foreign_manual, foreign_csv)

        if request.form.get("use_example_api") == "1":
            provider = get_provider(request.form.get("provider", "example"))
            foreign_entries = merge_entries(foreign_entries, provider.fetch_correct_score_odds())

        ev_threshold = float(request.form.get("ev_threshold", "0"))
        sort_by = request.form.get("sort_by", "ev")
        probability_mode = request.form.get("probability_mode", "raw")
        rows, stats = analyze_odds(
            lottery_entries,
            foreign_entries,
            ev_threshold=ev_threshold,
            sort_by=sort_by,
            probability_mode=probability_mode,
        )
        if not lottery_entries:
            context["error"] = "请录入或导入体彩比分赔率。"
        elif not foreign_entries:
            context["error"] = "请录入或导入国外比分赔率。"
        elif stats["matched_scores"] == 0:
            context["error"] = "体彩与国外赔率没有匹配的比分，请检查比分格式。"
        elif not rows:
            context["error"] = "当前EV阈值下没有筛选出价值项。"

        context.update(
            {
                "rows": rows,
                "stats": stats,
                "has_results": bool(rows),
                "highlights": _build_highlights(rows),
                "ev_threshold": ev_threshold,
                "sort_by": sort_by,
                "probability_mode": probability_mode,
                "provider": request.form.get("provider", "example"),
            }
        )
    except ValueError as exc:
        context["error"] = str(exc)
    except NotImplementedError as exc:
        context["error"] = str(exc)

    context["lottery_table_rows"] = _table_rows_from_form(
        request.form.getlist("lottery_scores[]"),
        request.form.getlist("lottery_odds_values[]"),
    )
    context["foreign_table_rows"] = _table_rows_from_form(
        request.form.getlist("foreign_scores[]"),
        request.form.getlist("foreign_odds_values[]"),
    )
    return render_template("index.html", **context)


@main_bp.route("/api/foreign-odds/<provider_name>")
def foreign_odds_api(provider_name):
    provider = get_provider(provider_name)
    try:
        entries = provider.fetch_correct_score_odds(match_id=request.args.get("match_id"))
    except NotImplementedError as exc:
        return jsonify({"provider": provider_name, "error": str(exc)}), 501
    return jsonify(
        {
            "provider": provider.name,
            "odds": [{"score": entry.score, "odds": entry.odds} for entry in entries],
        }
    )


def _base_context():
    return {
        "rows": [],
        "stats": {},
        "highlights": {},
        "has_results": False,
        "error": None,
        "lottery_text": "",
        "foreign_text": "",
        "lottery_table_rows": _default_entry_rows(LOTTERY_DEFAULT_SCORES),
        "foreign_table_rows": _default_entry_rows(FOREIGN_DEFAULT_SCORES),
        "ev_threshold": 0,
        "sort_by": "ev",
        "probability_mode": "raw",
        "provider": "example",
        "probability_mode_options": [
            ("raw", "局部比较：不去水"),
            ("devig", "完整市场：去水化"),
        ],
        "threshold_options": [
            (-0.05, "EV > -5%"),
            (-0.03, "EV > -3%"),
            (0, "EV > 0"),
            (0.03, "EV > 3%"),
            (0.05, "EV > 5%"),
            (0.10, "EV > 10%"),
            (0.15, "EV > 15%"),
        ],
        "sort_options": [
            ("ev", "EV降序"),
            ("kelly", "Kelly降序"),
            ("probability", "概率降序"),
            ("lottery_odds", "体彩赔率降序"),
        ],
        "providers": [
            ("example", "示例Provider"),
            ("pinnacle", "Pinnacle"),
            ("betfair", "Betfair"),
            ("the-odds-api", "The Odds API"),
            ("odds-api-io", "Odds API.io"),
        ],
    }


def _parse_table_entries(scores: list[str], odds_values: list[str], label: str) -> list[OddsEntry]:
    entries: list[OddsEntry] = []
    for index, (score, odds) in enumerate(zip(scores, odds_values), start=1):
        score = score.strip()
        odds = odds.strip()
        if not score and not odds:
            continue
        if score and not odds:
            continue
        if odds and not score:
            raise ValueError(f"{label}第 {index} 行需要同时填写比分和赔率。")
        entries.append(
            OddsEntry(score=normalize_score(score), odds=parse_odds_value(odds))
        )
    return entries


def _table_rows_from_form(scores: list[str], odds_values: list[str]) -> list[dict[str, str]]:
    rows = [
        {"score": score.strip(), "odds": odds.strip()}
        for score, odds in zip(scores, odds_values)
    ]
    rows = [row for row in rows if row["score"] or row["odds"]]
    return rows or _default_entry_rows()


def _default_entry_rows(scores: list[str] | None = None) -> list[dict[str, str]]:
    if not scores:
        return [{"score": "", "odds": ""}]
    return [{"score": score, "odds": ""} for score in scores]


def _build_highlights(rows) -> dict[str, dict[str, str]]:
    highlights: dict[str, dict[str, str]] = {}
    _mark_rank(highlights, rows, "ev", lambda row: row.ev)
    _mark_rank(highlights, rows, "kelly", lambda row: row.full_kelly)
    _mark_rank(highlights, rows, "probability", lambda row: row.fair_probability)
    return highlights


def _mark_rank(highlights, rows, metric: str, key_func) -> None:
    ranked_rows = sorted(rows, key=key_func, reverse=True)[:2]
    for index, row in enumerate(ranked_rows):
        rank = "top" if index == 0 else "second"
        highlights.setdefault(row.score, {})[metric] = f"highlight-{metric}-{rank}"
