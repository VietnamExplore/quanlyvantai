import { DeleteOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Col, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Row, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { api } from '../api';
import { formatVnd, MoneyInput } from './common';
import { ResponsiveTable } from './ResponsiveTable';

export interface DriverSalaryRow {
  id: number;
  driverId: number;
  effectiveFrom: string;
  baseSalary: string;
  commissionPercent: string;
  /** Mức lương đóng bảo hiểm / tháng (0 = không đóng) */
  insuranceSalary: string;
  note: string | null;
}

/** Mức lương đang áp dụng tháng này của các lái xe công ty: { [driverId]: mức } */
export function useCurrentSalaries(enabled: boolean) {
  return useQuery({
    queryKey: ['/drivers/salaries/current'],
    queryFn: () => api<Record<number, DriverSalaryRow>>('/drivers/salaries/current'),
    enabled,
  }).data;
}

export const salaryText = (s?: DriverSalaryRow | null) =>
  s ? `${formatVnd(s.baseSalary)}đ + ${Number(s.commissionPercent)}% DS` : null;

/** Mức lương đóng bảo hiểm mặc định cho lái xe công ty (đ/tháng) */
export const DEFAULT_INSURANCE_SALARY = 5_000_000;

/** Cài lương cứng + % doanh số + mức lương đóng bảo hiểm cho một lái xe công ty, lưu theo tháng bắt đầu áp dụng */
export function DriverSalaryModal({ driver, onClose }: { driver: { id: number; fullName: string } | null; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ effectiveFrom: Dayjs; baseSalary: number; commissionPercent: number; insuranceSalary: number; note?: string }>();

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ['/drivers/salaries', driver?.id],
    queryFn: () => api<DriverSalaryRow[]>(`/drivers/${driver!.id}/salaries`),
    enabled: !!driver,
  });

  // Có lịch sử thì gợi ý mức đóng bảo hiểm của mức gần nhất
  const lastInsurance = rows[0] ? Number(rows[0].insuranceSalary) : null;
  useEffect(() => {
    if (lastInsurance != null && !form.isFieldTouched('insuranceSalary')) form.setFieldValue('insuranceSalary', lastInsurance);
  }, [lastInsurance, form]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/drivers/salaries'] });
    queryClient.invalidateQueries({ queryKey: ['/drivers/salaries/current'] });
    queryClient.invalidateQueries({ queryKey: ['/reports/driver-pay'] });
  };

  async function save() {
    const v = await form.validateFields();
    try {
      await api(`/drivers/${driver!.id}/salaries`, {
        method: 'PUT',
        body: { effectiveFrom: v.effectiveFrom.format('YYYY-MM'), baseSalary: v.baseSalary ?? 0, commissionPercent: v.commissionPercent ?? 0, insuranceSalary: v.insuranceSalary ?? 0, note: v.note },
      });
      message.success('Đã lưu mức lương');
      form.resetFields();
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: number) {
    try {
      await api(`/drivers/salaries/${id}`, { method: 'DELETE' });
      message.success('Đã xóa mức lương');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal
      open={!!driver}
      title={`Lương lái xe: ${driver?.fullName ?? ''}`}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Đóng</Button>}
      width={680}
      destroyOnHidden
      // Mức mới mặc định giữ mức đóng bảo hiểm gần nhất (chưa có thì 5.000.000)
      afterOpenChange={(open) => open && form.setFieldsValue({ effectiveFrom: dayjs().startOf('month'), insuranceSalary: lastInsurance ?? DEFAULT_INSURANCE_SALARY })}
    >
      <Typography.Paragraph type="secondary">
        Lương tháng = lương cứng + % × doanh thu các chuyến lái xe đã chạy trong tháng (đã trừ giảm giá, chưa gồm VAT). Lái xe đóng bảo hiểm (BHXH, BHYT, BHTN) 10,5% trên mức lương đóng bảo hiểm – trừ vào thực nhận; công ty đóng 21,5% (tỷ lệ sửa ở Cài đặt). Khi thay đổi mức lương hoặc mức đóng bảo hiểm, thêm mức mới với
        tháng bắt đầu áp dụng – các tháng trước vẫn tính theo mức cũ.
      </Typography.Paragraph>

      <Form form={form} layout="vertical" name="driver_salary_form" disabled={false}>
        <Row gutter={12}>
          <Col xs={24} sm={8}>
            <Form.Item name="effectiveFrom" label="Áp dụng từ tháng" rules={[{ required: true, message: 'Chọn tháng' }]}>
              <DatePicker picker="month" format="MM/YYYY" style={{ width: '100%' }} allowClear={false} />
            </Form.Item>
          </Col>
          <Col xs={14} sm={8}>
            <Form.Item name="baseSalary" label="Lương cứng / tháng" rules={[{ required: true, message: 'Nhập lương cứng' }]}>
              <MoneyInput />
            </Form.Item>
          </Col>
          <Col xs={10} sm={8}>
            <Form.Item name="commissionPercent" label="% doanh số" rules={[{ required: true, message: 'Nhập %' }]}>
              <InputNumber min={0} max={100} step={0.5} suffix="%" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="insuranceSalary"
              label="Lương đóng bảo hiểm / tháng"
              tooltip="Mức lương làm căn cứ đóng BHXH, BHYT, BHTN (không nhỏ hơn lương tối thiểu vùng). Nhập 0 nếu lái xe không đóng bảo hiểm."
            >
              <MoneyInput />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="note" label="Ghi chú">
              <Input placeholder="Ví dụ: tăng lương từ tháng 11" />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" onClick={save}>
          Lưu mức lương
        </Button>
      </Form>

      <Typography.Title level={5} style={{ marginTop: 20 }}>
        Lịch sử mức lương
      </Typography.Title>
      <ResponsiveTable<DriverSalaryRow>
        rowKey="id"
        size="small"
        loading={isFetching}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: 'Chưa cài lương' }}
        columns={[
          { title: 'Áp dụng từ', dataIndex: 'effectiveFrom', render: (v) => `Tháng ${dayjs(v).format('MM/YYYY')}` },
          { title: 'Lương cứng', dataIndex: 'baseSalary', align: 'right', render: (v) => `${formatVnd(v)}đ` },
          { title: '% doanh số', dataIndex: 'commissionPercent', align: 'right', render: (v) => `${Number(v)}%` },
          { title: 'Lương đóng BH', dataIndex: 'insuranceSalary', align: 'right', render: (v) => (Number(v) ? `${formatVnd(v)}đ` : 'Không đóng') },
          { title: 'Ghi chú', dataIndex: 'note' },
          {
            key: 'del',
            render: (_, r) => (
              <Popconfirm title="Xóa mức lương này?" okText="Xóa" cancelText="Không" onConfirm={() => remove(r.id)}>
                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />
    </Modal>
  );
}
