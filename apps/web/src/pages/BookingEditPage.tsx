import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FilePdfOutlined,
  PlusOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  buildQuoteText,
  computeTotals,
  fmtTime,
  fromTrip,
  newKey,
  routeText,
  toTripPayload,
  tripAmount,
  type TripDraft,
} from '../booking-utils';
import { DATE_FORMAT, EnumTag, Money, MoneyInput, useCustomers, useSalesStaffOptions, useSettings } from '../components/common';
import { TripModal } from '../components/TripModal';
import { BOOKING_SOURCE, BOOKING_STATUS, SERVICE_TYPE, TRIP_STATUS, toOptions } from '../labels';
import { QuickSelect } from '../components/QuickCreate';
import type { Booking, BookingStatus, Customer } from '../types';

const LOCKED: BookingStatus[] = ['HOAN_THANH', 'HUY'];

export default function BookingEditPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { hasRole, user } = useAuth();
  const [form] = Form.useForm();
  const customers = useCustomers();
  const salesOptions = useSalesStaffOptions();
  const settings = useSettings();

  const [trips, setTrips] = useState<TripDraft[]>([]);
  const [editingTrip, setEditingTrip] = useState<TripDraft | null>(null);
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: booking, isLoading } = useQuery({
    queryKey: ['/bookings', Number(id)],
    queryFn: () => api<Booking>(`/bookings/${id}`),
    enabled: !isNew,
  });

  useEffect(() => {
    if (isNew) {
      form.setFieldsValue({
        source: 'HOTLINE',
        vatPercent: 0,
        discountAmount: 0,
        depositAmount: 0,
        salesUserId: user?.roles.includes('KINH_DOANH') ? user.id : undefined,
        quoteValidUntil: dayjs().add(7, 'day'),
      });
      setTrips([]);
    } else if (booking) {
      form.setFieldsValue({
        ...booking,
        discountAmount: Number(booking.discountAmount),
        vatPercent: Number(booking.vatPercent),
        depositAmount: Number(booking.depositAmount),
        quoteValidUntil: booking.quoteValidUntil ? dayjs(booking.quoteValidUntil) : null,
      });
      setTrips(booking.trips.map(fromTrip));
    }
    setDirty(false);
  }, [isNew, booking, form, user]);

  const status: BookingStatus = booking?.status ?? 'NHAP';
  const canEdit = hasRole('ADMIN', 'DIEU_HANH', 'KINH_DOANH');
  const readOnly = !canEdit || LOCKED.includes(status);

  const discount = Form.useWatch('discountAmount', form) ?? 0;
  const vatPercent = Form.useWatch('vatPercent', form) ?? 0;
  const deposit = Form.useWatch('depositAmount', form) ?? 0;
  const totals = computeTotals(trips, discount, vatPercent, deposit);

  /** Lưu booking. Trả về booking đã lưu, hoặc null nếu dữ liệu chưa hợp lệ / lỗi. */
  async function save(): Promise<Booking | null> {
    let v;
    try {
      v = await form.validateFields();
    } catch {
      message.warning('Vui lòng kiểm tra lại thông tin khách hàng');
      return null;
    }
    const payload = {
      customerId: v.customerId ?? null,
      contactName: v.contactName,
      contactPhone: v.contactPhone,
      source: v.source,
      salesUserId: v.salesUserId ?? null,
      discountAmount: v.discountAmount || 0,
      vatPercent: v.vatPercent || 0,
      depositAmount: v.depositAmount || 0,
      quoteValidUntil: v.quoteValidUntil ? (v.quoteValidUntil as Dayjs).format('YYYY-MM-DD') : null,
      notes: v.notes || null,
      internalNotes: v.internalNotes || null,
      trips: trips.map(toTripPayload),
    };
    setSaving(true);
    try {
      const saved = isNew
        ? await api<Booking>('/bookings', { method: 'POST', body: payload })
        : await api<Booking>(`/bookings/${id}`, { method: 'PATCH', body: payload });
      queryClient.setQueryData(['/bookings', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['/bookings'] });
      setDirty(false);
      if (isNew) {
        message.success(`Đã tạo booking ${saved.code}`);
        navigate(`/bookings/${saved.id}`, { replace: true });
      } else {
        message.success('Đã lưu');
      }
      return saved;
    } catch (e) {
      message.error((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(next: BookingStatus, cancelReason?: string) {
    const saved = dirty || isNew ? await save() : booking;
    if (!saved) return;
    try {
      const res = await api<Booking>(`/bookings/${saved.id}/status`, { method: 'POST', body: { status: next, cancelReason } });
      queryClient.setQueryData(['/bookings', res.id], res);
      queryClient.invalidateQueries({ queryKey: ['/bookings'] });
      message.success(`Booking: ${BOOKING_STATUS[next].label}`);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  function askCancel() {
    let reason = '';
    modal.confirm({
      title: 'Hủy booking?',
      content: <Input.TextArea rows={3} placeholder="Lý do hủy (bắt buộc)" onChange={(e) => (reason = e.target.value)} />,
      okText: 'Hủy booking',
      okButtonProps: { danger: true },
      cancelText: 'Không',
      onOk: () => {
        if (!reason.trim()) {
          message.warning('Vui lòng nhập lý do hủy');
          return Promise.reject();
        }
        return changeStatus('HUY', reason);
      },
    });
  }

  async function copyQuote() {
    if (!booking) return;
    if (dirty) {
      message.warning('Hãy lưu booking trước khi sao chép báo giá');
      return;
    }
    try {
      await navigator.clipboard.writeText(buildQuoteText(booking, settings));
      message.success('Đã sao chép nội dung báo giá. Dán (Ctrl+V) vào Zalo hoặc email.');
    } catch {
      message.error('Trình duyệt chặn sao chép. Hãy dùng nút "Xem / In báo giá".');
    }
  }

  const saveTrip = (t: TripDraft) => {
    setTrips((list) => (list.some((x) => x.key === t.key) ? list.map((x) => (x.key === t.key ? t : x)) : [...list, t]));
    setTripModalOpen(false);
    setDirty(true);
  };

  const duplicateTrip = (t: TripDraft) => {
    setTrips((list) => [...list, { ...t, key: newKey(), id: undefined, status: undefined }]);
    setDirty(true);
  };

  const removeTrip = (t: TripDraft) => {
    setTrips((list) => list.filter((x) => x.key !== t.key));
    setDirty(true);
  };

  const onCustomerChange = (customerId: number | undefined) => {
    const c = customers.find((x) => x.id === customerId);
    if (c) fillContact(c);
  };

  /** Điền người liên hệ, SĐT, NV phụ trách từ khách hàng (chỉ điền ô còn trống) */
  const fillContact = (c: Customer) => {
    const cur = form.getFieldsValue();
    form.setFieldsValue({
      contactName: cur.contactName || c.name,
      contactPhone: cur.contactPhone || c.phone || '',
      salesUserId: cur.salesUserId ?? c.salesUserId ?? undefined,
      source: c.type === 'DAI_LY' ? 'DAI_LY' : cur.source,
    });
  };

  if (!isNew && isLoading) {
    return (
      <Flex justify="center" style={{ padding: 48 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  const statusActions = !readOnly && (
    <>
      {status === 'BAO_GIA' && <Button onClick={() => changeStatus('NHAP')}>Về nháp</Button>}
      {status === 'NHAP' && (
        <Button icon={<SendOutlined />} onClick={() => changeStatus('BAO_GIA')} disabled={!trips.length}>
          Đã gửi báo giá
        </Button>
      )}
      {(status === 'NHAP' || status === 'BAO_GIA') && (
        <Button type="primary" ghost icon={<CheckCircleOutlined />} onClick={() => changeStatus('XAC_NHAN')} disabled={!trips.length}>
          Khách xác nhận
        </Button>
      )}
      {status === 'XAC_NHAN' && (
        <Popconfirm title="Đánh dấu booking đã hoàn thành?" okText="Hoàn thành" cancelText="Không" onConfirm={() => changeStatus('HOAN_THANH')}>
          <Button type="primary" ghost icon={<CheckCircleOutlined />}>
            Hoàn thành
          </Button>
        </Popconfirm>
      )}
      {!isNew && (
        <Button danger icon={<CloseCircleOutlined />} onClick={askCancel}>
          Hủy booking
        </Button>
      )}
    </>
  );

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Flex justify="space-between" align="center" wrap gap={12}>
          <Space wrap>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/bookings')} />
            <Typography.Title level={4} style={{ margin: 0 }}>
              {isNew ? 'Booking mới' : booking?.code}
            </Typography.Title>
            {!isNew && <EnumTag labels={BOOKING_STATUS} value={status} />}
            {dirty && <Tag color="orange">Chưa lưu</Tag>}
          </Space>
          <Space wrap>
            {!isNew && (
              <>
                <Button icon={<FilePdfOutlined />} href={`/bookings/${id}/quote`} target="_blank" disabled={dirty}>
                  Xem / In báo giá
                </Button>
                <Button icon={<CopyOutlined />} onClick={copyQuote}>
                  Sao chép gửi Zalo
                </Button>
              </>
            )}
            {statusActions}
            {!readOnly && (
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>
                Lưu
              </Button>
            )}
          </Space>
        </Flex>
        {booking?.status === 'HUY' && <Alert type="error" showIcon style={{ marginTop: 12 }} title={`Đã hủy: ${booking.cancelReason}`} />}
        {booking?.status === 'XAC_NHAN' && (
          <Alert type="info" showIcon style={{ marginTop: 12 }} title="Booking đã xác nhận: các chuyến đang chờ Điều hành xếp xe." />
        )}
      </Card>

      <Form form={form} layout="vertical" disabled={readOnly} onValuesChange={() => setDirty(true)}>
        <Card title="Khách hàng">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="customerId" label="Khách hàng / đại lý" extra="Bỏ trống nếu là khách lẻ chưa có trong danh mục">
                <QuickSelect
                  entity="customer"
                  allowClear
                  onChange={(id) => onCustomerChange(id as number | undefined)}
                  onCreated={(c) => fillContact(c as unknown as Customer)}
                  options={customers.map((c) => ({ value: c.id, label: c.phone ? `${c.name} – ${c.phone}` : c.name }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="contactName" label="Người liên hệ" rules={[{ required: true, message: 'Nhập tên người liên hệ' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="contactPhone" label="SĐT liên hệ" rules={[{ required: true, message: 'Nhập số điện thoại' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="source" label="Nguồn">
                <Select options={toOptions(BOOKING_SOURCE)} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="salesUserId" label="NV kinh doanh">
                <QuickSelect entity="salesUser" allowClear options={salesOptions} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="quoteValidUntil" label="Báo giá hiệu lực đến">
                <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            {!isNew && booking && (
              <Col xs={12} md={6}>
                <Descriptions size="small" column={1} style={{ marginTop: 4 }}>
                  <Descriptions.Item label="Người tạo">{booking.createdBy.fullName}</Descriptions.Item>
                  <Descriptions.Item label="Ngày tạo">{dayjs(booking.createdAt).format('HH:mm DD/MM/YYYY')}</Descriptions.Item>
                </Descriptions>
              </Col>
            )}
          </Row>
        </Card>

        <Card
          title={`Chuyến (${trips.length})`}
          style={{ marginTop: 16 }}
          extra={
            !readOnly && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={false}
                onClick={() => {
                  setEditingTrip(null);
                  setTripModalOpen(true);
                }}
              >
                Thêm chuyến
              </Button>
            )
          }
        >
          <Table<TripDraft>
            rowKey="key"
            size="middle"
            dataSource={trips}
            pagination={false}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: <Empty description="Chưa có chuyến nào. Bấm “Thêm chuyến” để bắt đầu." /> }}
            columns={[
              { title: '#', width: 40, render: (_, __, i) => i + 1 },
              { title: 'Dịch vụ', dataIndex: 'serviceType', render: (v) => <EnumTag labels={SERVICE_TYPE} value={v} /> },
              {
                title: 'Thời gian',
                render: (_, t) => (
                  <>
                    <b>{fmtTime(t.pickupTime)}</b>
                    {t.endTime && (
                      <>
                        <br />
                        <Typography.Text type="secondary">đến {fmtTime(t.endTime)}</Typography.Text>
                      </>
                    )}
                  </>
                ),
              },
              {
                title: 'Hành trình',
                render: (_, t) => (
                  <div style={{ maxWidth: 320, whiteSpace: 'normal' }}>
                    {routeText(t)}
                    {t.flightNumber && <Tag style={{ marginLeft: 4 }}>✈ {t.flightNumber}</Tag>}
                    {t.notes && (
                      <>
                        <br />
                        <Typography.Text type="secondary">{t.notes}</Typography.Text>
                      </>
                    )}
                  </div>
                ),
              },
              {
                title: 'Xe / khách',
                render: (_, t) => (
                  <>
                    {t.vehicleTypeName}
                    <br />
                    <Typography.Text type="secondary">
                      {t.passengers} khách{t.days > 1 ? ` · ${t.days} ngày` : ''}
                    </Typography.Text>
                  </>
                ),
              },
              {
                title: 'Thành tiền',
                align: 'right',
                render: (_, t) => (
                  <Tooltip
                    title={
                      t.surcharges.length ? (
                        <>
                          Giá: {Number(t.unitPrice).toLocaleString('vi-VN')}đ
                          {t.surcharges.map((s, i) => (
                            <div key={i}>
                              + {s.name}: {Number(s.amount).toLocaleString('vi-VN')}đ
                            </div>
                          ))}
                        </>
                      ) : undefined
                    }
                  >
                    <Money value={tripAmount(t)} strong />
                    {t.surcharges.length > 0 && <div><Typography.Text type="secondary">gồm {t.surcharges.length} phụ thu</Typography.Text></div>}
                  </Tooltip>
                ),
              },
              ...(status !== 'NHAP' && status !== 'BAO_GIA'
                ? [
                    {
                      title: 'Điều xe',
                      render: (_: unknown, t: TripDraft) =>
                        t.status ? (
                          <>
                            <EnumTag labels={TRIP_STATUS} value={t.status} />
                            {t.assignment && <div><Typography.Text type="secondary">{t.assignment}</Typography.Text></div>}
                          </>
                        ) : (
                          <Tag>Chưa lưu</Tag>
                        ),
                    },
                  ]
                : []),
              ...(!readOnly
                ? [
                    {
                      key: '_actions',
                      fixed: 'right' as const,
                      render: (_: unknown, t: TripDraft) => {
                        const locked = !!t.status && t.status !== 'CHO_DIEU' && t.status !== 'HUY';
                        return (
                          <Space size={0}>
                            <Button type="text" icon={<EditOutlined />} title="Sửa" onClick={() => { setEditingTrip(t); setTripModalOpen(true); }} />
                            <Button type="text" icon={<CopyOutlined />} title="Nhân bản (thêm xe cùng lịch)" onClick={() => duplicateTrip(t)} />
                            <Popconfirm title="Xóa chuyến này?" okText="Xóa" cancelText="Không" onConfirm={() => removeTrip(t)} disabled={locked}>
                              <Button type="text" danger icon={<DeleteOutlined />} title={locked ? 'Chuyến đã điều xe' : 'Xóa'} disabled={locked} />
                            </Popconfirm>
                          </Space>
                        );
                      },
                    },
                  ]
                : []),
            ]}
          />
        </Card>

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col xs={24} lg={14}>
            <Card title="Ghi chú" style={{ height: '100%' }}>
              <Form.Item name="notes" label="Ghi chú cho khách (in trên báo giá)">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Form.Item name="internalNotes" label="Ghi chú nội bộ (khách không thấy)" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={3} />
              </Form.Item>
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="Thanh toán" style={{ height: '100%' }}>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="discountAmount" label="Giảm giá">
                    <MoneyInput />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="vatPercent" label="VAT (%)" extra="0 nếu không xuất hóa đơn">
                    <InputNumber min={0} max={100} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="depositAmount" label="Đặt cọc">
                    <MoneyInput />
                  </Form.Item>
                </Col>
              </Row>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Tạm tính">
                  <Money value={totals.subtotal} />
                </Descriptions.Item>
                {discount > 0 && (
                  <Descriptions.Item label="Giảm giá">
                    -<Money value={discount} />
                  </Descriptions.Item>
                )}
                {vatPercent > 0 && (
                  <Descriptions.Item label={`VAT ${vatPercent}%`}>
                    <Money value={totals.vatAmount} />
                  </Descriptions.Item>
                )}
                <Descriptions.Item label={<b>TỔNG CỘNG</b>}>
                  <Typography.Text strong style={{ fontSize: 18, color: 'var(--ant-color-primary)' }}>
                    {totals.total.toLocaleString('vi-VN')} đ
                  </Typography.Text>
                </Descriptions.Item>
                {deposit > 0 && (
                  <Descriptions.Item label="Còn phải thu">
                    <Money value={totals.remaining} strong />
                  </Descriptions.Item>
                )}
              </Descriptions>
              {trips.length > 0 && (
                <Descriptions column={1} size="small" bordered style={{ marginTop: 12 }} title={<Typography.Text type="secondary">Nội bộ (khách không thấy)</Typography.Text>}>
                  <Descriptions.Item label="Chi phí dự kiến">
                    <Money value={totals.cost} />
                  </Descriptions.Item>
                  <Descriptions.Item label="Lợi nhuận dự kiến">
                    <Typography.Text strong type={totals.profit < 0 ? 'danger' : undefined}>
                      {totals.profit.toLocaleString('vi-VN')} đ
                    </Typography.Text>
                    {totals.subtotal - discount > 0 && (
                      <Typography.Text type="secondary"> ({Math.round((totals.profit / (totals.subtotal - discount)) * 100)}%)</Typography.Text>
                    )}
                    {totals.missingCost > 0 && (
                      <div>
                        <Typography.Text type="warning">{totals.missingCost} chuyến chưa nhập chi phí</Typography.Text>
                      </div>
                    )}
                  </Descriptions.Item>
                </Descriptions>
              )}
            </Card>
          </Col>
        </Row>
      </Form>

      <TripModal open={tripModalOpen} trip={editingTrip} onCancel={() => setTripModalOpen(false)} onSave={saveTrip} />
    </Space>
  );
}
