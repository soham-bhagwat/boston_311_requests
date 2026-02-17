import { useState, useMemo, useEffect, useRef } from "react";

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
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef(null);
  const [colorBy, setColorBy] = useState("status");
  const [leafletReady, setLeafletReady] = useState(false);
  const leafletRef = useRef(null);

  // Parse points - same logic that worked in debug version
  const points = useMemo(() => {
    const valid = [];
    for (let i = 0; i < data.length && valid.length < 2000; i++) {
      const d = data[i];
      let rawLat = d.lat !== undefined ? d.lat : d.latitude;
      let rawLng = d.lng !== undefined ? d.lng : d.longitude;
      if (rawLat === null || rawLat === undefined || rawLat === "") continue;
      if (rawLng === null || rawLng === undefined || rawLng === "") continue;
      const lat = typeof rawLat === "number" ? rawLat : parseFloat(String(rawLat).trim());
      const lng = typeof rawLng === "number" ? rawLng : parseFloat(String(rawLng).trim());
      if (isNaN(lat) || isNaN(lng)) continue;
      if (lat < 42.2 || lat > 42.42 || lng < -71.2 || lng > -70.9) continue;
      valid.push({ ...d, lat, lng });
    }
    return valid;
  }, [data]);

  // Load Leaflet CSS and JS from CDN
  useEffect(() => {
    // Check if already loaded
    if (window.L) {
      leafletRef.current = window.L;
      setLeafletReady(true);
      return;
    }

    // Load CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(link);

    // Load JS
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    script.onload = () => {
      leafletRef.current = window.L;
      setLeafletReady(true);
    };
    script.onerror = () => {
      console.error("Failed to load Leaflet");
    };
    document.head.appendChild(script);
  }, []);

  // Initialize map
  useEffect(() => {
    const L = leafletRef.current;
    if (!L || !mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current).setView([42.36, -71.06], 12);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInstance.current = map;

    // Force a resize after mount
    setTimeout(() => { map.invalidateSize(); }, 200);

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [leafletReady]);

  // Draw markers
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapInstance.current;
    if (!L || !map) return;

    // Remove old markers
    if (markersRef.current) {
      map.removeLayer(markersRef.current);
    }

    const group = L.layerGroup();

    points.forEach((pt) => {
      const color = getColor(pt, colorBy);
      L.circleMarker([pt.lat, pt.lng], {
        radius: 5,
        fillColor: color,
        color: color,
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.6,
      })
      .bindPopup(
        '<div style="font-family:system-ui;font-size:13px;line-height:1.5;min-width:200px">' +
        '<strong style="font-size:14px">' + (pt.topic || "Unknown") + '</strong><br/>' +
        '<span style="color:#666">' + (pt.address || "No address") + '</span>' +
        '<hr style="margin:6px 0;border:none;border-top:1px solid #eee"/>' +
        '<b>Status:</b> ' + (pt.status || "Unknown") + '<br/>' +
        '<b>Department:</b> ' + (pt.department || "Unknown") + '<br/>' +
        '<b>Source:</b> ' + (pt.source || "Unknown") + '<br/>' +
        (pt.neighborhood ? '<b>Neighborhood:</b> ' + pt.neighborhood + '<br/>' : '') +
        (pt.daysToClose != null ? '<b>Resolution:</b> ' + pt.daysToClose.toFixed(1) + ' days' : '') +
        '</div>'
      )
      .addTo(group);
    });

    group.addTo(map);
    markersRef.current = group;
  }, [points, colorBy, leafletReady]);

  const P = {
    surface: "#0d1520", border: "#1a2d47",
    accent: "#38bdf8", muted: "#94a3b8", dim: "#475569",
  };

  const legendItems = colorBy === "status"
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
        height: 500,
      }}>
        {!leafletReady && (
          <div style={{
            height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            background: P.surface, color: P.muted, fontSize: 14,
          }}>Loading map...</div>
        )}
        <div ref={mapRef} style={{ height: "100%", width: "100%", display: leafletReady ? "block" : "none" }} />
      </div>

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