"use client";

// recharts is heavy — this file is lazy-loaded via next/dynamic from
// ItemRenderer so graph code stays out of the critical bundle.

import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ScatterChart, Scatter, ZAxis,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, LabelList,
} from "recharts";
import type { BlockItem, GraphPoint } from "@/store/boardStore";

const TT_STYLE = { background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 };

export function ChartRenderer({ type, data, seriesKeys, colors, showGrid, showLegend, curve, collapsed, width, height, fontFamily, fontSize, fontColor, barRadius, strokeWidth, showDataLabels, xAxisTitle, yAxisTitle }: {
  type: BlockItem["graphType"];
  data: GraphPoint[];
  seriesKeys: string[];
  colors: string[];
  showGrid: boolean;
  showLegend: boolean;
  curve: "monotone" | "linear";
  collapsed: boolean;
  width: number;
  height: number;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  barRadius?: number;
  strokeWidth?: number;
  showDataLabels?: boolean;
  xAxisTitle?: string;
  yAxisTitle?: string;
}) {
  const dims = { width, height };
  const tickStyle = { fill: fontColor ?? "var(--text-muted)", fontSize: fontSize ?? 10, fontFamily: fontFamily };
  const tt = collapsed ? undefined : <Tooltip contentStyle={TT_STYLE} />;
  const grid = showGrid && !collapsed ? <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /> : null;
  const legend = showLegend && !collapsed ? <Legend wrapperStyle={{ fontSize: fontSize ?? 10, fontFamily }} /> : null;
  const xAxis = <XAxis dataKey="label" tick={tickStyle} hide={collapsed} label={xAxisTitle && !collapsed ? { value: xAxisTitle, position: "insideBottom", offset: -4, style: { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)" } } : undefined} />;
  const yAxis = <YAxis tick={tickStyle} hide={collapsed} label={yAxisTitle && !collapsed ? { value: yAxisTitle, angle: -90, position: "insideLeft", style: { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)" } } : undefined} />;
  const br = barRadius ?? 3;
  const sw = strokeWidth ?? 2;
  const lblStyle = { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)", fontFamily };

  if (type === "bar" || type === "bar-stacked") {
    const stacked = type === "bar-stacked";
    return (
      <BarChart {...dims} data={data}>
        {grid}{xAxis}{yAxis}{tt}{legend}
        {seriesKeys.map((k, i) => (
          <Bar key={k} dataKey={k} fill={colors[i % colors.length]} radius={stacked ? 0 : [br,br,0,0]} stackId={stacked ? "s" : undefined}>
            {showDataLabels && !collapsed && <LabelList dataKey={k} position="top" style={lblStyle} />}
          </Bar>
        ))}
      </BarChart>
    );
  }
  if (type === "bar-h") {
    return (
      <BarChart {...dims} data={data} layout="vertical">
        {grid}
        <XAxis type="number" tick={tickStyle} hide={collapsed} label={xAxisTitle && !collapsed ? { value: xAxisTitle, position: "insideBottom", offset: -4, style: { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)" } } : undefined} />
        <YAxis type="category" dataKey="label" tick={tickStyle} hide={collapsed} width={40} label={yAxisTitle && !collapsed ? { value: yAxisTitle, angle: -90, position: "insideLeft", style: { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)" } } : undefined} />
        {tt}{legend}
        {seriesKeys.map((k, i) => (
          <Bar key={k} dataKey={k} fill={colors[i % colors.length]} radius={[0,br,br,0]}>
            {showDataLabels && !collapsed && <LabelList dataKey={k} position="right" style={lblStyle} />}
          </Bar>
        ))}
      </BarChart>
    );
  }
  if (type === "line" || type === "multiline") {
    return (
      <LineChart {...dims} data={data}>
        {grid}{xAxis}{yAxis}{tt}{legend}
        {seriesKeys.map((k, i) => (
          <Line key={k} type={curve} dataKey={k} stroke={colors[i % colors.length]} strokeWidth={sw} dot={!collapsed}>
            {showDataLabels && !collapsed && <LabelList dataKey={k} position="top" style={lblStyle} />}
          </Line>
        ))}
      </LineChart>
    );
  }
  if (type === "area" || type === "area-stacked") {
    const stacked = type === "area-stacked";
    return (
      <AreaChart {...dims} data={data}>
        {grid}{xAxis}{yAxis}{tt}{legend}
        {seriesKeys.map((k, i) => (
          <Area key={k} type={curve} dataKey={k} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.25} strokeWidth={sw} stackId={stacked ? "s" : undefined}>
            {showDataLabels && !collapsed && <LabelList dataKey={k} position="top" style={lblStyle} />}
          </Area>
        ))}
      </AreaChart>
    );
  }
  if (type === "pie" || type === "donut") {
    const inner = type === "donut" ? "45%" : 0;
    return (
      <PieChart {...dims}>
        {tt}{legend}
        <Pie data={data} dataKey={seriesKeys[0] ?? "value"} nameKey="label" cx="50%" cy="50%" innerRadius={inner} outerRadius={collapsed ? "90%" : "75%"}>
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          {showDataLabels && !collapsed && <LabelList dataKey="label" position="outside" style={lblStyle} />}
        </Pie>
      </PieChart>
    );
  }
  if (type === "scatter") {
    // seriesKeys[0] = shared X axis; seriesKeys[1..n] = one dataset per Y series
    const xKey = seriesKeys[0] ?? "x";
    const yKeys = seriesKeys.length > 1 ? seriesKeys.slice(1) : [seriesKeys[0] ?? "y"];
    const labelStyle = { fontSize: collapsed ? 0 : (fontSize ?? 9), fill: fontColor ?? "var(--text-muted)", fontFamily };
    const xLabel = xAxisTitle ?? xKey;
    return (
      <ScatterChart {...dims}>
        {grid}
        <XAxis dataKey="x" type="number" name={xKey} tick={tickStyle} hide={collapsed} label={collapsed ? undefined : { value: xLabel, position: "insideBottom", offset: -4, style: { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)" } }} />
        <YAxis dataKey="y" type="number" tick={tickStyle} hide={collapsed} label={yAxisTitle && !collapsed ? { value: yAxisTitle, angle: -90, position: "insideLeft", style: { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)" } } : undefined} />
        <ZAxis range={[sw * 20, sw * 20]} />
        {tt}
        {showLegend && !collapsed && <Legend wrapperStyle={{ fontSize: fontSize ?? 10, fontFamily }} />}
        {yKeys.map((yKey, i) => {
          const pts = data.map((r) => ({ x: Number(r[xKey] ?? 0), y: Number(r[yKey] ?? 0), label: r.label }));
          return (
            <Scatter key={yKey} name={yKey} data={pts} fill={colors[i % colors.length]}>
              {showDataLabels && !collapsed && <LabelList dataKey="label" position="top" style={labelStyle} />}
            </Scatter>
          );
        })}
      </ScatterChart>
    );
  }
  if (type === "radar") {
    return (
      <RadarChart {...dims} data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="label" tick={{ ...tickStyle, fontSize: collapsed ? 8 : (fontSize ?? 10) }} />
        {tt}{legend}
        {seriesKeys.map((k, i) => (
          <Radar key={k} name={k} dataKey={k} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.2}>
            {showDataLabels && !collapsed && <LabelList dataKey={k} style={lblStyle} />}
          </Radar>
        ))}
      </RadarChart>
    );
  }
  return (
    <BarChart {...dims} data={data}>
      <Bar dataKey={seriesKeys[0] ?? "value"} fill={colors[0]} />
    </BarChart>
  );
}
