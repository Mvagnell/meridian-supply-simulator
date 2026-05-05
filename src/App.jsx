import { useState, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar
} from "recharts";

// ─── DATA LAYER ──────────────────────────────────────────────────────────────

const NODES = {
  // Tier-2 raw material suppliers
  steel_us:    { id: "steel_us",    label: "US Steel Co",       sub: "Gary, IN",          tier: 2, type: "supplier", x: 80,  y: 120 },
  castings_de: { id: "castings_de", label: "Kessler Castings",  sub: "Stuttgart, DE",     tier: 2, type: "supplier", x: 80,  y: 240 },
  motors_mx:   { id: "motors_mx",   label: "Motores del Norte", sub: "Monterrey, MX",     tier: 2, type: "supplier", x: 80,  y: 360 },
  elec_tw:     { id: "elec_tw",     label: "Pacific Controls",  sub: "Taipei, TW",        tier: 2, type: "supplier", x: 80,  y: 480 },
  hydro_it:    { id: "hydro_it",    label: "Lombardi Hydraulics",sub: "Milan, IT",         tier: 2, type: "supplier", x: 80,  y: 600 },

  // Tier-1 component suppliers
  comp_a: { id: "comp_a", label: "Alloy Fabricators", sub: "Cleveland, OH", tier: 1, type: "supplier", x: 310, y: 160 },
  comp_b: { id: "comp_b", label: "Drivetech Systems",  sub: "Detroit, MI",   tier: 1, type: "supplier", x: 310, y: 320 },
  comp_c: { id: "comp_c", label: "Apex Electronics",   sub: "Austin, TX",    tier: 1, type: "supplier", x: 310, y: 480 },
  comp_d: { id: "comp_d", label: "FluidPower GmbH",    sub: "Munich, DE",    tier: 1, type: "supplier", x: 310, y: 620 },

  // Manufacturing plants
  plant_oh: { id: "plant_oh", label: "Meridian Ohio",   sub: "Columbus, OH",     tier: 0, type: "plant", x: 540, y: 200 },
  plant_de: { id: "plant_de", label: "Meridian Europe", sub: "Düsseldorf, DE",   tier: 0, type: "plant", x: 540, y: 400 },
  plant_mx: { id: "plant_mx", label: "Meridian Mexico", sub: "San Luis Potosí",  tier: 0, type: "plant", x: 540, y: 580 },

  // Distribution centers
  dc_east: { id: "dc_east", label: "DC East",    sub: "Atlanta, GA",  tier: -1, type: "dc", x: 760, y: 160 },
  dc_west: { id: "dc_west", label: "DC West",    sub: "Phoenix, AZ",  tier: -1, type: "dc", x: 760, y: 320 },
  dc_eu:   { id: "dc_eu",   label: "DC Europe",  sub: "Rotterdam, NL",tier: -1, type: "dc", x: 760, y: 480 },
  dc_latam:{ id: "dc_latam",label: "DC LATAM",   sub: "Bogotá, CO",   tier: -1, type: "dc", x: 760, y: 600 },
};

const EDGES = [
  // Tier-2 → Tier-1
  { from: "steel_us",    to: "comp_a" },
  { from: "steel_us",    to: "comp_b" },
  { from: "castings_de", to: "comp_a" },
  { from: "castings_de", to: "comp_d" },
  { from: "motors_mx",   to: "comp_b" },
  { from: "motors_mx",   to: "comp_c" },
  { from: "elec_tw",     to: "comp_c" },
  { from: "hydro_it",    to: "comp_d" },
  // Tier-1 → Plants
  { from: "comp_a", to: "plant_oh" },
  { from: "comp_a", to: "plant_de" },
  { from: "comp_b", to: "plant_oh" },
  { from: "comp_b", to: "plant_mx" },
  { from: "comp_c", to: "plant_oh" },
  { from: "comp_c", to: "plant_mx" },
  { from: "comp_d", to: "plant_de" },
  { from: "comp_d", to: "plant_mx" },
  // Plants → DCs
  { from: "plant_oh", to: "dc_east" },
  { from: "plant_oh", to: "dc_west" },
  { from: "plant_de", to: "dc_eu" },
  { from: "plant_de", to: "dc_east" },
  { from: "plant_mx", to: "dc_west" },
  { from: "plant_mx", to: "dc_latam" },
];

