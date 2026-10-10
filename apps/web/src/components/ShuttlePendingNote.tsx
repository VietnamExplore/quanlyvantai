import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Flex, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

interface Pending {
  id: number;
  departAt: string;
  routeId: number;
  routeName: string;
}

/**
 * Nhắc ở cột Chờ điều xe: chuyến xe ghép có khách chưa điều xe (7 ngày tới).
 * Mặc định chỉ hiện một dòng cảnh báo; bấm "Xem" mới hiện các giờ theo tuyến, bấm giờ để mở chuyến ở trang Xe ghép.
 */
export function ShuttlePendingNote() {
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({ queryKey: ['/shuttle/pending'], queryFn: () => api<Pending[]>('/shuttle/pending'), refetchInterval: 60_000 });
  if (!data.length) return null;
  // Gom theo tuyến + ngày
  const groups = new Map<string, { routeId: number; routeName: string; date: string; runs: Pending[] }>();
  for (const r of data) {
    const date = dayjs(r.departAt).format('YYYY-MM-DD');
    const key = `${r.routeId}|${date}`;
    const g = groups.get(key) ?? { routeId: r.routeId, routeName: r.routeName, date, runs: [] };
    g.runs.push(r);
    groups.set(key, g);
  }
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 12 }}
      title={
        <Flex justify="space-between" align="center" wrap gap={4}>
          <span>
            Xe ghép: <b>{data.length}</b> chuyến có khách chưa điều xe
          </span>
          <Button size="small" type="link" style={{ padding: 0 }} icon={open ? <UpOutlined /> : <DownOutlined />} onClick={() => setOpen((v) => !v)}>
            {open ? 'Ẩn' : 'Xem'}
          </Button>
        </Flex>
      }
      description={
        open && (
          <Flex vertical gap={6} style={{ marginTop: 4 }}>
            {[...groups.values()].map((g) => (
              <div key={`${g.routeId}|${g.date}`}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  {dayjs(g.date).format('dd DD/MM')} · {g.routeName}
                </Typography.Text>
                <Flex gap={4} wrap style={{ marginTop: 2 }}>
                  {g.runs.map((r) => (
                    <Link key={r.id} to={`/shuttle?date=${g.date}&route=${g.routeId}&run=${r.id}`}>
                      <Tag color="orange" style={{ cursor: 'pointer', marginInlineEnd: 0 }}>
                        {dayjs(r.departAt).format('HH:mm')}
                      </Tag>
                    </Link>
                  ))}
                </Flex>
              </div>
            ))}
          </Flex>
        )
      }
    />
  );
}
