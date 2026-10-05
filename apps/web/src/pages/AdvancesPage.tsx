import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Flex, Form, Input, Modal, Segmented, Space, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { api } from '../api';
import { DATE_FORMAT, formatVnd, MoneyInput, paged } from '../components/common';
import { PAYMENT_METHOD } from '../labels';
import type { PaymentMethod } from '../types';

type AdvanceStatus = 'CHO_DUYET' | 'DA_CHI' | 'TU_CHOI' | 'DA_HUY';

interface AdvanceRequest {
  id: number;
  amount: string;
  reason: string;
  status: AdvanceStatus;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  decidedBy: { fullName: string } | null;
  voucher: { id: number; code: string; amount: string; date: string; method: PaymentMethod } | null;
  driver: { id: number; fullName: string; phone: string };
}

const STATUS: Record<AdvanceStatus, { label: string; color: string }> = {
  CHO_DUYET: { label: 'Chờ duyệt', color: 'orange' },
  DA_CHI: { label: 'Đã chi', color: 'green' },
  TU_CHOI: { label: 'Từ chối', color: 'red' },
  DA_HUY: { label: 'Lái xe đã hủy', color: 'default' },
};

/** Đề nghị tạm ứng của lái xe gửi từ app: duyệt chi (tự lập phiếu chi, trừ lương) hoặc từ chối */
export default function AdvancesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AdvanceStatus | 'ALL'>('CHO_DUYET');
  const { data = [], isLoading } = useQuery({
    queryKey: ['/advance-requests', filter],
    queryFn: () => api<AdvanceRequest[]>('/advance-requests', { query: { status: filter === 'ALL' ? undefined : filter } }),
  });
  const [approving, setApproving] = useState<AdvanceRequest | null>(null);
  const [rejecting, setRejecting] = useState<AdvanceRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [approveForm] = Form.useForm<{ amount: number; method: PaymentMethod; date: Dayjs; note?: string }>();
  const [rejectForm] = Form.useForm<{ reason: string }>();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/advance-requests'] });
    queryClient.invalidateQueries({ queryKey: ['/finance'] });
  };

  function openApprove(r: AdvanceRequest) {
    approveForm.setFieldsValue({ amount: Number(r.amount), method: 'TIEN_MAT', date: dayjs(), note: undefined });
    setApproving(r);
  }

  async function approve() {
    const v = await approveForm.validateFields();
    setBusy(true);
    try {
      const res = await api<{ voucherCode: string }>(`/advance-requests/${approving!.id}/approve`, {
        method: 'POST',
        body: { amount: v.amount, method: v.method, date: v.date.format('YYYY-MM-DD'), note: v.note?.trim() || null },
      });
      message.success(`Đã chi tạm ứng, lập phiếu chi ${res.voucherCode}`);
      setApproving(null);
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    const v = await rejectForm.validateFields();
    setBusy(true);
    try {
      await api(`/advance-requests/${rejecting!.id}/reject`, { method: 'POST', body: { reason: v.reason } });
      message.success('Đã từ chối đề nghị');
      setRejecting(null);
      rejectForm.resetFields();
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pendingTotal = data.filter((r) => r.status === 'CHO_DUYET').reduce((s, r) => s + Number(r.amount), 0);

  return (
    <Card
      title="Đề nghị tạm ứng của lái xe"
      extra={
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as AdvanceStatus | 'ALL')}
          options={[
            { value: 'CHO_DUYET', label: 'Chờ duyệt' },
            { value: 'DA_CHI', label: 'Đã chi' },
            { value: 'TU_CHOI', label: 'Từ chối' },
            { value: 'ALL', label: 'Tất cả' },
          ]}
        />
      }
    >
      {filter === 'CHO_DUYET' && data.length > 0 && (
        <Typography.Paragraph type="secondary">
          {data.length} đề nghị chờ duyệt · tổng {formatVnd(pendingTotal)}. Khi chi, phần mềm tự lập phiếu chi "Tạm ứng" và trừ vào lương tháng của lái xe.
        </Typography.Paragraph>
      )}
      <Table<AdvanceRequest>
        rowKey="id"
        size="middle"
        loading={isLoading}
        dataSource={data}
        scroll={{ x: 900 }}
        pagination={paged('đề nghị')}
        locale={{ emptyText: filter === 'CHO_DUYET' ? 'Không có đề nghị nào chờ duyệt' : 'Không có đề nghị' }}
        columns={[
          { title: 'Ngày gửi', dataIndex: 'createdAt', render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY'), width: 140 },
          {
            title: 'Lái xe',
            render: (_, r) => (
              <>
                <b>{r.driver.fullName}</b>
                <div>
                  <Typography.Text type="secondary">{r.driver.phone}</Typography.Text>
                </div>
              </>
            ),
          },
          { title: 'Số tiền đề nghị', dataIndex: 'amount', align: 'right', render: (v) => <b>{formatVnd(v)}</b> },
          { title: 'Lý do', dataIndex: 'reason' },
          {
            title: 'Trạng thái',
            render: (_, r) => (
              <Space direction="vertical" size={2}>
                <Tag color={STATUS[r.status].color}>{STATUS[r.status].label}</Tag>
                {r.voucher && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {r.voucher.code} · {formatVnd(r.voucher.amount)} · {PAYMENT_METHOD[r.voucher.method]?.label} · {dayjs(r.voucher.date).format(DATE_FORMAT)}
                  </Typography.Text>
                )}
                {r.status === 'DA_CHI' && !r.voucher && (
                  <Typography.Text type="warning" style={{ fontSize: 12 }}>
                    Phiếu chi đã bị xóa
                  </Typography.Text>
                )}
                {r.decisionNote && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {r.decisionNote}
                  </Typography.Text>
                )}
                {r.decidedBy && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {r.decidedBy.fullName} · {dayjs(r.decidedAt).format('DD/MM HH:mm')}
                  </Typography.Text>
                )}
              </Space>
            ),
          },
          {
            title: '',
            width: 190,
            render: (_, r) =>
              r.status === 'CHO_DUYET' && (
                <Flex gap={8}>
                  <Button type="primary" size="small" onClick={() => openApprove(r)}>
                    Duyệt & chi
                  </Button>
                  <Button danger size="small" onClick={() => setRejecting(r)}>
                    Từ chối
                  </Button>
                </Flex>
              ),
          },
        ]}
      />

      <Modal
        open={!!approving}
        title={approving ? `Chi tạm ứng cho ${approving.driver.fullName}` : ''}
        okText="Chi tiền & lập phiếu chi"
        cancelText="Đóng"
        confirmLoading={busy}
        onOk={approve}
        onCancel={() => setApproving(null)}
        destroyOnHidden
      >
        {approving && (
          <Typography.Paragraph type="secondary">
            Lái xe đề nghị {formatVnd(approving.amount)} – {approving.reason}
          </Typography.Paragraph>
        )}
        <Form form={approveForm} layout="vertical">
          <Form.Item
            name="amount"
            label="Số tiền chi"
            extra="Có thể chi ít hơn số đề nghị"
            rules={[
              { required: true, message: 'Nhập số tiền' },
              { validator: (_, v) => (approving && v > Number(approving.amount) ? Promise.reject(new Error('Không chi quá số tiền đề nghị')) : Promise.resolve()) },
            ]}
          >
            <MoneyInput style={{ width: '100%' }} />
          </Form.Item>
          <Flex gap={16}>
            <Form.Item name="method" label="Hình thức" style={{ flex: 1 }}>
              <Segmented
                options={[
                  { value: 'TIEN_MAT', label: 'Tiền mặt' },
                  { value: 'CHUYEN_KHOAN', label: 'Chuyển khoản' },
                ]}
              />
            </Form.Item>
            <Form.Item name="date" label="Ngày chi" rules={[{ required: true }]}>
              <DatePicker format={DATE_FORMAT} allowClear={false} />
            </Form.Item>
          </Flex>
          <Form.Item name="note" label="Ghi chú">
            <Input placeholder="Không bắt buộc" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!rejecting}
        title={rejecting ? `Từ chối đề nghị của ${rejecting.driver.fullName}` : ''}
        okText="Từ chối"
        okButtonProps={{ danger: true }}
        cancelText="Đóng"
        confirmLoading={busy}
        onOk={reject}
        onCancel={() => setRejecting(null)}
        destroyOnHidden
      >
        <Form form={rejectForm} layout="vertical">
          <Form.Item name="reason" label="Lý do (gửi tới app lái xe)" rules={[{ required: true, message: 'Nhập lý do từ chối' }]}>
            <Input.TextArea autoSize={{ minRows: 2 }} placeholder="VD: đã ứng quá thu nhập tháng này" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
