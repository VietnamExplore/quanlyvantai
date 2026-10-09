import { ThunderboltOutlined } from '@ant-design/icons';
import { App, Button, Card, Checkbox, Flex, InputNumber, Radio, Select, TimePicker, Typography, type FormInstance } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { WEEKDAYS } from '../shuttle-types';

const INTERVALS = [15, 30, 45, 60, 90, 120].map((m) => ({ value: m, label: m < 60 ? `${m} phút / chuyến` : `${m / 60} giờ / chuyến`.replace('1.5', '1,5') }));

/** Các giờ từ start đến end (gồm cả end nếu chia hết), cách nhau interval phút */
export function scheduleTimes(start: Dayjs, end: Dayjs, interval: number) {
  const out: string[] = [];
  const from = start.hour() * 60 + start.minute();
  const to = end.hour() * 60 + end.minute();
  for (let m = from; m <= to && out.length < 200; m += interval) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return out;
}

/**
 * Tạo nhanh giờ xuất bến trong form tuyến: giờ chuyến đầu, giờ chuyến cuối, mỗi bao lâu một chuyến.
 * Ghi vào danh sách "schedules" của form (thay thế hoặc thêm vào, bỏ giờ trùng).
 */
export function QuickScheduleGen({ form }: { form: FormInstance }) {
  const { message } = App.useApp();
  const [start, setStart] = useState<Dayjs | null>(dayjs('06:00', 'HH:mm'));
  const [end, setEnd] = useState<Dayjs | null>(dayjs('22:00', 'HH:mm'));
  const [interval, setInterval] = useState(60);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [mode, setMode] = useState<'replace' | 'append'>('replace');

  const times = start && end && !end.isBefore(start) ? scheduleTimes(start, end, interval) : [];

  const generate = () => {
    if (!times.length) {
      message.error('Giờ chuyến cuối phải sau giờ chuyến đầu');
      return;
    }
    const current = ((form.getFieldValue('schedules') ?? []) as { departTime?: Dayjs | null; isActive?: boolean }[]).filter((s) => s.departTime);
    // Thay thế: giữ id của giờ cũ trùng giờ mới (để chuyến đã tạo vẫn gắn đúng lịch), bỏ các giờ cũ còn lại
    const keep = mode === 'append' ? current : current.filter((s) => times.includes(s.departTime!.format('HH:mm')));
    const have = new Set(keep.map((s) => s.departTime!.format('HH:mm')));
    const added = times.filter((t) => !have.has(t)).map((t) => ({ departTime: dayjs(t, 'HH:mm'), weekdays, capacity, isActive: true }));
    const next = [...keep.map((s) => (mode === 'replace' ? { ...s, weekdays, capacity, isActive: true } : s)), ...added].sort((a, b) => a.departTime!.format('HH:mm').localeCompare(b.departTime!.format('HH:mm')));
    form.setFieldValue('schedules', next);
    message.success(mode === 'replace' ? `Đã tạo ${next.length} giờ chạy` : `Đã thêm ${added.length} giờ chạy${added.length < times.length ? ` (bỏ ${times.length - added.length} giờ trùng)` : ''}`);
  };

  return (
    <Card size="small" style={{ marginBottom: 12, background: '#f6f9ff' }}>
      <Flex gap={8} wrap align="center">
        <Typography.Text strong>
          <ThunderboltOutlined /> Tạo nhanh:
        </Typography.Text>
        <span>từ</span>
        <TimePicker value={start} onChange={setStart} format="HH:mm" minuteStep={5} needConfirm={false} allowClear={false} style={{ width: 90 }} placeholder="Chuyến đầu" />
        <span>đến</span>
        <TimePicker value={end} onChange={setEnd} format="HH:mm" minuteStep={5} needConfirm={false} allowClear={false} style={{ width: 90 }} placeholder="Chuyến cuối" />
        <Select value={interval} onChange={setInterval} options={INTERVALS} style={{ width: 150 }} />
        <InputNumber min={1} value={capacity} onChange={(v) => setCapacity(v)} placeholder="Số ghế (theo tuyến)" style={{ width: 160 }} />
      </Flex>
      <Flex gap={12} wrap align="center" style={{ marginTop: 8 }}>
        <Checkbox.Group options={WEEKDAYS} value={weekdays} onChange={(v) => setWeekdays(v as number[])} />
        <Radio.Group
          size="small"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          options={[
            { value: 'replace', label: 'Thay các giờ hiện có' },
            { value: 'append', label: 'Thêm vào' },
          ]}
        />
        <Button type="primary" size="small" icon={<ThunderboltOutlined />} disabled={!times.length} onClick={generate}>
          Tạo {times.length} giờ chạy
        </Button>
      </Flex>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {times.length
          ? `${times.slice(0, 8).join(', ')}${times.length > 8 ? ` … ${times[times.length - 1]}` : ''}`
          : 'Chọn giờ chuyến cuối sau giờ chuyến đầu'}
        {' · '}
        {weekdays.length && weekdays.length < 7 ? WEEKDAYS.filter((d) => weekdays.includes(d.value)).map((d) => d.label).join(', ') : 'mọi ngày'}
      </Typography.Text>
    </Card>
  );
}
