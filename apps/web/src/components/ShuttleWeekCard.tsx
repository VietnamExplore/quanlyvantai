import { useQuery } from '@tanstack/react-query';
import { Badge, Card, Empty, Flex, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { ShuttleRun } from '../shuttle-types';

/** "Hôm nay", "Ngày mai", "T4 23/10" */
const dayTitle = (d: dayjs.Dayjs) => {
  const diff = d.startOf('day').diff(dayjs().startOf('day'), 'day');
  return diff === 0 ? `Hôm nay · ${d.format('DD/MM')}` : diff === 1 ? `Ngày mai · ${d.format('DD/MM')}` : d.format('dd DD/MM');
};

/**
 * Trang Điều xe: các chuyến xe ghép có khách trong 7 ngày tới (hôm nay + 6 ngày), theo ngày.
 * Mỗi chuyến: giờ khởi hành, tuyến, số khách, đã điều xe (biển số / lái xe / nhà xe) hay chưa; bấm để mở chuyến ở trang Xe ghép.
 */
export function ShuttleWeekCard({ style }: { style?: React.CSSProperties }) {
  const from = dayjs().format('YYYY-MM-DD');
  const to = dayjs().add(6, 'day').format('YYYY-MM-DD');
  const { data = [], isLoading } = useQuery({
    queryKey: ['/shuttle/runs', { from, to }],
    queryFn: () => api<ShuttleRun[]>('/shuttle/runs', { query: { from, to } }),
    refetchInterval: 60_000,
  });
  const runs = data.filter((r) => r.status !== 'HUY' && r.seatsConfirmed + r.seatsHeld > 0).sort((a, b) => a.departAt.localeCompare(b.departAt));
  const pending = runs.filter((r) => !r.vehicle && !r.partner && r.seatsConfirmed > 0).length;
  const days = new Map<string, ShuttleRun[]>();
  for (const r of runs) {
    const k = dayjs(r.departAt).format('YYYY-MM-DD');
    days.set(k, [...(days.get(k) ?? []), r]);
  }

  return (
    <Card
      size="small"
      loading={isLoading}
      style={style}
      title={
        <Flex align="center" gap={8}>
          🚌 Xe ghép 7 ngày tới
          <Badge count={runs.length} showZero color="#1677ff" />
          {pending > 0 && <Tag color="orange">{pending} chưa điều xe</Tag>}
        </Flex>
      }
      styles={{ body: { maxHeight: 520, overflowY: 'auto' } }}
    >
      {!runs.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có chuyến xe ghép nào có khách trong 7 ngày tới" />
      ) : (
        <Flex vertical gap={12}>
          {[...days.entries()].map(([day, list]) => (
            <div key={day}>
              <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
                <Typography.Text strong style={{ color: day === from ? '#1677ff' : undefined }}>
                  {dayTitle(dayjs(day))}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {list.length} chuyến · {list.reduce((n, r) => n + r.seatsConfirmed + r.seatsHeld, 0)} khách
                </Typography.Text>
              </Flex>
              <Flex vertical gap={6}>
                {list.map((r) => {
                  const assigned = r.vehicle || r.partner;
                  const needs = !assigned && r.seatsConfirmed > 0;
                  return (
                    <Link
                      key={r.id}
                      to={`/shuttle?date=${day}&route=${r.routeId}&run=${r.id}`}
                      style={{
                        display: 'block',
                        border: `1px solid ${needs ? '#ffd591' : '#e6ebf2'}`,
                        background: needs ? '#fff7e6' : '#fff',
                        borderRadius: 10,
                        padding: '6px 10px',
                        color: 'inherit',
                      }}
                    >
                      <Flex justify="space-between" align="center" gap={8}>
                        <Typography.Text strong style={{ fontSize: 15 }}>
                          {dayjs(r.departAt).format('HH:mm')}
                        </Typography.Text>
                        <Typography.Text style={{ flex: 1, minWidth: 0 }} ellipsis={{ tooltip: r.route.name }}>
                          {r.route.name}
                        </Typography.Text>
                        <Tag style={{ marginInlineEnd: 0 }}>
                          {r.seatsConfirmed + r.seatsHeld} khách
                        </Tag>
                      </Flex>
                      <Typography.Text type={needs ? 'warning' : 'secondary'} style={{ fontSize: 12 }}>
                        {r.vehicle
                          ? `🚐 ${r.vehicle.plateNumber}${r.driver ? ` · ${r.driver.fullName}` : ' · chưa chọn lái xe'}`
                          : r.partner
                            ? `🤝 ${r.partner.name}${r.partnerPlate ? ` · ${r.partnerPlate}` : ''}`
                            : needs
                              ? '⚠ Chưa điều xe'
                              : 'Khách đang giữ chỗ (chưa xác nhận)'}
                      </Typography.Text>
                    </Link>
                  );
                })}
              </Flex>
            </div>
          ))}
        </Flex>
      )}
    </Card>
  );
}
