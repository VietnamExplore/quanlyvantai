import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Col, Divider, Form, Input, InputNumber, Modal, Radio, Row, Select, Switch, Tag, type SelectProps } from 'antd';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { CUSTOMER_TYPE, LOCATION_TYPE, OWNERSHIP, toOptions } from '../labels';
import type { CostCategory, Role } from '../types';
import { MoneyInput, useCompanyDriverOptions, useLocations, usePartnerOptions, useServices, useVehicleTypeOptions } from './common';

export type QuickEntity = 'customer' | 'location' | 'partner' | 'driver' | 'vehicle' | 'vehicleType' | 'route' | 'salesUser' | 'service' | 'costCategory';

type Rec = { id: number } & Record<string, unknown>;

interface EntityConfig {
  title: string;
  endpoint: string;
  roles: Role[];
  /** Trường nhận chữ người dùng đã gõ tìm */
  nameField: string;
  /** Trường khóa của bản ghi (mặc định "id") */
  valueKey?: string;
  defaults?: Record<string, unknown>;
  /** Biến đổi dữ liệu form trước khi gửi */
  toPayload?: (v: Record<string, unknown>) => Record<string, unknown>;
  /** Các danh sách khác cần tải lại sau khi tạo */
  invalidate?: string[];
  Fields: () => ReactNode;
}

// ───── Form từng loại dữ liệu ─────

function CustomerFields() {
  return (
    <Row gutter={12}>
      <Col span={16}>
        <Form.Item name="name" label="Tên khách hàng / công ty" rules={[{ required: true, message: 'Nhập tên' }]}>
          <Input autoFocus />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item name="type" label="Loại khách">
          <Select options={toOptions(CUSTOMER_TYPE)} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="phone" label="SĐT">
          <Input />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
          <Input />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="taxCode" label="Mã số thuế">
          <Input />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="salesUserId" label="NV kinh doanh phụ trách">
          <QuickSelect entity="salesUser" allowClear />
        </Form.Item>
      </Col>
    </Row>
  );
}

function LocationFields() {
  return (
    <Row gutter={12}>
      <Col span={16}>
        <Form.Item name="name" label="Tên địa điểm" rules={[{ required: true, message: 'Nhập tên địa điểm' }]}>
          <Input autoFocus />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item name="type" label="Loại">
          <Select options={toOptions(LOCATION_TYPE)} />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item name="address" label="Địa chỉ">
          <Input />
        </Form.Item>
      </Col>
    </Row>
  );
}

function PartnerFields() {
  return (
    <Row gutter={12}>
      <Col span={24}>
        <Form.Item name="name" label="Tên nhà xe" rules={[{ required: true, message: 'Nhập tên nhà xe' }]}>
          <Input autoFocus />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="contactName" label="Người liên hệ">
          <Input />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="phone" label="SĐT">
          <Input />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item name="vehicleTypeCodes" label="Loại xe cung cấp được">
          <QuickSelect entity="vehicleType" mode="multiple" valueKey="code" />
        </Form.Item>
      </Col>
    </Row>
  );
}

function DriverFields() {
  return (
    <Row gutter={12}>
      <Col span={12}>
        <Form.Item name="fullName" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
          <Input autoFocus />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="phone" label="SĐT" rules={[{ required: true, message: 'Nhập SĐT' }]}>
          <Input />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item name="licenseClass" label="Hạng bằng">
          <Input placeholder="D1" />
        </Form.Item>
      </Col>
      <Col span={16}>
        <Form.Item name="partnerId" label="Thuộc nhà xe đối tác" extra="Để trống nếu là lái xe công ty">
          <QuickSelect entity="partner" allowClear />
        </Form.Item>
      </Col>
    </Row>
  );
}

