import { PlusOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Col, Divider, Form, Input, Modal, Radio, Row, Select, type SelectProps } from 'antd';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { CUSTOMER_TYPE, LOCATION_TYPE, OWNERSHIP, toOptions } from '../labels';
import type { Role } from '../types';
import { useCompanyDriverOptions, usePartnerOptions, useVehicleTypeOptions } from './common';

export type QuickEntity = 'customer' | 'location' | 'partner' | 'driver' | 'vehicle';

interface EntityConfig {
  title: string;
  endpoint: string;
  roles: Role[];
  /** Trường nhận chữ người dùng đã gõ tìm */
  nameField: string;
  defaults?: Record<string, unknown>;
  Fields: () => ReactNode;
}

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
      <Col span={24}>
        <Form.Item name="taxCode" label="Mã số thuế">
          <Input />
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
  const { codeOptions } = useVehicleTypeOptions();
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
          <Select mode="multiple" options={codeOptions} />
        </Form.Item>
      </Col>
    </Row>
  );
}

function DriverFields() {
  const partnerOptions = usePartnerOptions();
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
          <Select allowClear showSearch optionFilterProp="label" options={partnerOptions} />
        </Form.Item>
      </Col>
    </Row>
  );
}

function VehicleFields() {
  const { options: typeOptions } = useVehicleTypeOptions();
  const partnerOptions = usePartnerOptions();
  const driverOptions = useCompanyDriverOptions();
  return (
    <Row gutter={12}>
      <Col span={12}>
        <Form.Item name="plateNumber" label="Biển số" rules={[{ required: true, message: 'Nhập biển số' }]}>
          <Input autoFocus placeholder="51B-123.45" />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="vehicleTypeId" label="Loại xe" rules={[{ required: true, message: 'Chọn loại xe' }]}>
          <Select showSearch optionFilterProp="label" options={typeOptions} />
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
                <Select showSearch optionFilterProp="label" options={partnerOptions} />
              </Form.Item>
            ) : (
              <Form.Item name="defaultDriverId" label="Lái xe mặc định">
                <Select allowClear showSearch optionFilterProp="label" options={driverOptions} />
              </Form.Item>
            )
          }
        </Form.Item>
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
  onCreated?: (record: { id: number } & Record<string, unknown>) => void;
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
    const payload = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    setSaving(true);
    try {
      const record = await api<{ id: number } & Record<string, unknown>>(cfg.endpoint, { method: 'POST', body: payload });
      message.success(`Đã thêm ${cfg.title}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [cfg.endpoint] }),
        queryClient.invalidateQueries({ queryKey: ['/dispatch/options'] }),
      ]);
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
      width={560}
      forceRender
      zIndex={1100}
    >
      <Form form={form} layout="vertical" name={`quick_${entity ?? 'none'}`}>
        {cfg && <cfg.Fields />}
      </Form>
      {cfg && <div style={{ fontSize: 12, color: '#8c8c8c' }}>Các thông tin khác bổ sung sau trong mục danh mục.</div>}
    </Modal>
  );
}

type QuickSelectProps = SelectProps & {
  entity: QuickEntity;
  /** Gọi sau khi tạo mới thành công (ngoài việc tự chọn giá trị mới) */
  onCreated?: (record: { id: number } & Record<string, unknown>) => void;
};

/**
 * Ô chọn có nút "+ Thêm mới" ở cuối danh sách.
 * Dùng thay Select trong Form.Item: tạo xong sẽ tự chọn bản ghi mới.
 */
export function QuickSelect({ entity, onCreated, ...props }: QuickSelectProps) {
  const canCreate = useCanQuickCreate(entity);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const cfg = QUICK_ENTITIES[entity];

  return (
    <>
      <Select
        showSearch
        optionFilterProp="label"
        {...props}
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
        entity={entity}
        open={open}
        initial={search ? { [cfg.nameField]: search } : undefined}
        onClose={() => setOpen(false)}
        onCreated={(record) => {
          // Chọn luôn bản ghi vừa tạo
          props.onChange?.(record.id, { value: record.id, label: String(record[cfg.nameField] ?? record.id) });
          onCreated?.(record);
          setSearch('');
        }}
      />
    </>
  );
}
