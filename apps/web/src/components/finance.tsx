import { DeleteOutlined, DollarOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Descriptions, Empty, Flex, Form, Input, Modal, Popconfirm, Radio, Row, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { PAYMENT_METHOD, toOptions } from '../labels';
import type { Booking, PaymentMethod, TripCostRow } from '../types';
import { DATE_FORMAT, EnumTag, Money, MoneyInput } from './common';
import { QuickSelect } from './QuickCreate';

/** Nhãn tình trạng thanh toán của booking */
export function PaidTag({ total, paid }: { total: number; paid: number }) {
  if (total <= 0) return null;
  if (paid >= total) return <Tag color="green">Đã thu đủ</Tag>;
  if (paid > 0) return <Tag color="gold">Thu một phần</Tag>;
  return <Tag>Chưa thu</Tag>;
}

export interface PaymentValues {
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
  note: string | null;
}

/** Form ghi nhận một lần thu / chi tiền (dùng cho thu tiền khách và trả nhà xe) */
export function PaymentModal({
  open,
  title,
  defaultAmount,
  allowNegative,
  hint,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  defaultAmount?: number;
  allowNegative?: boolean;
  hint?: ReactNode;
  onClose: () => void;
  onSubmit: (v: PaymentValues) => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [refund, setRefund] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRefund(false);
    form.resetFields();
    form.setFieldsValue({ amount: defaultAmount && defaultAmount > 0 ? defaultAmount : undefined, method: 'CHUYEN_KHOAN', paidAt: dayjs() });
  }, [open, defaultAmount, form]);

  async function submit() {
    let v;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        amount: refund ? -Math.abs(v.amount) : v.amount,
        method: v.method,
        paidAt: (v.paidAt as Dayjs).format('YYYY-MM-DD'),
        reference: v.reference || null,
        note: v.note || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={title} open={open} onCancel={onClose} onOk={submit} okText="Lưu" cancelText="Hủy" confirmLoading={saving} width={520} forceRender>
      {hint}
      <Form form={form} layout="vertical" name="payment_form" disabled={false}>
        {allowNegative && (
          <Radio.Group value={refund} onChange={(e) => setRefund(e.target.value)} style={{ marginBottom: 12 }} optionType="button">
            <Radio.Button value={false}>Thu tiền</Radio.Button>
            <Radio.Button value={true}>Hoàn tiền cho khách</Radio.Button>
          </Radio.Group>
        )}
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="amount" label="Số tiền" rules={[{ required: true, message: 'Nhập số tiền' }]}>
              <MoneyInput min={1} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="paidAt" label="Ngày" rules={[{ required: true, message: 'Chọn ngày' }]}>
              <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="method" label="Hình thức">
              <Radio.Group options={toOptions(PAYMENT_METHOD)} optionType="button" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="reference" label="Số chứng từ / mã giao dịch">
              <Input placeholder="Ví dụ: FT2610123456" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="note" label="Ghi chú" style={{ marginBottom: 0 }}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

/**
 * Khung "Thu tiền khách" trong trang booking.
 * Tự tải dữ liệu riêng để ghi nhận thu tiền không làm mất phần booking đang sửa dở.
 */
export function PaymentsCard({ bookingId }: { bookingId: number }) {
  const { hasRole } = useAuth();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: booking, refetch } = useQuery({ queryKey: ['/bookings/payments', bookingId], queryFn: () => api<Booking>('/bookings/' + bookingId) });
  const onChanged = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['/finance'] });
    queryClient.invalidateQueries({ queryKey: ['/bookings', {}] });
    queryClient.invalidateQueries({ queryKey: ['/reports/summary'] });
  };
  const canCollect = hasRole('ADMIN', 'KE_TOAN', 'KINH_DOANH');
  const canDelete = hasRole('ADMIN', 'KE_TOAN');
  if (!booking) return null;

  async function remove(id: number) {
    try {
      await api(`/payments/${id}`, { method: 'DELETE' });
      message.success('Đã xóa phiếu thu');
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Card
      title={
        <Flex gap={8} align="center">
          Thu tiền khách <PaidTag total={booking.total} paid={booking.paid} />
        </Flex>
      }
      style={{ marginTop: 16 }}
      extra={
        canCollect &&
        booking.status !== 'HUY' && (
          <Button type="primary" icon={<DollarOutlined />} onClick={() => setOpen(true)}>
            Ghi nhận thu tiền
          </Button>
        )
      }
    >
      <Descriptions size="small" column={{ xs: 1, sm: 3 }} bordered style={{ marginBottom: 12 }}>
        <Descriptions.Item label="Tổng tiền">
          <Money value={booking.total} strong />
        </Descriptions.Item>
        <Descriptions.Item label="Đã thu">
          <Money value={booking.paid} />
        </Descriptions.Item>
        <Descriptions.Item label="Còn phải thu">
          <Typography.Text strong type={booking.balance > 0 ? 'danger' : 'success'}>
            {booking.balance.toLocaleString('vi-VN')} đ
          </Typography.Text>
        </Descriptions.Item>
      </Descriptions>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={booking.payments}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có phiếu thu" /> }}
        columns={[
          { title: 'Ngày', dataIndex: 'paidAt', render: (v) => dayjs(v).format(DATE_FORMAT) },
          {
            title: 'Số tiền',
            dataIndex: 'amount',
            align: 'right',
            render: (v) => (Number(v) < 0 ? <Typography.Text type="danger">Hoàn {Math.abs(Number(v)).toLocaleString('vi-VN')} đ</Typography.Text> : <Money value={v} strong />),
          },
          { title: 'Hình thức', dataIndex: 'method', render: (v) => <EnumTag labels={PAYMENT_METHOD} value={v} /> },
          { title: 'Chứng từ', dataIndex: 'reference' },
          { title: 'Ghi chú', dataIndex: 'note' },
          { title: 'Người ghi', render: (_, p) => p.createdBy?.fullName },
          ...(canDelete
            ? [
                {
                  key: 'del',
                  width: 44,
                  render: (_: unknown, p: { id: number }) => (
                    <Popconfirm title="Xóa phiếu thu này?" okText="Xóa" cancelText="Không" onConfirm={() => remove(p.id)}>
                      <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ),
                },
              ]
            : []),
        ]}
      />
      <PaymentModal
        open={open}
        title={`Thu tiền booking ${booking.code}`}
        defaultAmount={booking.balance}
        allowNegative
        onClose={() => setOpen(false)}
        onSubmit={async (v) => {
          try {
            await api(`/bookings/${booking.id}/payments`, { method: 'POST', body: v });
            message.success(v.amount < 0 ? 'Đã ghi nhận hoàn tiền' : 'Đã ghi nhận thu tiền');
            onChanged();
          } catch (e) {
            message.error((e as Error).message);
            throw e;
          }
        }}
      />
    </Card>
  );
}