// Base state (no disruption)
const BASE_STATE = {
  leadTimeDelta: 0,
  costImpact: 0,
  fillRate: 98,
  resilienceScore: 88,
  capacityLoss: 0,
  affectedNodes: [],
  inventoryData: Array.from({ length: 12 }, (_, i) => ({
    week: `W${i + 1}`, safety: 100, onHand: 100 - i * 0.4,
  })),
  costData: Array.from({ length: 12 }, (_, i) => ({
    week: `W${i + 1}`, baseline: 2.4, actual: 2.4,
  })),
};

// Scenario definitions
const SCENARIOS = {
  supplier_failure: {
    id: "supplier_failure",
    label: "Tier-1 Supplier Failure",
    icon: "⚠",
    description: "Single-source component supplier goes offline. Alloy Fabricators (Cleveland) experiences a major equipment failure, halting output of precision castings used in hydraulic presses and conveyor systems.",
    affectedNodes: ["comp_a"],
    cascades: { mild: ["plant_oh"], moderate: ["plant_oh", "plant_de"], severe: ["plant_oh", "plant_de", "dc_east", "dc_eu"] },
    impacts: {
      mild:     { leadTimeDelta: 8,  costImpact: 1.2, fillRate: 87, resilienceScore: 62, capacityLoss: 18 },
      moderate: { leadTimeDelta: 18, costImpact: 3.8, fillRate: 71, resilienceScore: 44, capacityLoss: 35 },
      severe:   { leadTimeDelta: 34, costImpact: 8.1, fillRate: 52, resilienceScore: 24, capacityLoss: 58 },
    },
  },
  port_closure: {
    id: "port_closure",
    label: "Port Closure",
    icon: "⚓",
    description: "West Coast port strike disrupts inbound ocean freight. Pacific Controls (Taipei) shipments are stranded, cutting electronics component supply to US and Mexico plants.",
    affectedNodes: ["elec_tw", "comp_c"],
    cascades: { mild: ["plant_oh"], moderate: ["plant_oh", "plant_mx"], severe: ["plant_oh", "plant_mx", "dc_west", "dc_latam"] },
    impacts: {
      mild:     { leadTimeDelta: 12, costImpact: 2.1, fillRate: 82, resilienceScore: 58, capacityLoss: 22 },
      moderate: { leadTimeDelta: 24, costImpact: 5.2, fillRate: 67, resilienceScore: 38, capacityLoss: 42 },
      severe:   { leadTimeDelta: 41, costImpact: 9.6, fillRate: 48, resilienceScore: 21, capacityLoss: 64 },
    },
  },
  demand_spike: {
    id: "demand_spike",
    label: "Demand Spike +45%",
    icon: "📈",
    description: "Infrastructure bill drives sudden 45% surge in orders for conveyor systems and hydraulic presses. All plants operating above rated capacity; DC buffers depleting rapidly.",
    affectedNodes: ["dc_east", "dc_west"],
    cascades: { mild: ["plant_oh"], moderate: ["plant_oh", "plant_mx"], severe: ["plant_oh", "plant_mx", "plant_de"] },
    impacts: {
      mild:     { leadTimeDelta: 6,  costImpact: 0.8, fillRate: 84, resilienceScore: 66, capacityLoss: 12 },
      moderate: { leadTimeDelta: 14, costImpact: 2.4, fillRate: 73, resilienceScore: 50, capacityLoss: 28 },
      severe:   { leadTimeDelta: 28, costImpact: 6.2, fillRate: 58, resilienceScore: 32, capacityLoss: 45 },
    },
  },
  tariff_shock: {
    id: "tariff_shock",
    label: "Tariff Shock",
    icon: "🌐",
    description: "25% tariff imposed on steel and component imports from EU and Asia. Kessler Castings, Lombardi Hydraulics, and FluidPower GmbH face immediate cost pass-through to Meridian.",
    affectedNodes: ["castings_de", "hydro_it", "comp_d"],
    cascades: { mild: [], moderate: ["plant_de"], severe: ["plant_de", "dc_eu", "dc_east"] },
    impacts: {
      mild:     { leadTimeDelta: 2,  costImpact: 3.4, fillRate: 91, resilienceScore: 70, capacityLoss: 5 },
      moderate: { leadTimeDelta: 7,  costImpact: 7.1, fillRate: 83, resilienceScore: 54, capacityLoss: 14 },
      severe:   { leadTimeDelta: 16, costImpact: 12.8,fillRate: 71, resilienceScore: 36, capacityLoss: 24 },
    },
  },
  energy_disruption: {
    id: "energy_disruption",
    label: "Energy Disruption",
    icon: "⚡",
    description: "European energy crisis forces rolling power cuts. Meridian Europe plant reduces to 40% rated capacity; FluidPower GmbH suspends third shift. Heat treatment and machining operations most affected.",
    affectedNodes: ["plant_de", "comp_d"],
    cascades: { mild: ["dc_eu"], moderate: ["dc_eu", "dc_east"], severe: ["dc_eu", "dc_east", "plant_de"] },
    impacts: {
      mild:     { leadTimeDelta: 10, costImpact: 1.8, fillRate: 80, resilienceScore: 60, capacityLoss: 28 },
      moderate: { leadTimeDelta: 22, costImpact: 4.5, fillRate: 65, resilienceScore: 41, capacityLoss: 48 },
      severe:   { leadTimeDelta: 38, costImpact: 7.9, fillRate: 49, resilienceScore: 26, capacityLoss: 65 },
    },
  },
};

