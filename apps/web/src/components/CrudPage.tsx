import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Flex, Form, Input, Modal, Popconfirm, Select, Space, Tabs, Typography, type FormInstance } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { paged, usePartnerOptions } from './common';
import { ResponsiveTable } from './ResponsiveTable';

type Filters = Record<string, string | number | undefined>;

/** Một phần (tab) của danh sách, ví dụ "Công ty" / "Nhà xe đối tác" */
export interface CrudSection<T> {
  key: string;
  label: string;
  /** Bản ghi thuộc phần này */
  match: (row: T) => boolean;
  /** Giá trị mặc định khi bấm Thêm mới ở phần này (gộp với newDefaults chung) */
  newDefaults?: Record<string, unknown>;
  /** Ẩn các cột (theo tiêu đề cột) không cần ở phần này */
  hideColumns?: string[];
  /** Có lọc theo nhà xe đối tác: trả về mã nhà xe của bản ghi */
  partnerOf?: (row: T) => number | null | undefined;
}

export interface CrudPageProps<T extends object> {
  /** Trường khóa của bản ghi (mặc định "id"), dùng trong đường dẫn sửa/xóa */
  idField?: keyof T & string;
  title: string;
  /** Đường dẫn API, ví dụ "/vehicles" */
  endpoint: string;
  columns: ColumnsType<T>;
  /** section: mã phần (tab) đang mở, nếu trang chia phần */
  renderForm: (ctx: { form: FormInstance; editing: T | null; section?: string }) => ReactNode;
  /** Bộ lọc thêm bên cạnh ô tìm kiếm */
  renderFilters?: (filters: Filters, setFilter: (key: string, value: string | number | undefined) => void) => ReactNode;
  /** Các trường ngày: tự đổi giữa chuỗi "YYYY-MM-DD" và Dayjs cho DatePicker */
  dateFields?: string[];
  /** Map bản ghi sang giá trị form khi sửa (ngoài việc đổi ngày) */
  toFormValues?: (row: T) => Record<string, unknown>;
  /** Biến đổi dữ liệu form trước khi gửi lên API */
  toPayload?: (payload: Record<string, unknown>) => Record<string, unknown>;
  /** Giá trị mặc định khi thêm mới */
  newDefaults?: Record<string, unknown>;
  canEdit: boolean;
  canDelete?: boolean;
  /** Câu hỏi xác nhận khi xóa (mặc định: "Xóa bản ghi này?") */
  deleteConfirm?: string;
  searchPlaceholder?: string;
  modalWidth?: number;
  /** Chia danh sách thành các phần (tab) riêng; tab đang mở lưu trên địa chỉ trang (?tab=…) */
  sections?: CrudSection<T>[];
}

