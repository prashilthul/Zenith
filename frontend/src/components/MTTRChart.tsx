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
  const resolved = incidents.filter((i) => i.resolution_time_seconds != null);

  if (resolved.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">
        No resolved incidents to chart
      </div>
    );
  }

  const data = resolved.slice(-20).map((inc, idx) => ({
    name: `#${idx + 1}`,
    detection: inc.detection_time_seconds ?? 0,
    diagnosis: inc.diagnosis_time_seconds ?? 0,
    fix: inc.fix_time_seconds ?? 0,
    verify: inc.verify_time_seconds ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}
          stroke="#475569"
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}
          stroke="#475569"
          label={{
            value: "seconds",
            angle: -90,
            position: "insideLeft",
            fill: "#64748b",
            fontSize: 11,
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "8px",
            fontFamily: "monospace",
            fontSize: 12,
          }}
          labelStyle={{ color: "#e2e8f0" }}
        />
        <Legend
          wrapperStyle={{ fontFamily: "monospace", fontSize: 12 }}
        />
        <Bar dataKey="detection" stackId="a" fill="#f59e0b" name="Detection" radius={[0, 0, 0, 0]} />
        <Bar dataKey="diagnosis" stackId="a" fill="#3b82f6" name="Diagnosis" />
        <Bar dataKey="fix" stackId="a" fill="#06b6d4" name="Fix" />
        <Bar dataKey="verify" stackId="a" fill="#10b981" name="Verify" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
