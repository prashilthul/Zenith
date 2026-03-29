import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { Incident } from "../types";

interface Props {
  incidents: Incident[];
}

export default function MTTRChart({ incidents }: Props) {
  if (incidents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">
        No incidents to chart
      </div>
    );
  }

  // Create simple chart data from incidents
  const data = incidents.slice(-10).map((inc, idx) => ({
    name: inc.anomaly_type || `#${idx + 1}`,
    confidence: (inc.confidence || 0) * 100,
    incidents: 1,
  }));

  // Aggregate by anomaly type
  const aggregated: Record<string, { name: string; count: number; avgConf: number }> = {};
  for (const d of data) {
    if (!aggregated[d.name]) aggregated[d.name] = { name: d.name, count: 0, avgConf: 0 };
    aggregated[d.name].count++;
    aggregated[d.name].avgConf += d.confidence;
  }
  const chartData = Object.values(aggregated).map(a => ({
    name: a.name,
    count: a.count,
    confidence: Math.round(a.avgConf / a.count),
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#94a3b8", fontSize: 10, fontFamily: "monospace" }}
          stroke="#475569"
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}
          stroke="#475569"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "8px",
            fontFamily: "monospace",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontFamily: "monospace", fontSize: 12 }} />
        <Bar dataKey="count" fill="#06b6d4" name="Incidents" radius={[4, 4, 0, 0]} />
        <Bar dataKey="confidence" fill="#10b981" name="Avg Confidence %" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