export function CrudPage<T extends object>(props: CrudPageProps<T>) {
  const idField = (props.idField ?? 'id') as keyof T & string;
  const keyOf = (row: T) => String(row[idField]);
  const { title, endpoint, columns, renderForm, renderFilters, dateFields = [], canEdit, canDelete, deleteConfirm } = props;
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [filters, setFilters] = useState<Filters>({});
  const [editing, setEditing] = useState<T | null>(null);
  const [open, setOpen] = useState(false);

  const setFilter = (key: string, value: string | number | undefined) => setFilters((f) => ({ ...f, [key]: value }));
  const partnerOptions = usePartnerOptions();
  const [params, setParams] = useSearchParams();
  const sections = props.sections ?? [];
  const section = sections.find((x) => x.key === params.get('tab')) ?? sections[0];
  const [partner, setPartner] = useState<number>();

  const { data = [], isFetching } = useQuery({
    queryKey: [endpoint, filters],
    queryFn: () => api<T[]>(endpoint, { query: filters }),
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing
        ? api(`${endpoint}/${encodeURIComponent(keyOf(editing))}`, { method: 'PATCH', body: payload })
        : api(endpoint, { method: 'POST', body: payload }),
    onSuccess: () => {
      message.success(editing ? 'Đã cập nhật' : 'Đã thêm mới');
      setOpen(false);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`${endpoint}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('Đã xóa');
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const openForm = (row: T | null) => {
    setEditing(row);
    form.resetFields();
    if (row) {
      const values: Record<string, unknown> = { ...row, ...props.toFormValues?.(row) };
      for (const f of dateFields) values[f] = values[f] ? dayjs(values[f] as string) : null;
      form.setFieldsValue(values);
    } else if (props.newDefaults || section?.newDefaults) {
      form.setFieldsValue({ ...props.newDefaults, ...section?.newDefaults });
    }
    setOpen(true);
  };

  const submit = async () => {
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      return; // Lỗi nhập liệu đã hiện ngay dưới từng ô
    }
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      let value = v;
      if (dateFields.includes(k) && value) value = (value as Dayjs).format('YYYY-MM-DD');
      if (value === undefined || value === '') value = null;
      // Thêm mới: bỏ trường trống để backend dùng giá trị mặc định. Sửa: gửi null để xóa giá trị cũ.
      if (value === null && !editing) continue;
      payload[k] = value;
    }
    save.mutate(props.toPayload ? props.toPayload(payload) : payload);
  };

  const actionColumn: ColumnsType<T> = canEdit
    ? [
        {
          key: '_actions',
          width: canDelete ? 90 : 50,
          fixed: 'right',
          render: (_, row) => (
            <Space size={0}>
              <Button type="text" icon={<EditOutlined />} onClick={() => openForm(row)} title="Sửa" />
              {canDelete && (
                <Popconfirm title={deleteConfirm ? <div style={{ maxWidth: 320 }}>{deleteConfirm}</div> : "Xóa bản ghi này?"} okText="Xóa" cancelText="Hủy" onConfirm={() => remove.mutate(keyOf(row))}>
                  <Button type="text" danger icon={<DeleteOutlined />} title="Xóa" />
                </Popconfirm>
              )}
            </Space>
          ),
        },
      ]
    : [];

  // Bản ghi của phần (tab) đang mở, lọc thêm theo nhà xe nếu có chọn
  const rows = section ? data.filter((r) => section.match(r) && (!partner || !section.partnerOf || section.partnerOf(r) === partner)) : data;
  const shownColumns = section?.hideColumns?.length ? columns.filter((c) => !section.hideColumns!.includes(String(c.title ?? ''))) : columns;
  const switchSection = (key: string) => {
    setPartner(undefined);
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('tab', key);
      return n;
    }, { replace: true });
  };

  return (
    <Card>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {title} <Typography.Text type="secondary">({rows.length})</Typography.Text>
        </Typography.Title>
        <Flex gap={8} wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={props.searchPlaceholder ?? 'Tìm kiếm...'}
            style={{ width: 240 }}
            onChange={(e) => setFilter('q', e.target.value || undefined)}
          />
          {section?.partnerOf && (
            <Select allowClear showSearch optionFilterProp="label" placeholder="Tất cả nhà xe" style={{ width: 200 }} options={partnerOptions} value={partner} onChange={setPartner} />
          )}
          {renderFilters?.(filters, setFilter)}
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)}>
              Thêm mới
            </Button>
          )}
        </Flex>
      </Flex>

      {sections.length > 0 && (
        <Tabs
          activeKey={section?.key}
          onChange={switchSection}
          style={{ marginBottom: 4 }}
          items={sections.map((x) => ({ key: x.key, label: `${x.label} (${data.filter(x.match).length})` }))}
        />
      )}
      <ResponsiveTable<T>
        rowKey={(row) => keyOf(row)}
        size="middle"
        loading={isFetching}
        columns={[...shownColumns, ...actionColumn]}
        dataSource={rows}
        pagination={paged()}
      />

      <Modal
        title={editing ? `Sửa: ${title.toLowerCase()}` : `Thêm mới: ${title.toLowerCase()}`}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={save.isPending}
        width={props.modalWidth ?? 720}
        forceRender
      >
        <Form form={form} layout="vertical">
          {renderForm({ form, editing, section: section?.key })}
        </Form>
      </Modal>
    </Card>
  );
}