// Generate inventory burn-down and cost data based on scenario + severity + mitigations
function computeSimulation(scenario, severity, mitigations) {
  if (!scenario) return BASE_STATE;
  const def = SCENARIOS[scenario];
  const raw = def.impacts[severity];

  let { leadTimeDelta, costImpact, fillRate, resilienceScore, capacityLoss } = { ...raw };

  // Apply mitigation effects
  if (mitigations.backup_supplier) {
    leadTimeDelta = Math.round(leadTimeDelta * 0.65);
    costImpact = +(costImpact * 1.18).toFixed(1);      // premium cost
    fillRate = Math.min(98, fillRate + 9);
    resilienceScore = Math.min(95, resilienceScore + 14);
    capacityLoss = Math.max(0, capacityLoss - 12);
  }
  if (mitigations.air_freight) {
    leadTimeDelta = Math.max(2, Math.round(leadTimeDelta * 0.5));
    costImpact = +(costImpact * 1.35).toFixed(1);
    fillRate = Math.min(98, fillRate + 7);
    resilienceScore = Math.min(95, resilienceScore + 8);
  }
  if (mitigations.safety_stock) {
    fillRate = Math.min(98, fillRate + 11);
    resilienceScore = Math.min(95, resilienceScore + 10);
    capacityLoss = Math.max(0, capacityLoss - 6);
  }
  if (mitigations.reroute_dc) {
    leadTimeDelta = Math.max(1, Math.round(leadTimeDelta * 0.8));
    fillRate = Math.min(98, fillRate + 5);
    resilienceScore = Math.min(95, resilienceScore + 6);
  }

  // Generate weekly inventory burn-down
  const stockDraw = mitigations.safety_stock ? 0.55 : 0.85;
  const recover   = mitigations.backup_supplier || mitigations.air_freight;
  const inventoryData = Array.from({ length: 12 }, (_, i) => {
    const baseDecay = Math.max(20, 100 - i * (capacityLoss / 10) * stockDraw);
    const recovered = recover && i >= 4 ? Math.min(100, baseDecay + (i - 4) * 5) : baseDecay;
    return {
      week: `W${i + 1}`,
      safety: 30,
      onHand: Math.round(Math.min(100, recovered)),
    };
  });

  // Generate weekly cost data
  const costData = Array.from({ length: 12 }, (_, i) => {
    const spike = i < 3 ? costImpact : costImpact * (recover ? Math.max(0.4, 1 - i * 0.08) : 1);
    return {
      week: `W${i + 1}`,
      baseline: 2.4,
      actual: +(2.4 + spike * (i < 1 ? 0.3 : i < 3 ? 0.7 : 1)).toFixed(2),
    };
  });

  const allAffected = [
    ...def.affectedNodes,
    ...(def.cascades[severity] || []),
  ];

  return { leadTimeDelta, costImpact, fillRate, resilienceScore, capacityLoss, affectedNodes: allAffected, inventoryData, costData };
}

