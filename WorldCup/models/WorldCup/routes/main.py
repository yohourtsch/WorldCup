from __future__ import annotations

from flask import Blueprint, jsonify, redirect, render_template, request, url_for

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

HALF_FULL_OPTIONS = ["胜胜", "胜平", "胜负", "平胜", "平平", "平负", "负胜", "负平", "负负"]
TOTAL_GOALS_OPTIONS = ["1球", "2球", "3球", "4球", "5球", "6球", "7球"]
MATCH_RESULT_OPTIONS = ["胜", "负", "平"]

MARKETS = {
    "correct-score": {
        "key": "correct-score",
        "module_label": "模块一",
        "title": "比分",
        "headline": "比分价值分析工作台",
        "description": "体彩比分赔率与国外比分盘对齐后计算EV和Kelly。",
        "selection_label": "比分",
        "lottery_label": "体彩比分赔率",
        "foreign_label": "国外比分赔率",
        "lottery_defaults": LOTTERY_DEFAULT_SCORES,
        "foreign_defaults": FOREIGN_DEFAULT_SCORES,
        "normalizer": normalize_score,
        "manual_parser": parse_manual_entries,
        "placeholder": "0:0",
        "lottery_odds_placeholder": "8.50",
        "foreign_odds_placeholder": "8.10",
        "path": "/",
        "endpoint": "main.index",
    },
    "half-full": {
        "key": "half-full",
        "module_label": "模块二",
        "title": "半全场胜平负",
        "headline": "半全场胜平负分析工作台",
        "description": "体彩半全场赔率与国外同市场赔率对齐后计算EV和Kelly。",
        "selection_label": "赛果",
        "lottery_label": "体彩半全场赔率",
        "foreign_label": "国外半全场赔率",
        "lottery_defaults": HALF_FULL_OPTIONS,
        "foreign_defaults": HALF_FULL_OPTIONS,
        "normalizer": lambda value: _normalize_option(value, HALF_FULL_OPTIONS, "半全场选项"),
        "manual_parser": lambda text: _parse_manual_options(text, HALF_FULL_OPTIONS, "半全场选项"),
        "placeholder": "胜胜",
        "lottery_odds_placeholder": "3.20",
        "foreign_odds_placeholder": "3.10",
        "path": "/half-full",
        "endpoint": "main.half_full",
    },
    "total-goals": {
        "key": "total-goals",
        "module_label": "模块三",
        "title": "总进球数",
        "headline": "总进球数分析工作台",
        "description": "体彩总进球数赔率与国外同市场赔率对齐后计算EV和Kelly。",
        "selection_label": "进球数",
        "lottery_label": "体彩总进球数赔率",
        "foreign_label": "国外总进球数赔率",
        "lottery_defaults": TOTAL_GOALS_OPTIONS,
        "foreign_defaults": TOTAL_GOALS_OPTIONS,
        "normalizer": lambda value: _normalize_option(value, TOTAL_GOALS_OPTIONS, "总进球数选项"),
        "manual_parser": lambda text: _parse_manual_options(text, TOTAL_GOALS_OPTIONS, "总进球数选项"),
        "placeholder": "1球",
        "lottery_odds_placeholder": "4.50",
        "foreign_odds_placeholder": "4.30",
        "path": "/total-goals",
        "endpoint": "main.total_goals",
    },
    "match-result": {
        "key": "match-result",
        "module_label": "模块四",
        "title": "胜负平",
        "headline": "胜负平分析工作台",
        "description": "体彩胜负平赔率与国外同市场赔率对齐后计算EV和Kelly。",
        "selection_label": "赛果",
        "lottery_label": "体彩胜负平赔率",
        "foreign_label": "国外胜负平赔率",
        "lottery_defaults": MATCH_RESULT_OPTIONS,
        "foreign_defaults": MATCH_RESULT_OPTIONS,
        "normalizer": lambda value: _normalize_option(value, MATCH_RESULT_OPTIONS, "胜负平选项"),
        "manual_parser": lambda text: _parse_manual_options(text, MATCH_RESULT_OPTIONS, "胜负平选项"),
        "placeholder": "胜",
        "lottery_odds_placeholder": "2.10",
        "foreign_odds_placeholder": "2.05",
        "path": "/match-result",
        "endpoint": "main.match_result",
    },
}


@main_bp.route("/", methods=["GET", "POST"])
def index():
    return _market_page(MARKETS["correct-score"])


@main_bp.route("/half-full", methods=["GET", "POST"])
def half_full():
    return _market_page(MARKETS["half-full"])


@main_bp.route("/total-goals", methods=["GET", "POST"])
def total_goals():
    return _market_page(MARKETS["total-goals"])


@main_bp.route("/match-result", methods=["GET", "POST"])
def match_result():
    return _market_page(MARKETS["match-result"])


@main_bp.route("/market/<market_key>")
def market_alias(market_key):
    market = MARKETS.get(market_key)
    if not market:
        return redirect(url_for("main.index"))
    return redirect(url_for(market["endpoint"]))


