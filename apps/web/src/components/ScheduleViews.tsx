import { Empty, Tag, Tooltip, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { CSSProperties, ReactNode } from 'react';
import { routeText } from '../booking-utils';
import { BLOCK_COLOR } from '../dispatch-utils';
import { TRIP_STATUS } from '../labels';
import type { DispatchTrip, Schedule, ScheduleVehicle } from '../types';

const LABEL_W = 165;
const LINE = '#ebebea';

/** Các ngày (YYYY-MM-DD) chuyến chiếm dụng xe: từ ngày đón tới ngày kết thúc */
export function tripDays(t: DispatchTrip) {
  const out: string[] = [];
  let d = dayjs(t.pickupTime).startOf('day');
  const end = dayjs(t.endTime).isAfter(dayjs(t.pickupTime)) ? dayjs(t.endTime).subtract(1, 'minute') : dayjs(t.pickupTime);
  for (let i = 0; i < 400 && !d.isAfter(end, 'day'); i++, d = d.add(1, 'day')) out.push(d.format('YYYY-MM-DD'));
  return out;
}

/** Gom chuyến của xe theo ngày */
function byDay(trips: DispatchTrip[]) {
  const map = new Map<string, DispatchTrip[]>();
  for (const t of trips) for (const d of tripDays(t)) map.set(d, [...(map.get(d) ?? []), t]);
  for (const list of map.values()) list.sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
  return map;
}

function TripTip({ trips }: { trips: DispatchTrip[] }) {
  return (
    <>
      {trips.map((t) => (
        <div key={t.id} style={{ marginBottom: 4 }}>
          <b>{t.booking.code}</b> · {TRIP_STATUS[t.status].label}
          <div>
            {dayjs(t.pickupTime).format('HH:mm DD/MM')} → {dayjs(t.endTime).format('HH:mm DD/MM')}
          </div>
          <div>{routeText(t)}</div>
          <div>{t.driver?.fullName ?? 'chưa có lái xe'}</div>
        </div>
      ))}
    </>
  );
}

/** Ô tên xe bên trái mỗi dòng */
function VehicleLabel({ v, extra }: { v: ScheduleVehicle; extra?: ReactNode }) {
  return (
    <div style={{ width: LABEL_W, flexShrink: 0, padding: '6px 8px 6px 0', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
      <b>{v.plateNumber}</b>
      {v.status !== 'SAN_SANG' && (
        <Tag color="orange" style={{ marginLeft: 4 }}>
          {v.status === 'BAO_DUONG' ? 'Bảo dưỡng' : 'Ngừng'}
        </Tag>
      )}
      <div style={{ fontSize: 12, color: '#52514e' }}>
        {v.vehicleType.name}
        {v.defaultDriver && ` · ${v.defaultDriver.fullName}`}
      </div>
      {extra && <div style={{ fontSize: 12, color: '#8a8984' }}>{extra}</div>}
    </div>
  );
}

function NoVehicles() {
  return <Empty description="Chưa có xe công ty. Thêm xe ở menu Danh mục → Xe." />;
}

const headCell = (today: boolean, weekend: boolean): CSSProperties => ({
  textAlign: 'center',
  fontSize: 12,
  padding: '4px 2px',
  color: today ? '#1668dc' : weekend ? '#c0392b' : '#52514e',
  fontWeight: today ? 700 : 500,
  borderBottom: `1px solid ${LINE}`,
  background: today ? '#eef4ff' : undefined,
});

// ───── Tuần: 7 cột ngày, mỗi ô liệt kê chuyến ─────

export function WeekGrid({ data, start, onOpen, onPickDay }: { data: Schedule; start: Dayjs; onOpen: (id: number) => void; onPickDay: (d: Dayjs) => void }) {
  if (!data.vehicles.length) return <NoVehicles />;
  const days = Array.from({ length: 7 }, (_, i) => start.add(i, 'day'));
  const today = dayjs();
  const cols = `${LABEL_W}px repeat(7, minmax(112px, 1fr))`;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, minWidth: LABEL_W + 7 * 112 }}>
        <div style={{ borderBottom: `1px solid ${LINE}`, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }} />
        {days.map((d) => (
          <div key={d.valueOf()} style={{ ...headCell(d.isSame(today, 'day'), d.day() === 0), cursor: 'pointer' }} onClick={() => onPickDay(d)} title="Xem lịch ngày này">
            <div style={{ textTransform: 'capitalize' }}>{d.format('dd')}</div>
            <div>{d.format('DD/MM')}</div>
          </div>
        ))}
        {data.vehicles.map((v) => {
          const map = byDay(v.trips);
          const count = new Set(v.trips.map((t) => t.id)).size;
          return (
            <div key={v.id} style={{ display: 'contents' }}>
              <div style={{ borderBottom: `1px solid ${LINE}` }}>
                <VehicleLabel v={v} extra={count ? `${count} chuyến trong tuần` : 'Rảnh cả tuần'} />
              </div>
              {days.map((d) => {
                const key = d.format('YYYY-MM-DD');
                const list = map.get(key) ?? [];
                return (
                  <div
                    key={key}
                    style={{
                      borderBottom: `1px solid ${LINE}`,
                      borderLeft: `1px solid #f3f3f2`,
                      padding: 4,
                      minHeight: 56,
                      background: d.isSame(today, 'day') ? '#f7faff' : undefined,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    {list.map((t) => {
                      const c = BLOCK_COLOR[t.status];
                      const cont = !dayjs(t.pickupTime).isSame(d, 'day');
                      return (
                        <Tooltip key={t.id} title={<TripTip trips={[t]} />}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => onOpen(t.id)}
                            onKeyDown={(e) => e.key === 'Enter' && onOpen(t.id)}
                            style={{
                              background: c.bg,
                              borderLeft: `3px solid ${c.border}`,
                              borderRadius: 4,
                              padding: '1px 5px',
                              fontSize: 12,
                              lineHeight: '17px',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {cont ? <span style={{ color: '#8a8984' }}>↳ tiếp</span> : <b>{dayjs(t.pickupTime).format('HH:mm')}</b>} {t.booking.code}
                          </div>
                        </Tooltip>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───── Tháng: mỗi ô là một ngày, tô màu ngày xe có chuyến ─────

export function MonthGrid({ data, month, onPickDay }: { data: Schedule; month: Dayjs; onPickDay: (d: Dayjs) => void }) {
  if (!data.vehicles.length) return <NoVehicles />;
  const first = month.startOf('month');
  const days = Array.from({ length: first.daysInMonth() }, (_, i) => first.add(i, 'day'));
  const today = dayjs();
  const CELL = 30;
  const cols = `${LABEL_W}px repeat(${days.length}, minmax(${CELL}px, 1fr))`;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, minWidth: LABEL_W + days.length * CELL }}>
        <div style={{ borderBottom: `1px solid ${LINE}`, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }} />
        {days.map((d) => (
          <div key={d.date()} style={headCell(d.isSame(today, 'day'), d.day() === 0)}>
            <div style={{ fontSize: 10, textTransform: 'capitalize' }}>{d.format('dd')}</div>
            {d.date()}
          </div>
        ))}
        {data.vehicles.map((v) => {
          const map = byDay(v.trips);
          const busy = days.filter((d) => map.has(d.format('YYYY-MM-DD'))).length;
          return (
            <div key={v.id} style={{ display: 'contents' }}>
              <div style={{ borderBottom: `1px solid ${LINE}` }}>
                <VehicleLabel v={v} extra={`${busy}/${days.length} ngày có chuyến`} />
              </div>
              {days.map((d) => {
                const list = map.get(d.format('YYYY-MM-DD')) ?? [];
                const n = list.length;
                const bg = n === 0 ? undefined : n === 1 ? '#cfe0f7' : n === 2 ? '#8db4ea' : '#2a78d6';
                const cell = (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onPickDay(d)}
                    onKeyDown={(e) => e.key === 'Enter' && onPickDay(d)}
                    style={{
                      borderBottom: `1px solid ${LINE}`,
                      borderLeft: `1px solid #f3f3f2`,
                      minHeight: 52,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      background: d.isSame(today, 'day') ? '#f7faff' : undefined,
                      padding: 3,
                    }}
                  >
                    {n > 0 && (
                      <span
                        style={{
                          width: '100%',
                          height: 22,
                          borderRadius: 4,
                          background: bg,
                          color: n >= 3 ? '#fff' : '#1f3b64',
                          fontSize: 12,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {n}
                      </span>
                    )}
                  </div>
                );
                return n ? (
                  <Tooltip key={d.date()} title={<TripTip trips={list} />}>
                    {cell}
                  </Tooltip>
                ) : (
                  <div key={d.date()} style={{ display: 'contents' }}>
                    {cell}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
        Số trong ô = số chuyến xe chạy trong ngày (màu càng đậm càng nhiều chuyến). Bấm vào một ngày để xem lịch chi tiết theo giờ.
      </Typography.Text>
    </div>
  );
}

// ───── Năm: 12 tháng, số chuyến và số ngày xe chạy ─────

export function YearGrid({ data, year, onPickMonth }: { data: Schedule; year: Dayjs; onPickMonth: (m: Dayjs) => void }) {
  if (!data.vehicles.length) return <NoVehicles />;
  const months = Array.from({ length: 12 }, (_, i) => year.startOf('year').add(i, 'month'));
  const now = dayjs();
  const cols = `${LABEL_W}px repeat(12, minmax(64px, 1fr))`;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, minWidth: LABEL_W + 12 * 64 }}>
        <div style={{ borderBottom: `1px solid ${LINE}`, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }} />
        {months.map((m) => (
          <div key={m.month()} style={headCell(m.isSame(now, 'month'), false)}>
            Th {m.month() + 1}
          </div>
        ))}
        {data.vehicles.map((v) => {
          const map = byDay(v.trips);
          const total = new Set(v.trips.map((t) => t.id)).size;
          return (
            <div key={v.id} style={{ display: 'contents' }}>
              <div style={{ borderBottom: `1px solid ${LINE}` }}>
                <VehicleLabel v={v} extra={`${total} chuyến trong năm`} />
              </div>
              {months.map((m) => {
                const ym = m.format('YYYY-MM');
                const daysUsed = [...map.keys()].filter((k) => k.startsWith(ym)).length;
                const trips = v.trips.filter((t) => dayjs(t.pickupTime).format('YYYY-MM') === ym).length;
                const ratio = daysUsed / m.daysInMonth();
                const bg = daysUsed === 0 ? undefined : ratio < 0.25 ? '#e3edfb' : ratio < 0.5 ? '#bcd3f3' : ratio < 0.75 ? '#7fa9e6' : '#2a78d6';
                return (
                  <Tooltip key={ym} title={`Tháng ${m.format('MM/YYYY')}: ${trips} chuyến · xe chạy ${daysUsed}/${m.daysInMonth()} ngày (${Math.round(ratio * 100)}%)`}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onPickMonth(m)}
                      onKeyDown={(e) => e.key === 'Enter' && onPickMonth(m)}
                      style={{
                        borderBottom: `1px solid ${LINE}`,
                        borderLeft: `1px solid #f3f3f2`,
                        minHeight: 52,
                        padding: 4,
                        cursor: 'pointer',
                        display: 'flex',
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          borderRadius: 4,
                          background: bg,
                          color: ratio >= 0.75 ? '#fff' : '#1f3b64',
                          fontSize: 12,
                          lineHeight: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {daysUsed > 0 && (
                          <>
                            <b>{trips} chuyến</b>
                            <span>{daysUsed} ngày</span>
                          </>
                        )}
                      </div>
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          );
        })}
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
        Màu càng đậm = xe chạy càng nhiều ngày trong tháng. Bấm vào một tháng để xem lịch tháng đó.
      </Typography.Text>
    </div>
  );
}
