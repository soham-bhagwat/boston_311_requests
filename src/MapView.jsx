import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const BOSTON_CENTER = [42.3601, -71.0589];

const STATUS_COLORS = {
  "Closed": "#22c55e",
  "In progress": "#f59e0b",
  "Open": "#38bdf8",
};

const TOPIC_COLORS = {
  "Street Light Outage": "#f59e0b",
  "Street Light Knockdown": "#f97316",
  "Pothole": "#ef4444",
  "Missed Trash/Recycling/Yard Waste/Bulk Item": "#84cc16",
  "Sidewalk Repair": "#a78bfa",
  "Pruning Request": "#22c55e",
  "Fallen Tree or Branches": "#14b8a6",
  "Rodent Activity": "#ec4899",
  "Parking Enforcement": "#06b6d4",
  "Graffiti Removal": "#6366f1",
};

function getColor(point, colorBy) {
  if (colorBy === "status") return STATUS_COLORS[point.status] || "#94a3b8";
  if (colorBy === "topic") return TOPIC_COLORS[point.topic] || "#94a3b8";
  return "#38bdf8";
}

export default function MapView({ data }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef(null);
  const [colorBy, setColorBy] = useState("status");

  const points = data.filter(
    (d) => d.lat && d.lng && d.lat > 42 && d.lat < 42.5 && d.lng > -71.2 && d.lng < -70.9
  );

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current, {
      center: BOSTON_CENTER,
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }
    ).addTo(mapInstance.current);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;

    if (markersRef.current) {
      mapInstance.current.removeLayer(markersRef.current);
    }

    const markers = L.layerGroup();
    const subset = points.slice(0, 2000);

    subset.forEach((pt) => {
      const color = getColor(pt, colorBy);
      const circle = L.circleMarker([pt.lat, pt.lng], {
        radius: 5,
        fillColor: color,
        color: color,
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.6,
      });

      circle.bindPopup(`
        <div style="font-family:system-ui;font-size:13px;line-height:1.5;min-width:200px">
          <strong style="font-size:14px">${pt.topic}</strong><br/>
          <span style="color:#666">${pt.address || "No address"}</span>
          <hr style="margin:6px 0;border:none;border-top:1px solid #eee"/>
          <b>Status:</b> ${pt.status}<br/>
          <b>Department:</b> ${pt.department}<br/>
          <b>Source:</b> ${pt.source}<br/>
          ${pt.neighborhood ? `<b>Neighborhood:</b> ${pt.neighborhood}<br/>` : ""}
          ${pt.daysToClose != null ? `<b>Resolution:</b> ${pt.daysToClose.toFixed(1)} days` : ""}
        </div>
      `);

      markers.addLayer(circle);
    });

    markers.addTo(mapInstance.current);
    markersRef.current = markers;
  }, [points, colorBy]);

  const P = {
    bg: "#06090f", surface: "#0d1520", surfaceAlt: "#131d2e",
    border: "#1a2d47", accent: "#38bdf8", text: "#e2e8f0",
    muted: "#94a3b8", dim: "#475569",
  };

  const legendItems =
    colorBy === "status"
      ? Object.entries(STATUS_COLORS)
      : Object.entries(TOPIC_COLORS).slice(0, 8);

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ fontSize: 12, color: P.muted, fontFamily: "'Geist Mono', monospace" }}>
          {points.length.toLocaleString()} locations plotted
          {points.length > 2000 && ` (showing 2,000 of ${points.length.toLocaleString()})`}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["status", "topic"].map((opt) => (
            <button key={opt} onClick={() => setColorBy(opt)} style={{
              padding: "6px 16px", fontSize: 12, borderRadius: 6, cursor: "pointer",
              fontFamily: "'Geist Mono', monospace", transition: "all 0.2s",
              background: colorBy === opt ? `${P.accent}20` : "transparent",
              color: colorBy === opt ? P.accent : P.muted,
              border: `1px solid ${colorBy === opt ? P.accent + "40" : P.border}`,
            }}>
              Color by {opt}
            </button>
          ))}
        </div>
      </div>

      <div style={{
        borderRadius: 12, overflow: "hidden", border: `1px solid ${P.border}`,
        height: 500, position: "relative",
      }}>
        <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
      </div>

      <div style={{
        display: "flex", flexWrap: "wrap", gap: 14, marginTop: 14, padding: "12px 16px",
        background: P.surface, borderRadius: 10, border: `1px solid ${P.border}`,
      }}>
        {legendItems.map(([label, color]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%", background: color,
              boxShadow: `0 0 6px ${color}60`,
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