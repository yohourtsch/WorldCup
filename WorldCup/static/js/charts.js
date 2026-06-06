(() => {
    const rows = window.analysisRows || [];

    if (window.lucide) {
        window.lucide.createIcons({
            attrs: {
                "stroke-width": 2,
            },
        });
    }

    document.querySelectorAll("[data-add-row]").forEach((button) => {
        button.addEventListener("click", () => {
            const table = button.closest("[data-entry-table]");
            const body = table?.querySelector("[data-entry-body]");
            if (!body) {
                return;
            }

            body.appendChild(createEntryRow(
                button.dataset.scoreName,
                button.dataset.oddsName,
            ));
            refreshIcons();
        });
    });

    document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-remove-row]");
        if (!button) {
            return;
        }

        const body = button.closest("[data-entry-body]");
        const row = button.closest(".entry-row");
        if (!body || !row) {
            return;
        }

        if (body.querySelectorAll(".entry-row").length === 1) {
            row.querySelectorAll("input").forEach((input) => {
                input.value = "";
            });
            return;
        }

        row.remove();
    });

    if (!rows.length || !window.Chart) {
        return;
    }

    const labels = rows.map((row) => row.score);
    const evValues = rows.map((row) => percentage(row.ev));
    const probabilityValues = rows.map((row) => percentage(row.fair_probability));
    const kellyValues = rows.map((row) => percentage(row.full_kelly));
    const probabilityLabel = window.probabilityLabel || "计算概率";

    const gridColor = "rgba(30, 35, 41, 0.09)";
    const labelColor = "#667085";
    const positiveColor = "#11805a";
    const negativeColor = "#b42318";
    const brandColor = "#1f6f68";
    const goldColor = "#bd8a13";
    const accentColor = "#c4492d";

    Chart.defaults.font.family = 'Inter, "Segoe UI", "Microsoft YaHei", Arial, sans-serif';
    Chart.defaults.color = labelColor;

    new Chart(document.getElementById("evChart"), {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "EV",
                    data: evValues,
                    borderRadius: 4,
                    backgroundColor: evValues.map((value) => value > 0 ? positiveColor : negativeColor),
                },
            ],
        },
        options: commonOptions({
            indexAxis: "y",
            scales: {
                x: percentAxis("EV"),
                y: categoryAxis(),
            },
        }),
    });

    new Chart(document.getElementById("probabilityChart"), {
        type: "doughnut",
        data: {
            labels,
            datasets: [
                {
                    data: probabilityValues,
                    backgroundColor: palette(rows.length),
                    borderColor: "#ffffff",
                    borderWidth: 2,
                },
            ],
        },
        options: commonOptions({
            cutout: "58%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        boxWidth: 10,
                        boxHeight: 10,
                        usePointStyle: true,
                    },
                },
                tooltip: percentTooltip(probabilityLabel),
            },
        }),
    });

    new Chart(document.getElementById("kellyChart"), {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "Full Kelly",
                    data: kellyValues,
                    borderRadius: 4,
                    backgroundColor: goldColor,
                },
                {
                    label: "Half Kelly",
                    data: rows.map((row) => percentage(row.half_kelly)),
                    borderRadius: 4,
                    backgroundColor: brandColor,
                },
                {
                    label: "Quarter Kelly",
                    data: rows.map((row) => percentage(row.quarter_kelly)),
                    borderRadius: 4,
                    backgroundColor: accentColor,
                },
            ],
        },
        options: commonOptions({
            scales: {
                x: categoryAxis(),
                y: percentAxis("Kelly"),
            },
        }),
    });

    new Chart(document.getElementById("scatterChart"), {
        type: "scatter",
        data: {
            datasets: [
                {
                    label: "比分赔率",
                    data: rows.map((row) => ({
                        x: row.foreign_odds,
                        y: row.lottery_odds,
                        score: row.score,
                    })),
                    pointBackgroundColor: rows.map((row) => row.ev > 0 ? positiveColor : negativeColor),
                    pointBorderColor: "#ffffff",
                    pointBorderWidth: 1,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                },
            ],
        },
        options: commonOptions({
            scales: {
                x: numberAxis("国外赔率"),
                y: numberAxis("体彩赔率"),
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const raw = context.raw;
                            return `${raw.score}: 国外 ${raw.x.toFixed(2)} / 体彩 ${raw.y.toFixed(2)}`;
                        },
                    },
                },
            },
        }),
    });

    function percentage(value) {
        return Number((value * 100).toFixed(4));
    }

    function commonOptions(overrides = {}) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: "nearest",
            },
            plugins: {
                legend: {
                    labels: {
                        boxWidth: 10,
                        boxHeight: 10,
                        borderRadius: 2,
                    },
                },
                tooltip: percentTooltip(),
                ...(overrides.plugins || {}),
            },
            scales: overrides.scales,
            indexAxis: overrides.indexAxis,
            cutout: overrides.cutout,
        };
    }

    function percentAxis(title) {
        return {
            grid: {
                color: gridColor,
            },
            title: {
                display: true,
                text: title,
            },
            ticks: {
                callback: (value) => `${value}%`,
            },
        };
    }

    function numberAxis(title) {
        return {
            grid: {
                color: gridColor,
            },
            title: {
                display: true,
                text: title,
            },
        };
    }

    function categoryAxis() {
        return {
            grid: {
                display: false,
            },
        };
    }

    function percentTooltip(label = "") {
        return {
            callbacks: {
                label: (context) => {
                    const value = typeof context.raw === "number"
                        ? context.raw
                        : typeof context.parsed === "object"
                            ? context.parsed.x ?? context.parsed.y
                            : context.parsed;
                    const prefix = label || context.dataset.label || context.label;
                    return `${prefix}: ${Number(value).toFixed(2)}%`;
                },
            },
        };
    }

    function palette(count) {
        const colors = [
            "#1f6f68",
            "#c4492d",
            "#bd8a13",
            "#4b6f9f",
            "#11805a",
            "#8f4d6a",
            "#6a5f32",
            "#5e6c84",
        ];
        return Array.from({ length: count }, (_, index) => colors[index % colors.length]);
    }

    function createEntryRow(scoreName, oddsName) {
        const row = document.createElement("div");
        row.className = "entry-row";
        row.innerHTML = `
            <input class="form-control" type="text" name="${scoreName}" placeholder="0:0" inputmode="numeric">
            <input class="form-control" type="number" name="${oddsName}" placeholder="8.50" min="1.01" step="0.01">
            <button class="btn btn-outline-secondary icon-button" type="button" data-remove-row aria-label="删除赔率行">
                <i data-lucide="trash-2"></i>
            </button>
        `;
        return row;
    }

    function refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons({
                attrs: {
                    "stroke-width": 2,
                },
            });
        }
    }
})();