def _market_page(market):
    context = _base_context(market)

    if request.method == "GET":
        return render_template("index.html", **context)

    try:
        lottery_manual = _parse_table_entries(
            request.form.getlist("lottery_scores[]"),
            request.form.getlist("lottery_odds_values[]"),
            market["lottery_label"],
            market["normalizer"],
        )
        foreign_manual = _parse_table_entries(
            request.form.getlist("foreign_scores[]"),
            request.form.getlist("foreign_odds_values[]"),
            market["foreign_label"],
            market["normalizer"],
        )
        lottery_manual.extend(market["manual_parser"](request.form.get("lottery_odds", "")))
        foreign_manual.extend(market["manual_parser"](request.form.get("foreign_odds", "")))
        lottery_csv = parse_odds_csv(request.files.get("lottery_csv"), market["normalizer"])
        foreign_csv = parse_odds_csv(request.files.get("foreign_csv"), market["normalizer"])

        lottery_entries = merge_entries(lottery_manual, lottery_csv)
        foreign_entries = merge_entries(foreign_manual, foreign_csv)

        if market["key"] == "correct-score" and request.form.get("use_example_api") == "1":
            provider = get_provider(request.form.get("provider", "example"))
            foreign_entries = merge_entries(foreign_entries, provider.fetch_correct_score_odds())

        ev_threshold_value = request.form.get("ev_threshold", "0")
        ev_threshold = _parse_ev_threshold(ev_threshold_value)
        sort_by = request.form.get("sort_by", "ev")
        probability_mode = request.form.get("probability_mode", "raw")
        rows, stats = analyze_odds(
            lottery_entries,
            foreign_entries,
            ev_threshold=ev_threshold,
            sort_by=sort_by,
            probability_mode=probability_mode,
            selection_order=market["lottery_defaults"],
        )
        if not lottery_entries:
            context["error"] = f"请录入或导入{market['lottery_label']}。"
        elif not foreign_entries:
            context["error"] = f"请录入或导入{market['foreign_label']}。"
        elif stats["matched_scores"] == 0:
            context["error"] = f"体彩与国外赔率没有匹配的{market['selection_label']}，请检查格式。"
        elif not rows:
            context["error"] = "当前EV阈值下没有筛选出价值项。"

        context.update(
            {
                "rows": rows,
                "stats": stats,
                "has_results": bool(rows),
                "highlights": _build_highlights(rows),
                "ev_threshold": ev_threshold_value,
                "ev_threshold_label": _format_ev_threshold(ev_threshold_value),
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
        market["lottery_defaults"],
    )
    context["foreign_table_rows"] = _table_rows_from_form(
        request.form.getlist("foreign_scores[]"),
        request.form.getlist("foreign_odds_values[]"),
        market["foreign_defaults"],
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


def _base_context(market):
    return {
        "market": market,
        "markets": list(MARKETS.values()),
        "rows": [],
        "stats": {},
        "highlights": {},
        "has_results": False,
        "error": None,
        "lottery_text": "",
        "foreign_text": "",
        "lottery_table_rows": _default_entry_rows(market["lottery_defaults"]),
        "foreign_table_rows": _default_entry_rows(market["foreign_defaults"]),
        "ev_threshold": "0",
        "ev_threshold_label": "EV > 0",
        "sort_by": "ev",
        "probability_mode": "raw",
        "provider": "example",
        "probability_mode_options": [
            ("raw", "局部比较：不去水"),
            ("devig", "完整市场：去水化"),
        ],
        "threshold_options": [
            ("all", "无限制"),
            ("-0.05", "EV > -5%"),
            ("-0.03", "EV > -3%"),
            ("0", "EV > 0"),
            ("0.03", "EV > 3%"),
            ("0.05", "EV > 5%"),
            ("0.10", "EV > 10%"),
            ("0.15", "EV > 15%"),
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


def _parse_table_entries(scores, odds_values, label, normalizer) -> list[OddsEntry]:
    entries: list[OddsEntry] = []
    for index, (selection, odds) in enumerate(zip(scores, odds_values), start=1):
        selection = selection.strip()
        odds = odds.strip()
        if not selection and not odds:
            continue
        if selection and not odds:
            continue
        if odds and not selection:
            raise ValueError(f"{label}第 {index} 行需要同时填写选项和赔率。")
        entries.append(
            OddsEntry(score=normalizer(selection), odds=parse_odds_value(odds))
        )
    return entries


def _table_rows_from_form(scores, odds_values, default_options=None) -> list[dict[str, str]]:
    rows = [
        {"score": score.strip(), "odds": odds.strip()}
        for score, odds in zip(scores, odds_values)
    ]
    rows = [row for row in rows if row["score"] or row["odds"]]
    return rows or _default_entry_rows(default_options)


def _default_entry_rows(options=None) -> list[dict[str, str]]:
    if not options:
        return [{"score": "", "odds": ""}]
    return [{"score": option, "odds": ""} for option in options]


def _normalize_option(value, allowed_options: list[str], label: str) -> str:
    option = str(value or "").strip()
    if option not in allowed_options:
        raise ValueError(f"无效{label}：{value}")
    return option


def _parse_manual_options(text: str, allowed_options: list[str], label: str) -> list[OddsEntry]:
    entries: list[OddsEntry] = []
    if not text or not text.strip():
        return entries

    for line_number, line in enumerate(text.splitlines(), start=1):
        clean = line.strip()
        if not clean:
            continue
        parts = clean.replace(",", " ").split()
        if len(parts) < 2:
            raise ValueError(f"第 {line_number} 行格式错误，应为：选项 赔率")
        entries.append(
            OddsEntry(
                score=_normalize_option(parts[0], allowed_options, label),
                odds=parse_odds_value(parts[1]),
            )
        )
    return entries


def _parse_ev_threshold(value: str) -> float | None:
    if value == "all":
        return None
    return float(value)


def _format_ev_threshold(value: str) -> str:
    if value == "all":
        return "无限制"
    return f"EV > {float(value) * 100:.0f}%"


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