function VehicleFields() {
  return (
    <Row gutter={12}>
      <Col span={12}>
        <Form.Item name="plateNumber" label="Biển số" rules={[{ required: true, message: 'Nhập biển số' }]}>
          <Input autoFocus placeholder="51B-123.45" />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="vehicleTypeId" label="Loại xe" rules={[{ required: true, message: 'Chọn loại xe' }]}>
          <QuickSelect entity="vehicleType" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item name="ownership" label="Sở hữu">
          <Radio.Group optionType="button" options={toOptions(OWNERSHIP)} />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item noStyle dependencies={['ownership']}>
          {({ getFieldValue }) =>
            getFieldValue('ownership') === 'DOI_TAC' ? (
              <Form.Item name="partnerId" label="Nhà xe đối tác" rules={[{ required: true, message: 'Chọn nhà xe' }]}>
                <QuickSelect entity="partner" />
              </Form.Item>
            ) : (
              <Form.Item name="defaultDriverId" label="Lái xe mặc định">
                <QuickSelect entity="driver" allowClear />
              </Form.Item>
            )
          }
        </Form.Item>
      </Col>
    </Row>
  );
}

const LICENSE_CLASSES = ['B', 'C1', 'C', 'D1', 'D2', 'D', 'BE', 'C1E', 'CE', 'D1E', 'D2E', 'DE'];

function VehicleTypeFields() {
  return (
    <Row gutter={12}>
      <Col span={8}>
        <Form.Item name="code" label="Mã" rules={[{ required: true, message: 'Nhập mã' }]} extra="Ví dụ: XE22">
          <Input autoFocus />
        </Form.Item>
      </Col>
      <Col span={16}>
        <Form.Item name="name" label="Tên" rules={[{ required: true, message: 'Nhập tên' }]}>
          <Input placeholder="Xe 22 chỗ" />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="seats" label="Số chỗ (gồm ghế lái)" rules={[{ required: true, message: 'Nhập số chỗ' }]}>
          <InputNumber min={2} style={{ width: '100%' }} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="maxPassengers" label="Số khách tối đa" rules={[{ required: true, message: 'Nhập số khách' }]}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item name="licenseClasses" label="Hạng bằng lái phù hợp">
          <Select mode="tags" options={LICENSE_CLASSES.map((c) => ({ value: c, label: c }))} />
        </Form.Item>
      </Col>
    </Row>
  );
}

function RouteFields() {
  return (
    <Row gutter={12}>
      <Col span={16}>
        <Form.Item name="name" label="Tên tuyến" rules={[{ required: true, message: 'Nhập tên tuyến' }]}>
          <Input autoFocus placeholder="Khách sạn – Sân bay Đà Nẵng" />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item name="serviceType" label="Dịch vụ">
          <QuickSelect entity="service" />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="fromLocationId" label="Điểm đi">
          <QuickSelect entity="location" allowClear />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="toLocationId" label="Điểm đến">
          <QuickSelect entity="location" allowClear />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="vehicleTypeId" label="Giá cho loại xe" rules={[{ required: true, message: 'Chọn loại xe' }]}>
          <QuickSelect entity="vehicleType" />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="durationHours" label="Giờ chạy" tooltip="Dùng để tính giờ xe rảnh khi điều phối">
          <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="price" label="Giá bán" rules={[{ required: true, message: 'Nhập giá bán' }]}>
          <MoneyInput />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="partnerCost" label="Giá mua đối tác (tham khảo)">
          <MoneyInput />
        </Form.Item>
      </Col>
      <Col span={24} style={{ fontSize: 12, color: '#8c8c8c', marginTop: -8, marginBottom: 8 }}>
        Giá cho các loại xe khác thêm sau trong mục Bảng giá → Giá theo tuyến.
      </Col>
    </Row>
  );
}

export const SERVICE_COLORS = ['blue', 'cyan', 'green', 'purple', 'magenta', 'orange', 'gold', 'geekblue', 'lime', 'volcano', 'red'];

