import { useEffect, useRef, useState, useMemo } from "react";

// Boston bounding box
const BOUNDS = { minLat: 42.23, maxLat: 42.40, minLng: -71.19, maxLng: -70.99 };
const W = 900;
const H = 600;

const STATUS_COLORS = { Closed: "#22c55e", "In progress": "#f59e0b", Open: "#38bdf8" };
const TOPIC_COLORS = {
  "Street Light Outage": "#f59e0b", "Street Light Knockdown": "#f97316",
  "Pothole": "#ef4444", "Missed Trash/Recycling/Yard Waste/Bulk Item": "#84cc16",
  "Sidewalk Repair": "#a78bfa", "Pruning Request": "#22c55e",
  "Fallen Tree or Branches": "#14b8a6", "Rodent Activity": "#ec4899",
  "Parking Enforcement": "#06b6d4", "Graffiti Removal": "#6366f1",
};

function toXY(lat, lng) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * W;
  const y = H - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * H;
  return { x, y };
}

function getColor(pt, colorBy) {
  if (colorBy === "status") return STATUS_COLORS[pt.status] || "#94a3b8";
  if (colorBy === "topic") return TOPIC_COLORS[pt.topic] || "#94a3b8";
  return "#38bdf8";
}

export default function MapView({ data }) {
  const canvasRef = useRef(null);
  const [colorBy, setColorBy] = useState("status");
  const [hovered, setHovered] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const points = useMemo(() =>
    data.filter(d => d.lat && d.lng &&
      d.lat > BOUNDS.minLat && d.lat < BOUNDS.maxLat &&
      d.lng > BOUNDS.minLng && d.lng < BOUNDS.maxLng
    ).map(d => ({ ...d, ...toXY(d.lat, d.lng) }))
  , [data]);

  // Draw dots on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#0d1520";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "#1a2d4720";
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo((W / 10) * i, 0);
      ctx.lineTo((W / 10) * i, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (H / 10) * i);
      ctx.lineTo(W, (H / 10) * i);
      ctx.stroke();
    }

    // Draw points
    const subset = points.slice(0, 3000);
    subset.forEach(pt => {
      const color = getColor(pt, colorBy);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color + "99";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });
  }, [points, colorBy]);

  // Handle mouse hover for tooltips
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    // Find nearest point within 10px
    let closest = null;
    let closestDist = 10;
    for (const pt of points.slice(0, 3000)) {
      const dist = Math.sqrt((pt.x - mx) ** 2 + (pt.y - my) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closest = pt;
      }
    }
    setHovered(closest);
  };

  const P = {
    surface: "#0d1520", surfaceAlt: "#131d2e", border: "#1a2d47",
    accent: "#38bdf8", muted: "#94a3b8", dim: "#475569",
  };

  const legendItems = colorBy === "status"
    ? Object.entries(STATUS_COLORS)
    : Object.entries(TOPIC_COLORS).slice(0, 8);

  return (
    <div>
      {/* Controls */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ fontSize: 12, color: P.muted, fontFamily: "'Geist Mono', monospace" }}>
          {points.length.toLocaleString()} locations
          {points.length > 3000 ? " (showing 3,000)" : ""}
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

      {/* Canvas Map */}
      <div style={{
        borderRadius: 12, overflow: "hidden", border: "1px solid " + P.border,
        position: "relative", background: P.surface,
      }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHovered(null)}
        />

        {/* Tooltip */}
        {hovered && (
          <div style={{
            position: "absolute",
            left: Math.min(mousePos.x + 12, canvasRef.current?.getBoundingClientRect().width - 260),
            top: mousePos.y - 10,
            background: P.surfaceAlt, border: "1px solid " + P.border,
            borderRadius: 8, padding: "10px 14px", pointerEvents: "none",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 10,
            maxWidth: 250, fontSize: 12, lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{hovered.topic}</div>
            <div style={{ color: P.dim, marginBottom: 6 }}>{hovered.address || "No address"}</div>
            <div><b>Status:</b> <span style={{ color: STATUS_COLORS[hovered.status] || P.muted }}>{hovered.status}</span></div>
            <div><b>Dept:</b> {hovered.department}</div>
            {hovered.neighborhood && <div><b>Area:</b> {hovered.neighborhood}</div>}
            {hovered.daysToClose != null && <div><b>Resolved:</b> {hovered.daysToClose.toFixed(1)}d</div>}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 14, marginTop: 14, padding: "12px 16px",
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
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#94a3b8" }} />
          <span style={{ fontSize: 11, color: P.dim }}>Other</span>
        </div>
      </div>
    </div>
  );
}