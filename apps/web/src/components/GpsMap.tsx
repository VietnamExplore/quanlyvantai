import 'maplibre-gl/dist/maplibre-gl.css';
import { APIProvider, Map as GMap, useMap as useGMap } from '@vis.gl/react-google-maps';
import { Empty, Typography } from 'antd';
import maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useSettings } from './common';

export interface MapMarker {
  key: string;
  lat: number;
  lng: number;
  color: string;
  label?: string;
  /** Vòng tròn rỗng (điểm cảnh báo) */
  ring?: boolean;
  /** Luôn hiện nhãn (bản đồ ít xe) */
  permanent?: boolean;
}

interface Props {
  markers: MapMarker[];
  line?: [number, number][];
  /** Canh khung bản đồ vừa các điểm này (đổi khi danh sách đổi) */
  fit?: [number, number][];
  /** Bay tới điểm này */
  focus?: [number, number] | null;
  height?: number;
}

const DA_NANG = { lat: 16.054, lng: 108.202 };

/**
 * Bản đồ giám sát GPS – chỉ dùng bản đồ thể hiện đúng chủ quyền Việt Nam (Hoàng Sa, Trường Sa):
 * VietMap (ưu tiên, doanh nghiệp bản đồ Việt Nam) hoặc Google Maps hiển thị theo vùng Việt Nam.
 * Chưa cài khóa: dùng Google Maps nhúng miễn phí (một vị trí / một tuyến mỗi lần).
 */
export function GpsMap(props: Props) {
  const settings = useSettings();
  const vietmap = settings.vietmapKey?.trim();
  const google = settings.googleMapsKey?.trim();
  if (vietmap) return <VietMapView apiKey={vietmap} {...props} />;
  if (google) return <GoogleView apiKey={google} {...props} />;
  // Chưa có khóa: Google Maps nhúng (miễn phí, không cần khóa)
  return <GoogleEmbed {...props} />;
}

/** Chọn đều tối đa n điểm (giữ điểm đầu, cuối) */
const sample = (pts: [number, number][], n: number) => {
  if (pts.length <= n) return pts;
  return Array.from({ length: n }, (_, i) => pts[Math.round((i * (pts.length - 1)) / (n - 1))]);
};
const ll = ([lat, lng]: [number, number]) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

/**
 * Google Maps nhúng – miễn phí, không cần khóa (tính năng "Nhúng bản đồ" của Google), tiếng Việt, vùng Việt Nam.
 * Mỗi lần hiện một vị trí (xe đang chọn) hoặc một tuyến Google vẽ qua tối đa 10 điểm của lộ trình GPS.
 */
