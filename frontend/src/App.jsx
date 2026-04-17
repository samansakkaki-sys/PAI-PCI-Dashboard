import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE) {
  throw new Error("Missing VITE_API_BASE_URL environment variable.");
}

const PAI_THRESHOLD = 0.7;
const PCI_THRESHOLD = 0.1;
const MODE_OPTIONS = [
  { value: "weighted", label: "Weighted" },
  { value: "unweighted", label: "Unweighted" },
];
const CHANNEL_OPTIONS = [
  { value: "retail", label: "Retail" },
  { value: "bot", label: "Bot" },
  { value: "seller", label: "Seller" },
  { value: "total", label: "Total" },
];
const CHANNEL_META = {
  retail: { label: "Retail", paiColor: "#2563eb", pciColor: "#1d4ed8" },
  bot: { label: "Bot", paiColor: "#059669", pciColor: "#047857" },
  seller: { label: "Seller", paiColor: "#d97706", pciColor: "#b45309" },
  total: { label: "Total", paiColor: "#111827", pciColor: "#7f1d1d" },
};
const COMPARE_COLORS = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#4f46e5",
  "#be123c",
];

const jalaliDateFormatter = (() => {
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
})();

function formatPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "--";
  }
  return `${(num * 100).toFixed(1)}%`;
}

