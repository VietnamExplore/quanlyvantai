import { CarOutlined, CheckOutlined, CloseOutlined, EditOutlined, KeyOutlined, LogoutOutlined, PhoneOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Avatar, Button, Card, Collapse, Dropdown, Empty, Flex, Form, Input, Layout, Modal, Segmented, Spin, Statistic, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { DATE_FORMAT, EnumTag, formatVnd } from '../components/common';
import { NotificationBell } from '../components/NotificationBell';
import { ResponsiveTable } from '../components/ResponsiveTable';
import { PAYMENT_METHOD, TRIP_STATUS } from '../labels';
import { BRAND } from '../theme';
import type { PaymentMethod, TripStatus } from '../types';

interface PartnerTrip {
  id: number;
  seq: number;
  status: TripStatus;
  serviceType: string;
  pickupTime: string;
  endTime: string | null;
  pickupAddress: string;
  dropoffAddress: string | null;
  flightNumber: string | null;
  departureFlight: string | null;
  passengers: number;
  days: number;
  itinerary: string | null;
  notes: string | null;
  dispatchNote: string | null;
  partnerPlate: string | null;
  partnerDriverName: string | null;
  partnerDriverPhone: string | null;
  partnerCost: string | null;
  vehicleType: { name: string; seats: number };
  service: { name: string } | null;
  booking: {
    code: string;
    leaderRole: string | null;
    leaderName: string | null;
    leaderPhone: string | null;
    signTitle: string | null;
    passengers: { seq: number; fullName: string; nationality: string | null; phone: string | null }[];
  };
}

interface Summary {
  tripCount: number;
  totalCost: number;
  totalPaid: number;
  balance: number;
  trips: { id: number; pickupTime: string; pickupAddress: string; dropoffAddress: string | null; partnerPlate: string | null; partnerCost: string | null; status: TripStatus; booking: { code: string }; vehicleType: { name: string } }[];
  payments: { id: number; amount: string; paidAt: string; method: PaymentMethod; reference: string | null; note: string | null }[];
}

type Tab = 'new' | 'active' | 'history' | 'money';

/** Bước kế tiếp nhà xe bấm */
const NEXT: Partial<Record<TripStatus, { status: TripStatus; label: string }>> = {
  TAI_XE_NHAN: { status: 'DANG_DEN_DON', label: 'Bắt đầu đi đón' },
  DANG_DEN_DON: { status: 'DA_DON_KHACH', label: 'Đã đón khách' },
  DA_DON_KHACH: { status: 'HOAN_THANH', label: 'Hoàn thành chuyến' },
};

const LEADER: Record<string, string> = { HDV: 'Hướng dẫn viên', TRUONG_DOAN: 'Trưởng đoàn' };

/**
 * Cổng nhà xe đối tác: nhận / từ chối chuyến, nhập xe & tài xế, cập nhật trạng thái, xem công nợ.
 * Chỉ thấy chuyến giao cho nhà xe mình, không thấy giá bán cho khách.
 */
export default function PartnerPortalPage() {
  const { user, logout } = useAuth();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('new');
  const [pwdOpen, setPwdOpen] = useState(false);
  const [vehicleFor, setVehicleFor] = useState<{ trip: PartnerTrip; accept: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [vehicleForm] = Form.useForm<{ partnerPlate?: string; partnerDriverName?: string; partnerDriverPhone?: string }>();

  const { data: me } = useQuery({ queryKey: ['/partner/me'], queryFn: () => api<{ name: string }>('/partner/me') });
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['/partner/trips', tab],
    queryFn: () => api<{ items: PartnerTrip[]; counts: { new: number; active: number } }>('/partner/trips', { query: { scope: tab } }),
    enabled: tab !== 'money',
    refetchInterval: 60_000,
  });
  const { data: summary } = useQuery({ queryKey: ['/partner/summary'], queryFn: () => api<Summary>('/partner/summary'), enabled: tab === 'money' });

  // Mở từ thông báo (?trip=ID): chuyển sang tab có chuyến đó và cuộn tới
  const focusTrip = Number(params.get('trip')) || null;
  useEffect(() => {
    if (!focusTrip) return;
    api<PartnerTrip>(`/partner/trips/${focusTrip}`)
      .then((t) => setTab(t.status === 'DA_GAN' ? 'new' : t.status === 'HOAN_THANH' || t.status === 'HUY' ? 'history' : 'active'))
      .catch(() => message.warning('Chuyến này không còn giao cho nhà xe'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTrip]);
  useEffect(() => {
    if (focusTrip && data?.items.some((t) => t.id === focusTrip)) {
      setTimeout(() => document.getElementById(`trip-${focusTrip}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
    }
  }, [focusTrip, data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['/partner'] });

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      message.success(ok);
      refresh();
      queryClient.invalidateQueries({ queryKey: ['/partner/trips'] });
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openVehicle(trip: PartnerTrip, accept: boolean) {
    vehicleForm.setFieldsValue({ partnerPlate: trip.partnerPlate ?? '', partnerDriverName: trip.partnerDriverName ?? '', partnerDriverPhone: trip.partnerDriverPhone ?? '' });
    setVehicleFor({ trip, accept });
  }

  async function saveVehicle() {
    if (!vehicleFor) return;
    const v = await vehicleForm.validateFields();
    const { trip, accept } = vehicleFor;
    const done = await run(
      () => api(`/partner/trips/${trip.id}/${accept ? 'accept' : 'vehicle'}`, { method: 'POST', body: v }),
      accept ? 'Đã nhận chuyến' : 'Đã cập nhật xe / tài xế',
    );
    if (done) {
      setVehicleFor(null);
      if (accept) setTab('active');
    }
  }

  function reject(trip: PartnerTrip) {
    let reason = '';
    modal.confirm({
      title: `Từ chối chuyến ${trip.booking.code}?`,
      content: <Input.TextArea rows={3} autoFocus placeholder="Lý do (bắt buộc), vd: hết xe ngày này" onChange={(e) => (reason = e.target.value)} />,
      okText: 'Từ chối',
      okButtonProps: { danger: true },
      cancelText: 'Không',
      onOk: () => {
        if (!reason.trim()) {
          message.warning('Vui lòng nhập lý do');
          return Promise.reject();
        }
        return run(() => api(`/partner/trips/${trip.id}/reject`, { method: 'POST', body: { reason } }), 'Đã từ chối, văn phòng sẽ điều xe khác');
      },
    });
  }

  function advance(trip: PartnerTrip) {
    const next = NEXT[trip.status];
    if (!next) return;
    modal.confirm({
      title: `${next.label}?`,
      content: `${trip.booking.code} · ${dayjs(trip.pickupTime).format('HH:mm DD/MM')}`,
      okText: next.label,
      cancelText: 'Không',
      onOk: () => run(() => api(`/partner/trips/${trip.id}/status`, { method: 'POST', body: { status: next.status } }), `Đã cập nhật: ${TRIP_STATUS[next.status].label}`),
    });
  }

  const counts = data?.counts;
  const tabs = [
    { value: 'new', label: `Chờ nhận${counts?.new ? ` (${counts.new})` : ''}` },
    { value: 'active', label: `Đang chạy${counts?.active ? ` (${counts.active})` : ''}` },
    { value: 'history', label: 'Đã xong' },
    { value: 'money', label: 'Công nợ' },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: BRAND.bg }}>
      <Layout.Header className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 16px' }}>
        <Flex align="center" gap={10} style={{ minWidth: 0 }}>
          <img src="/api/settings/logo" alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 8 }} onError={(e) => (e.currentTarget.style.display = 'none')} />
          <div style={{ minWidth: 0, lineHeight: 1.2 }}>
            <div style={{ fontSize: 12, color: BRAND.muted }}>Cổng nhà xe đối tác</div>
            <div style={{ fontWeight: 700, color: BRAND.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me?.name ?? '…'}</div>
          </div>
        </Flex>
        <Flex align="center" gap={8}>
          <NotificationBell />
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'me', label: <b>{user?.fullName}</b>, disabled: true },
                { type: 'divider' },
                { key: 'pwd', icon: <KeyOutlined />, label: 'Đổi mật khẩu', onClick: () => setPwdOpen(true) },
                { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true, onClick: logout },
              ],
            }}
          >
            <Avatar style={{ background: BRAND.primary, cursor: 'pointer' }}>{user?.fullName?.trim().split(/\s+/).pop()?.[0]?.toUpperCase()}</Avatar>
          </Dropdown>
        </Flex>
      </Layout.Header>

      <Layout.Content style={{ padding: 12, maxWidth: 960, width: '100%', margin: '0 auto' }}>
        <Flex justify="space-between" align="center" gap={8} wrap style={{ marginBottom: 12 }}>
          <Segmented
            value={tab}
            onChange={(v) => {
              setTab(v as Tab);
              if (params.get('trip')) setParams({});
            }}
            options={tabs}
          />
          {tab !== 'money' && (
            <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
              Tải lại
            </Button>
          )}
        </Flex>

        {tab === 'money' ? (
          <MoneyView summary={summary} />
        ) : isFetching && !data ? (
          <Flex justify="center" style={{ padding: 48 }}>
            <Spin />
          </Flex>
        ) : !data?.items.length ? (
          <Card>
            <Empty description={tab === 'new' ? 'Không có chuyến nào chờ nhận' : tab === 'active' ? 'Không có chuyến đang chạy' : 'Chưa có chuyến hoàn thành trong 60 ngày'} />
          </Card>
        ) : (
          data.items.map((t) => (
            <TripCard
              key={t.id}
              trip={t}
              focused={t.id === focusTrip}
              busy={busy}
              onAccept={() => openVehicle(t, true)}
              onReject={() => reject(t)}
              onVehicle={() => openVehicle(t, false)}
              onNext={() => advance(t)}
            />
          ))
        )}
      </Layout.Content>

      <Modal
        open={!!vehicleFor}
        title={vehicleFor?.accept ? `Nhận chuyến ${vehicleFor.trip.booking.code}` : 'Xe và tài xế'}
        okText={vehicleFor?.accept ? 'Nhận chuyến' : 'Lưu'}
        cancelText="Hủy"
        confirmLoading={busy}
        onOk={saveVehicle}
        onCancel={() => setVehicleFor(null)}
        destroyOnHidden
      >
        {vehicleFor?.accept && (
          <Typography.Paragraph type="secondary">Nhập luôn xe và tài xế nếu đã sắp xếp (có thể nhập sau, nhưng phải có trước khi bắt đầu chuyến).</Typography.Paragraph>
        )}
        <Form form={vehicleForm} layout="vertical">
          <Form.Item name="partnerPlate" label="Biển số xe" normalize={(v?: string) => v?.toUpperCase()}>
            <Input placeholder="43B-123.45" />
          </Form.Item>
          <Form.Item name="partnerDriverName" label="Tên tài xế">
            <Input />
          </Form.Item>
          <Form.Item name="partnerDriverPhone" label="SĐT tài xế">
            <Input inputMode="tel" />
          </Form.Item>
        </Form>
      </Modal>
      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </Layout>
  );
}

function TripCard({
  trip: t,
  focused,
  busy,
  onAccept,
  onReject,
  onVehicle,
  onNext,
}: {
  trip: PartnerTrip;
  focused: boolean;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onVehicle: () => void;
  onNext: () => void;
}) {
  const next = NEXT[t.status];
  const closed = t.status === 'HOAN_THANH' || t.status === 'HUY';
  const b = t.booking;
  return (
    <Card id={`trip-${t.id}`} className={focused ? 'partner-trip partner-trip-focus' : 'partner-trip'} style={{ marginBottom: 12 }}>
      <Flex justify="space-between" align="flex-start" gap={8}>
        <div>
          <div className="partner-trip-time">{dayjs(t.pickupTime).format('HH:mm')}</div>
          <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{dayjs(t.pickupTime).format('dddd DD/MM/YYYY')}</div>
          <Typography.Text type="secondary">
            {b.code} · {t.service?.name ?? t.serviceType}
            {t.days > 1 ? ` · ${t.days} ngày` : ''}
          </Typography.Text>
        </div>
        {t.status === 'DA_GAN' ? <Tag color="orange">Chờ nhận</Tag> : t.status === 'TAI_XE_NHAN' ? <Tag color="cyan">Đã nhận chuyến</Tag> : <EnumTag labels={TRIP_STATUS} value={t.status} />}
      </Flex>

      <div className="partner-trip-route">
        <div>
          <span className="dot dot-from" /> {t.pickupAddress}
        </div>
        {t.dropoffAddress && (
          <div>
            <span className="dot dot-to" /> {t.dropoffAddress}
          </div>
        )}
      </div>

      <Flex gap={6} wrap style={{ marginBottom: 8 }}>
        <Tag icon={<CarOutlined />}>{t.vehicleType.name}</Tag>
        <Tag>{t.passengers} khách</Tag>
        {t.flightNumber && <Tag color="blue">✈ Đón {t.flightNumber}</Tag>}
        {t.departureFlight && <Tag color="blue">✈ Tiễn {t.departureFlight}</Tag>}
        {t.partnerCost && <Tag color="green">Giá thuê {formatVnd(t.partnerCost)}đ</Tag>}
      </Flex>

      {t.itinerary && (
        <div className="partner-note">
          <b>Lịch trình:</b> <span style={{ whiteSpace: 'pre-line' }}>{t.itinerary}</span>
        </div>
      )}
      {t.dispatchNote && (
        <div className="partner-note partner-note-warn">
          <b>Ghi chú điều xe:</b> {t.dispatchNote}
        </div>
      )}
      {t.notes && (
        <div className="partner-note">
          <b>Ghi chú chuyến:</b> {t.notes}
        </div>
      )}

      {(b.leaderName || b.leaderPhone) && (
        <div style={{ marginTop: 8 }}>
          <Typography.Text type="secondary">{LEADER[b.leaderRole ?? ''] ?? 'Người liên hệ đón'}: </Typography.Text>
          <b>{b.leaderName}</b>
          {b.leaderPhone && (
            <a href={`tel:${b.leaderPhone}`} style={{ marginLeft: 8 }}>
              <PhoneOutlined /> {b.leaderPhone}
            </a>
          )}
        </div>
      )}
      {b.signTitle && (
        <div>
          <Typography.Text type="secondary">Bảng đón: </Typography.Text>
          <b>{b.signTitle}</b>
        </div>
      )}
      {b.passengers.length > 0 && (
        <Collapse
          size="small"
          ghost
          items={[
            {
              key: 'p',
              label: `Danh sách khách (${b.passengers.length})`,
              children: b.passengers.map((p) => (
                <div key={p.seq}>
                  {p.seq}. {p.fullName}
                  {p.nationality ? ` · ${p.nationality}` : ''}
                  {p.phone && (
                    <a href={`tel:${p.phone}`} style={{ marginLeft: 6 }}>
                      {p.phone}
                    </a>
                  )}
                </div>
              )),
            },
          ]}
        />
      )}

      <div className="partner-vehicle">
        <Typography.Text type="secondary">Xe / tài xế: </Typography.Text>
        {t.partnerPlate || t.partnerDriverName ? (
          <b>{[t.partnerPlate, t.partnerDriverName, t.partnerDriverPhone].filter(Boolean).join(' · ')}</b>
        ) : (
          <Typography.Text type="warning">chưa nhập</Typography.Text>
        )}
        {!closed && t.status !== 'DA_GAN' && (
          <Button size="small" type="link" icon={<EditOutlined />} onClick={onVehicle}>
            Sửa
          </Button>
        )}
      </div>

      {t.status === 'DA_GAN' && (
        <Flex gap={8} style={{ marginTop: 12 }}>
          <Button danger icon={<CloseOutlined />} onClick={onReject} disabled={busy} style={{ flex: 1 }}>
            Từ chối
          </Button>
          <Button type="primary" icon={<CheckOutlined />} onClick={onAccept} loading={busy} style={{ flex: 2 }}>
            Nhận chuyến
          </Button>
        </Flex>
      )}
      {next && (
        <Button type="primary" block onClick={onNext} loading={busy} style={{ marginTop: 12 }}>
          {next.label}
        </Button>
      )}
    </Card>
  );
}

function MoneyView({ summary }: { summary?: Summary }) {
  if (!summary) {
    return (
      <Flex justify="center" style={{ padding: 48 }}>
        <Spin />
      </Flex>
    );
  }
  return (
    <>
      <Flex gap={12} wrap style={{ marginBottom: 12 }}>
        <Card style={{ flex: '1 1 200px' }}>
          <Statistic title={`Tiền chuyến (${summary.tripCount} chuyến)`} value={summary.totalCost} suffix="đ" />
        </Card>
        <Card style={{ flex: '1 1 200px' }}>
          <Statistic title="Đã được thanh toán" value={summary.totalPaid} suffix="đ" valueStyle={{ color: '#15803d' }} />
        </Card>
        <Card style={{ flex: '1 1 200px' }}>
          <Statistic title="Còn lại" value={summary.balance} suffix="đ" valueStyle={{ color: summary.balance > 0 ? '#b45309' : undefined }} />
        </Card>
      </Flex>
      <Card title="Các lần thanh toán" style={{ marginBottom: 12 }}>
        <ResponsiveTable
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={summary.payments}
          locale={{ emptyText: 'Chưa có lần thanh toán nào' }}
          columns={[
            { title: 'Ngày', dataIndex: 'paidAt', render: (v) => dayjs(v).format(DATE_FORMAT) },
            { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v) => <b>{formatVnd(v)}đ</b> },
            { title: 'Hình thức', dataIndex: 'method', render: (v: PaymentMethod) => PAYMENT_METHOD[v]?.label },
            { title: 'Số chứng từ / ghi chú', render: (_, p) => [p.reference, p.note].filter(Boolean).join(' · ') },
          ]}
        />
      </Card>
      <Card title="Chuyến tính tiền">
        <ResponsiveTable
          rowKey="id"
          size="small"
          dataSource={summary.trips}
          pagination={{ pageSize: 100, hideOnSinglePage: true }}
          columns={[
            { title: 'Ngày đón', dataIndex: 'pickupTime', render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY'), sorter: (a, b) => a.pickupTime.localeCompare(b.pickupTime) },
            { title: 'Booking', render: (_, t) => t.booking.code },
            { title: 'Hành trình', render: (_, t) => (t.dropoffAddress ? `${t.pickupAddress} → ${t.dropoffAddress}` : t.pickupAddress) },
            { title: 'Xe', render: (_, t) => [t.vehicleType.name, t.partnerPlate].filter(Boolean).join(' · ') },
            { title: 'Trạng thái', dataIndex: 'status', render: (v) => <EnumTag labels={TRIP_STATUS} value={v} /> },
            { title: 'Giá thuê', dataIndex: 'partnerCost', align: 'right', render: (v) => (v ? `${formatVnd(v)}đ` : '—') },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={5}>
                <b>Tổng</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">
                <b>{formatVnd(summary.totalCost)}đ</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>
    </>
  );
}
