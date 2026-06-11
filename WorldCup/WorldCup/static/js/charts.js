(() => {
    const rows = window.analysisRows || [];
    const form = document.querySelector("[data-market-form]");
    const storageKey = form?.dataset.marketKey
        ? `worldcup-market-form:${form.dataset.marketKey}`
        : "";

    if (window.lucide) {
        window.lucide.createIcons({
            attrs: {
                "stroke-width": 2,
            },
        });
    }

    restoreSavedForm();
    initializeCorrectScoreInputTools();
    bindFormPersistence();

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
                button.dataset.selectionPlaceholder || "选项",
                button.dataset.oddsPlaceholder || "8.50",
            ));
            refreshIcons();
            saveFormState();
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
            saveFormState();
            return;
        }

        row.remove();
        saveFormState();
    });

    initializeCorrectScoreAnalysis();

    if (!rows.length || !window.Chart) {
        return;
    }

    const labels = rows.map((row) => row.score);
    const evValues = rows.map((row) => percentage(row.ev));
    const probabilityValues = rows.map((row) => percentage(row.fair_probability));
    const kellyValues = rows.map((row) => percentage(row.full_kelly));
    const probabilityLabel = window.probabilityLabel || "计算概率";
    const selectionLabel = window.marketSelectionLabel || "选项";

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
                    label: `${selectionLabel}赔率`,
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
                            return `${raw.score}: 国外 ${raw.x.toFixed(3)} / 体彩 ${raw.y.toFixed(3)}`;
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
                    return `${prefix}: ${Number(value).toFixed(3)}%`;
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

    function createEntryRow(scoreName, oddsName, selectionPlaceholder, oddsPlaceholder) {
        const row = document.createElement("div");
        row.className = "entry-row";
        row.innerHTML = `
            <input class="form-control" type="text" name="${scoreName}" placeholder="${selectionPlaceholder}">
            <input class="form-control" type="number" name="${oddsName}" placeholder="${oddsPlaceholder}" min="1.001" step="0.001">
            <button class="btn btn-outline-secondary icon-button" type="button" data-remove-row aria-label="删除赔率行">
                <i data-lucide="trash-2"></i>
            </button>
        `;
        return row;
    }

    function initializeCorrectScoreInputTools() {
        if (window.marketKey !== "correct-score" || !form) {
            return;
        }

        const resetLotteryOddsButton = form.querySelector("[data-reset-lottery-odds]");
        const restoreLotteryDefaultsButton = form.querySelector("[data-restore-lottery-defaults]");
        const foreignSetSelect = form.querySelector("[data-foreign-set]");
        const saveForeignSetButton = form.querySelector("[data-save-foreign-set]");
        const foreignJsonInput = form.querySelector("[data-foreign-json]");
        const jsonStatus = form.querySelector("[data-json-status]");
        const foreignSetsStorageKey = "worldcup-foreign-sets:correct-score";
        const savedState = readSavedState();
        let activeForeignSet = foreignSetSelect?.value || "set-1";

        if (foreignSetSelect && savedState?.foreignSet && hasOption(foreignSetSelect, savedState.foreignSet)) {
            foreignSetSelect.value = savedState.foreignSet;
            activeForeignSet = savedState.foreignSet;
        }

        if (savedState?.foreignRows?.length || savedState?.foreignJson) {
            saveForeignSet(activeForeignSet, false);
        } else if (readForeignSets()[activeForeignSet]) {
            loadForeignSet(activeForeignSet, false);
        } else {
            saveForeignSet(activeForeignSet, false);
        }

        resetLotteryOddsButton?.addEventListener("click", () => {
            form.querySelectorAll('[name="lottery_odds_values[]"]').forEach((input) => {
                input.value = "";
            });
            saveFormState();
        });

        restoreLotteryDefaultsButton?.addEventListener("click", () => {
            restoreRowsFromScores("lottery", window.lotteryDefaultScores || []);
            refreshIcons();
            saveFormState();
        });

        saveForeignSetButton?.addEventListener("click", () => {
            saveForeignSet(activeForeignSet, true);
            saveFormState();
        });

        foreignSetSelect?.addEventListener("change", () => {
            saveForeignSet(activeForeignSet, false);
            activeForeignSet = foreignSetSelect.value;
            loadForeignSet(activeForeignSet, true);
            saveFormState();
        });

        foreignJsonInput?.addEventListener("input", () => {
            const text = foreignJsonInput.value.trim();
            if (!text) {
                setJsonStatus("");
                saveForeignSet(activeForeignSet, false);
                saveFormState();
                return;
            }

            try {
                const importedRows = parseForeignOddsJson(text);
                restoreRows("foreign", importedRows);
                refreshIcons();
                setJsonStatus(`已导入 ${importedRows.length} 条国外赔率。`);
                saveForeignSet(activeForeignSet, false);
                saveFormState();
            } catch (error) {
                setJsonStatus(error.message || "JSON格式无法识别。", true);
                saveFormState();
            }
        });

        function saveForeignSet(setKey, showStatus) {
            if (!setKey || !window.localStorage) {
                return;
            }
            const sets = readForeignSets();
            sets[setKey] = {
                rows: readRows("foreign"),
                json: foreignJsonInput?.value || "",
                updatedAt: Date.now(),
            };
            window.localStorage.setItem(foreignSetsStorageKey, JSON.stringify(sets));
            if (showStatus) {
                setJsonStatus(`已保存到${foreignSetLabel(setKey)}。`);
            }
        }

        function loadForeignSet(setKey, showStatus) {
            const savedSet = readForeignSets()[setKey];
            if (savedSet?.rows?.length) {
                restoreRows("foreign", savedSet.rows);
            } else {
                restoreRowsFromScores("foreign", window.foreignDefaultScores || []);
            }
            if (foreignJsonInput) {
                foreignJsonInput.value = savedSet?.json || "";
            }
            refreshIcons();
            if (showStatus) {
                setJsonStatus(`已切换到${foreignSetLabel(setKey)}。`);
            }
        }

        function readForeignSets() {
            if (!window.localStorage) {
                return {};
            }
            try {
                return JSON.parse(window.localStorage.getItem(foreignSetsStorageKey)) || {};
            } catch {
                return {};
            }
        }

        function setJsonStatus(message, isError = false) {
            if (!jsonStatus) {
                return;
            }
            jsonStatus.textContent = message;
            jsonStatus.classList.toggle("error", Boolean(isError));
        }
    }

    function restoreRowsFromScores(prefix, scores) {
        const rowsFromScores = Array.isArray(scores) && scores.length
            ? scores.map((score) => ({ score, odds: "" }))
            : [{ score: "", odds: "" }];
        restoreRows(prefix, rowsFromScores);
    }

    function parseForeignOddsJson(text) {
        const normalizedText = text
            .replaceAll("“", '"')
            .replaceAll("”", '"')
            .replaceAll("‘", "'")
            .replaceAll("’", "'");
        const parsed = JSON.parse(normalizedText);
        const source = Array.isArray(parsed)
            ? parsed
            : parsed?.odds || parsed?.data || parsed?.results;

        if (!Array.isArray(source)) {
            throw new Error('JSON需要是数组，或包含 "odds" 数组。');
        }

        const importedRows = source.map((item, index) => {
            const score = Array.isArray(item)
                ? item[0]
                : item?.score ?? item?.selection ?? item?.result ?? item?.name;
            const odds = Array.isArray(item)
                ? item[1]
                : item?.odds ?? item?.price ?? item?.decimal_odds ?? item?.decimalOdds;
            const normalizedScore = String(score ?? "").trim();
            const numericOdds = Number(String(odds ?? "").trim());

            if (!normalizedScore || !Number.isFinite(numericOdds) || numericOdds <= 1) {
                throw new Error(`JSON第 ${index + 1} 项需要有效比分和大于1的赔率。`);
            }

            return {
                score: normalizedScore,
                odds: numericOdds.toFixed(3),
            };
        });

        if (!importedRows.length) {
            throw new Error("JSON中没有可导入的赔率。");
        }
        return importedRows;
    }

    function hasOption(select, value) {
        return Array.from(select.options).some((option) => option.value === value);
    }

    function foreignSetLabel(setKey) {
        const labels = {
            "set-1": "赔率组 1",
            "set-2": "赔率组 2",
            "set-3": "赔率组 3",
        };
        return labels[setKey] || "当前赔率组";
    }

    function initializeCorrectScoreAnalysis() {
        if (window.marketKey !== "correct-score" || !rows.length) {
            return;
        }

        const tableBody = document.querySelector("[data-analysis-row]")?.closest("tbody");
        const thresholdSelect = document.querySelector("[data-analysis-threshold]");
        const sortSelect = document.querySelector("[data-analysis-sort]");
        const countTarget = document.querySelector("[data-analysis-count]");
        const kellyBody = document.querySelector("[data-competitive-kelly-body]");
        const kellySummary = document.querySelector("[data-competitive-summary]");
        const clearButton = document.querySelector("[data-clear-kelly-selection]");
        if (!tableBody || !thresholdSelect || !sortSelect) {
            return;
        }

        const viewStorageKey = "worldcup-analysis-view:correct-score";
        const selectedScores = new Set();
        const savedView = readJson(viewStorageKey);
        if (savedView?.threshold) {
            thresholdSelect.value = savedView.threshold;
        }
        if (savedView?.sortBy) {
            sortSelect.value = savedView.sortBy;
        }

        thresholdSelect.addEventListener("change", () => {
            saveAnalysisView(viewStorageKey, thresholdSelect.value, sortSelect.value);
            renderAnalysisRows();
        });
        sortSelect.addEventListener("change", () => {
            saveAnalysisView(viewStorageKey, thresholdSelect.value, sortSelect.value);
            renderAnalysisRows();
        });
        clearButton?.addEventListener("click", () => {
            selectedScores.clear();
            renderAnalysisRows();
        });

        tableBody.addEventListener("change", (event) => {
            const checkbox = event.target.closest("[data-kelly-select]");
            if (!checkbox) {
                return;
            }
            if (checkbox.checked) {
                selectedScores.add(checkbox.value);
            } else {
                selectedScores.delete(checkbox.value);
            }
            renderCompetitiveKelly();
        });

        renderAnalysisRows();

        function renderAnalysisRows() {
            const visibleRows = sortRows(
                filterRows(rows, thresholdSelect.value),
                sortSelect.value,
            );
            const visibleScores = new Set(visibleRows.map((row) => row.score));
            Array.from(selectedScores).forEach((score) => {
                if (!visibleScores.has(score)) {
                    selectedScores.delete(score);
                }
            });

            const highlights = buildClientHighlights(visibleRows);
            tableBody.innerHTML = visibleRows.length
                ? visibleRows
                    .map((row) => renderAnalysisRow(row, highlights[row.score] || {}, selectedScores.has(row.score)))
                    .join("")
                : `<tr><td colspan="10" class="muted-table-message">当前筛选无结果。</td></tr>`;

            if (countTarget) {
                countTarget.textContent = String(visibleRows.length);
            }
            renderCompetitiveKelly();
        }

        function renderCompetitiveKelly() {
            if (!kellyBody || !kellySummary) {
                return;
            }

            const selectedRows = rows.filter((row) => selectedScores.has(row.score));
            const result = calculateCompetitiveKelly(selectedRows);
            kellySummary.innerHTML = renderCompetitiveSummary(selectedRows, result);

            if (!selectedRows.length) {
                kellyBody.innerHTML = `<tr><td colspan="7" class="muted-table-message">请选择上方比分。</td></tr>`;
                return;
            }
            if (!result.allocations.length) {
                kellyBody.innerHTML = `<tr><td colspan="7" class="muted-table-message">${escapeHtml(result.message)}</td></tr>`;
                return;
            }

            kellyBody.innerHTML = result.allocations
                .map((item) => `
                    <tr>
                        <td><span class="score-pill">${escapeHtml(item.row.score)}</span></td>
                        <td>${item.row.lottery_odds.toFixed(3)}</td>
                        <td>${formatPercent(item.row.fair_probability)}</td>
                        <td class="${item.row.ev > 0 ? "text-positive" : "text-negative"}">${formatPercent(item.row.ev, true)}</td>
                        <td class="kelly-stake">${formatPercent(item.fraction)}</td>
                        <td>${formatPercent(item.fraction / 2)}</td>
                        <td>${formatPercent(item.fraction / 4)}</td>
                    </tr>
                `)
                .join("");
        }
    }

    function filterRows(sourceRows, threshold) {
        if (threshold === "all") {
            return [...sourceRows];
        }
        const numericThreshold = Number(threshold);
        return sourceRows.filter((row) => row.ev > numericThreshold);
    }

    function sortRows(sourceRows, sortBy) {
        const sortedRows = [...sourceRows];
        const sorters = {
            ev: (row) => row.ev,
            kelly: (row) => row.full_kelly,
            probability: (row) => row.fair_probability,
            lottery_odds: (row) => row.lottery_odds,
        };
        if (!sorters[sortBy]) {
            return sortedRows;
        }
        return sortedRows.sort((a, b) => sorters[sortBy](b) - sorters[sortBy](a));
    }

    function buildClientHighlights(sourceRows) {
        const highlights = {};
        markClientRank(highlights, sourceRows, "ev", (row) => row.ev);
        markClientRank(highlights, sourceRows, "kelly", (row) => row.full_kelly);
        markClientRank(highlights, sourceRows, "probability", (row) => row.fair_probability);
        return highlights;
    }

    function markClientRank(highlights, sourceRows, metric, keyFunc) {
        [...sourceRows]
            .sort((a, b) => keyFunc(b) - keyFunc(a))
            .slice(0, 2)
            .forEach((row, index) => {
                const rank = index === 0 ? "top" : "second";
                highlights[row.score] = highlights[row.score] || {};
                highlights[row.score][metric] = `highlight-${metric}-${rank}`;
            });
    }

    function renderAnalysisRow(row, highlights, isSelected) {
        return `
            <tr class="${row.is_value ? "value-row" : ""}" data-analysis-row data-score="${escapeHtml(row.score)}">
                <td class="select-column">
                    <input class="form-check-input" type="checkbox" data-kelly-select value="${escapeHtml(row.score)}" ${isSelected ? "checked" : ""} aria-label="选择${escapeHtml(row.score)}">
                </td>
                <td><span class="score-pill">${escapeHtml(row.score)}</span></td>
                <td>${row.lottery_odds.toFixed(3)}</td>
                <td>${row.foreign_odds.toFixed(3)}</td>
                <td>${formatPercent(row.raw_probability)}</td>
                <td data-cell="probability" class="${highlights.probability || ""}">${formatPercent(row.fair_probability)}</td>
                <td data-cell="ev" class="${row.ev > 0 ? "text-positive" : "text-negative"} ${highlights.ev || ""}">${formatPercent(row.ev, true)}</td>
                <td data-cell="kelly" class="${highlights.kelly || ""}">${formatPercent(row.full_kelly)}</td>
                <td>${formatPercent(row.half_kelly)}</td>
                <td>${formatPercent(row.quarter_kelly)}</td>
            </tr>
        `;
    }

    function calculateCompetitiveKelly(selectedRows) {
        const positiveRows = selectedRows.filter((row) => row.ev > 0 && row.fair_probability > 0 && row.lottery_odds > 1);
        if (!positiveRows.length) {
            return {
                allocations: [],
                totalStake: 0,
                cashReserve: 1,
                message: "所选比分没有正EV，竞争Kelly不建议下注。",
                ignoredCount: selectedRows.length,
            };
        }

        let activeRows = [...positiveRows];
        let removedCount = selectedRows.length - positiveRows.length;
        let warning = "";

        while (activeRows.length) {
            const probabilitySum = activeRows.reduce((sum, row) => sum + row.fair_probability, 0);
            const reciprocalOddsSum = activeRows.reduce((sum, row) => sum + (1 / row.lottery_odds), 0);

            if (probabilitySum >= 0.999999) {
                const allocations = activeRows.map((row) => ({
                    row,
                    fraction: row.fair_probability / probabilitySum,
                }));
                return {
                    allocations,
                    totalStake: 1,
                    cashReserve: 0,
                    ignoredCount: removedCount,
                    message: "所选概率合计接近或超过100%，已按所选概率归一化。",
                };
            }

            if (reciprocalOddsSum >= 0.999999) {
                activeRows = removeWeakestCompetitiveRow(activeRows);
                removedCount += 1;
                warning = "部分边际较弱的比分已从竞争Kelly组合中剔除。";
                continue;
            }

            const cashReserve = (1 - probabilitySum) / (1 - reciprocalOddsSum);
            const allocations = activeRows.map((row) => ({
                row,
                fraction: row.fair_probability - (cashReserve / row.lottery_odds),
            }));
            const viableAllocations = allocations.filter((item) => item.fraction > 0.000001);

            if (viableAllocations.length === allocations.length) {
                return {
                    allocations: viableAllocations,
                    totalStake: viableAllocations.reduce((sum, item) => sum + item.fraction, 0),
                    cashReserve,
                    ignoredCount: removedCount,
                    message: warning,
                };
            }

            removedCount += allocations.length - viableAllocations.length;
            activeRows = viableAllocations.map((item) => item.row);
            warning = "部分边际较弱的比分已从竞争Kelly组合中剔除。";
        }

        return {
            allocations: [],
            totalStake: 0,
            cashReserve: 1,
            ignoredCount: selectedRows.length,
            message: "竞争Kelly计算后没有可下注比分。",
        };
    }

    function removeWeakestCompetitiveRow(sourceRows) {
        if (sourceRows.length <= 1) {
            return [];
        }
        const weakest = [...sourceRows].sort((a, b) => (a.fair_probability * a.lottery_odds) - (b.fair_probability * b.lottery_odds))[0];
        return sourceRows.filter((row) => row.score !== weakest.score);
    }

    function renderCompetitiveSummary(selectedRows, result) {
        const parts = [
            `<span>已选 ${selectedRows.length} 个比分</span>`,
            `<span>参与分配 ${result.allocations.length} 个</span>`,
            `<span>Full Kelly总投入 <strong>${formatPercent(result.totalStake || 0)}</strong></span>`,
            `<span>保留资金 <strong>${formatPercent(result.cashReserve ?? 1)}</strong></span>`,
        ];
        if (result.ignoredCount) {
            parts.push(`<span>剔除 ${result.ignoredCount} 个</span>`);
        }
        if (result.message) {
            parts.push(`<span>${escapeHtml(result.message)}</span>`);
        }
        return parts.join("");
    }

    function saveAnalysisView(key, threshold, sortBy) {
        if (!window.localStorage) {
            return;
        }
        window.localStorage.setItem(key, JSON.stringify({ threshold, sortBy }));
    }

    function readJson(key) {
        if (!window.localStorage) {
            return null;
        }
        try {
            return JSON.parse(window.localStorage.getItem(key));
        } catch {
            return null;
        }
    }

    function formatPercent(value, signed = false) {
        const prefix = signed && value > 0 ? "+" : "";
        return `${prefix}${(value * 100).toFixed(3)}%`;
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function bindFormPersistence() {
        if (!form || !storageKey || !window.localStorage) {
            return;
        }

        form.addEventListener("input", saveFormState);
        form.addEventListener("change", saveFormState);
        form.addEventListener("submit", saveFormState);
    }

    function restoreSavedForm() {
        if (!form || !storageKey || !window.localStorage) {
            return;
        }

        const saved = readSavedState();
        if (!saved) {
            return;
        }

        restoreRows("lottery", saved.lotteryRows);
        restoreRows("foreign", saved.foreignRows);
        setFieldValue("probability_mode", saved.probabilityMode);
        setFieldValue("ev_threshold", saved.evThreshold);
        setFieldValue("sort_by", saved.sortBy);
        setFieldValue("provider", saved.provider);
        setChecked("use_example_api", Boolean(saved.useExampleApi));
        setDataControlValue("[data-foreign-set]", saved.foreignSet);
        setDataControlValue("[data-foreign-json]", saved.foreignJson);
        refreshIcons();
    }

    function saveFormState() {
        if (!form || !storageKey || !window.localStorage) {
            return;
        }

        const state = {
            lotteryRows: readRows("lottery"),
            foreignRows: readRows("foreign"),
            probabilityMode: getFieldValue("probability_mode"),
            evThreshold: getFieldValue("ev_threshold"),
            sortBy: getFieldValue("sort_by"),
            provider: getFieldValue("provider"),
            useExampleApi: getChecked("use_example_api"),
            foreignSet: getDataControlValue("[data-foreign-set]"),
            foreignJson: getDataControlValue("[data-foreign-json]"),
        };

        window.localStorage.setItem(storageKey, JSON.stringify(state));
    }

    function readSavedState() {
        try {
            return JSON.parse(window.localStorage.getItem(storageKey));
        } catch {
            return null;
        }
    }

    function readRows(prefix) {
        const scores = Array.from(form.querySelectorAll(`[name="${prefix}_scores[]"]`));
        const odds = Array.from(form.querySelectorAll(`[name="${prefix}_odds_values[]"]`));
        return scores.map((scoreInput, index) => ({
            score: scoreInput.value,
            odds: odds[index]?.value || "",
        }));
    }

    function restoreRows(prefix, rows) {
        if (!Array.isArray(rows) || !rows.length) {
            return;
        }

        const body = form.querySelector(`[name="${prefix}_scores[]"]`)?.closest("[data-entry-table]")?.querySelector("[data-entry-body]");
        const addButton = form.querySelector(`[data-score-name="${prefix}_scores[]"]`);
        if (!body || !addButton) {
            return;
        }

        body.innerHTML = "";
        rows.forEach((row) => {
            const element = createEntryRow(
                `${prefix}_scores[]`,
                `${prefix}_odds_values[]`,
                addButton.dataset.selectionPlaceholder || "选项",
                addButton.dataset.oddsPlaceholder || "8.50",
            );
            const inputs = element.querySelectorAll("input");
            inputs[0].value = row.score || "";
            inputs[1].value = row.odds || "";
            body.appendChild(element);
        });
    }

    function getFieldValue(name) {
        return form.querySelector(`[name="${name}"]`)?.value || "";
    }

    function setFieldValue(name, value) {
        const field = form.querySelector(`[name="${name}"]`);
        if (field && value !== undefined && value !== null) {
            field.value = value;
        }
    }

    function getDataControlValue(selector) {
        return form.querySelector(selector)?.value || "";
    }

    function setDataControlValue(selector, value) {
        const field = form.querySelector(selector);
        if (field && value !== undefined && value !== null) {
            field.value = value;
        }
    }

    function getChecked(name) {
        return Boolean(form.querySelector(`[name="${name}"]`)?.checked);
    }

    function setChecked(name, value) {
        const field = form.querySelector(`[name="${name}"]`);
        if (field) {
            field.checked = value;
        }
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
