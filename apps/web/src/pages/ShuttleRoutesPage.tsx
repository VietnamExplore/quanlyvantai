import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Checkbox, Col, DatePicker, Divider, Flex, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Switch, Tag, TimePicker, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Clamp, MoneyInput, formatVnd, paged, useVehicleTypeOptions } from '../components/common';
import { ResponsiveTable } from '../components/ResponsiveTable';
import { QuickScheduleGen } from '../components/QuickScheduleGen';
import { WEEKDAYS, type ShuttleRoute, type ShuttleStopKind } from '../shuttle-types';

interface StopForm {
  id?: number;
  name: string;
  kind: ShuttleStopKind;
  address?: string;
  offsetMinutes: number;
  surcharge?: number;
  canPickup: boolean;
  canDropoff: boolean;
}

interface ScheduleForm {
  id?: number;
  departTime: Dayjs;
  weekdays: number[];
  validRange?: [Dayjs | null, Dayjs | null] | null;
  capacity?: number | null;
  isActive: boolean;
}

const weekdayText = (w: number[]) => (!w.length || w.length === 7 ? 'Mọi ngày' : WEEKDAYS.filter((d) => w.includes(d.value)).map((d) => d.label).join(', '));

/** Danh mục → Tuyến xe ghép: giá vé / ghế, điểm dừng và khu vực đón, giờ xuất bến cố định */
export default function ShuttleRoutesPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'DIEU_HANH');
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { options: typeOptions, vehicleTypes } = useVehicleTypeOptions();
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<ShuttleRoute | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Giá trị ban đầu của form (form được tạo mới mỗi lần mở hộp thoại)
  const [initial, setInitial] = useState<Record<string, unknown>>({});
  const { data = [], isFetching } = useQuery({ queryKey: ['/shuttle/routes', 'all'], queryFn: () => api<ShuttleRoute[]>('/shuttle/routes', { query: { all: 1 } }) });

  const openForm = (r: ShuttleRoute | null) => {
    setEditing(r);
    setInitial(
      r
        ? {
            ...r,
            adultPrice: Number(r.adultPrice),
            childPrice: Number(r.childPrice),
            agentAdultPrice: r.agentAdultPrice === null ? null : Number(r.agentAdultPrice),
            agentChildPrice: r.agentChildPrice === null ? null : Number(r.agentChildPrice),
            stops: r.stops.filter((s) => s.isActive).map((s) => ({ ...s, address: s.address ?? undefined, surcharge: Number(s.surcharge) })),
            schedules: r.schedules
              .filter((s) => s.isActive)
              .map((s) => ({ ...s, departTime: dayjs(s.departTime, 'HH:mm'), validRange: s.validFrom || s.validTo ? [s.validFrom ? dayjs(s.validFrom) : null, s.validTo ? dayjs(s.validTo) : null] : null })),
          }
        : {
            isActive: true,
            capacity: 15,
            durationMinutes: 60,
            childPrice: 0,
            stops: [
              { name: '', kind: 'KHU_VUC', offsetMinutes: 0, canPickup: true, canDropoff: false },
              { name: '', kind: 'DIEM_DUNG', offsetMinutes: 60, canPickup: false, canDropoff: true },
            ],
            schedules: [{ departTime: dayjs('08:00', 'HH:mm'), weekdays: [], isActive: true }],
          },
    );
    setOpen(true);
  };

  const submit = async () => {
    let v;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    const body = {
      ...v,
      notes: v.notes || null,
      agentAdultPrice: v.agentAdultPrice ?? null,
      agentChildPrice: v.agentChildPrice ?? null,
      stops: (v.stops as StopForm[]).map((s) => ({ ...s, address: s.address || null, surcharge: s.surcharge || 0 })),
      schedules: ((v.schedules ?? []) as ScheduleForm[]).map((s) => ({
        id: s.id,
        departTime: s.departTime.format('HH:mm'),
        weekdays: s.weekdays ?? [],
        validFrom: s.validRange?.[0]?.format('YYYY-MM-DD') ?? null,
        validTo: s.validRange?.[1]?.format('YYYY-MM-DD') ?? null,
        capacity: s.capacity || null,
        isActive: s.isActive ?? true,
      })),
    };
    setSaving(true);
    try {
      await api(editing ? `/shuttle/routes/${editing.id}` : '/shuttle/routes', { method: editing ? 'PUT' : 'POST', body });
      message.success(editing ? 'Đã cập nhật tuyến' : 'Đã thêm tuyến');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/shuttle'] });
      queryClient.invalidateQueries({ queryKey: ['/shuttle/routes'] });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: ShuttleRoute) => {
    try {
      const res = await api<{ message: string }>(`/shuttle/routes/${r.id}`, { method: 'DELETE' });
      message.success(res.message);
      queryClient.invalidateQueries({ queryKey: ['/shuttle/routes'] });
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const vehicleType = (id: number) => vehicleTypes.find((t) => t.id === id);

  return (
    <Card>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Tuyến xe ghép <Typography.Text type="secondary">({data.length})</Typography.Text>
          </Typography.Title>
          <Typography.Text type="secondary">Bán từng chỗ ngồi. Chuyến theo giờ cố định tự tạo ở trang Xe ghép; nhập khách bằng dịch vụ "Xe ghép" trong booking.</Typography.Text>
        </div>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)}>
            Thêm tuyến
          </Button>
        )}
      </Flex>
      <ResponsiveTable<ShuttleRoute>
        rowKey="id"
        loading={isFetching}
        dataSource={data}
        pagination={paged('tuyến')}
        locale={{ emptyText: 'Chưa có tuyến xe ghép. Bấm "Thêm tuyến".' }}
        columns={[
          {
            title: 'Tuyến',
            render: (_, r) => (
              <>
                <b>{r.isActive ? r.name : <s>{r.name}</s>}</b> <Tag>{r.code}</Tag>
                {!r.isActive && <Tag>Ngừng</Tag>}
                <div>
                  <Typography.Text type="secondary">
                    {r.vehicleType.name} · {r.capacity} ghế · {r.durationMinutes} phút
                  </Typography.Text>
                </div>
              </>
            ),
          },
          {
            title: 'Giá vé',
            render: (_, r) => (
              <>
                NL {formatVnd(r.adultPrice)}đ · TE {formatVnd(r.childPrice)}đ
                {r.agentAdultPrice && (
                  <div>
                    <Typography.Text type="secondary">Đại lý: NL {formatVnd(r.agentAdultPrice)}đ{r.agentChildPrice ? ` · TE ${formatVnd(r.agentChildPrice)}đ` : ''}</Typography.Text>
                  </div>
                )}
              </>
            ),
          },
          {
            title: 'Điểm đón / trả',
            render: (_, r) => (
              <Clamp style={{ maxWidth: 360 }}>
                {r.stops
                  .filter((s) => s.isActive)
                  .map((s) => `${s.kind === 'KHU_VUC' ? '🏨' : '📍'} ${s.name}`)
                  .join(' → ')}
              </Clamp>
            ),
          },
          {
            title: 'Giờ chạy',
            render: (_, r) =>
              r.schedules
                .filter((s) => s.isActive)
                .map((s) => (
                  <Tag key={s.id} title={weekdayText(s.weekdays)}>
                    {s.departTime}
                    {s.weekdays.length && s.weekdays.length < 7 ? ` (${weekdayText(s.weekdays)})` : ''}
                  </Tag>
                )),
          },
          ...(canEdit
            ? [
                {
                  key: 'act',
                  width: 90,
                  render: (_: unknown, r: ShuttleRoute) => (
                    <Space size={0}>
                      <Button type="text" icon={<EditOutlined />} onClick={() => openForm(r)} title="Sửa" />
                      <Popconfirm title="Xóa tuyến này?" description="Tuyến đã có khách đặt sẽ chuyển sang ngừng sử dụng." okText="Xóa" cancelText="Hủy" onConfirm={() => remove(r)}>
                        <Button type="text" danger icon={<DeleteOutlined />} title="Xóa" />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />

      <Modal
        title={editing ? `Sửa tuyến: ${editing.name}` : 'Thêm tuyến xe ghép'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saving}
        width={960}
        destroyOnHidden
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto', overflowX: 'hidden' } }}
      >
        <Form key={editing?.id ?? 'new'} form={form} layout="vertical" initialValues={initial} preserve={false}>
          <Row gutter={16}>
            <Col xs={24} md={14}>
              <Form.Item name="name" label="Tên tuyến" rules={[{ required: true, message: 'Nhập tên tuyến' }]}>
                <Input placeholder="VD: Đà Nẵng → Hội An" />
              </Form.Item>
            </Col>
            <Col xs={12} md={5}>
              <Form.Item name="code" label="Mã tuyến" rules={[{ required: true, message: 'Nhập mã' }]} normalize={(v?: string) => v?.toUpperCase().replace(/\s/g, '')}>
                <Input placeholder="DN-HA" />
              </Form.Item>
            </Col>
            <Col xs={12} md={5}>
              <Form.Item name="isActive" label="Đang chạy" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="vehicleTypeId" label="Loại xe mặc định" rules={[{ required: true, message: 'Chọn loại xe' }]}>
                <Select
                  options={typeOptions}
                  onChange={(id: number) => {
                    const t = vehicleType(id);
                    if (t && !form.getFieldValue('capacity')) form.setFieldValue('capacity', t.maxPassengers);
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={7}>
              <Form.Item name="capacity" label="Số ghế bán / chuyến" rules={[{ required: true, message: 'Nhập số ghế' }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={7}>
              <Form.Item name="durationMinutes" label="Thời gian chạy (phút)" rules={[{ required: true, message: 'Nhập thời gian' }]} tooltip="Từ giờ xuất bến đến điểm cuối, dùng để kiểm tra trùng lịch xe">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="adultPrice" label="Giá vé người lớn" rules={[{ required: true, message: 'Nhập giá' }]}>
                <MoneyInput />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="childPrice" label="Giá vé trẻ em">
                <MoneyInput />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="agentAdultPrice" label="Người lớn – đại lý" tooltip="Khi khách hàng của booking là đại lý. Bỏ trống = giá thường">
                <MoneyInput placeholder="Như giá thường" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="agentChildPrice" label="Trẻ em – đại lý">
                <MoneyInput placeholder="Như giá thường" />
              </Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="start" style={{ margin: '4px 0 8px' }}>
            Điểm dừng / khu vực đón (theo thứ tự chạy)
          </Divider>
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            📍 Điểm dừng cố định: khách tự ra điểm. 🏨 Khu vực: xe đón / trả tận khách sạn trong khu vực. Giờ đón = giờ xuất bến + số phút lệch.
          </Typography.Paragraph>
          <Form.List name="stops">
            {(fields, { add, remove, move }) => (
              <>
                {fields.map((f, i) => (
                  <Row key={f.key} gutter={8} align="top" style={{ marginBottom: 4 }}>
                    <Form.Item name={[f.name, 'id']} hidden>
                      <Input />
                    </Form.Item>
                    <Col xs={24} md={6}>
                      <Form.Item name={[f.name, 'name']} rules={[{ required: true, message: 'Nhập tên' }]} style={{ marginBottom: 8 }}>
                        <Input placeholder={`Điểm ${i + 1}: VD Trung tâm Đà Nẵng`} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={4}>
                      <Form.Item name={[f.name, 'kind']} style={{ marginBottom: 8 }}>
                        <Select
                          options={[
                            { value: 'KHU_VUC', label: '🏨 Khu vực đón tận nơi' },
                            { value: 'DIEM_DUNG', label: '📍 Điểm dừng cố định' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={5}>
                      <Form.Item name={[f.name, 'address']} style={{ marginBottom: 8 }}>
                        <Input placeholder="Địa chỉ / ghi chú" />
                      </Form.Item>
                    </Col>
                    <Col xs={8} md={2}>
                      <Form.Item name={[f.name, 'offsetMinutes']} rules={[{ required: true, message: 'Phút' }]} style={{ marginBottom: 8 }} tooltip="Phút sau giờ xuất bến">
                        <InputNumber min={0} placeholder="+phút" style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={16} md={3}>
                      <Form.Item name={[f.name, 'surcharge']} style={{ marginBottom: 8 }}>
                        <MoneyInput placeholder="Phụ phí/ghế" />
                      </Form.Item>
                    </Col>
                    <Col xs={16} md={3}>
                      <Flex vertical style={{ lineHeight: 1.4 }}>
                        <Form.Item name={[f.name, 'canPickup']} valuePropName="checked" noStyle>
                          <Checkbox>Đón</Checkbox>
                        </Form.Item>
                        <Form.Item name={[f.name, 'canDropoff']} valuePropName="checked" noStyle>
                          <Checkbox>Trả</Checkbox>
                        </Form.Item>
                      </Flex>
                    </Col>
                    <Col xs={8} md={1}>
                      <Flex>
                        <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, i - 1)} title="Lên" />
                        <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={i === fields.length - 1} onClick={() => move(i, i + 1)} title="Xuống" />
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={fields.length <= 2} onClick={() => remove(f.name)} title="Xóa" />
                      </Flex>
                    </Col>
                  </Row>
                ))}
                <Button size="small" icon={<PlusOutlined />} onClick={() => add({ name: '', kind: 'DIEM_DUNG', offsetMinutes: 0, canPickup: true, canDropoff: true })}>
                  Thêm điểm
                </Button>
              </>
            )}
          </Form.List>

          <Divider titlePlacement="start" style={{ margin: '16px 0 8px' }}>
            Giờ xuất bến cố định
          </Divider>
          <QuickScheduleGen form={form} />
          <Form.List name="schedules">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <Row key={f.key} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                    <Form.Item name={[f.name, 'id']} hidden>
                      <Input />
                    </Form.Item>
                    <Col xs={8} md={3}>
                      <Form.Item name={[f.name, 'departTime']} rules={[{ required: true, message: 'Giờ' }]} noStyle>
                        <TimePicker format="HH:mm" minuteStep={5} needConfirm={false} style={{ width: '100%' }} placeholder="Giờ" />
                      </Form.Item>
                    </Col>
                    <Col xs={16} md={8}>
                      <Form.Item name={[f.name, 'weekdays']} noStyle>
                        <Checkbox.Group options={WEEKDAYS} />
                      </Form.Item>
                    </Col>
                    <Col xs={14} md={7}>
                      <Form.Item name={[f.name, 'validRange']} noStyle>
                        <DatePicker.RangePicker format="DD/MM/YYYY" allowEmpty={[true, true]} placeholder={['Từ ngày', 'Đến ngày']} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={6} md={3}>
                      <Form.Item name={[f.name, 'capacity']} noStyle>
                        <InputNumber min={1} placeholder="Số ghế" style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={4} md={2}>
                      <Form.Item name={[f.name, 'isActive']} valuePropName="checked" noStyle>
                        <Switch size="small" title="Đang chạy" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={1}>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                    </Col>
                  </Row>
                ))}
                <Typography.Paragraph type="secondary" style={{ margin: '4px 0 8px' }}>
                  Không tích ngày nào = chạy mọi ngày. Bỏ trống số ghế = theo tuyến. Bỏ trống ngày hiệu lực = luôn chạy.
                </Typography.Paragraph>
                <Button size="small" icon={<PlusOutlined />} onClick={() => add({ departTime: null, weekdays: [], isActive: true })}>
                  Thêm giờ chạy
                </Button>
              </>
            )}
          </Form.List>
          <Form.Item name="notes" label="Ghi chú" style={{ marginTop: 16 }}>
            <Input.TextArea rows={2} placeholder="VD: hành lý tối đa 1 vali / khách" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