export function ServiceFields() {
  return (
    <Row gutter={12}>
      <Col span={24}>
        <Form.Item name="name" label="Tên dịch vụ" rules={[{ required: true, message: 'Nhập tên dịch vụ' }]}>
          <Input autoFocus placeholder="Đưa đón sự kiện, Xe cưới, Đưa đón nhân viên…" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item name="pricingMode" label="Cách tính giá">
          <Radio.Group
            options={[
              { value: 'TUYEN', label: 'Theo tuyến (chọn tuyến có giá)' },
              { value: 'THEO_NGAY', label: 'Theo ngày thuê (tuyến không bắt buộc)' },
            ]}
          />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="hasFlight" label="Có số hiệu chuyến bay" valuePropName="checked" tooltip="Bật cho dịch vụ đón/tiễn sân bay">
          <Switch />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="color" label="Màu nhãn">
          <Select allowClear options={SERVICE_COLORS.map((c) => ({ value: c, label: <Tag color={c}>{c}</Tag> }))} />
        </Form.Item>
      </Col>
    </Row>
  );
}

function SalesUserFields() {
  return (
    <Row gutter={12}>
      <Col span={12}>
        <Form.Item name="fullName" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
          <Input autoFocus />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="phone" label="SĐT">
          <Input />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Nhập tên đăng nhập' }]} extra="Nên dùng số điện thoại">
          <Input autoComplete="off" />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }, { min: 6, message: 'Tối thiểu 6 ký tự' }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Col>
      <Col span={24} style={{ fontSize: 12, color: '#8c8c8c', marginTop: -8, marginBottom: 8 }}>
        Tài khoản được tạo với vai trò Kinh doanh. Đổi vai trò trong mục Người dùng.
      </Col>
    </Row>
  );
}

export const QUICK_ENTITIES: Record<QuickEntity, EntityConfig> = {
  customer: { title: 'khách hàng', endpoint: '/customers', roles: ['ADMIN', 'KINH_DOANH'], nameField: 'name', defaults: { type: 'KHACH_LE' }, Fields: CustomerFields },
  location: { title: 'địa điểm', endpoint: '/locations', roles: ['ADMIN', 'DIEU_HANH', 'KINH_DOANH'], nameField: 'name', defaults: { type: 'KHACH_SAN' }, Fields: LocationFields },
  partner: { title: 'nhà xe đối tác', endpoint: '/partners', roles: ['ADMIN', 'DIEU_HANH'], nameField: 'name', defaults: { vehicleTypeCodes: [] }, Fields: PartnerFields },
  driver: { title: 'lái xe', endpoint: '/drivers', roles: ['ADMIN', 'DIEU_HANH'], nameField: 'fullName', Fields: DriverFields },
  vehicle: { title: 'xe', endpoint: '/vehicles', roles: ['ADMIN', 'DIEU_HANH'], nameField: 'plateNumber', defaults: { ownership: 'CONG_TY' }, Fields: VehicleFields },
  vehicleType: {
    title: 'loại xe',
    endpoint: '/vehicle-types',
    roles: ['ADMIN'],
    nameField: 'name',
    defaults: { licenseClasses: [] },
    invalidate: ['/rental-rates'],
    Fields: VehicleTypeFields,
  },
  route: {
    title: 'tuyến',
    endpoint: '/route-prices',
    roles: ['ADMIN', 'KE_TOAN'],
    nameField: 'name',
    defaults: { serviceType: 'THEO_TUYEN' },
    toPayload: ({ vehicleTypeId, price, partnerCost, ...rest }) => ({
      ...rest,
      items: [{ vehicleTypeId, price, partnerCost: partnerCost ?? null }],
    }),
    Fields: RouteFields,
  },
  service: {
    title: 'dịch vụ',
    endpoint: '/services',
    roles: ['ADMIN'],
    nameField: 'name',
    valueKey: 'code',
    defaults: { pricingMode: 'TUYEN', hasFlight: false },
    Fields: ServiceFields,
  },
  costCategory: {
    title: 'loại chi phí',
    endpoint: '/cost-categories',
    roles: ['ADMIN', 'KE_TOAN'],
    nameField: 'name',
    valueKey: 'code',
    Fields: () => (
      <Form.Item name="name" label="Tên loại chi phí" rules={[{ required: true, message: 'Nhập tên' }]}>
        <Input autoFocus placeholder="Ví dụ: Phí vào cảng, Thuê hướng dẫn viên…" />
      </Form.Item>
    ),
  },
  salesUser: {
    title: 'nhân viên kinh doanh',
    endpoint: '/users',
    roles: ['ADMIN'],
    nameField: 'fullName',
    toPayload: (v) => ({ ...v, roles: ['KINH_DOANH'] }),
    invalidate: ['/users/sales-staff'],
    Fields: SalesUserFields,
  },
};

