import { Alert, Form, Input, Modal, Select, Typography } from 'antd';
import { useEffect } from 'react';
import { MoneyInput } from './common';

export const PARTNER_ISSUE: Record<string, { label: string; color: string }> = {
  TRE_GIO: { label: 'Nhà xe đón trễ', color: 'orange' },
  KHONG_DON: { label: 'Nhà xe không đón khách', color: 'red' },
};

const REASONS = [
  { value: 'TRE_GIO', label: 'Nhà xe đón trễ' },
  { value: 'KHONG_DON', label: 'Nhà xe không đón khách' },
  { value: 'PHAT_SINH', label: 'Thay đổi lịch trình / phát sinh' },
  { value: 'KHAC', label: 'Khác' },
];

export interface PartnerCostValues {
  partnerCost: number;
  partnerVatPercent?: number;
  reason: string;
  note: string;
}

/**
 * Hộp điều chỉnh giá giao nhà xe (Admin / Điều hành), dùng được cả khi chuyến / booking đã hoàn thành:
 * nhà xe đón trễ, không đón khách, phát sinh… Lý do được ghi lịch sử chuyến và gửi cho nhà xe.
 */
export function PartnerCostAdjust({
  open,
  partnerName,
  currentCost,
  invoice,
  vatPercent,
  busy,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  partnerName: string;
  currentCost: number;
  invoice: boolean;
  vatPercent: number;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: PartnerCostValues) => void;
}) {
  const [form] = Form.useForm<PartnerCostValues>();
  useEffect(() => {
    if (open) form.setFieldsValue({ partnerCost: currentCost, partnerVatPercent: vatPercent, reason: undefined, note: undefined });
  }, [open, currentCost, vatPercent, form]);
  const reason = Form.useWatch('reason', form);
  const cost = Form.useWatch('partnerCost', form);

  return (
    <Modal
      open={open}
      title={`Điều chỉnh giá nhà xe · ${partnerName}`}
      okText="Lưu điều chỉnh"
      cancelText="Hủy"
      confirmLoading={busy}
      onCancel={onCancel}
      onOk={() => form.validateFields().then(onSubmit)}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Giá hiện tại: <b>{currentCost.toLocaleString('vi-VN')}đ</b> (chưa thuế). Công nợ nhà xe và lợi nhuận chuyến tự tính lại; nhà xe nhận thông báo kèm lý do.
      </Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="reason" label="Lý do" rules={[{ required: true, message: 'Chọn lý do' }]}>
          <Select options={REASONS} placeholder="Chọn lý do điều chỉnh" />
        </Form.Item>
        {reason === 'KHONG_DON' && (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} title="Nhà xe không đón khách: thường giá thuê = 0 (hoặc trừ phạt theo thỏa thuận). Nếu cần xe khác chạy thay, hãy điều lại chuyến." />
        )}
        <Form.Item name="partnerCost" label="Giá thuê mới (chưa thuế)" rules={[{ required: true, message: 'Nhập giá thuê' }]}>
          <MoneyInput style={{ width: '100%' }} />
        </Form.Item>
        {invoice && (
          <Form.Item name="partnerVatPercent" label="Thuế suất hóa đơn nhà xe">
            <Select options={[0, 5, 8, 10].map((x) => ({ value: x, label: `${x}%` }))} style={{ width: 140 }} />
          </Form.Item>
        )}
        {typeof cost === 'number' && cost !== currentCost && (
          <Typography.Paragraph>
            {cost < currentCost ? 'Giảm' : 'Tăng'} <b>{Math.abs(cost - currentCost).toLocaleString('vi-VN')}đ</b> so với giá cũ.
          </Typography.Paragraph>
        )}
        <Form.Item name="note" label="Ghi chú (nhà xe sẽ thấy)" rules={[{ required: true, whitespace: true, message: 'Nhập ghi chú' }]}>
          <Input.TextArea rows={3} placeholder="VD: đón trễ 45 phút so với giờ hạ cánh, trừ 30% theo thỏa thuận" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