// ─── COLOR HELPERS ────────────────────────────────────────────────────────────
function nodeColor(nodeId, affectedNodes, type) {
  const isAffected = affectedNodes.includes(nodeId);
  if (isAffected) return { fill: "#dc2626", stroke: "#991b1b", text: "#fff" };
  const palette = {
    supplier: { fill: "#dbeafe", stroke: "#3b82f6", text: "#1e3a8a" },
    plant:    { fill: "#dcfce7", stroke: "#16a34a", text: "#14532d" },
    dc:       { fill: "#fef9c3", stroke: "#ca8a04", text: "#713f12" },
  };
  return palette[type] || { fill: "#f1f5f9", stroke: "#94a3b8", text: "#334155" };
}

function edgeColor(fromId, toId, affectedNodes) {
  if (affectedNodes.includes(fromId) || affectedNodes.includes(toId)) return "#dc2626";
  return "#cbd5e1";
}

// ─── RESILIENCE GAUGE ─────────────────────────────────────────────────────────
function ResilienceGauge({ score }) {
  const angle = -135 + (score / 100) * 270;
  const color = score >= 70 ? "#16a34a" : score >= 45 ? "#d97706" : "#dc2626";
  const rad = (a) => (a * Math.PI) / 180;
  const cx = 80, cy = 80, r = 58;
  const needleX = cx + r * 0.72 * Math.cos(rad(angle));
  const needleY = cy + r * 0.72 * Math.sin(rad(angle));
  return (
    <svg width="160" height="110" viewBox="0 0 160 110">
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="10"
        strokeDasharray={`${270 / 360 * 2 * Math.PI * r} ${2 * Math.PI * r}`}
        strokeDashoffset={`${-135 / 360 * 2 * Math.PI * r}`}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
      {/* Fill */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={`${(score / 100) * 270 / 360 * 2 * Math.PI * r} ${2 * Math.PI * r}`}
        strokeDashoffset={`${-135 / 360 * 2 * Math.PI * r}`}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.4s" }} />
      {/* Needle */}
      <line x1={cx} y1={cy} x2={needleX} y2={needleY}
        stroke="#334155" strokeWidth="2.5" strokeLinecap="round"
        style={{ transition: "x2 0.5s, y2 0.5s" }} />
      <circle cx={cx} cy={cy} r="5" fill="#334155" />
      <text x={cx} y={cy + 28} textAnchor="middle" fontSize="22" fontWeight="700" fill={color}
        style={{ transition: "fill 0.4s" }}>{score}</text>
      <text x={cx} y={cy + 42} textAnchor="middle" fontSize="10" fill="#64748b">resilience score</text>
    </svg>
  );
}

// ─── NETWORK MAP ──────────────────────────────────────────────────────────────
const SVG_W = 960, SVG_H = 740;

function NetworkMap({ affectedNodes, onNodeClick, hoveredNode, setHoveredNode }) {
  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" style={{ display: "block", borderRadius: 12, background: "#f8fafc" }}>
      {/* Column labels */}
      {[
        { x: 80,  label: "Tier-2 Suppliers" },
        { x: 310, label: "Tier-1 Suppliers" },
        { x: 540, label: "Plants" },
        { x: 760, label: "Distribution" },
      ].map(col => (
        <text key={col.x} x={col.x} y={28} textAnchor="middle" fontSize="11" fill="#94a3b8" fontWeight="600" letterSpacing="0.05em">
          {col.label.toUpperCase()}
        </text>
      ))}

      {/* Edges */}
      {EDGES.map((e, i) => {
        const from = NODES[e.from], to = NODES[e.to];
        const color = edgeColor(e.from, e.to, affectedNodes);
        const isHot = color === "#dc2626";
        return (
          <line key={i}
            x1={from.x + 68} y1={from.y + 22}
            x2={to.x - 2}    y2={to.y + 22}
            stroke={color} strokeWidth={isHot ? 2 : 1}
            strokeOpacity={isHot ? 0.9 : 0.35}
            style={{ transition: "stroke 0.4s, stroke-width 0.3s" }} />
        );
      })}

      {/* Nodes */}
      {Object.values(NODES).map(node => {
        const c = nodeColor(node.id, affectedNodes, node.type);
        const isHovered = hoveredNode === node.id;
        return (
          <g key={node.id}
            style={{ cursor: "pointer" }}
            onClick={() => onNodeClick(node)}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}>
            <rect x={node.x} y={node.y} width={136} height={44} rx={8}
              fill={c.fill} stroke={c.stroke} strokeWidth={isHovered ? 2 : 1}
              filter={isHovered ? "drop-shadow(0 2px 6px rgba(0,0,0,0.15))" : "none"}
              style={{ transition: "fill 0.35s, stroke 0.35s" }} />
            <text x={node.x + 68} y={node.y + 15} textAnchor="middle" fontSize="11" fontWeight="700" fill={c.text}>{node.label}</text>
            <text x={node.x + 68} y={node.y + 30} textAnchor="middle" fontSize="10" fill={c.text} opacity={0.75}>{node.sub}</text>
          </g>
        );
      })}

      {/* Legend */}
      {[
        { color: "#dbeafe", stroke: "#3b82f6", label: "Supplier" },
        { color: "#dcfce7", stroke: "#16a34a", label: "Plant" },
        { color: "#fef9c3", stroke: "#ca8a04", label: "DC" },
        { color: "#fee2e2", stroke: "#dc2626", label: "Disrupted" },
      ].map((item, i) => (
        <g key={i} transform={`translate(${30 + i * 110}, 698)`}>
          <rect width="14" height="14" rx="3" fill={item.color} stroke={item.stroke} strokeWidth="1" />
          <text x="20" y="11" fontSize="11" fill="#64748b">{item.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── CUSTOM TOOLTIP ───────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1e293b", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#f1f5f9" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(p.name === "actual" || p.name === "baseline" ? 2 : 0) : p.value}
          {p.name.includes("Hand") || p.name.includes("safety") ? "%" : p.name === "actual" || p.name === "baseline" ? "M" : ""}
        </div>
      ))}
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeScenario, setActiveScenario] = useState(null);
  const [severity, setSeverity] = useState("moderate");
  const [mitigations, setMitigations] = useState({ backup_supplier: false, air_freight: false, safety_stock: false, reroute_dc: false });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [activeTab, setActiveTab] = useState("inventory");

  const sim = computeSimulation(activeScenario, severity, mitigations);

  const toggleMitigation = useCallback((key) => {
    setMitigations(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleNodeClick = (node) => setSelectedNode(node);

  const kpiDelta = (val, base, inverse = false) => {
    if (val === base) return null;
    const up = val > base;
    const good = inverse ? !up : up;
    return { label: `${up ? "+" : ""}${val - base}`, color: good ? "#16a34a" : "#dc2626" };
  };

  const kpis = [
    {
      label: "Lead Time Delta",
      value: `+${sim.leadTimeDelta} days`,
      sub: activeScenario ? "vs. baseline" : "on target",
      color: sim.leadTimeDelta > 20 ? "#dc2626" : sim.leadTimeDelta > 8 ? "#d97706" : "#16a34a",
    },
    {
      label: "Cost Impact",
      value: activeScenario ? `+$${sim.costImpact}M` : "$0",
      sub: "weekly premium",
      color: sim.costImpact > 6 ? "#dc2626" : sim.costImpact > 2 ? "#d97706" : "#16a34a",
    },
    {
      label: "Fill Rate",
      value: `${sim.fillRate}%`,
      sub: "order fulfillment",
      color: sim.fillRate < 65 ? "#dc2626" : sim.fillRate < 80 ? "#d97706" : "#16a34a",
    },
    {
      label: "Capacity Loss",
      value: `${sim.capacityLoss}%`,
      sub: "affected plants",
      color: sim.capacityLoss > 40 ? "#dc2626" : sim.capacityLoss > 20 ? "#d97706" : "#16a34a",
    },
  ];

  const MITIGATIONS = [
    { key: "backup_supplier", label: "Activate Backup Supplier", detail: "+18% cost, −35% lead time", icon: "🏭" },
    { key: "air_freight",     label: "Air Freight Override",     detail: "+35% cost, −50% lead time", icon: "✈" },
    { key: "safety_stock",    label: "Draw Safety Stock",        detail: "Absorbs 4–6 weeks demand",   icon: "📦" },
    { key: "reroute_dc",      label: "Reroute via Alt DC",       detail: "+2 days, avoids disrupted DC",icon: "🔄" },
  ];

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif", background: "#0f172a", minHeight: "100vh", color: "#f1f5f9" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e293b", padding: "18px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⬡</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>Meridian Industrial</div>
            <div style={{ fontSize: 11, color: "#64748b", letterSpacing: "0.08em" }}>SUPPLY CHAIN DISRUPTION SIMULATOR</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["mild", "moderate", "severe"].map(s => (
            <button key={s} onClick={() => setSeverity(s)}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "1px solid",
                borderColor: severity === s ? (s === "mild" ? "#16a34a" : s === "moderate" ? "#d97706" : "#dc2626") : "#334155",
                background: severity === s ? (s === "mild" ? "#052e16" : s === "moderate" ? "#431407" : "#450a0a") : "transparent",
                color: severity === s ? "#fff" : "#64748b",
                fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "capitalize", letterSpacing: "0.04em",
              }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 300px", gap: 0, height: "calc(100vh - 73px)" }}>

        {/* LEFT PANEL — Scenarios */}
        <div style={{ borderRight: "1px solid #1e293b", padding: "20px 16px", overflowY: "auto" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.1em", marginBottom: 12 }}>SELECT DISRUPTION</div>
          {Object.values(SCENARIOS).map(s => {
            const active = activeScenario === s.id;
            return (
              <div key={s.id} onClick={() => { setActiveScenario(active ? null : s.id); setMitigations({ backup_supplier: false, air_freight: false, safety_stock: false, reroute_dc: false }); }}
                style={{
                  borderRadius: 10, padding: "12px 14px", marginBottom: 8, cursor: "pointer",
                  border: `1px solid ${active ? "#3b82f6" : "#1e293b"}`,
                  background: active ? "#0f2744" : "#0f172a",
                  transition: "all 0.2s",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>{s.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: active ? "#93c5fd" : "#e2e8f0" }}>{s.label}</span>
                </div>
                {active && <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5, margin: "6px 0 0" }}>{s.description}</p>}
              </div>
            );
          })}

          {/* Mitigation levers */}
          {activeScenario && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.1em", marginBottom: 12 }}>MITIGATION LEVERS</div>
              {MITIGATIONS.map(m => (
                <div key={m.key} onClick={() => toggleMitigation(m.key)}
                  style={{
                    borderRadius: 10, padding: "10px 12px", marginBottom: 8, cursor: "pointer",
                    border: `1px solid ${mitigations[m.key] ? "#16a34a" : "#1e293b"}`,
                    background: mitigations[m.key] ? "#052e16" : "#0f172a",
                    transition: "all 0.2s",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14 }}>{m.icon}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: mitigations[m.key] ? "#86efac" : "#cbd5e1" }}>{m.label}</div>
                      <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{m.detail}</div>
                    </div>
                    <div style={{ marginLeft: "auto", width: 16, height: 16, borderRadius: "50%", border: `2px solid ${mitigations[m.key] ? "#16a34a" : "#334155"}`, background: mitigations[m.key] ? "#16a34a" : "transparent", flexShrink: 0 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CENTER — Network Map */}
        <div style={{ padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {kpis.map(kpi => (
              <div key={kpi.label} style={{ borderRadius: 10, padding: "14px 16px", background: "#1e293b", border: "1px solid #334155" }}>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6 }}>{kpi.label.toUpperCase()}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: kpi.color, transition: "color 0.4s" }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Network map */}
          <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b" }}>
            <NetworkMap
              affectedNodes={sim.affectedNodes}
              onNodeClick={handleNodeClick}
              hoveredNode={hoveredNode}
              setHoveredNode={setHoveredNode} />
          </div>

          {/* Node detail tooltip */}
          {selectedNode && (
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "12px 16px", border: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: sim.affectedNodes.includes(selectedNode.id) ? "#f87171" : "#93c5fd" }}>{selectedNode.label}</span>
                <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>{selectedNode.sub}</span>
                <span style={{ fontSize: 11, color: "#475569", marginLeft: 12 }}>
                  {selectedNode.type === "supplier" ? "Component Supplier" : selectedNode.type === "plant" ? "Manufacturing Plant" : "Distribution Center"}
                  {" · "}Tier {selectedNode.tier < 0 ? "DC" : selectedNode.tier}
                </span>
                {sim.affectedNodes.includes(selectedNode.id) && (
                  <span style={{ marginLeft: 12, fontSize: 11, color: "#f87171", fontWeight: 600 }}>⚠ DISRUPTED</span>
                )}
              </div>
              <button onClick={() => setSelectedNode(null)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
          )}
        </div>

        {/* RIGHT PANEL — Charts + Resilience */}
        <div style={{ borderLeft: "1px solid #1e293b", padding: "20px 16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Resilience gauge */}
          <div style={{ background: "#1e293b", borderRadius: 10, padding: "14px 16px", border: "1px solid #334155", display: "flex", alignItems: "center", gap: 16 }}>
            <ResilienceGauge score={sim.resilienceScore} />
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6 }}>NETWORK RESILIENCE</div>
              <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                {sim.resilienceScore >= 70 ? "Supply chain is operating within acceptable risk tolerance." :
                  sim.resilienceScore >= 45 ? "Moderate stress detected. Mitigation recommended." :
                    "Critical disruption. Immediate intervention required."}
              </div>
            </div>
          </div>

          {/* Chart tabs */}
          <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
            {["inventory", "cost"].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{
                  padding: "5px 12px", borderRadius: 6, border: "none",
                  background: activeTab === tab ? "#1e40af" : "transparent",
                  color: activeTab === tab ? "#fff" : "#64748b",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
                }}>
                {tab === "inventory" ? "Inventory" : "Weekly Cost"}
              </button>
            ))}
          </div>

          {activeTab === "inventory" ? (
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 12 }}>INVENTORY BURN-DOWN (12 WEEKS)</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={sim.inventoryData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#475569" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#475569" }} domain={[0, 110]} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="onHand" name="On Hand %" stroke="#3b82f6" fill="url(#invGrad)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="safety" name="Safety Stock %" stroke="#dc2626" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 8, lineHeight: 1.5 }}>
                Red dashed line = safety stock threshold (30%). If on-hand inventory crosses below, customer service is at risk.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 12 }}>WEEKLY COST vs BASELINE ($M)</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={sim.costData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#475569" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#475569" }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="baseline" name="baseline" fill="#1e3a8a" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="actual" name="actual" fill="#dc2626" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 8, lineHeight: 1.5 }}>
                Blue = baseline weekly ops cost. Red = actual including expedite, premium freight, and overtime premiums.
              </div>
            </div>
          )}

          {/* Impact summary */}
          {activeScenario && (
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "14px 16px", border: "1px solid #334155" }}>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>IMPACT SUMMARY</div>
              {[
                { label: "Nodes disrupted", value: sim.affectedNodes.length },
                { label: "Lead time added", value: `${sim.leadTimeDelta} days` },
                { label: "Fill rate drop", value: `${98 - sim.fillRate}pp` },
                { label: "Weekly cost premium", value: `$${sim.costImpact}M` },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid #0f172a" }}>
                  <span style={{ color: "#94a3b8" }}>{row.label}</span>
                  <span style={{ fontWeight: 700, color: "#f1f5f9" }}>{row.value}</span>
                </div>
              ))}
            </div>
          )}

          {!activeScenario && (
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "20px 16px", border: "1px dashed #334155", textAlign: "center", color: "#475569", fontSize: 12, lineHeight: 1.7 }}>
              Select a disruption scenario from the left panel to begin the simulation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
