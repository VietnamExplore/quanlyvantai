import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Badge, Button, Card, DatePicker, Descriptions, Flex, Form, Input, Modal, Radio, Segmented, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { FieldPhotos, FUEL_LABEL, INCIDENT_STATUS, INCIDENT_TYPE, IncidentTags, type FieldIncident, type VehicleCheckRow } from '../components/FieldParts';

const fmt = (s: string) => dayjs(s).format('HH:mm DD/MM/YYYY');

/** Xử lý sự cố: đổi tình trạng + ghi chú (lái xe nhận thông báo) */
function HandleModal({ incident, onClose }: { incident: FieldIncident | null; onClose: () => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  if (!incident) return null;
  const save = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await api(`/field/incidents/${incident.id}`, { method: 'PATCH', body: v });
      message.success('Đã cập nhật sự cố, lái xe đã được báo');
      qc.invalidateQueries({ queryKey: ['/field/incidents'] });
      qc.invalidateQueries({ queryKey: ['/field/incidents/open-count'] });
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open title={`Sự cố #${incident.id}`} onCancel={onClose} onOk={save} okText="Lưu" confirmLoading={saving} destroyOnHidden width={640}>
      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        <div>
          <IncidentTags i={incident} />
        </div>
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="Lái xe">
            {incident.driver.fullName} · <a href={`tel:${incident.driver.phone}`}>{incident.driver.phone}</a>
          </Descriptions.Item>
          {incident.vehicle && <Descriptions.Item label="Xe">{incident.vehicle.plateNumber}</Descriptions.Item>}
          {incident.trip && (
            <Descriptions.Item label="Chuyến">
              <Link to={`/bookings/${incident.trip.booking.id}`}>{incident.trip.booking.code}</Link> · {fmt(incident.trip.pickupTime)} · {incident.trip.pickupAddress}
              {incident.trip.dropoffAddress && ` → ${incident.trip.dropoffAddress}`}
              <div>
                Khách: {incident.trip.booking.contactName} – {incident.trip.booking.contactPhone}
              </div>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="Thời điểm báo">{fmt(incident.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="Mô tả">
            <span style={{ whiteSpace: 'pre-wrap' }}>{incident.note}</span>
          </Descriptions.Item>
        </Descriptions>
        <FieldPhotos photos={incident.photos} size={96} />
        <Form form={form} layout="vertical" initialValues={{ status: incident.status === 'MOI' ? 'DANG_XU_LY' : incident.status, handleNote: incident.handleNote }} preserve={false}>
          <Form.Item name="status" label="Tình trạng">
            <Radio.Group optionType="button" buttonStyle="solid" options={Object.entries(INCIDENT_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
          </Form.Item>
          <Form.Item name="handleNote" label="Cách xử lý / hướng dẫn cho lái xe">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Ví dụ: Đã điều xe 43B-xxx thay thế, đến trong 20 phút" />
          </Form.Item>
        </Form>
      </Space>
    </Modal>
  );
}

function IncidentsTab() {
  const { hasRole } = useAuth();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<string>('MOI,DANG_XU_LY');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ['/field/incidents', status, range?.[0]?.format('YYYY-MM-DD'), range?.[1]?.format('YYYY-MM-DD')],
    queryFn: () =>
      api<FieldIncident[]>('/field/incidents', {
        query: { status: status || undefined, from: range?.[0]?.format('YYYY-MM-DD'), to: range?.[1]?.format('YYYY-MM-DD') },
      }),
    refetchInterval: 60_000,
  });
  const openId = Number(params.get('incident')) || null;
  const { data: one } = useQuery({
    queryKey: ['/field/incidents', 'one', openId],
    queryFn: () => api<FieldIncident[]>('/field/incidents').then((l) => l.find((x) => x.id === openId) ?? null),
    enabled: !!openId && !data.some((x) => x.id === openId),
  });
  const open = data.find((x) => x.id === openId) ?? one ?? null;
  const setOpen = (id: number | null) =>
    setParams(
      (p) => {
        if (id) p.set('incident', String(id));
        else p.delete('incident');
        return p;
      },
      { replace: true },
    );
  const canHandle = hasRole('ADMIN', 'DIEU_HANH');

  return (
    <>
      <Flex gap={8} wrap style={{ marginBottom: 12 }}>
        <Segmented
          value={status}
          onChange={(v) => setStatus(v as string)}
          options={[
            { value: 'MOI,DANG_XU_LY', label: 'Chưa xử lý xong' },
            { value: 'DA_XU_LY', label: 'Đã xử lý' },
            { value: '', label: 'Tất cả' },
          ]}
        />
        <DatePicker.RangePicker format="DD/MM/YYYY" value={range} onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)} />
      </Flex>
      <Table<FieldIncident>
        rowKey="id"
        size="middle"
        loading={isLoading}
        dataSource={data}
        scroll={{ x: 900 }}
        pagination={{ pageSize: 30, hideOnSinglePage: true }}
        onRow={(r) => ({ onClick: () => setOpen(r.id), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Thời điểm', dataIndex: 'createdAt', width: 140, render: fmt },
          { title: 'Sự cố', width: 210, render: (_, r) => <IncidentTags i={r} /> },
          {
            title: 'Nội dung',
            render: (_, r) => (
              <>
                <div style={{ whiteSpace: 'pre-wrap' }}>{r.note}</div>
                {r.handleNote && <Typography.Text type="secondary">Xử lý: {r.handleNote}</Typography.Text>}
              </>
            ),
          },
          { title: 'Lái xe / xe', width: 170, render: (_, r) => <>{r.driver.fullName}{r.vehicle && <div><Tag>{r.vehicle.plateNumber}</Tag></div>}</> },
          { title: 'Chuyến', width: 150, render: (_, r) => (r.trip ? <Link to={`/bookings/${r.trip.booking.id}`} onClick={(e) => e.stopPropagation()}>{r.trip.booking.code}</Link> : '—') },
          { title: 'Ảnh', width: 60, align: 'center', render: (_, r) => r.photos.length || '' },
        ]}
      />
      {open && <HandleModal incident={canHandle ? open : null} onClose={() => setOpen(null)} />}
    </>
  );
}

function ChecksTab() {
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>([dayjs().subtract(30, 'day'), dayjs()]);
  const [vehicleId, setVehicleId] = useState<number | undefined>();
  const [defects, setDefects] = useState(false);
  const { data: vehicles = [] } = useQuery({ queryKey: ['/vehicles', {}], queryFn: () => api<{ id: number; plateNumber: string; ownership: string }[]>('/vehicles') });
  const { data = [], isLoading } = useQuery({
    queryKey: ['/field/vehicle-checks', range?.[0]?.format('YYYY-MM-DD'), range?.[1]?.format('YYYY-MM-DD'), vehicleId, defects],
    queryFn: () =>
      api<VehicleCheckRow[]>('/field/vehicle-checks', {
        query: { from: range?.[0]?.format('YYYY-MM-DD'), to: range?.[1]?.format('YYYY-MM-DD'), vehicleId, defects: defects ? 1 : undefined },
      }),
  });
  return (
    <>
      <Flex gap={8} wrap style={{ marginBottom: 12 }}>
        <DatePicker.RangePicker format="DD/MM/YYYY" value={range} onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)} />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Xe"
          style={{ width: 160 }}
          value={vehicleId}
          onChange={setVehicleId}
          options={vehicles.filter((v) => v.ownership === 'CONG_TY').map((v) => ({ value: v.id, label: v.plateNumber }))}
        />
        <Segmented value={defects ? 'loi' : 'all'} onChange={(v) => setDefects(v === 'loi')} options={[{ value: 'all', label: 'Tất cả' }, { value: 'loi', label: 'Có hạng mục lỗi' }]} />
      </Flex>
      <Table<VehicleCheckRow>
        rowKey="id"
        size="middle"
        loading={isLoading}
        dataSource={data}
        scroll={{ x: 900 }}
        pagination={{ pageSize: 30, hideOnSinglePage: true }}
        expandable={{
          rowExpandable: (r) => r.items.length > 0 || r.photos.length > 0 || !!r.note,
          expandedRowRender: (r) => (
            <Space direction="vertical" size={8}>
              <Flex gap={6} wrap>
                {r.items.map((i) => (
                  <Tag key={i.key} color={i.ok ? 'green' : 'red'}>
                    {i.ok ? '✔' : '✖'} {i.label}
                    {i.note ? `: ${i.note}` : ''}
                  </Tag>
                ))}
              </Flex>
              {r.note && <span>Ghi chú: {r.note}</span>}
              <FieldPhotos photos={r.photos} size={96} />
            </Space>
          ),
        }}
        columns={[
          { title: 'Thời điểm', dataIndex: 'createdAt', width: 140, render: fmt },
          { title: 'Loại', dataIndex: 'kind', width: 90, render: (v) => (v === 'NHAN' ? <Tag color="blue">Nhận xe</Tag> : <Tag color="purple">Trả xe</Tag>) },
          { title: 'Xe', width: 120, render: (_, r) => <b>{r.vehicle.plateNumber}</b> },
          { title: 'Lái xe', render: (_, r) => r.driver.fullName },
          { title: 'Km đồng hồ', dataIndex: 'odometerKm', width: 120, align: 'right', render: (v) => (v == null ? '' : v.toLocaleString('vi-VN')) },
          { title: 'Nhiên liệu', dataIndex: 'fuelLevel', width: 100, align: 'center', render: (v) => (v == null ? '' : FUEL_LABEL[v] ?? `${v}%`) },
          {
            title: 'Kiểm tra',
            width: 200,
            render: (_, r) =>
              r.defects ? (
                <Tag color="red">{r.defects} hạng mục lỗi</Tag>
              ) : (
                <Tag color="green">Đạt</Tag>
              ),
          },
          { title: 'Ảnh', width: 60, align: 'center', render: (_, r) => r.photos.length || '' },
        ]}
      />
    </>
  );
}

/** Vận hành hiện trường: sự cố lái xe báo, nhận / trả xe đầu – cuối ca */
export default function FieldPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'checks' ? 'checks' : 'incidents';
  const { data: open } = useQuery({ queryKey: ['/field/incidents/open-count'], queryFn: () => api<{ count: number }>('/field/incidents/open-count'), refetchInterval: 60_000 });
  return (
    <Card>
      <Tabs
        activeKey={tab}
        onChange={(k) =>
          setParams(
            (p) => {
              p.set('tab', k);
              p.delete('incident');
              return p;
            },
            { replace: true },
          )
        }
        items={[
          {
            key: 'incidents',
            label: (
              <Badge count={open?.count ?? 0} size="small" offset={[8, -2]}>
                Sự cố
              </Badge>
            ),
            children: <IncidentsTab />,
          },
          { key: 'checks', label: 'Nhận / trả xe', children: <ChecksTab /> },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12.5 }}>
        Lái xe báo sự cố, nhận / trả xe và mời khách ký nhận ngay trên app. Sự cố mới và xe có hạng mục lỗi được báo qua chuông thông báo.{' '}
        {Object.values(INCIDENT_TYPE).length} loại sự cố: {Object.values(INCIDENT_TYPE).map((t) => t.label).join(', ')}.
      </Typography.Paragraph>
    </Card>
  );
}
