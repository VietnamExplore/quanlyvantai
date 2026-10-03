import { EditOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, Form, InputNumber, Modal, Row, Table, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Money, MoneyInput } from '../components/common';
import type { RentalRateRow } from '../types';

export default function RentalRatesPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'KE_TOAN');
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<RentalRateRow | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ['/rental-rates'], queryFn: () => api<RentalRateRow[]>('/rental-rates') });

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => api(`/rental-rates/${editing!.id}`, { method: 'PUT', body: values }),
    onSuccess: () => {
      message.success('Đã lưu giá thuê');
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['/rental-rates'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const open = (row: RentalRateRow) => {
    setEditing(row);
    const r = row.rentalRate;
    form.setFieldsValue(
      r
        ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null || typeof v === 'number' ? v : Number(v)]))
        : { fullDayHours: 10, fullDayKm: 100, halfDayHours: 4, halfDayKm: 50, extraKmPrice: 0, extraHourPrice: 0, driverOvernightFee: 0, fullDayPrice: null, halfDayPrice: null },
    );
  };

  const submit = async () => {
    try {
      const v = await form.validateFields();
      const { id: _id, vehicleTypeId: _vt, updatedAt: _u, ...values } = v;
      save.mutate(values);
    } catch {
      /* lỗi đã hiện dưới từng ô */
    }
  };

  const r = (fn: (x: NonNullable<RentalRateRow['rentalRate']>) => ReactNode) => (_: unknown, row: RentalRateRow) =>
    row.rentalRate ? fn(row.rentalRate) : <Typography.Text type="secondary">Chưa khai báo</Typography.Text>;

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Giá thuê xe theo ngày
      </Typography.Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="Dùng cho dịch vụ Thuê xe theo ngày, Tour nhiều ngày và City tour khi không chọn tuyến cố định. Giá hiện tại là GIÁ MẪU, hãy sửa lại theo giá của công ty."
      />
      <Table<RentalRateRow>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Loại xe', dataIndex: 'name', render: (v) => <b>{v}</b> },
          { title: 'Giá 1 ngày', render: r((x) => (<><Money value={x.fullDayPrice} strong /><br /><small>{x.fullDayHours}h / {x.fullDayKm}km</small></>)) },
          { title: 'Giá nửa ngày', render: r((x) => (x.halfDayPrice ? <><Money value={x.halfDayPrice} /><br /><small>{x.halfDayHours}h / {x.halfDayKm}km</small></> : '—')) },
          { title: 'Vượt km', render: r((x) => <><Money value={x.extraKmPrice} />/km</>) },
          { title: 'Vượt giờ', render: r((x) => <><Money value={x.extraHourPrice} />/giờ</>) },
          { title: 'Lưu đêm tài xế', render: r((x) => <><Money value={x.driverOvernightFee} />/đêm</>) },
          ...(canEdit ? [{ key: 'edit', width: 50, render: (_: unknown, row: RentalRateRow) => <Button type="text" icon={<EditOutlined />} onClick={() => open(row)} /> }] : []),
        ]}
      />

      <Modal
        title={`Giá thuê: ${editing?.name ?? ''}`}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={submit}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={save.isPending}
        width={640}
        forceRender
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="fullDayPrice" label="Giá 1 ngày" rules={[{ required: true, message: 'Nhập giá' }]}>
                <MoneyInput />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="fullDayHours" label="Số giờ">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="fullDayKm" label="Số km">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="halfDayPrice" label="Giá nửa ngày">
                <MoneyInput />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="halfDayHours" label="Số giờ">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="halfDayKm" label="Số km">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="extraKmPrice" label="Vượt km (đ/km)">
                <MoneyInput step={1000} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="extraHourPrice" label="Vượt giờ (đ/giờ)">
                <MoneyInput step={10_000} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="driverOvernightFee" label="Lưu đêm tài xế">
                <MoneyInput />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
}