/** Chi phí thực tế của một chuyến (trong khung điều xe) */
export function TripCostsSection({ tripId, amount, partnerCost, estimatedCost }: { tripId: number; amount: number; partnerCost: number | null; estimatedCost: number | null }) {
  const { hasRole } = useAuth();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [adding, setAdding] = useState(false);
  const canAdd = hasRole('ADMIN', 'DIEU_HANH', 'KE_TOAN');
  const canDelete = hasRole('ADMIN', 'KE_TOAN');

  const { data: costs = [], refetch } = useQuery({ queryKey: ['/trips/costs', tripId], queryFn: () => api<TripCostRow[]>(`/trips/${tripId}/costs`) });
  const extra = costs.reduce((s, c) => s + Number(c.amount), 0);
  // Cùng quy tắc với báo cáo lợi nhuận
  const total = partnerCost !== null ? partnerCost + extra : costs.length ? extra : (estimatedCost ?? 0);
  const isEstimate = partnerCost === null && !costs.length;

  const refresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['/reports/summary'] });
    queryClient.invalidateQueries({ queryKey: ['/finance'] });
  };

  async function add() {
    let v;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    try {
      await api(`/trips/${tripId}/costs`, {
        method: 'POST',
        body: { categoryCode: v.categoryCode, amount: v.amount, spentAt: (v.spentAt as Dayjs | undefined)?.format('YYYY-MM-DD'), note: v.note || null },
      });
      message.success('Đã thêm chi phí');
      form.resetFields();
      form.setFieldsValue({ spentAt: dayjs() });
      setAdding(false);
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: number) {
    try {
      await api(`/trip-costs/${id}`, { method: 'DELETE' });
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <div>
      <Table<TripCostRow>
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={costs}
        locale={{ emptyText: partnerCost !== null ? 'Không có chi phí phát sinh ngoài giá thuê' : 'Chưa nhập chi phí thực tế' }}
        columns={[
          { title: 'Ngày', dataIndex: 'spentAt', render: (v) => dayjs(v).format('DD/MM') },
          {
            title: 'Loại',
            render: (_, c) => (
              <>
                {c.category.name}
                {c.byDriver && <Tag style={{ marginLeft: 4 }}>App lái xe</Tag>}
                {c.note && <div><Typography.Text type="secondary">{c.note}</Typography.Text></div>}
              </>
            ),
          },
          { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v) => <Money value={v} /> },
          ...(canDelete
            ? [
                {
                  key: 'del',
                  width: 40,
                  render: (_: unknown, c: TripCostRow) =>
                    <Popconfirm title="Xóa chi phí này?" okText="Xóa" cancelText="Không" onConfirm={() => remove(c.id)}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                },
              ]
            : []),
        ]}
      />
      {canAdd && !adding && (
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          block
          style={{ marginTop: 8 }}
          onClick={() => {
            form.setFieldsValue({ spentAt: dayjs() });
            setAdding(true);
          }}
        >
          Thêm chi phí
        </Button>
      )}
      {adding && (
        <Form form={form} name={`trip_cost_${tripId}`} layout="vertical" disabled={false} style={{ marginTop: 8, padding: 12, background: 'var(--ant-color-fill-quaternary)', borderRadius: 8 }}>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="categoryCode" label="Loại chi phí" rules={[{ required: true, message: 'Chọn loại' }]}>
                <QuickSelect entity="costCategory" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="amount" label="Số tiền" rules={[{ required: true, message: 'Nhập số tiền' }]}>
                <MoneyInput min={1} />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="spentAt" label="Ngày chi" style={{ marginBottom: 8 }}>
                <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item name="note" label="Ghi chú" style={{ marginBottom: 8 }}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setAdding(false)}>Hủy</Button>
            <Button type="primary" onClick={add}>
              Thêm
            </Button>
          </Flex>
        </Form>
      )}
      <Descriptions size="small" column={1} style={{ marginTop: 12 }}>
        {partnerCost !== null && (
          <Descriptions.Item label="Giá thuê đối tác">
            <Money value={partnerCost} />
          </Descriptions.Item>
        )}
        <Descriptions.Item label={isEstimate ? 'Chi phí (đang dùng dự kiến)' : 'Tổng chi phí thực tế'}>
          <b>{total.toLocaleString('vi-VN')} đ</b>
        </Descriptions.Item>
        <Descriptions.Item label="Lãi của chuyến">
          <Typography.Text strong type={amount - total < 0 ? 'danger' : 'success'}>
            {(amount - total).toLocaleString('vi-VN')} đ
          </Typography.Text>
        </Descriptions.Item>
      </Descriptions>
    </div>
  );
}
