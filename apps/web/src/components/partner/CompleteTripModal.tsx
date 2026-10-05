import { Button, Descriptions, Flex, Form, Input, Modal, Typography } from 'antd';
import { useEffect } from 'react';
import { MoneyInput } from '../common';
import type { PartnerTrip } from './types';

export interface ExtraValues {
  extraUp?: number | null;
  extraDown?: number | null;
  extraNote?: string;
}

const vnd = (v: number) => `${Math.round(v).toLocaleString('vi-VN')}đ`;

/**
 * Nhà xe bấm "Hoàn thành chuyến": nhập giá phát sinh tăng / giảm (trước thuế) và lý do.
 * Tự tính tổng: giá thuê + tăng − giảm = chưa thuế, + thuế (nếu chuyến có yêu cầu xuất hóa đơn).
 * Không có phát sinh thì bấm "Không có phát sinh, hoàn thành".
 */
export function CompleteTripModal({ trip, busy, onCancel, onSubmit }: { trip: PartnerTrip | null; busy: boolean; onCancel: () => void; onSubmit: (v: ExtraValues) => void }) {
  const [form] = Form.useForm<ExtraValues>();
  useEffect(() => {
    if (trip) form.resetFields();
  }, [trip, form]);
  const up = Number(Form.useWatch('extraUp', form) || 0);
  const down = Number(Form.useWatch('extraDown', form) || 0);
  if (!trip) return null;

  const base = Number(trip.partnerCost ?? 0);
  const net = Math.max(0, base + up - down);
  const vatPct = trip.partnerInvoice ? Number(trip.partnerVatPercent ?? 0) : 0;
  const vat = Math.round((net * vatPct) / 100);

  return (
    <Modal
      open
      zIndex={1100}
      title={`Hoàn thành chuyến ${trip.booking.code}`}
      onCancel={onCancel}
      destroyOnHidden
      footer={
        <Flex gap={8} justify="flex-end" wrap>
          <Button onClick={() => onSubmit({})} disabled={busy}>
            Không có phát sinh, hoàn thành
          </Button>
          <Button type="primary" loading={busy} onClick={() => form.validateFields().then(onSubmit)}>
            Lưu phát sinh & hoàn thành
          </Button>
        </Flex>
      }
    >
      <Typography.Paragraph type="secondary">
        Nếu chuyến có <b>giá phát sinh</b> (thêm giờ, thêm điểm, cầu đường… hoặc giảm giá), nhập số tiền <b>trước thuế</b> và lý do. Phát sinh được <b>điều hành duyệt</b> rồi mới tính vào công nợ. Không có thì bấm "Không có phát sinh".
      </Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Flex gap={12}>
          <Form.Item name="extraUp" label="Phát sinh tăng (trước thuế)" style={{ flex: 1 }}>
            <MoneyInput placeholder="0" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="extraDown"
            label="Phát sinh giảm (trước thuế)"
            style={{ flex: 1 }}
            rules={[{ validator: (_, v) => (Number(v || 0) > base + up ? Promise.reject(new Error('Lớn hơn giá thuê')) : Promise.resolve()) }]}
          >
            <MoneyInput placeholder="0" style={{ width: '100%' }} />
          </Form.Item>
        </Flex>
        <Form.Item
          name="extraNote"
          label="Lý do phát sinh"
          dependencies={['extraUp', 'extraDown']}
          rules={[
            ({ getFieldValue }) => ({
              validator: (_, v) =>
                (Number(getFieldValue('extraUp') || 0) || Number(getFieldValue('extraDown') || 0)) && !v?.trim() ? Promise.reject(new Error('Nhập lý do phát sinh')) : Promise.resolve(),
            }),
          ]}
        >
          <Input.TextArea rows={2} placeholder="VD: khách yêu cầu thêm 2 giờ, đi thêm điểm Hội An" />
        </Form.Item>
      </Form>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Giá thuê">{vnd(base)}</Descriptions.Item>
        {up > 0 && <Descriptions.Item label="Phát sinh tăng">+{vnd(up)}</Descriptions.Item>}
        {down > 0 && <Descriptions.Item label="Phát sinh giảm">−{vnd(down)}</Descriptions.Item>}
        <Descriptions.Item label="Thành tiền chưa thuế">
          <b>{vnd(net)}</b>
        </Descriptions.Item>
        {trip.partnerInvoice && <Descriptions.Item label={`Thuế GTGT ${vatPct}%`}>{vnd(vat)}</Descriptions.Item>}
        <Descriptions.Item label={<b>{trip.partnerInvoice ? 'Tổng (gồm thuế)' : 'Tổng'}</b>}>
          <b style={{ color: '#15803d', fontSize: 16 }}>{vnd(net + vat)}</b>
        </Descriptions.Item>
      </Descriptions>
    </Modal>
  );
}
