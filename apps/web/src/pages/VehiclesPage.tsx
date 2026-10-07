import { QuickSelect } from '../components/QuickCreate';
import { Col, DatePicker, Form, Input, InputNumber, Radio, Row, Select } from 'antd';
import { useAuth } from '../auth';
import { CrudPage } from '../components/CrudPage';
import {
  DATE_FORMAT,
  EnumTag,
  ExpiryCell,
  useCompanyDriverOptions,
  usePartnerOptions,
  useVehicleTypeOptions,
} from '../components/common';
import { OWNERSHIP, VEHICLE_STATUS, toOptions } from '../labels';
import type { Vehicle } from '../types';

export default function VehiclesPage() {
  const { hasRole } = useAuth();
  const { options: typeOptions } = useVehicleTypeOptions();
  const partnerOptions = usePartnerOptions();
  const driverOptions = useCompanyDriverOptions();

  return (
    <CrudPage<Vehicle>
      title="Xe"
      endpoint="/vehicles"
      canEdit={hasRole('ADMIN', 'DIEU_HANH')}
      canDelete={hasRole('ADMIN', 'DIEU_HANH')}
      searchPlaceholder="Biển số, hãng, dòng xe"
      dateFields={['registrationExpiry', 'insuranceExpiry', 'badgeExpiry']}
      newDefaults={{ ownership: 'CONG_TY', status: 'SAN_SANG' }}
      sections={[
        { key: 'cong-ty', label: 'Xe công ty', match: (r) => r.ownership === 'CONG_TY', newDefaults: { ownership: 'CONG_TY' }, hideColumns: ['Sở hữu'] },
        {
          key: 'nha-xe',
          label: 'Xe nhà xe đối tác',
          match: (r) => r.ownership !== 'CONG_TY',
          newDefaults: { ownership: 'DOI_TAC' },
          hideColumns: ['Lái xe mặc định', 'Định mức xăng'],
          partnerOf: (r) => r.partner?.id,
        },
      ]}
      renderFilters={(f, set) => (
        <>
          <Select allowClear placeholder="Loại xe" style={{ width: 150 }} options={typeOptions} value={f.vehicleTypeId} onChange={(v) => set('vehicleTypeId', v)} />
          <Select allowClear placeholder="Trạng thái" style={{ width: 160 }} options={toOptions(VEHICLE_STATUS)} value={f.status} onChange={(v) => set('status', v)} />
        </>
      )}
      columns={[
        { title: 'Biển số', dataIndex: 'plateNumber', render: (v) => <b>{v}</b> },
        { title: 'Loại xe', render: (_, r) => r.vehicleType.name },
        { title: 'Hãng / dòng xe', render: (_, r) => [r.brand, r.model, r.year].filter(Boolean).join(' ') },
        {
          title: 'Sở hữu',
          render: (_, r) => (
            <>
              <EnumTag labels={OWNERSHIP} value={r.ownership} />
              {r.partner?.name}
            </>
          ),
        },
        { title: 'Lái xe mặc định', render: (_, r) => r.defaultDriver?.fullName },
        {
          title: 'Định mức xăng',
          align: 'right',
          render: (_, r) =>
            r.ownership !== 'CONG_TY' ? null : r.fuelNorm ? (
              <b>{Number(r.fuelNorm)} L/100km</b>
            ) : (
              <span style={{ color: '#888' }}>{r.vehicleType.fuelNorm ? Number(r.vehicleType.fuelNorm) : 11} L/100km (theo loại)</span>
            ),
        },
        { title: 'Trạng thái', dataIndex: 'status', render: (v) => <EnumTag labels={VEHICLE_STATUS} value={v} /> },
        { title: 'Đăng kiểm', dataIndex: 'registrationExpiry', render: (v) => <ExpiryCell value={v} /> },
        { title: 'Bảo hiểm', dataIndex: 'insuranceExpiry', render: (v) => <ExpiryCell value={v} /> },
        { title: 'Phù hiệu', dataIndex: 'badgeExpiry', render: (v) => <ExpiryCell value={v} /> },
      ]}
      renderForm={() => (
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="plateNumber" label="Biển số" rules={[{ required: true, message: 'Nhập biển số' }]}>
              <Input placeholder="51B-123.45" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="vehicleTypeId" label="Loại xe" rules={[{ required: true, message: 'Chọn loại xe' }]}>
              <QuickSelect entity="vehicleType" options={typeOptions} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="ownership" label="Sở hữu">
              <Radio.Group options={toOptions(OWNERSHIP)} optionType="button" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item noStyle dependencies={['ownership']}>
              {({ getFieldValue }) =>
                getFieldValue('ownership') === 'DOI_TAC' ? (
                  <Form.Item name="partnerId" label="Nhà xe đối tác" rules={[{ required: true, message: 'Chọn nhà xe' }]}>
                    <QuickSelect entity="partner" options={partnerOptions} />
                  </Form.Item>
                ) : (
                  <Form.Item name="defaultDriverId" label="Lái xe mặc định">
                    <QuickSelect entity="driver" allowClear options={driverOptions} />
                  </Form.Item>
                )
              }
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="brand" label="Hãng">
              <Input placeholder="Ford" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="model" label="Dòng xe">
              <Input placeholder="Transit" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="year" label="Đời xe">
              <InputNumber min={1980} max={2100} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="color" label="Màu">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="registrationExpiry" label="Hạn đăng kiểm">
              <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="insuranceExpiry" label="Hạn bảo hiểm">
              <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="badgeExpiry" label="Hạn phù hiệu">
              <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="status" label="Trạng thái">
              <Select options={toOptions(VEHICLE_STATUS)} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="odometerKm" label="Số km hiện tại" extra="Tự cập nhật khi lái xe ghi km kết thúc chuyến">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="fuelNorm"
              label="Định mức xăng dầu riêng (lít/100km)"
              tooltip="Bỏ trống = theo định mức của loại xe. Áp dụng cho các chuyến ghi km từ lúc lưu; chuyến cũ giữ định mức đã chốt (sửa từng chuyến trong ngăn Điều xe)."
            >
              <InputNumber min={1} max={100} step={0.5} placeholder="Theo loại xe" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="notes" label="Ghi chú">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
      )}
    />
  );
}
