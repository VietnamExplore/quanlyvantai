import { CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, Empty, Flex, Form, Input, InputNumber, Modal, Popconfirm, Row, Space, Switch, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Money, MoneyInput } from '../components/common';
import type { RentalRate, RentalRateRow } from '../types';

/** Gói đang sửa: id có = sửa; không có = thêm mới cho loại xe */
type Editing = { type: RentalRateRow; rate: RentalRate | null; copy?: boolean };

const DEFAULTS = {
  name: '',
  isActive: true,
  sortOrder: 0,
  fullDayPrice: null,
  fullDayHours: 10,
  fullDayKm: 100,
  halfDayPrice: null,
  halfDayHours: 4,
  halfDayKm: 50,
  extraKmPrice: 0,
  extraHourPrice: 0,
  driverOvernightFee: 0,
};

const NUM_FIELDS = ['fullDayPrice', 'halfDayPrice', 'extraKmPrice', 'extraHourPrice', 'driverOvernightFee'] as const;

export default function RentalRatesPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'KE_TOAN');
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<Editing | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ['/rental-rates'], queryFn: () => api<RentalRateRow[]>('/rental-rates') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['/rental-rates'] });

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      editing!.rate && !editing!.copy
        ? api(`/rental-rates/${editing!.rate.id}`, { method: 'PATCH', body: values })
        : api('/rental-rates', { method: 'POST', body: { ...values, vehicleTypeId: editing!.type.id } }),
    onSuccess: () => {
      message.success('Đã lưu gói giá thuê');
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const remove = async (r: RentalRate) => {
    try {
      await api(`/rental-rates/${r.id}`, { method: 'DELETE' });
      message.success('Đã xóa gói giá');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const open = (type: RentalRateRow, rate: RentalRate | null, copy = false) => {
    setEditing({ type, rate, copy });
    form.resetFields();
    if (rate) {
      const values: Record<string, unknown> = { ...rate };
      for (const k of NUM_FIELDS) values[k] = rate[k] === null ? null : Number(rate[k]);
      if (copy) values.name = `${rate.name} (bản sao)`;
      form.setFieldsValue(values);
    } else {
      form.setFieldsValue({ ...DEFAULTS, name: type.rentalRates.length ? '' : 'Giá chuẩn', sortOrder: type.rentalRates.length });
    }
  };

  const submit = async () => {
    try {
      const v = await form.validateFields();
      save.mutate({
        name: v.name,
        sortOrder: v.sortOrder ?? 0,
        isActive: v.isActive ?? true,
        fullDayPrice: v.fullDayPrice,
        fullDayHours: v.fullDayHours,
        fullDayKm: v.fullDayKm,
        halfDayPrice: v.halfDayPrice ?? null,
        halfDayHours: v.halfDayHours,
        halfDayKm: v.halfDayKm,
        extraKmPrice: v.extraKmPrice ?? 0,
        extraHourPrice: v.extraHourPrice ?? 0,
        driverOvernightFee: v.driverOvernightFee ?? 0,
      });
    } catch {
      /* lỗi đã hiện dưới từng ô */
    }
  };

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Giá thuê xe theo ngày
      </Typography.Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="Mỗi loại xe có thể có nhiều gói giá (ví dụ: Nội thành, Đi Hội An – Bà Nà, Đi Huế…). Khi nhập chuyến Thuê xe theo ngày / Tour / City tour không chọn tuyến, nhân viên chọn gói để hệ thống tự tính giá. Gói xếp đầu là gói mặc định."
      />

      <Flex vertical gap={20}>
        {data.map((type) => (
          <div key={type.id}>
            <Flex justify="space-between" align="center" style={{ marginBottom: 8 }} wrap gap={8}>
              <Space>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {type.name}
                </Typography.Title>
                <Typography.Text type="secondary">{type.rentalRates.length} gói giá</Typography.Text>
              </Space>
              {canEdit && (
                <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => open(type, null)}>
                  Thêm gói giá
                </Button>
              )}
            </Flex>
            <Table<RentalRate>
              rowKey="id"
              size="small"
              loading={isLoading}
              dataSource={type.rentalRates}
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có gói giá thuê cho loại xe này" /> }}
              onRow={(r) => (canEdit ? { onClick: () => open(type, r), style: { cursor: 'pointer' } } : {})}
              columns={[
                {
                  title: 'Gói giá',
                  render: (_, r, i) => (
                    <>
                      <b>{r.name}</b>
                      {i === 0 && r.isActive && (
                        <Tag color="blue" style={{ marginLeft: 6 }}>
                          Mặc định
                        </Tag>
                      )}
                      {!r.isActive && <Tag style={{ marginLeft: 6 }}>Ngừng dùng</Tag>}
                    </>
                  ),
                },
                {
                  title: 'Giá 1 ngày',
                  align: 'right',
                  render: (_, x) => (
                    <>
                      <Money value={x.fullDayPrice} strong />
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {x.fullDayHours}h / {x.fullDayKm}km
                        </Typography.Text>
                      </div>
                    </>
                  ),
                },
                {
                  title: 'Giá nửa ngày',
                  align: 'right',
                  render: (_, x) =>
                    x.halfDayPrice ? (
                      <>
                        <Money value={x.halfDayPrice} />
                        <div>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {x.halfDayHours}h / {x.halfDayKm}km
                          </Typography.Text>
                        </div>
                      </>
                    ) : (
                      '—'
                    ),
                },
                { title: 'Vượt km', align: 'right', render: (_, x) => <><Money value={x.extraKmPrice} />/km</> },
                { title: 'Vượt giờ', align: 'right', render: (_, x) => <><Money value={x.extraHourPrice} />/giờ</> },
                { title: 'Lưu đêm tài xế', align: 'right', render: (_, x) => <><Money value={x.driverOvernightFee} />/đêm</> },
                { title: 'Đã dùng', align: 'right', render: (_, x) => `${x._count?.trips ?? 0} chuyến` },
                ...(canEdit
                  ? [
                      {
                        key: 'actions',
                        width: 110,
                        render: (_: unknown, r: RentalRate) => (
                          <Space size={0} onClick={(e) => e.stopPropagation()}>
                            <Button type="text" icon={<EditOutlined />} title="Sửa" onClick={() => open(type, r)} />
                            <Button type="text" icon={<CopyOutlined />} title="Nhân bản thành gói mới" onClick={() => open(type, r, true)} />
                            <Popconfirm
                              title="Xóa gói giá này?"
                              description={r._count?.trips ? `Đã dùng cho ${r._count.trips} chuyến: các chuyến giữ nguyên giá đã tính. Có thể chọn "Ngừng dùng" thay vì xóa.` : undefined}
                              okText="Xóa"
                              cancelText="Không"
                              onConfirm={() => remove(r)}
                            >
                              <Button type="text" danger icon={<DeleteOutlined />} title="Xóa" />
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        ))}
      </Flex>

      <Modal
        title={editing ? `${editing.rate && !editing.copy ? 'Sửa' : 'Thêm'} gói giá thuê · ${editing.type.name}` : ''}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={submit}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={save.isPending}
        width={680}
        forceRender
      >
        <Form form={form} layout="vertical" name="rental_rate_form">
          <Row gutter={16}>
            <Col xs={24} md={14}>
              <Form.Item name="name" label="Tên gói giá" rules={[{ required: true, whitespace: true, message: 'Nhập tên gói' }]}>
                <Input placeholder="Ví dụ: Nội thành Đà Nẵng, Đi Hội An – Bà Nà, Đi Huế" />
              </Form.Item>
            </Col>
            <Col xs={12} md={5}>
              <Form.Item name="sortOrder" label="Thứ tự" tooltip="Số nhỏ xếp trước; gói xếp đầu là gói mặc định">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={5}>
              <Form.Item name="isActive" label="Đang dùng" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
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
