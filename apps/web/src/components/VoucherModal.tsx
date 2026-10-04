import { useQuery } from '@tanstack/react-query';
import { App, Col, DatePicker, Form, Input, Modal, Row, Segmented, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { api } from '../api';
import { PAYMENT_METHOD } from '../labels';
import type { CostCategory, PaymentMethod, Vehicle } from '../types';
import { MoneyInput, usePartnerOptions } from './common';

export type VoucherType = 'THU' | 'CHI';
type Target = 'CONG_TY' | 'DOI_TAC' | 'NONE';

export interface Voucher {
  id: number;
  code: string;
  type: VoucherType;
  date: string;
  categoryCode: string | null;
  title: string | null;
  vehicleId: number | null;
  partnerId: number | null;
  vehicle: { plateNumber: string; ownership: 'CONG_TY' | 'DOI_TAC' } | null;
  counterparty: string | null;
  amount: string | number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
}

interface FormValues {
  type: VoucherType;
  date: Dayjs;
  amount: number;
  categoryCode?: string | null;
  title?: string;
  target: Target;
  vehicleId?: number | null;
  partnerId?: number | null;
  counterparty?: string;
  method: PaymentMethod;
  reference?: string;
  note?: string;
}

/** Tạo / sửa phiếu thu, phiếu chi; gắn với xe công ty hoặc xe / nhà xe đối tác */
export function VoucherModal({
  open,
  editing,
  defaultType = 'CHI',
  onClose,
  onSaved,
}: {
  open: boolean;
  editing?: Voucher | null;
  defaultType?: VoucherType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const type = Form.useWatch('type', form);
  const target = Form.useWatch('target', form);
  const partnerId = Form.useWatch('partnerId', form);
  const categoryCode = Form.useWatch('categoryCode', form);

  const { data: categories = [] } = useQuery({ queryKey: ['/cost-categories'], queryFn: () => api<CostCategory[]>('/cost-categories'), enabled: open });
  const { data: vehicles = [] } = useQuery({ queryKey: ['/vehicles', {}], queryFn: () => api<Vehicle[]>('/vehicles'), enabled: open });
  const partnerOptions = usePartnerOptions();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (editing) {
      form.setFieldsValue({
        type: editing.type,
        date: dayjs(editing.date),
        amount: Number(editing.amount),
        categoryCode: editing.categoryCode,
        title: editing.title ?? undefined,
        target: editing.vehicle?.ownership ?? (editing.partnerId ? 'DOI_TAC' : 'NONE'),
        vehicleId: editing.vehicleId,
        partnerId: editing.partnerId,
        counterparty: editing.counterparty ?? undefined,
        method: editing.method,
        reference: editing.reference ?? undefined,
        note: editing.note ?? undefined,
      });
    } else {
      form.setFieldsValue({ type: defaultType, date: dayjs(), target: 'CONG_TY', method: 'TIEN_MAT' });
    }
  }, [open, editing, defaultType, form]);

  const companyVehicles = vehicles.filter((v) => v.ownership === 'CONG_TY');
  const partnerVehicles = vehicles.filter((v) => v.ownership === 'DOI_TAC' && (!partnerId || v.partnerId === partnerId));
  const vehicleOption = (v: Vehicle) => ({
    value: v.id,
    label: `${v.plateNumber} · ${v.vehicleType.name}${v.ownership === 'DOI_TAC' && v.partner ? ` · ${v.partner.name}` : ''}`,
  });

  async function submit() {
    const v = await form.validateFields();
    const body = {
      ...(!editing && { type: v.type }),
      date: v.date.format('YYYY-MM-DD'),
      amount: v.amount,
      categoryCode: v.categoryCode ?? null,
      title: v.categoryCode ? null : (v.title ?? null),
      vehicleId: v.target === 'NONE' ? null : (v.vehicleId ?? null),
      partnerId: v.target === 'DOI_TAC' ? (v.partnerId ?? null) : null,
      counterparty: v.counterparty ?? null,
      method: v.method,
      reference: v.reference ?? null,
      note: v.note ?? null,
    };
    try {
      const saved = editing
        ? await api<Voucher>(`/vouchers/${editing.id}`, { method: 'PATCH', body })
        : await api<Voucher>('/vouchers', { method: 'POST', body });
      message.success(editing ? `Đã lưu phiếu ${saved.code}` : `Đã tạo phiếu ${saved.code}`);
      onSaved();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const isChi = type !== 'THU';
  return (
    <Modal
      open={open}
      title={editing ? `Sửa phiếu ${editing.code}` : 'Tạo phiếu thu chi'}
      okText={editing ? 'Lưu' : 'Tạo phiếu'}
      cancelText="Đóng"
      width={640}
      onOk={submit}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item name="type">
          <Segmented
            block
            disabled={!!editing}
            options={[
              { value: 'CHI', label: 'Phiếu chi' },
              { value: 'THU', label: 'Phiếu thu' },
            ]}
          />
        </Form.Item>

        <Row gutter={12}>
          <Col xs={24} sm={10}>
            <Form.Item name="date" label="Ngày" rules={[{ required: true, message: 'Chọn ngày' }]}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} allowClear={false} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={14}>
            <Form.Item name="amount" label="Số tiền" rules={[{ required: true, message: 'Nhập số tiền' }, { type: 'number', min: 1, message: 'Số tiền phải lớn hơn 0' }]}>
              <MoneyInput autoFocus />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="categoryCode" label={isChi ? 'Loại chi phí' : 'Loại khoản thu'}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={isChi ? 'Xăng dầu, sửa chữa, bảo dưỡng…' : 'Chọn nếu có'}
                options={categories.filter((c) => c.isActive || c.code === categoryCode).map((c) => ({ value: c.code, label: c.name }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="title" label="Hoặc ghi khoản mục khác">
              <Input disabled={!!categoryCode} placeholder={isChi ? 'VD: Mua lốp, đăng kiểm' : 'VD: Thu thanh lý, cho thuê xe'} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="target" label={isChi ? 'Gắn chi phí cho' : 'Gắn khoản thu cho'}>
          <Segmented
            options={[
              { value: 'CONG_TY', label: 'Xe công ty' },
              { value: 'DOI_TAC', label: 'Xe / nhà xe đối tác' },
              { value: 'NONE', label: 'Không gắn xe' },
            ]}
            onChange={() => form.setFieldsValue({ vehicleId: null, partnerId: null })}
          />
        </Form.Item>

        {target === 'CONG_TY' && (
          <Form.Item name="vehicleId" label="Xe" rules={[{ required: true, message: 'Chọn xe' }]}>
            <Select showSearch optionFilterProp="label" placeholder="Chọn biển số xe công ty" options={companyVehicles.map(vehicleOption)} />
          </Form.Item>
        )}
        {target === 'DOI_TAC' && (
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="partnerId" label="Nhà xe đối tác" rules={[{ required: true, message: 'Chọn nhà xe' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn nhà xe"
                  options={partnerOptions}
                  onChange={() => form.setFieldValue('vehicleId', null)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="vehicleId" label="Xe của đối tác" extra={partnerId && !partnerVehicles.length ? 'Nhà xe này chưa khai báo xe' : undefined}>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Không bắt buộc"
                  options={partnerVehicles.map(vehicleOption)}
                  onChange={(id) => {
                    const v = vehicles.find((x) => x.id === id);
                    if (v?.partnerId) form.setFieldValue('partnerId', v.partnerId);
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
        )}

        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="counterparty" label={isChi ? 'Người nhận tiền' : 'Người nộp tiền'}>
              <Input placeholder="Tên người / đơn vị" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="method" label="Hình thức">
              <Select options={Object.entries(PAYMENT_METHOD).map(([value, l]) => ({ value, label: l.label }))} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="reference" label="Số chứng từ / hóa đơn">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="note" label="Ghi chú">
              <Input />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
