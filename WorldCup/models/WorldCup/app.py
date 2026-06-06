from __future__ import annotations

from flask import Flask

from routes.main import main_bp


def map_analysis_rows(rows):
    return [
        {
            "score": row.score,
            "lottery_odds": row.lottery_odds,
            "foreign_odds": row.foreign_odds,
            "raw_probability": row.raw_probability,
            "fair_probability": row.fair_probability,
            "ev": row.ev,
            "full_kelly": row.full_kelly,
            "half_kelly": row.half_kelly,
            "quarter_kelly": row.quarter_kelly,
            "is_value": row.is_value,
        }
        for row in rows
    ]


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = "worldcup-value-betting-dev-key"
    app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024
    app.register_blueprint(main_bp)
    app.add_template_filter(map_analysis_rows)
    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
