import { Alert, Form, Input, Modal, Radio, Tag, Typography } from 'antd';
import { useEffect } from 'react';
import { MoneyInput } from './common';

/** Trạng thái duyệt phát sinh nhà xe: chỉ phát sinh đã duyệt mới tính công nợ / lợi nhuận */
export const EXTRA_STATUS: Record<string, { label: string; color: string }> = {
  CHO_DUYET: { label: 'Chờ duyệt', color: 'gold' },
  DA_DUYET: { label: 'Đã duyệt', color: 'green' },
  TU_CHOI: { label: 'Không duyệt', color: 'red' },
};

export function ExtraStatusTag({ status, note }: { status?: string | null; note?: string | null }) {
  const s = status ? EXTRA_STATUS[status] : undefined;
  if (!s) return null;
  return (
    <Tag color={s.color} title={note ?? undefined} style={{ marginInlineEnd: 4 }}>
      {s.label}
    </Tag>
  );
}

export interface ExtraReviewValues {
  approve: boolean;
  extraUp?: number;
  extraDown?: number;
  note?: string;
}

const vnd = (v: number) => `${Math.round(v).toLocaleString('vi-VN')}đ`;

/** Điều hành / Admin duyệt (có thể sửa số tiền) hoặc từ chối phát sinh nhà xe báo khi hoàn thành chuyến */
export function PartnerExtraReviewModal({
  open,
  title,
  partnerCost,
  extraUp,
  extraDown,
  extraNote,
  invoice,
  vatPercent,
  busy,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: string;
  partnerCost: number;
  extraUp: number;
  extraDown: number;
  extraNote?: string | null;
  invoice: boolean;
  vatPercent: number;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: ExtraReviewValues) => void;
}) {
  const [form] = Form.useForm<ExtraReviewValues>();
  useEffect(() => {
    if (open) form.setFieldsValue({ approve: true, extraUp, extraDown, note: undefined });
  }, [open, extraUp, extraDown, form]);
  const approve = Form.useWatch('approve', form) ?? true;
  const up = Number(Form.useWatch('extraUp', form) ?? 0);
  const down = Number(Form.useWatch('extraDown', form) ?? 0);
  const net = Math.max(0, partnerCost + (approve ? up - down : 0));
  const vat = invoice ? Math.round((net * vatPercent) / 100) : 0;

  return (
    <Modal open={open} title={title} okText={approve ? 'Duyệt phát sinh' : 'Từ chối phát sinh'} okButtonProps={{ danger: !approve }} cancelText="Để sau" confirmLoading={busy} onCancel={onCancel} onOk={() => form.validateFields().then(onSubmit)} destroyOnHidden>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        title={
          <>
            Nhà xe báo: {extraUp > 0 && <b>+{vnd(extraUp)} </b>}
            {extraDown > 0 && <b>−{vnd(extraDown)} </b>}(trước thuế){extraNote ? ` · ${extraNote}` : ''}
          </>
        }
      />
      <Form form={form} layout="vertical">
        <Form.Item name="approve">
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: true, label: 'Duyệt' },
              { value: false, label: 'Không duyệt' },
            ]}
          />
        </Form.Item>
        {approve && (
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="extraUp" label="Phát sinh tăng được duyệt" style={{ flex: 1 }}>
              <MoneyInput style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="extraDown"
              label="Phát sinh giảm"
              style={{ flex: 1 }}
              rules={[{ validator: (_, v) => (Number(v || 0) > partnerCost + up ? Promise.reject(new Error('Lớn hơn giá thuê')) : Promise.resolve()) }]}
            >
              <MoneyInput style={{ width: '100%' }} />
            </Form.Item>
          </div>
        )}
        <Form.Item
          name="note"
          label={approve ? 'Ghi chú (nhà xe sẽ thấy)' : 'Lý do không duyệt (nhà xe sẽ thấy)'}
          dependencies={['approve']}
          rules={[({ getFieldValue }) => ({ validator: (_, v) => (getFieldValue('approve') === false && !v?.trim() ? Promise.reject(new Error('Nhập lý do không duyệt')) : Promise.resolve()) })]}
        >
          <Input.TextArea rows={2} placeholder={approve ? 'VD: duyệt theo thỏa thuận với khách' : 'VD: khách không yêu cầu thêm giờ'} />
        </Form.Item>
      </Form>
      <Typography.Paragraph style={{ margin: 0 }}>
        Công nợ nhà xe chuyến này: <b>{vnd(net)}</b> chưa thuế
        {invoice && (
          <>
            {' '}+ VAT {vatPercent}% = <b style={{ color: '#15803d' }}>{vnd(net + vat)}</b>
          </>
        )}
      </Typography.Paragraph>
    </Modal>
  );
}
