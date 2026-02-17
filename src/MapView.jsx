import { useState, useMemo } from "react";

const BOUNDS = { minLat: 42.22, maxLat: 42.41, minLng: -71.19, maxLng: -70.98 };
const W = 800;
const H = 550;

const STATUS_COLORS = { Closed: "#22c55e", "In progress": "#f59e0b", Open: "#38bdf8" };
const TOPIC_COLORS = {
  "Street Light Outage": "#f59e0b", "Street Light Knockdown": "#f97316",
  "Pothole": "#ef4444", "Missed Trash/Recycling/Yard Waste/Bulk Item": "#84cc16",
  "Sidewalk Repair": "#a78bfa", "Pruning Request": "#22c55e",
  "Fallen Tree or Branches": "#14b8a6", "Rodent Activity": "#ec4899",
  "Parking Enforcement": "#06b6d4", "Graffiti Removal": "#6366f1",
};

function getColor(pt, colorBy) {
  if (colorBy === "status") return STATUS_COLORS[pt.status] || "#94a3b8";
  if (colorBy === "topic") return TOPIC_COLORS[pt.topic] || "#94a3b8";
  return "#38bdf8";
}

export default function MapView({ data }) {
  const [colorBy, setColorBy] = useState("status");
  const [hovered, setHovered] = useState(null);

  // DEBUG: inspect first record to see what fields exist
  const debugInfo = useMemo(() => {
    if (!data || data.length === 0) return "No data passed to MapView";
    const first = data[0];
    const keys = Object.keys(first);
    const latVal = first.lat;
    const lngVal = first.lng;
    const latitudeVal = first.latitude;
    const longitudeVal = first.longitude;
    return JSON.stringify({
      totalRecords: data.length,
      sampleKeys: keys.slice(0, 10),
      "first.lat": latVal,
      "first.lng": lngVal,
      "first.latitude": latitudeVal,
      "first.longitude": longitudeVal,
      "typeof first.lat": typeof latVal,
      "typeof first.lng": typeof lngVal,
    }, null, 2);
  }, [data]);

  const points = useMemo(() => {
    const valid = [];
    let skippedNoValue = 0;
    let skippedNaN = 0;
    let skippedBounds = 0;

    for (let i = 0; i < data.length && valid.length < 2000; i++) {
      const d = data[i];

      // Try every possible field name
      let rawLat = d.lat !== undefined ? d.lat : d.latitude;
      let rawLng = d.lng !== undefined ? d.lng : d.longitude;

      if (rawLat === null || rawLat === undefined || rawLat === "") {
        skippedNoValue++;
        continue;
      }
      if (rawLng === null || rawLng === undefined || rawLng === "") {
        skippedNoValue++;
        continue;
      }

      const lat = typeof rawLat === "number" ? rawLat : parseFloat(String(rawLat).trim());
      const lng = typeof rawLng === "number" ? rawLng : parseFloat(String(rawLng).trim());

      if (isNaN(lat) || isNaN(lng)) {
        skippedNaN++;
        continue;
      }

      if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) {
        skippedBounds++;
        continue;
      }

      const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * W;
      const y = H - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * H;
      valid.push({ ...d, lat, lng, x, y });
    }

    // Store debug stats
    valid._debug = { skippedNoValue, skippedNaN, skippedBounds, total: data.length };
    return valid;
  }, [data]);

  const P = {
    surface: "#0d1520", border: "#1a2d47",
    accent: "#38bdf8", muted: "#94a3b8", dim: "#475569",
  };

  const legendItems = colorBy === "status"
    ? Object.entries(STATUS_COLORS)
    : Object.entries(TOPIC_COLORS).slice(0, 8);

  const dbg = points._debug || {};

  return (
    <div>
      {/* DEBUG BOX - remove after fixing */}
      <div style={{
        background: "#1a0505", border: "1px solid #ef4444", borderRadius: 8,
        padding: 12, marginBottom: 14, fontSize: 11, fontFamily: "monospace",
        color: "#fca5a5", whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto",
      }}>
        <b>DEBUG (remove after fixing):</b>{"\n"}
        Valid points: {points.length}{"\n"}
        Skipped (no value): {dbg.skippedNoValue}{"\n"}
        Skipped (NaN): {dbg.skippedNaN}{"\n"}
        Skipped (out of bounds): {dbg.skippedBounds}{"\n"}
        Total data: {dbg.total}{"\n"}
        ---{"\n"}
        {debugInfo}
      </div>

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ fontSize: 12, color: P.muted, fontFamily: "'Geist Mono', monospace" }}>
          {points.length.toLocaleString()} locations
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["status", "topic"].map(opt => (
            <button key={opt} onClick={() => setColorBy(opt)} style={{
              padding: "6px 16px", fontSize: 12, borderRadius: 6, cursor: "pointer",
              fontFamily: "'Geist Mono', monospace",
              background: colorBy === opt ? P.accent + "20" : "transparent",
              color: colorBy === opt ? P.accent : P.muted,
              border: "1px solid " + (colorBy === opt ? P.accent + "40" : P.border),
            }}>Color by {opt}</button>
          ))}
        </div>
      </div>

      <div style={{
        borderRadius: 12, overflow: "hidden", border: "1px solid " + P.border,
        background: P.surface,
      }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
          <rect width={W} height={H} fill="#0d1520" />
          {Array.from({ length: 11 }, (_, i) => (
            <line key={"gx" + i} x1={(W / 10) * i} y1={0} x2={(W / 10) * i} y2={H} stroke="#1a2d47" strokeOpacity={0.3} strokeWidth={0.5} />
          ))}
          {Array.from({ length: 11 }, (_, i) => (
            <line key={"gy" + i} x1={0} y1={(H / 10) * i} x2={W} y2={(H / 10) * i} stroke="#1a2d47" strokeOpacity={0.3} strokeWidth={0.5} />
          ))}
          {points.map((pt, i) => {
            const color = getColor(pt, colorBy);
            return (
              <circle
                key={i}
                cx={pt.x}
                cy={pt.y}
                r={hovered === i ? 7 : 4}
                fill={color}
                fillOpacity={0.65}
                stroke={color}
                strokeWidth={hovered === i ? 1.5 : 0.5}
                style={{ cursor: "pointer", transition: "r 0.15s" }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
          {points.length === 0 && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fill="#94a3b8" fontSize={16}>
              No locations to display — check debug info above
            </text>
          )}
        </svg>
      </div>

      {hovered !== null && points[hovered] && (
        <div style={{
          marginTop: 10, padding: "12px 16px",
          background: "#131d2e", border: "1px solid " + P.border,
          borderRadius: 10, fontSize: 13, lineHeight: 1.7,
        }}>
          <strong style={{ fontSize: 14 }}>{points[hovered].topic}</strong>
          <span style={{ color: P.dim, marginLeft: 10 }}>{points[hovered].address || "No address"}</span>
          <br />
          <span><b>Status:</b> <span style={{ color: STATUS_COLORS[points[hovered].status] || P.muted }}>{points[hovered].status}</span></span>
          <span style={{ marginLeft: 16 }}><b>Dept:</b> {points[hovered].department}</span>
          {points[hovered].neighborhood && <span style={{ marginLeft: 16 }}><b>Area:</b> {points[hovered].neighborhood}</span>}
          {points[hovered].daysToClose != null && <span style={{ marginLeft: 16 }}><b>Resolved:</b> {points[hovered].daysToClose.toFixed(1)}d</span>}
        </div>
      )}

      <div style={{
        display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10, padding: "12px 16px",
        background: P.surface, borderRadius: 10, border: "1px solid " + P.border,
      }}>
        {legendItems.map(([label, color]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%", background: color,
              boxShadow: "0 0 6px " + color + "60",
            }} />
            <span style={{ fontSize: 11, color: P.muted }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}