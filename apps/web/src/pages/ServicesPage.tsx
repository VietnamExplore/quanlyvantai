import { Form, Switch, Tag } from 'antd';
import { useAuth } from '../auth';
import { CrudPage } from '../components/CrudPage';
import { ForeignNamesFields } from '../components/ForeignNames';
import { ServiceFields } from '../components/QuickCreate';
import type { Service } from '../types';

export default function ServicesPage() {
  const { hasRole } = useAuth();

  return (
    <CrudPage<Service>
      title="Dịch vụ"
      endpoint="/services"
      idField="code"
      canEdit={hasRole('ADMIN')}
      modalWidth={600}
      newDefaults={{ pricingMode: 'TUYEN', hasFlight: false, isActive: true }}
      columns={[
        { title: 'Dịch vụ', dataIndex: 'name', render: (v, r) => <Tag color={r.color ?? undefined}>{r.isActive ? v : <s>{v}</s>}</Tag> },
        { title: 'Mã', dataIndex: 'code', render: (v) => <code>{v}</code> },
        { title: 'Tên ngoại ngữ', render: (_, r) => <span style={{ fontSize: 12, color: '#666' }}>{Object.values(r.names ?? {}).filter(Boolean).join(' · ')}</span> },
        { title: 'Cách tính giá', dataIndex: 'pricingMode', render: (v) => (v === 'THEO_NGAY' ? 'Theo ngày thuê' : v === 'XE_GHEP' ? 'Xe ghép (theo ghế)' : 'Theo tuyến') },
        { title: 'Chuyến bay', dataIndex: 'hasFlight', render: (v) => (v ? '✈ Có' : '') },
        { title: 'Số chuyến / tuyến', render: (_, r) => `${r._count?.trips ?? 0} / ${r._count?.routes ?? 0}` },
        { title: 'Sử dụng', dataIndex: 'isActive', render: (v) => (v ? null : <Tag>Ngừng</Tag>) },
      ]}
      renderForm={() => (
        <>
          <ServiceFields />
          <ForeignNamesFields placeholders={{ en: 'Airport transfer', ko: '공항 픽업·샌딩', zh: '机场接送', ja: '空港送迎' }} />
          <Form.Item name="isActive" label="Đang sử dụng" valuePropName="checked" extra="Tắt để ẩn khỏi ô chọn khi tạo chuyến mới; dữ liệu cũ vẫn giữ nguyên">
            <Switch />
          </Form.Item>
        </>
      )}
    />
  );
}