/** Người dùng hiện tại có được tạo nhanh loại dữ liệu này không */
export function useCanQuickCreate(entity: QuickEntity) {
  const { hasRole } = useAuth();
  return hasRole(...QUICK_ENTITIES[entity].roles);
}

interface ModalProps {
  entity: QuickEntity | null;
  open: boolean;
  /** Giá trị điền sẵn, ví dụ chữ người dùng vừa gõ tìm */
  initial?: Record<string, unknown>;
  onClose: () => void;
  onCreated?: (record: Rec) => void;
}

/** Form gọn để tạo nhanh một bản ghi danh mục */
export function QuickCreateModal({ entity, open, initial, onClose, onCreated }: ModalProps) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const cfg = entity ? QUICK_ENTITIES[entity] : null;
  const initialRef = useRef(initial);
  initialRef.current = initial;
  // Mỗi ô chọn có form thêm nhanh riêng: tên form phải khác nhau để không trùng mã ô nhập
  const formUid = useId().replace(/[^a-zA-Z0-9]/g, '');

  // Chỉ khởi tạo form lúc mở, không xóa dữ liệu đang nhập khi trang vẽ lại
  useEffect(() => {
    if (open && entity) {
      form.resetFields();
      form.setFieldsValue({ ...QUICK_ENTITIES[entity].defaults, ...initialRef.current });
    }
  }, [open, entity, form]);

  async function submit() {
    if (!cfg) return;
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    // Bỏ trường trống để máy chủ dùng giá trị mặc định
    const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const payload = cfg.toPayload ? cfg.toPayload(clean) : clean;
    setSaving(true);
    try {
      const record = await api<Rec>(cfg.endpoint, { method: 'POST', body: payload });
      message.success(`Đã thêm ${cfg.title}`);
      await Promise.all(
        [cfg.endpoint, '/dispatch/options', ...(cfg.invalidate ?? [])].map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
      );
      onCreated?.(record);
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={cfg ? `Thêm nhanh ${cfg.title}` : ''}
      open={open && !!cfg}
      onCancel={onClose}
      onOk={submit}
      okText="Thêm"
      cancelText="Hủy"
      confirmLoading={saving}
      width={600}
      forceRender
      destroyOnHidden
      zIndex={1100}
    >
      <Form form={form} layout="vertical" name={`quick_${entity ?? 'none'}_${formUid}`}>
        {cfg && open && <cfg.Fields />}
      </Form>
      {cfg && <div style={{ fontSize: 12, color: '#8c8c8c' }}>Các thông tin khác bổ sung sau trong mục danh mục.</div>}
    </Modal>
  );
}

// ───── Danh sách lựa chọn mặc định cho từng loại (khi trang không truyền options) ─────

function useDefaultOptions(entity: QuickEntity, enabled: boolean, valueKey: string): SelectProps['options'] {
  const partners = usePartnerOptions();
  const drivers = useCompanyDriverOptions();
  const { vehicleTypes } = useVehicleTypeOptions();
  const locations = useLocations();
  const sales = useSalesStaffOptionsSafe(enabled && entity === 'salesUser');
  const { options: serviceOptions } = useServices();
  const { data: costCategories = [] } = useQuery({
    queryKey: ['/cost-categories'],
    queryFn: () => api<CostCategory[]>('/cost-categories'),
    enabled: enabled && entity === 'costCategory',
  });
  if (!enabled) return undefined;
  switch (entity) {
    case 'partner':
      return partners;
    case 'driver':
      return drivers;
    case 'vehicleType':
      return vehicleTypes.filter((t) => t.isActive).map((t) => ({ value: valueKey === 'code' ? t.code : t.id, label: t.name }));
    case 'location':
      return locations.map((l) => ({ value: l.id, label: l.name }));
    case 'salesUser':
      return sales;
    case 'service':
      return serviceOptions;
    case 'costCategory':
      return costCategories.filter((c) => c.isActive).map((c) => ({ value: c.code, label: c.name }));
    default:
      return undefined;
  }
}

