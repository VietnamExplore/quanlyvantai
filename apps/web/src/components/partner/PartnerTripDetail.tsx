import { AimOutlined, CheckOutlined, CloseOutlined, CopyOutlined, EditOutlined, FileProtectOutlined, IdcardOutlined, MessageOutlined, PhoneOutlined, PictureOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { App, Button, Drawer, Flex, Grid, Tag, Typography } from 'antd';
import { api } from '../../api';
import dayjs from 'dayjs';
import { useState } from 'react';
import { copyText, useCopyText } from '../../clipboard';
import { formatVnd } from '../common';
import { APP_LABEL, chatUrl, guessApp, type ContactApp } from './contact';
import { buildPartnerDispatchText } from './dispatch-text';
import { SignBoard } from './SignBoard';
import type { PartnerTrip } from './types';
import { ExtraStatusTag } from '../PartnerExtraReview';

const LEADER: Record<string, string> = { HDV: 'Hướng dẫn viên', TRUONG_DOAN: 'Trưởng đoàn' };
const GENDER: Record<string, string> = { NAM: 'Nam', NU: 'Nữ' };
const PAX_PREVIEW = 8;

const STATUS: Record<string, { label: string; color: string }> = {
  DA_GAN: { label: 'Chờ nhận', color: 'orange' },
  TAI_XE_NHAN: { label: 'Đã nhận chuyến', color: 'cyan' },
  DANG_DEN_DON: { label: 'Đang đến đón', color: 'purple' },
  DA_DON_KHACH: { label: 'Đang chở khách', color: 'purple' },
  HOAN_THANH: { label: 'Hoàn thành', color: 'green' },
  HUY: { label: 'Đã hủy', color: 'red' },
};

export const NEXT_STEP: Record<string, { status: string; label: string }> = {
  TAI_XE_NHAN: { status: 'DANG_DEN_DON', label: 'Bắt đầu đi đón' },
  DANG_DEN_DON: { status: 'DA_DON_KHACH', label: 'Đã đón khách' },
  DA_DON_KHACH: { status: 'HOAN_THANH', label: 'Hoàn thành chuyến' },
};

/** Tra giờ bay thực tế (trễ / sớm) của số hiệu chuyến bay */
const flightUrl = (flight: string) => `https://www.google.com/search?q=${encodeURIComponent(`${flight} flight status`)}`;

const mapUrl = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&hl=vi&gl=vn`;

/** Chi tiết chuyến cho nhà xe (bố cục giống app lái xe): lộ trình, liên hệ đón khách, đoàn khách, bảng đón, xe & tài xế */
export function PartnerTripDetail({
  trip: t,
  busy,
  onClose,
  onAccept,
  onReject,
  onVehicle,
  onNext,
}: {
  trip: PartnerTrip | null;
  busy: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  onVehicle: () => void;
  onNext: () => void;
}) {
  const { message } = App.useApp();
  const mobile = Grid.useBreakpoint().md === false;
  const [signOpen, setSignOpen] = useState(false);
  const [allPax, setAllPax] = useState(false);
  const copy = useCopyText();
  const { data: inv } = useQuery({
    queryKey: ['/partner/invoice-info'],
    queryFn: () => api<{ companyName: string | null; taxCode: string | null; address: string | null; email: string | null; phone: string | null }>('/partner/invoice-info'),
    enabled: !!t?.partnerInvoice,
    staleTime: 10 * 60_000,
  });
  if (!t) return null;

  const b = t.booking;
  const next = NEXT_STEP[t.status];
  const closed = t.status === 'HOAN_THANH' || t.status === 'HUY';
  // Liên hệ đón khách: trưởng đoàn / HDV; không có thì khách đi (máy chủ chọn sẵn, không lộ công ty / đại lý đặt)
  const phone = b.leaderPhone || b.guestContact?.phone || null;
  // Điểm trả: địa chỉ khách ghi, xe ghép không ghi thì lấy điểm trả của tuyến
  const dropoff = t.dropoffAddress || t.shuttleDropoffStop?.name || null;
  const contactName = b.leaderName || b.guestContact?.name || null;
  const app: ContactApp = (b.leaderApp as ContactApp | null) ?? guessApp(phone);
  const st = STATUS[t.status] ?? { label: t.status, color: 'default' };

  async function chat() {
    const url = chatUrl(app, phone, b.leaderAppId);
    if (url) {
      window.open(url, '_blank');
      return;
    }
    // KakaoTalk / WeChat / LINE chưa có ID: chép ID hoặc số để tìm bạn trong ứng dụng
    const value = b.leaderAppId?.trim() || phone || '';
    if (await copyText(value)) message.info(`Đã chép "${value}". Mở ${APP_LABEL[app]}, vào tìm bạn rồi dán để nhắn cho khách.`, 6);
    else message.info(`Tìm khách trên ${APP_LABEL[app]} bằng: ${value}`, 8);
  }

  const footer = !closed && (t.status === 'DA_GAN' || next) && (
    <Flex gap={8}>
      {t.status === 'DA_GAN' ? (
        <>
          <Button danger size="large" icon={<CloseOutlined />} onClick={onReject} disabled={busy} style={{ flex: 1 }}>
            Từ chối
          </Button>
          <Button type="primary" size="large" icon={<CheckOutlined />} onClick={onAccept} loading={busy} style={{ flex: 2 }}>
            Nhận chuyến
          </Button>
        </>
      ) : (
        next && (
          <Button type="primary" size="large" block onClick={onNext} loading={busy}>
            {next.label.toUpperCase()}
          </Button>
        )
      )}
    </Flex>
  );

  return (
    <Drawer open onClose={onClose} title="Chi tiết chuyến" size={mobile ? '100%' : 560} footer={footer || undefined} styles={{ body: { padding: 12, background: '#eef3fa' } }}>
      {/* Đầu thẻ: giờ đón nổi bật */}
      <div className="pt-hero">
        <Flex justify="space-between" align="center">
          <span className="pt-hero-code">
            {b.code} · chuyến {t.seq}
          </span>
          <Tag color={st.color} style={{ marginInlineEnd: 0 }}>
            {st.label}
          </Tag>
        </Flex>
        <div className="pt-hero-time">{dayjs(t.pickupTime).format('HH:mm')}</div>
        <div className="pt-hero-day">{dayjs(t.pickupTime).format('dddd, DD/MM/YYYY')}</div>
        <div className="pt-hero-sub">
          {t.service?.name ?? t.serviceType}
          {t.days > 1 ? ` · ${t.days} ngày` : ''} · {t.vehicleType.name}
        </div>
      </div>

      {/* Thao tác nhanh */}
      <div className="pt-card pt-quick">
        <button type="button" onClick={() => setSignOpen(true)}>
          <span className="pt-quick-icon" style={{ background: '#e8f1fe' }}>
            <PictureOutlined />
          </span>
          Bảng đón
        </button>
        {b.contract && (
          <a href={`/e/hd/${b.contract.token}`} target="_blank" rel="noreferrer" title={`Hợp đồng vận chuyển ${b.contract.number} – lái xe xuất trình khi kiểm tra`}>
            <span className="pt-quick-icon" style={{ background: '#fff3e2' }}>
              <FileProtectOutlined />
            </span>
            Hợp đồng
          </a>
        )}
        <a href={mapUrl(t.pickupAddress)} target="_blank" rel="noreferrer">
          <span className="pt-quick-icon" style={{ background: '#e7f7ee' }}>
            <AimOutlined />
          </span>
          Chỉ đường
        </a>
        {phone ? (
          <a href={`tel:${phone}`}>
            <span className="pt-quick-icon" style={{ background: '#fff3e2' }}>
              <PhoneOutlined />
            </span>
            Gọi đoàn
          </a>
        ) : (
          <span className="pt-quick-disabled">
            <span className="pt-quick-icon" style={{ background: '#f1f4f9' }}>
              <PhoneOutlined />
            </span>
            Gọi đoàn
          </span>
        )}
        {/* Chép lệnh điều xe gửi lái xe của nhà xe (sau khi đã nhận chuyến) */}
        {t.status === 'DA_GAN' || t.status === 'HUY' ? (
          <span className="pt-quick-disabled" title={t.status === 'DA_GAN' ? 'Nhận chuyến trước rồi chép lệnh gửi lái xe' : undefined}>
            <span className="pt-quick-icon" style={{ background: '#f1f4f9' }}>
              <CopyOutlined />
            </span>
            Lệnh điều xe
          </span>
        ) : (
          <button type="button" onClick={() => copy(buildPartnerDispatchText(t), 'Đã sao chép lệnh điều xe. Dán vào Zalo gửi lái xe.')}>
            <span className="pt-quick-icon" style={{ background: '#f3ecfd' }}>
              <CopyOutlined style={{ color: '#7c3aed' }} />
            </span>
            Lệnh điều xe
          </button>
        )}
      </div>

      {/* Lộ trình */}
      <div className="pt-card">
        <div className="pt-section">🧭 Lộ trình</div>
        <div className="pt-stop">
          <span className="pt-dot" style={{ background: '#1677ff' }} />
          <div style={{ flex: 1 }}>
            <div className="pt-label">ĐIỂM ĐÓN · {dayjs(t.pickupTime).format('HH:mm')}</div>
            <div className="pt-address">{t.pickupAddress}</div>
            <Button size="small" href={mapUrl(t.pickupAddress)} target="_blank" icon={<AimOutlined />} style={{ marginTop: 6 }}>
              Chỉ đường
            </Button>
          </div>
        </div>
        {t.itinerary && (
          <div className="pt-stop">
            <span className="pt-dot pt-dot-small" />
            <div style={{ flex: 1 }}>
              <div className="pt-label">LỊCH TRÌNH</div>
              <div className="pt-itinerary">{t.itinerary}</div>
            </div>
          </div>
        )}
        {dropoff && (
          <div className="pt-stop">
            <span className="pt-dot" style={{ background: '#e3262b' }} />
            <div style={{ flex: 1 }}>
              <div className="pt-label">ĐIỂM TRẢ</div>
              <div className="pt-address">{dropoff}</div>
              <Button size="small" href={mapUrl(dropoff)} target="_blank" icon={<AimOutlined />} style={{ marginTop: 6 }}>
                Chỉ đường
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Liên hệ đón khách: trưởng đoàn / hướng dẫn viên */}
      {(contactName || phone || b.leaderAppId) && (
        <div className="pt-card">
          <div className="pt-section">📞 Liên hệ đón khách</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{contactName ?? 'Khách'}</div>
          <Typography.Text type="secondary">
            {b.leaderName || b.leaderPhone ? (LEADER[b.leaderRole ?? ''] ?? 'Người liên hệ trong đoàn') : 'Khách đi'}
            {phone ? ` · ${phone}` : ''}
            {b.leaderAppId ? ` · ${APP_LABEL[app]} ID: ${b.leaderAppId}` : ''}
          </Typography.Text>
          <Flex gap={8} style={{ marginTop: 10 }}>
            {phone && (
              <Button icon={<PhoneOutlined />} href={`tel:${phone}`} style={{ flex: 1 }}>
                Gọi
              </Button>
            )}
            <Button type="primary" ghost icon={<MessageOutlined />} onClick={chat} style={{ flex: 1 }}>
              Nhắn {APP_LABEL[app]}
            </Button>
          </Flex>
        </div>
      )}

      {/* Thông tin chuyến */}
      <div className="pt-card">
        <div className="pt-section">ℹ️ Thông tin chuyến</div>
        {t.shuttleRun && (
          <div style={{ background: '#eef4ff', border: '1px solid #c7d8fb', borderRadius: 12, padding: 10, marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>🚌 Xe ghép · {t.shuttleRun.route.name}</div>
            <div>
              Mã booking <b>{b.code}</b> · Hành trình: {t.pickupAddress || t.shuttlePickupStop?.name} → {dropoff ?? '—'}
            </div>
            <div>
              Khởi hành <b>{dayjs(t.shuttleRun.departAt).format('HH:mm DD/MM/YYYY')}</b>
              {t.shuttlePickupStop ? ` · đón tại ${t.shuttlePickupStop.name}` : ''}
              {t.shuttleDropoffStop ? ` · trả tại ${t.shuttleDropoffStop.name}` : ''}
            </div>
            {t.shuttleRun.partnerPricePerPax != null && (
              <div>
                Giá: <b>{formatVnd(t.shuttleRun.partnerPricePerPax)}đ/khách</b> × {t.passengers} khách = <b>{formatVnd(Number(t.shuttleRun.partnerPricePerPax) * t.passengers)}đ</b>
              </div>
            )}
          </div>
        )}
        <Flex gap={6} wrap>
          <Tag>👥 {t.passengers} khách</Tag>
          <Tag>🚐 {t.vehicleType.name}</Tag>
          {t.flightNumber && <Tag color="blue">✈ Đón {t.flightNumber}</Tag>}
          {t.departureFlight && <Tag color="blue">✈ Tiễn {t.departureFlight}</Tag>}
        </Flex>
        <div className="pt-row pt-row-strong">
          <span>Giờ đón khách</span>
          <b>
            {dayjs(t.pickupTime).format('HH:mm')} · <span style={{ textTransform: 'capitalize' }}>{dayjs(t.pickupTime).format('dddd, DD/MM/YYYY')}</span>
          </b>
        </div>
        {t.flightNumber && (
          <div className="pt-row pt-row-strong">
            <span>Chuyến bay đón</span>
            <span>
              <b>✈ {t.flightNumber}</b>
              <a href={flightUrl(t.flightNumber)} target="_blank" rel="noreferrer" style={{ marginLeft: 10, fontSize: 13 }}>
                Tra giờ hạ cánh
              </a>
            </span>
          </div>
        )}
        {t.departureFlight && (
          <div className="pt-row pt-row-strong">
            <span>Chuyến bay tiễn</span>
            <span>
              <b>✈ {t.departureFlight}</b>
              <a href={flightUrl(t.departureFlight)} target="_blank" rel="noreferrer" style={{ marginLeft: 10, fontSize: 13 }}>
                Tra giờ cất cánh
              </a>
            </span>
          </div>
        )}
        <div className="pt-row">
          <span>Bảng đón</span>
          <b>{b.signTitle || '—'}</b>
        </div>
        {t.endTime && (
          <div className="pt-row">
            <span>Dự kiến xong</span>
            <span>{dayjs(t.endTime).format('HH:mm DD/MM/YYYY')}</span>
          </div>
        )}
        {t.partnerCost && (
          <div className="pt-row">
            <span>Giá thuê{t.partnerInvoice ? ' (chưa thuế)' : ''}</span>
            <span>
              <b style={{ color: '#15803d' }}>{formatVnd(t.partnerCost)}đ</b>
              {t.partnerInvoice && Number(t.partnerVatPercent) > 0 && (
                <div style={{ fontSize: 13, color: '#475569' }}>
                  + VAT {Number(t.partnerVatPercent)}% = <b>{formatVnd(Math.round(Number(t.partnerCost) * (1 + Number(t.partnerVatPercent) / 100)))}đ</b>
                </div>
              )}
              {(Number(t.partnerExtraUp) > 0 || Number(t.partnerExtraDown) > 0) && (
                <div style={{ fontSize: 13, color: '#475569' }}>
                  Phát sinh{Number(t.partnerExtraUp) > 0 ? ` +${formatVnd(t.partnerExtraUp)}đ` : ''}
                  {Number(t.partnerExtraDown) > 0 ? ` −${formatVnd(t.partnerExtraDown)}đ` : ''}
                  {t.partnerExtraNote ? ` · ${t.partnerExtraNote}` : ''}{' '}
                  <ExtraStatusTag status={t.partnerExtraStatus} note={t.partnerExtraReviewNote} />
                  {t.partnerExtraStatus === 'CHO_DUYET' && <div style={{ fontSize: 12, color: '#b45309' }}>Đang chờ văn phòng duyệt, chưa tính vào công nợ</div>}
                  {t.partnerExtraStatus !== 'CHO_DUYET' && t.partnerExtraReviewNote && <div style={{ fontSize: 12 }}>Văn phòng: {t.partnerExtraReviewNote}</div>}
                </div>
              )}
              {t.partnerAdjustNote && <div style={{ fontSize: 13, color: '#b45309' }}>⚠ Văn phòng điều chỉnh giá · {t.partnerAdjustNote}</div>}
            </span>
          </div>
        )}
        {t.notes && (
          <div className="pt-row">
            <span>Ghi chú chuyến</span>
            <span>{t.notes}</span>
          </div>
        )}
        {t.dispatchNote && (
          <div className="pt-dispatch">
            <b>📌 Ghi chú điều xe</b>
            <div>{t.dispatchNote}</div>
          </div>
        )}
      </div>

      {/* Yêu cầu nhà xe xuất hóa đơn cho công ty */}
      {t.partnerInvoice && (
        <div className="pt-card pt-invoice">
          <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
            <div className="pt-section" style={{ marginBottom: 0, color: '#7c3aed' }}>
              🧾 Yêu cầu xuất hóa đơn
            </div>
            {inv && (
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() =>
                  copy(
                    [
                      inv.companyName && `Tên đơn vị: ${inv.companyName}`,
                      inv.taxCode && `Mã số thuế: ${inv.taxCode}`,
                      inv.address && `Địa chỉ: ${inv.address}`,
                      inv.email && `Email nhận hóa đơn: ${inv.email}`,
                      `Thuế suất: ${Number(t.partnerVatPercent)}%`,
                      t.partnerCost && `Giá chưa thuế: ${formatVnd(t.partnerCost)}đ`,
                      t.partnerInvoiceNote && `Ghi chú: ${t.partnerInvoiceNote}`,
                      `Chuyến: ${b.code} · ${dayjs(t.pickupTime).format('DD/MM/YYYY')}`,
                    ]
                      .filter(Boolean)
                      .join('\n'),
                    'Đã sao chép thông tin xuất hóa đơn',
                  )
                }
              >
                Sao chép
              </Button>
            )}
          </Flex>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 6 }}>
            Nhà xe xuất hóa đơn cho chuyến này theo thông tin dưới đây.
          </Typography.Paragraph>
          {inv ? (
            <>
              <div className="pt-row">
                <span>Tên đơn vị</span>
                <b>{inv.companyName ?? '—'}</b>
              </div>
              <div className="pt-row">
                <span>Mã số thuế</span>
                <b>{inv.taxCode ?? '—'}</b>
              </div>
              <div className="pt-row">
                <span>Địa chỉ</span>
                <span>{inv.address ?? '—'}</span>
              </div>
              <div className="pt-row">
                <span>Thuế suất</span>
                <b>{Number(t.partnerVatPercent)}%</b>
              </div>
              <div className="pt-row pt-row-strong">
                <span>Email nhận HĐ</span>
                {inv.email ? <a href={`mailto:${inv.email}`}>{inv.email}</a> : <span>—</span>}
              </div>
            </>
          ) : (
            <Typography.Text type="secondary">Đang tải thông tin công ty…</Typography.Text>
          )}
          {t.partnerInvoiceNote && (
            <div className="pt-row">
              <span>Ghi chú</span>
              <b>{t.partnerInvoiceNote}</b>
            </div>
          )}
        </div>
      )}

      {/* Đoàn khách: họ tên, giới tính, năm sinh, quốc tịch, SĐT */}
      {b.passengers.length > 0 && (
        <div className="pt-card">
          <div className="pt-section">👥 Đoàn khách · {b.passengers.length} người</div>
          {(allPax ? b.passengers : b.passengers.slice(0, PAX_PREVIEW)).map((p) => (
            <div key={p.seq} className="pt-pax">
              <span className="pt-pax-seq">{p.seq}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{p.fullName}</span>
                <br />
                <Typography.Text type="secondary">{[p.gender && GENDER[p.gender], p.birthYear, p.nationality].filter(Boolean).join(' · ') || '—'}</Typography.Text>
              </span>
              {p.phone && (
                <a href={`tel:${p.phone}`} style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                  <PhoneOutlined /> {p.phone}
                </a>
              )}
            </div>
          ))}
          {b.passengers.length > PAX_PREVIEW && (
            <Button type="link" onClick={() => setAllPax(!allPax)} style={{ paddingInline: 0 }}>
              {allPax ? 'Thu gọn' : `Xem tất cả ${b.passengers.length} khách`}
            </Button>
          )}
        </div>
      )}

      {/* Xe & tài xế của nhà xe */}
      <div className="pt-card">
        <Flex justify="space-between" align="center">
          <div className="pt-section" style={{ marginBottom: 0 }}>
            <IdcardOutlined /> Xe & tài xế
          </div>
          {!closed && t.status !== 'DA_GAN' && (
            <Button size="small" icon={<EditOutlined />} onClick={onVehicle}>
              Sửa
            </Button>
          )}
        </Flex>
        <div className="pt-row">
          <span>Biển số</span>
          {t.partnerPlate ? <b>{t.partnerPlate}</b> : <Typography.Text type="warning">chưa nhập</Typography.Text>}
        </div>
        <div className="pt-row">
          <span>Tài xế</span>
          {t.partnerDriverName ? (
            <span>
              <b>{t.partnerDriverName}</b>
              {t.partnerDriverPhone && (
                <a href={`tel:${t.partnerDriverPhone}`} style={{ marginLeft: 8 }}>
                  {t.partnerDriverPhone}
                </a>
              )}
            </span>
          ) : (
            <Typography.Text type="warning">chưa nhập</Typography.Text>
          )}
        </div>
      </div>

      {signOpen && <SignBoard tripId={t.id} title={(b.signTitle || b.leaderName || b.passengers[0]?.fullName || '').trim()} subtitle={b.signSubtitle} lang={b.docLanguage} hasFile={!!b.signFileType} onClose={() => setSignOpen(false)} />}
    </Drawer>
  );
}