function sanitizeValue(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatModeLabel(metricMode) {
  return metricMode === "unweighted" ? "Unweighted" : "Weighted";
}

function formatJalaliTimestamp(row, compact = false) {
  const rawDate = String(row.date || "").trim();
  const rawTime = String(row.time || "").trim();
  const cleanTime = rawTime && !rawTime.startsWith("1899") ? rawTime.slice(0, 5) : "";

  if (!rawDate) {
    return row.timestamp_label || "Unknown timestamp";
  }

  const parsed = new Date(rawDate.includes("T") ? rawDate : `${rawDate}T00:00:00`);
  if (!Number.isNaN(parsed.getTime()) && jalaliDateFormatter) {
    const datePart = jalaliDateFormatter.format(parsed);
    return compact || !cleanTime ? datePart : `${datePart} ${cleanTime}`;
  }

  return compact ? rawDate.replace("T", " ").slice(0, 10) : row.timestamp_label || rawDate;
}

function buildChartRows(rows) {
  return rows.map((row, index) => ({
    ...row,
    id: `${row.timestamp_label || "row"}-${index}`,
    shortLabel: formatJalaliTimestamp(row, true),
    fullLabel: formatJalaliTimestamp(row, false),
    pai_retail: sanitizeValue(row.pai_retail),
    pai_bot: sanitizeValue(row.pai_bot),
    pai_seller: sanitizeValue(row.pai_seller),
    pai_total: sanitizeValue(row.pai_total),
    pci_retail: sanitizeValue(row.pci_retail),
    pci_bot: sanitizeValue(row.pci_bot),
    pci_seller: sanitizeValue(row.pci_seller),
    pci_total: sanitizeValue(row.pci_total),
  }));
}

function buildCompareRows(compareData) {
  const merged = new Map();

  compareData.forEach((entry) => {
    entry.history.forEach((row, index) => {
      const fullLabel = formatJalaliTimestamp(row, false);
      const shortLabel = formatJalaliTimestamp(row, true) || `Point ${index + 1}`;
      const existing = merged.get(fullLabel) || { shortLabel, fullLabel };
      existing[`${entry.category}__pai_total`] = sanitizeValue(row.pai_total);
      existing[`${entry.category}__pci_total`] = sanitizeValue(row.pci_total);
      merged.set(fullLabel, existing);
    });
  });

  return Array.from(merged.values());
}

function buildMainSeries(metricType, selectedChannels) {
  return selectedChannels.map((channel) => ({
    key: `${metricType}_${channel}`,
    label: CHANNEL_META[channel].label,
    color: metricType === "pai" ? CHANNEL_META[channel].paiColor : CHANNEL_META[channel].pciColor,
  }));
}

function SummaryCard({ label, value, accent }) {
  return (
    <div className="summary-card">
      <span className="summary-label">{label}</span>
      <strong className="summary-value" style={{ color: accent }}>
        {value}
      </strong>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const items = payload.filter((item) => item.value !== null && item.value !== undefined);
  if (!items.length) {
    return null;
  }

  const label = items[0]?.payload?.fullLabel || items[0]?.payload?.shortLabel;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {items.map((item) => (
        <div className="chart-tooltip-row" key={item.dataKey}>
          <span className="chart-tooltip-name">
            <span
              className="chart-tooltip-swatch"
              style={{ backgroundColor: item.color }}
            />
            {item.name}
          </span>
          <strong>{formatPercent(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function CustomLegend({ payload, hiddenLines, onToggle }) {
  if (!payload?.length) {
    return null;
  }

  return (
    <div className="legend-list">
      {payload.map((entry) => {
        const disabled = Boolean(hiddenLines[entry.dataKey]);
        return (
          <button
            key={entry.dataKey}
            type="button"
            className={`legend-item${disabled ? " legend-item-muted" : ""}`}
            onClick={() => onToggle(entry.dataKey)}
          >
            <span
              className="legend-swatch"
              style={{ backgroundColor: entry.color }}
            />
            {entry.value}
          </button>
        );
      })}
    </div>
  );
}

function RankingList({ title, rows, valueKey }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>Latest snapshot across categories</p>
        </div>
      </div>
      {rows.length ? (
        <div className="ranking-list">
          {rows.map((row, index) => (
            <div className="ranking-row" key={`${title}-${row.category}`}>
              <span className="ranking-position">{index + 1}</span>
              <div className="ranking-copy">
                <strong>{row.category}</strong>
                <span>{formatJalaliTimestamp(row, false)}</span>
              </div>
              <strong>{formatPercent(row[valueKey])}</strong>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No ranking data"
          text="Ranking data will appear when the latest history snapshot is available."
        />
      )}
    </div>
  );
}

function TrendPanel({
  title,
  subtitle,
  data,
  lines,
  threshold,
  hiddenLines,
  onToggleLegend,
  loading,
  empty,
  emptyText,
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {loading ? (
        <div className="loading-panel">Loading {title.toLowerCase()}...</div>
      ) : empty ? (
        <EmptyState title="No history data" text={emptyText} />
      ) : (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dbe3ef" />
              <XAxis dataKey="shortLabel" minTickGap={28} />
              <YAxis tickFormatter={formatPercent} domain={[0, 1]} />
              <Tooltip content={<CustomTooltip />} />
              {lines.length > 1 ? (
                <Legend
                  verticalAlign="top"
                  content={
                    <CustomLegend hiddenLines={hiddenLines} onToggle={onToggleLegend} />
                  }
                />
              ) : null}
              <ReferenceLine
                y={threshold}
                stroke="#dc2626"
                strokeDasharray="6 6"
                label="Threshold"
              />
              {lines.map((line) =>
                hiddenLines[line.key] ? null : (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.label}
                    stroke={line.color}
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                )
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function App() {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedCompareCategories, setSelectedCompareCategories] = useState([]);
  const [metricMode, setMetricMode] = useState("weighted");
  const [selectedChannels, setSelectedChannels] = useState(["retail"]);
  const [historyRows, setHistoryRows] = useState([]);
  const [rankings, setRankings] = useState({ top_pai: [], worst_pci: [] });
  const [compareRows, setCompareRows] = useState([]);
  const [hiddenMainLines, setHiddenMainLines] = useState({});
  const [hiddenCompareLines, setHiddenCompareLines] = useState({});
  const [error, setError] = useState("");
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        setLoadingCategories(true);
        setError("");

        const res = await fetch(`${API_BASE}/kpis/categories`);
        if (!res.ok) {
          throw new Error(`Categories request failed: ${res.status}`);
        }

        const cats = await res.json();
        if (!Array.isArray(cats)) {
          throw new Error("Categories response is not an array.");
        }

        setCategories(cats);
        if (cats.length > 0) {
          setSelectedCategory((current) => current || cats[0]);
          setSelectedCompareCategories((current) => (current.length ? current : [cats[0]]));
        }
      } catch (err) {
        console.error(err);
        setError("Loading categories failed.");
      } finally {
        setLoadingCategories(false);
      }
    };

    loadCategories();
  }, []);

  useEffect(() => {
    const loadHistory = async () => {
      if (!selectedCategory) {
        setHistoryRows([]);
        return;
      }

      try {
        setLoadingHistory(true);
        setError("");

        const res = await fetch(
          `${API_BASE}/kpis/history?category=${encodeURIComponent(
            selectedCategory
          )}&metric_mode=${encodeURIComponent(metricMode)}`
        );
        if (!res.ok) {
          throw new Error(`History request failed: ${res.status}`);
        }

        const rows = await res.json();
        if (!Array.isArray(rows)) {
          throw new Error("History response is not an array.");
        }

        setHistoryRows(rows);
      } catch (err) {
        console.error(err);
        setError("Loading chart data failed.");
        setHistoryRows([]);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
  }, [selectedCategory, metricMode]);

  useEffect(() => {
    const loadRankings = async () => {
      try {
        setLoadingRankings(true);
        const res = await fetch(
          `${API_BASE}/kpis/rankings?metric_mode=${encodeURIComponent(metricMode)}`
        );
        if (!res.ok) {
          throw new Error(`Rankings request failed: ${res.status}`);
        }

        const payload = await res.json();
        setRankings({
          top_pai: Array.isArray(payload.top_pai) ? payload.top_pai : [],
          worst_pci: Array.isArray(payload.worst_pci) ? payload.worst_pci : [],
        });
      } catch (err) {
        console.error(err);
        setError("Loading ranking data failed.");
        setRankings({ top_pai: [], worst_pci: [] });
      } finally {
        setLoadingRankings(false);
      }
    };

    loadRankings();
  }, [metricMode]);

  useEffect(() => {
    const loadCompare = async () => {
      if (!selectedCompareCategories.length) {
        setCompareRows([]);
        return;
      }

      try {
        setLoadingCompare(true);
        setError("");

        const params = new URLSearchParams();
        selectedCompareCategories.forEach((category) => {
          params.append("categories", category);
        });
        params.set("metric_mode", metricMode);

        const res = await fetch(`${API_BASE}/kpis/compare?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Compare request failed: ${res.status}`);
        }

        const rows = await res.json();
        if (!Array.isArray(rows)) {
          throw new Error("Compare response is not an array.");
        }

        setCompareRows(rows);
      } catch (err) {
        console.error(err);
        setError("Loading compare data failed.");
        setCompareRows([]);
      } finally {
        setLoadingCompare(false);
      }
    };

    loadCompare();
  }, [selectedCompareCategories, metricMode]);

  useEffect(() => {
    setHiddenMainLines({});
  }, [selectedChannels, metricMode, selectedCategory]);

  useEffect(() => {
    setHiddenCompareLines({});
  }, [selectedCompareCategories, metricMode]);

  const chartData = useMemo(() => buildChartRows(historyRows), [historyRows]);
  const latest = chartData.length ? chartData[chartData.length - 1] : null;
  const compareChartData = useMemo(() => buildCompareRows(compareRows), [compareRows]);
  const compareSummary = useMemo(
    () =>
      compareRows
        .map((entry) => ({
          category: entry.category,
          latest: entry.history?.length ? entry.history[entry.history.length - 1] : null,
        }))
        .filter((entry) => entry.latest),
    [compareRows]
  );

  const paiLines = useMemo(
    () => buildMainSeries("pai", selectedChannels),
    [selectedChannels]
  );
  const pciLines = useMemo(
    () => buildMainSeries("pci", selectedChannels),
    [selectedChannels]
  );
  const compareLines = useMemo(
    () => ({
      pai: selectedCompareCategories.map((category, index) => ({
        key: `${category}__pai_total`,
        label: `${category} PAI`,
        color: COMPARE_COLORS[index % COMPARE_COLORS.length],
      })),
      pci: selectedCompareCategories.map((category, index) => ({
        key: `${category}__pci_total`,
        label: `${category} PCI`,
        color: COMPARE_COLORS[index % COMPARE_COLORS.length],
      })),
    }),
    [selectedCompareCategories]
  );

  const toggleCompareCategory = (category) => {
    setSelectedCompareCategories((current) => {
      if (current.includes(category)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((item) => item !== category);
      }
      return [...current, category];
    });
  };

  const toggleSelectedChannel = (channel) => {
    setSelectedChannels((current) => {
      if (current.includes(channel)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((item) => item !== channel);
      }
      return [...current, channel];
    });
  };

  const toggleMainLegendLine = (dataKey) => {
    setHiddenMainLines((current) => {
      const nextValue = !current[dataKey];
      const currentlyVisible = paiLines
        .concat(pciLines)
        .filter((line, index, all) => all.findIndex((item) => item.key === line.key) === index)
        .filter((line) => !current[line.key]).length;

      if (nextValue && currentlyVisible <= 1) {
        return current;
      }

      return {
        ...current,
        [dataKey]: nextValue,
      };
    });
  };

  const toggleCompareLegendLine = (dataKey) => {
    setHiddenCompareLines((current) => ({
      ...current,
      [dataKey]: !current[dataKey],
    }));
  };

  const mainSummaryCards = useMemo(() => {
    if (!latest) {
      return [];
    }

    const cards = [];
    selectedChannels.forEach((channel) => {
      cards.push({
        label: `Latest PAI ${CHANNEL_META[channel].label}`,
        value: formatPercent(latest[`pai_${channel}`]),
        accent: CHANNEL_META[channel].paiColor,
      });
      cards.push({
        label: `Latest PCI ${CHANNEL_META[channel].label}`,
        value: formatPercent(latest[`pci_${channel}`]),
        accent: CHANNEL_META[channel].pciColor,
      });
    });
    cards.push({
      label: "Metric Mode",
      value: formatModeLabel(metricMode),
      accent: "#111827",
    });
    cards.push({
      label: "Latest Timestamp",
      value: latest.fullLabel || "--",
      accent: "#334155",
    });
    return cards;
  }, [latest, metricMode, selectedChannels]);

  const channelSummaryText = selectedChannels
    .map((channel) => CHANNEL_META[channel].label)
    .join(" / ");
  const isSingleEmpty = !loadingHistory && !chartData.length && !error;
  const isCompareEmpty = !loadingCompare && !compareChartData.length && !error;

  return (
    <div className="app-shell">
      <div className="app-container">
        <header className="hero">
          <div>
            <p className="eyebrow">PAI / PCI Dashboard</p>
            <h1>Live category quality trends</h1>
            <p className="hero-copy">
              Track weighted or unweighted PAI/PCI performance by category with
              normalized categories, Jalali timestamps, and multi-channel overlays.
            </p>
          </div>
          <div className="hero-chip">
            {formatModeLabel(metricMode)} / {channelSummaryText}
          </div>
        </header>

        <section className="panel">
          <div className="toolbar">
            <div className="control-group control-grow">
              <label className="control-label" htmlFor="category-select">
                Category
              </label>
              <select
                id="category-select"
                className="select-input"
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                disabled={loadingCategories || !categories.length}
              >
                {categories.length === 0 ? (
                  <option value="">No categories</option>
                ) : (
                  categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="control-group">
              <span className="control-label">Metric mode</span>
              <div className="segmented-control">
                {MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`segmented-button${metricMode === option.value ? " is-active" : ""}`}
                    onClick={() => setMetricMode(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="control-group control-grow">
              <span className="control-label">Channels</span>
              <div className="chip-list">
                {CHANNEL_OPTIONS.map((option) => {
                  const active = selectedChannels.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`chip${active ? " chip-active" : ""}`}
                      onClick={() => toggleSelectedChannel(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="status-row">
            <span>
              {loadingCategories
                ? "Loading categories..."
                : selectedCategory
                ? `Category: ${selectedCategory}`
                : "No category selected"}
            </span>
            <span>
              {loadingHistory
                ? "Loading chart data..."
                : latest?.fullLabel || "Awaiting data"}
            </span>
          </div>

          {error ? <div className="error-banner">{error}</div> : null}
        </section>

        {!isSingleEmpty && mainSummaryCards.length ? (
          <section className="summary-grid">
            {mainSummaryCards.map((card) => (
              <SummaryCard
                key={card.label}
                label={card.label}
                value={card.value}
                accent={card.accent}
              />
            ))}
          </section>
        ) : null}

        <TrendPanel
          title="PAI Trend"
          subtitle={`${channelSummaryText} availability in ${formatModeLabel(metricMode).toLowerCase()} mode`}
          data={chartData}
          lines={paiLines}
          threshold={PAI_THRESHOLD}
          hiddenLines={hiddenMainLines}
          onToggleLegend={toggleMainLegendLine}
          loading={loadingHistory}
          empty={isSingleEmpty}
          emptyText="There is no history available for the selected category and metric mode."
        />

        <TrendPanel
          title="PCI Trend"
          subtitle={`${channelSummaryText} PCI in ${formatModeLabel(metricMode).toLowerCase()} mode`}
          data={chartData}
          lines={pciLines}
          threshold={PCI_THRESHOLD}
          hiddenLines={hiddenMainLines}
          onToggleLegend={toggleMainLegendLine}
          loading={loadingHistory}
          empty={isSingleEmpty}
          emptyText="There is no history available for the selected category and metric mode."
        />

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Compare Categories</h2>
              <p>Comparison remains total-only so the main charts stay channel-focused.</p>
            </div>
          </div>
          <div className="chip-list">
            {categories.map((category) => {
              const active = selectedCompareCategories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  className={`chip${active ? " chip-active" : ""}`}
                  onClick={() => toggleCompareCategory(category)}
                  disabled={loadingCategories}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </section>

        {compareSummary.length ? (
          <section className="summary-grid">
            {compareSummary.map((entry, index) => (
              <SummaryCard
                key={entry.category}
                label={`${entry.category} latest totals`}
                value={`${formatPercent(entry.latest.pai_total)} / ${formatPercent(entry.latest.pci_total)}`}
                accent={COMPARE_COLORS[index % COMPARE_COLORS.length]}
              />
            ))}
          </section>
        ) : null}

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Compare Total PAI</h2>
              <p>Cross-category comparison using Jalali timestamps</p>
            </div>
          </div>
          {loadingCompare ? (
            <div className="loading-panel">Loading compare chart...</div>
          ) : isCompareEmpty ? (
            <EmptyState
              title="No compare data"
              text="Select one or more categories that have history rows for the current metric mode."
            />
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={compareChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dbe3ef" />
                  <XAxis dataKey="shortLabel" minTickGap={28} />
                  <YAxis tickFormatter={formatPercent} domain={[0, 1]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="top"
                    content={
                      <CustomLegend
                        hiddenLines={hiddenCompareLines}
                        onToggle={toggleCompareLegendLine}
                      />
                    }
                  />
                  <ReferenceLine
                    y={PAI_THRESHOLD}
                    stroke="#dc2626"
                    strokeDasharray="6 6"
                    label="Threshold"
                  />
                  {compareLines.pai.map((line) =>
                    hiddenCompareLines[line.key] ? null : (
                      <Line
                        key={line.key}
                        type="monotone"
                        dataKey={line.key}
                        name={line.label}
                        stroke={line.color}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    )
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Compare Total PCI</h2>
              <p>Cross-category comparison using Jalali timestamps</p>
            </div>
          </div>
          {loadingCompare ? (
            <div className="loading-panel">Loading compare chart...</div>
          ) : isCompareEmpty ? (
            <EmptyState
              title="No compare data"
              text="Select one or more categories that have history rows for the current metric mode."
            />
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={compareChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dbe3ef" />
                  <XAxis dataKey="shortLabel" minTickGap={28} />
                  <YAxis tickFormatter={formatPercent} domain={[0, 1]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="top"
                    content={
                      <CustomLegend
                        hiddenLines={hiddenCompareLines}
                        onToggle={toggleCompareLegendLine}
                      />
                    }
                  />
                  <ReferenceLine
                    y={PCI_THRESHOLD}
                    stroke="#dc2626"
                    strokeDasharray="6 6"
                    label="Threshold"
                  />
                  {compareLines.pci.map((line) =>
                    hiddenCompareLines[line.key] ? null : (
                      <Line
                        key={line.key}
                        type="monotone"
                        dataKey={line.key}
                        name={line.label}
                        stroke={line.color}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    )
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="ranking-grid">
          <div className="ranking-panel">
            {loadingRankings ? (
              <div className="panel loading-panel">Loading top PAI categories...</div>
            ) : (
              <RankingList
                title="Top Categories by Latest PAI Total"
                rows={rankings.top_pai}
                valueKey="pai_total"
              />
            )}
          </div>
          <div className="ranking-panel">
            {loadingRankings ? (
              <div className="panel loading-panel">Loading worst PCI categories...</div>
            ) : (
              <RankingList
                title="Worst Categories by Latest PCI Total"
                rows={rankings.worst_pci}
                valueKey="pci_total"
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