/** Danh sách NV kinh doanh; chỉ tải khi cần */
function useSalesStaffOptionsSafe(enabled: boolean) {
  const { data = [] } = useQuery({
    queryKey: ['/users/sales-staff'],
    queryFn: () => api<{ id: number; fullName: string }[]>('/users/sales-staff'),
    enabled,
  });
  return data.map((u) => ({ value: u.id, label: u.fullName }));
}

type QuickSelectProps = SelectProps & {
  entity: QuickEntity;
  /** Trường dùng làm giá trị của ô chọn (mặc định "id", ví dụ loại xe của nhà xe dùng "code") */
  valueKey?: string;
  /** Giá trị điền sẵn thêm vào form tạo mới, ví dụ loại xe đang chọn */
  createInitial?: Record<string, unknown>;
  /** Gọi sau khi tạo mới thành công (ngoài việc tự chọn giá trị mới) */
  onCreated?: (record: Rec) => void;
};

/**
 * Ô chọn có nút "+ Thêm mới" ở cuối danh sách.
 * Dùng thay Select trong Form.Item: tạo xong sẽ tự chọn bản ghi mới.
 * Không truyền `options` thì tự lấy danh sách mặc định của loại dữ liệu.
 */
export function QuickSelect({ entity, valueKey: valueKeyProp, createInitial, onCreated, ...props }: QuickSelectProps) {
  const canCreate = useCanQuickCreate(entity);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const cfg = QUICK_ENTITIES[entity];
  const valueKey = valueKeyProp ?? cfg.valueKey ?? 'id';
  const defaultOptions = useDefaultOptions(entity, props.options === undefined, valueKey);
  const multiple = props.mode === 'multiple' || props.mode === 'tags';

  return (
    <>
      <Select
        showSearch
        optionFilterProp="label"
        {...props}
        options={props.options ?? defaultOptions}
        onSearch={(v) => {
          // Giữ lại chữ đã gõ: khi bấm nút "Thêm mới", ô chọn tự xóa chữ tìm kiếm
          if (v) setSearch(v);
          props.onSearch?.(v);
        }}
        onOpenChange={(o) => {
          if (o) setSearch('');
          props.onOpenChange?.(o);
        }}
        popupRender={(menu) =>
          canCreate ? (
            <>
              {menu}
              <Divider style={{ margin: '4px 0' }} />
              <Button
                type="text"
                icon={<PlusOutlined />}
                block
                style={{ justifyContent: 'flex-start', color: 'var(--ant-color-primary)', height: 'auto', whiteSpace: 'normal', textAlign: 'left' }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpen(true)}
              >
                Thêm {cfg.title} mới{search ? `: "${search}"` : ''}
              </Button>
            </>
          ) : (
            menu
          )
        }
      />
      <QuickCreateModal
        entity={open ? entity : null}
        open={open}
        initial={{ ...createInitial, ...(search ? { [cfg.nameField]: search } : {}) }}
        onClose={() => setOpen(false)}
        onCreated={(record) => {
          // Chọn luôn bản ghi vừa tạo
          const value = record[valueKey] as string | number;
          const option = { value, label: String(record[cfg.nameField] ?? value) };
          if (multiple) {
            const cur = (Array.isArray(props.value) ? props.value : []) as (string | number)[];
            props.onChange?.([...cur, value], [option]);
          } else {
            props.onChange?.(value, option);
          }
          onCreated?.(record);
          setSearch('');
        }}
      />
    </>
  );
}
