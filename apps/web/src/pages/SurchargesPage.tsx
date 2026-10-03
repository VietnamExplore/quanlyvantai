import { Col, DatePicker, Form, Input, InputNumber, Radio, Row, Select, Switch, Tag } from 'antd';
import dayjs from 'dayjs';
import { useAuth } from '../auth';
import { CrudPage } from '../components/CrudPage';
import { DATE_FORMAT, EnumTag, formatVnd } from '../components/common';
import { SURCHARGE_RULE, toOptions } from '../labels';
import type { Holiday, Surcharge } from '../types';

export default function SurchargesPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'KE_TOAN');

  return (
    <>
      <CrudPage<Surcharge>
        title="Phụ thu"
        endpoint="/surcharges"
        canEdit={canEdit}
        canDelete={canEdit}
        modalWidth={560}
        newDefaults={{ rule: 'THU_CONG', isPercent: false, isActive: true }}
        toFormValues={(r) => ({ value: Number(r.value) })}
        columns={[
          { title: 'Phụ thu', dataIndex: 'name', render: (v, r) => (r.isActive ? <b>{v}</b> : <s>{v}</s>) },
          { title: 'Áp dụng', dataIndex: 'rule', render: (v) => <EnumTag labels={SURCHARGE_RULE} value={v} /> },
          { title: 'Mức', render: (_, r) => (r.isPercent ? `${Number(r.value)}% giá chuyến` : `${formatVnd(r.value)} đ`) },
          { title: 'Sử dụng', dataIndex: 'isActive', render: (v) => (v ? null : <Tag>Ngừng</Tag>) },
        ]}
        renderForm={() => (
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="name" label="Tên phụ thu" rules={[{ required: true, message: 'Nhập tên phụ thu' }]}>
                <Input placeholder="Phụ thu ban đêm" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="rule" label="Cách áp dụng">
                <Select options={toOptions(SURCHARGE_RULE)} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="isPercent" label="Tính theo">
                <Radio.Group optionType="button" options={[{ value: true, label: '% giá chuyến' }, { value: false, label: 'Số tiền' }]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="value" label="Mức phụ thu" rules={[{ required: true, message: 'Nhập mức phụ thu' }]}>
                <InputNumber<number> min={0} style={{ width: '100%' }} formatter={(v) => formatVnd(v)} parser={(v) => Number((v ?? '').replace(/[^\d]/g, ''))} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="isActive" label="Đang áp dụng" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        )}
      />

      <div style={{ height: 16 }} />

      <CrudPage<Holiday>
        title="Ngày lễ, Tết (áp phụ thu Lễ Tết)"
        endpoint="/holidays"
        canEdit={canEdit}
        canDelete={canEdit}
        modalWidth={520}
        dateFields={['startDate', 'endDate']}
        columns={[
          { title: 'Ngày lễ', dataIndex: 'name', render: (v) => <b>{v}</b> },
          { title: 'Từ ngày', dataIndex: 'startDate', render: (v) => dayjs(v).format(DATE_FORMAT) },
          { title: 'Đến hết ngày', dataIndex: 'endDate', render: (v) => dayjs(v).format(DATE_FORMAT) },
          { title: 'Số ngày', render: (_, r) => dayjs(r.endDate).diff(dayjs(r.startDate), 'day') + 1 },
        ]}
        renderForm={() => (
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="name" label="Tên ngày lễ" rules={[{ required: true, message: 'Nhập tên ngày lễ' }]}>
                <Input placeholder="Tết Nguyên đán 2027" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="startDate" label="Từ ngày" rules={[{ required: true, message: 'Chọn ngày' }]}>
                <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="endDate"
                label="Đến hết ngày"
                dependencies={['startDate']}
                rules={[
                  { required: true, message: 'Chọn ngày' },
                  ({ getFieldValue }) => ({
                    validator: (_, v) =>
                      !v || !getFieldValue('startDate') || !v.isBefore(getFieldValue('startDate'), 'day')
                        ? Promise.resolve()
                        : Promise.reject(new Error('Phải từ ngày bắt đầu trở đi')),
                  }),
                ]}
              >
                <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        )}
      />
    </>
  );
}
