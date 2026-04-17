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

const API_BASE = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE) {
  throw new Error("Missing VITE_API_BASE_URL environment variable.");
}

const PAI_THRESHOLD = 0.7;
const PCI_THRESHOLD = 0.1;

function formatPercent(value) {
  const num = Number(value ?? 0);
  return `${(num * 100).toFixed(1)}%`;
}

function App() {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [data, setData] = useState([]);
  const [error, setError] = useState("");
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

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
          setSelectedCategory(cats[0]);
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
        setData([]);
        return;
      }

      try {
        setLoadingHistory(true);
        setError("");

        const res = await fetch(
          `${API_BASE}/kpis/history?category=${encodeURIComponent(
            selectedCategory
          )}`
        );

        if (!res.ok) {
          throw new Error(`History request failed: ${res.status}`);
        }

        const rows = await res.json();

        if (!Array.isArray(rows)) {
          throw new Error("History response is not an array.");
        }

        setData(rows);
      } catch (err) {
        console.error(err);
        setError("Loading history failed.");
        setData([]);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
  }, [selectedCategory]);

  const chartData = useMemo(() => {
    return data.map((row) => {
      const rawDate = row.date || "";
      const rawTime = row.time || "";

      let label = "";
      if (typeof rawDate === "string" && rawDate.includes("T")) {
        label = rawDate.slice(0, 10);
      } else {
        label = String(rawDate);
      }

      if (rawTime && typeof rawTime === "string" && !rawTime.startsWith("1899")) {
        label = `${label} ${rawTime.slice(0, 5)}`;
      }

      return {
        label,
        pai_retail: Number(row.pai_retail_weighted ?? 0),
        pai_bot: Number(row.pai_bot_weighted ?? 0),
        pai_seller: Number(row.pai_seller_weighted ?? 0),

        pci_retail: Number(row.pci_retail_weighted_avg ?? 0),
        pci_bot: Number(row.pci_bot_weighted_avg ?? 0),
        pci_seller: Number(row.pci_seller_weighted_avg ?? 0),
      };
    });
  }, [data]);

  const latest = chartData.length > 0 ? chartData[chartData.length - 1] : null;

  const cardStyle = {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
    marginBottom: "24px",
  };

  const statCardStyle = {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "16px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
    minWidth: "180px",
    flex: 1,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ margin: 0, fontSize: "32px" }}>PAI / PCI Dashboard</h1>
          <p style={{ marginTop: "8px", color: "#666" }}>
            Trend view for Retail, Bot, and Seller by category
          </p>
        </div>

        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label style={{ fontWeight: "bold" }}>Category:</label>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={loadingCategories || categories.length === 0}
              style={{
                minWidth: "260px",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #d0d7e2",
                background: "#fff",
                fontSize: "14px",
              }}
            >
              {categories.length === 0 ? (
                <option value="">No categories</option>
              ) : (
                categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))
              )}
            </select>

            <div style={{ color: "#666", fontSize: "14px" }}>
              {loadingCategories
                ? "Loading categories..."
                : loadingHistory
                ? "Loading chart data..."
                : `Rows: ${chartData.length}`}
            </div>
          </div>

          {error ? (
            <div
              style={{
                marginTop: "16px",
                color: "#b00020",
                background: "#fdecec",
                padding: "12px",
                borderRadius: "10px",
              }}
            >
              {error}
            </div>
          ) : null}
        </div>

        {latest ? (
          <div
            style={{
              display: "flex",
              gap: "16px",
              flexWrap: "wrap",
              marginBottom: "24px",
            }}
          >
            <div style={statCardStyle}>
              <div style={{ color: "#666", marginBottom: "8px" }}>
                Latest PAI Retail
              </div>
              <div style={{ fontSize: "26px", fontWeight: "bold", color: "#3b82f6" }}>
                {formatPercent(latest.pai_retail)}
              </div>
            </div>

            <div style={statCardStyle}>
              <div style={{ color: "#666", marginBottom: "8px" }}>
                Latest PAI Bot
              </div>
              <div style={{ fontSize: "26px", fontWeight: "bold", color: "#10b981" }}>
                {formatPercent(latest.pai_bot)}
              </div>
            </div>

            <div style={statCardStyle}>
              <div style={{ color: "#666", marginBottom: "8px" }}>
                Latest PAI Seller
              </div>
              <div style={{ fontSize: "26px", fontWeight: "bold", color: "#f59e0b" }}>
                {formatPercent(latest.pai_seller)}
              </div>
            </div>

            <div style={statCardStyle}>
              <div style={{ color: "#666", marginBottom: "8px" }}>
                Latest PCI Retail
              </div>
              <div style={{ fontSize: "26px", fontWeight: "bold", color: "#2563eb" }}>
                {formatPercent(latest.pci_retail)}
              </div>
            </div>

            <div style={statCardStyle}>
              <div style={{ color: "#666", marginBottom: "8px" }}>
                Latest PCI Bot
              </div>
              <div style={{ fontSize: "26px", fontWeight: "bold", color: "#059669" }}>
                {formatPercent(latest.pci_bot)}
              </div>
            </div>

            <div style={statCardStyle}>
              <div style={{ color: "#666", marginBottom: "8px" }}>
                Latest PCI Seller
              </div>
              <div style={{ fontSize: "26px", fontWeight: "bold", color: "#d97706" }}>
                {formatPercent(latest.pci_seller)}
              </div>
            </div>
          </div>
        ) : null}

        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>PAI Trend</h2>
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={formatPercent} domain={[0, 1]} />
              <Tooltip formatter={(value) => formatPercent(value)} />
              <Legend />
              <ReferenceLine
                y={PAI_THRESHOLD}
                stroke="#ef4444"
                strokeDasharray="6 6"
                label="Threshold"
              />
              <Line
                type="natural"
                dataKey="pai_retail"
                name="Retail"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                type="natural"
                dataKey="pai_bot"
                name="Bot"
                stroke="#10b981"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                type="natural"
                dataKey="pai_seller"
                name="Seller"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>PCI Trend</h2>
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={formatPercent} />
              <Tooltip formatter={(value) => formatPercent(value)} />
              <Legend />
              <ReferenceLine
                y={PCI_THRESHOLD}
                stroke="#ef4444"
                strokeDasharray="6 6"
                label="Threshold"
              />
              <Line
                type="natural"
                dataKey="pci_retail"
                name="Retail"
                stroke="#2563eb"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                type="natural"
                dataKey="pci_bot"
                name="Bot"
                stroke="#059669"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                type="natural"
                dataKey="pci_seller"
                name="Seller"
                stroke="#d97706"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default App;