function GoogleEmbed({ markers, line, focus, height = 560 }: Props) {
  const { hasRole } = useAuth();
  let src: string | null = null;
  let open: string | null = null;
  if (line && line.length > 1) {
    const pts = sample(line, 10);
    const [first, ...rest] = pts;
    src = `https://maps.google.com/maps?saddr=${ll(first)}&daddr=${rest.map(ll).join('+to:')}&hl=vi&gl=vn&output=embed`;
    open = `https://www.google.com/maps/dir/${pts.map(ll).join('/')}?hl=vi&gl=vn`;
  } else {
    const target = focus ?? (markers.find((m) => !m.ring) ? [markers.find((m) => !m.ring)!.lat, markers.find((m) => !m.ring)!.lng] : null);
    if (target) {
      const t = target as [number, number];
      src = `https://maps.google.com/maps?q=${ll(t)}&z=15&hl=vi&gl=vn&output=embed`;
      open = `https://www.google.com/maps?q=${ll(t)}&hl=vi&gl=vn`;
    }
  }
  if (!src) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa', borderRadius: 8, padding: 24 }}>
        <Empty description="Chưa có vị trí để hiện trên bản đồ" />
      </div>
    );
  }
  return (
    <div>
      <iframe
        title="Google Maps"
        src={src}
        style={{ width: '100%', height, border: 0, borderRadius: 8 }}
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {line && line.length > 1
            ? 'Google vẽ đường đi qua 10 điểm chính của lộ trình GPS (gần đúng).'
            : 'Bản đồ Google miễn phí hiện xe đang chọn – bấm xe trong danh sách để chuyển.'}{' '}
          {hasRole('ADMIN') && (
            <>
              Muốn hiện tất cả xe cùng lúc: nhập khóa VietMap / Google Maps ở <Link to="/settings">Cài đặt</Link>.
            </>
          )}
        </Typography.Text>
        {open && (
          <a href={open} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>
            Mở trên Google Maps ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ───── VietMap (MapLibre GL, bản đồ vector) ─────

function dot(m: MapMarker) {
  const el = document.createElement('div');
  const size = m.ring ? 16 : 18;
  Object.assign(el.style, {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    background: m.ring ? 'transparent' : m.color,
    border: m.ring ? `3px solid ${m.color}` : '2px solid #fff',
    boxShadow: '0 1px 4px rgba(0,0,0,.35)',
    cursor: 'pointer',
  });
  if (m.label) el.title = m.label;
  if (m.permanent && m.label) {
    const tag = document.createElement('div');
    tag.textContent = m.label;
    Object.assign(tag.style, {
      position: 'absolute',
      bottom: '22px',
      left: '50%',
      transform: 'translateX(-50%)',
      whiteSpace: 'nowrap',
      background: '#fff',
      padding: '1px 6px',
      borderRadius: '6px',
      fontSize: '11px',
      fontWeight: '700',
      color: '#0f1b2d',
      boxShadow: '0 1px 3px rgba(0,0,0,.25)',
    });
    el.appendChild(tag);
  }
  return el;
}

function VietMapView({ apiKey, markers, line, fit, focus, height = 560 }: Props & { apiKey: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      style: `https://maps.vietmap.vn/maps/styles/tm/style.json?apikey=${encodeURIComponent(apiKey)}`,
      center: [DA_NANG.lng, DA_NANG.lat],
      zoom: 12,
      attributionControl: { compact: true, customAttribution: '© VIETMAP' },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    m.on('load', () => setMap(m));
    return () => {
      setMap(null);
      m.remove();
    };
  }, [apiKey]);

  useEffect(() => {
    if (!map) return;
    const objs = markers.map((mk) => new maplibregl.Marker({ element: dot(mk) }).setLngLat([mk.lng, mk.lat]).addTo(map));
    return () => objs.forEach((o) => o.remove());
  }, [map, markers]);

  useEffect(() => {
    if (!map || !line || line.length < 2) return;
    const id = 'gps-line';
    map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line.map(([lat, lng]) => [lng, lat]) } } });
    map.addLayer({ id, type: 'line', source: id, paint: { 'line-color': '#1668dc', 'line-width': 4, 'line-opacity': 0.85 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    return () => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, line]);

  useEffect(() => {
    if (!map || !fit?.length) return;
    if (fit.length === 1) {
      map.jumpTo({ center: [fit[0][1], fit[0][0]], zoom: 15 });
      return;
    }
    const b = new maplibregl.LngLatBounds();
    fit.forEach(([lat, lng]) => b.extend([lng, lat]));
    map.fitBounds(b, { padding: 40, maxZoom: 16, duration: 0 });
  }, [map, fit]);

  useEffect(() => {
    if (map && focus) map.flyTo({ center: [focus[1], focus[0]], zoom: 15 });
  }, [map, focus]);

  return <div ref={box} style={{ height, width: '100%', borderRadius: 8, overflow: 'hidden' }} />;
}

// ───── Google Maps (vùng Việt Nam, tiếng Việt) ─────

function GoogleView({ apiKey, markers, line, fit, focus, height = 560 }: Props & { apiKey: string }) {
  return (
    <div style={{ height, width: '100%', borderRadius: 8, overflow: 'hidden' }}>
      <APIProvider apiKey={apiKey} language="vi" region="VN">
        <GMap defaultCenter={DA_NANG} defaultZoom={12} gestureHandling="greedy" streetViewControl={false} mapTypeControl fullscreenControl style={{ width: '100%', height: '100%' }}>
          <GoogleOverlay markers={markers} line={line} fit={fit} focus={focus} />
        </GMap>
      </APIProvider>
    </div>
  );
}

/** Vẽ điểm, đường đi, canh khung bằng API Google Maps */
function GoogleOverlay({ markers, line, fit, focus }: Props) {
  const map = useGMap();

  useEffect(() => {
    if (!map) return;
    const g = google.maps;
    const objs = markers.map(
      (m) =>
        new g.Marker({
          map,
          position: { lat: m.lat, lng: m.lng },
          title: m.label,
          icon: {
            path: g.SymbolPath.CIRCLE,
            scale: m.ring ? 9 : 8,
            fillColor: m.color,
            fillOpacity: m.ring ? 0.25 : 1,
            strokeColor: m.ring ? m.color : '#ffffff',
            strokeWeight: m.ring ? 3 : 2,
          },
          label: m.permanent && m.label ? { text: m.label, fontSize: '11px', fontWeight: '700', color: '#0f1b2d' } : undefined,
        }),
    );
    return () => objs.forEach((o) => o.setMap(null));
  }, [map, markers]);

  useEffect(() => {
    if (!map || !line || line.length < 2) return;
    const pl = new google.maps.Polyline({ map, path: line.map(([lat, lng]) => ({ lat, lng })), strokeColor: '#1668dc', strokeOpacity: 0.85, strokeWeight: 4 });
    return () => pl.setMap(null);
  }, [map, line]);

  useEffect(() => {
    if (!map || !fit?.length) return;
    if (fit.length === 1) {
      map.setCenter({ lat: fit[0][0], lng: fit[0][1] });
      map.setZoom(15);
      return;
    }
    const b = new google.maps.LatLngBounds();
    fit.forEach(([lat, lng]) => b.extend({ lat, lng }));
    map.fitBounds(b, 40);
  }, [map, fit]);

  useEffect(() => {
    if (!map || !focus) return;
    map.panTo({ lat: focus[0], lng: focus[1] });
    map.setZoom(15);
  }, [map, focus]);

  return null;
}
