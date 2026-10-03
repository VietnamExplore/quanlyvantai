import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Flex, Spin } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { fmtTime, routeText } from '../booking-utils';
import { formatVnd, useSettings } from '../components/common';
import type { Booking } from '../types';

const css = `
  .quote { max-width: 820px; margin: 24px auto; background: #fff; color: #222; padding: 40px 48px; font-size: 14px; line-height: 1.5;
           box-shadow: 0 2px 12px rgba(0,0,0,.08); font-family: 'Times New Roman', serif; }
  .quote h1 { text-align: center; font-size: 22px; margin: 24px 0 4px; letter-spacing: .5px; }
  .quote table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  .quote th, .quote td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
  .quote th { background: #f0f0f0; }
  .quote .r { text-align: right; white-space: nowrap; }
  .quote .muted { color: #666; font-size: 13px; }
  .quote .totals td { border: none; padding: 2px 8px; }
  .quote pre { font-family: inherit; white-space: pre-wrap; margin: 0; }
  .toolbar { position: sticky; top: 0; padding: 12px; background: #f5f5f5; z-index: 1; }
  @media (max-width: 700px) { .quote { padding: 20px 16px; margin: 0; } }
  @media print { .toolbar { display: none; } body { background: #fff !important; } .quote { box-shadow: none; margin: 0; max-width: none; padding: 0; } }
`;

export default function QuotePage() {
  const { id } = useParams();
  const settings = useSettings();
  const { data: b, isLoading } = useQuery({ queryKey: ['/bookings', Number(id)], queryFn: () => api<Booking>(`/bookings/${id}`) });

  useEffect(() => {
    if (b) document.title = `Báo giá ${b.code}`;
  }, [b]);

  if (isLoading || !b) {
    return (
      <Flex justify="center" style={{ padding: 48 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  const trips = b.trips.filter((t) => t.status !== 'HUY');
  const vnd = (v: number | string) => formatVnd(v);

  return (
    <>
      <style>{css}</style>
      <Flex className="toolbar" justify="center" gap={8}>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          In / Lưu PDF
        </Button>
        <Button onClick={() => window.close()}>Đóng</Button>
      </Flex>

      <div className="quote">
        <div>
          <b style={{ fontSize: 16 }}>{settings.companyName}</b>
          {settings.companyAddress && <div>Địa chỉ: {settings.companyAddress}</div>}
          <div>
            {settings.companyPhone && <>Hotline: {settings.companyPhone}</>}
            {settings.companyEmail && <> · Email: {settings.companyEmail}</>}
            {settings.companyTaxCode && <> · MST: {settings.companyTaxCode}</>}
          </div>
        </div>

        <h1>BÁO GIÁ DỊCH VỤ VẬN CHUYỂN</h1>
        <div style={{ textAlign: 'center' }} className="muted">
          Số: {b.code} · Ngày {dayjs().format('DD/MM/YYYY')}
        </div>

        <div style={{ marginTop: 20 }}>
          <div>
            <b>Kính gửi:</b> {b.customer?.name ?? b.contactName}
          </div>
          {b.customer && <div>Người liên hệ: {b.contactName}</div>}
          <div>Điện thoại: {b.contactPhone}</div>
          {b.customer?.address && <div>Địa chỉ: {b.customer.address}</div>}
          {b.customer?.taxCode && <div>MST: {b.customer.taxCode}</div>}
          <p>Công ty chúng tôi xin trân trọng gửi Quý khách báo giá dịch vụ xe như sau:</p>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>STT</th>
              <th>Dịch vụ / Hành trình</th>
              <th style={{ width: 130 }}>Thời gian</th>
              <th style={{ width: 110 }}>Loại xe</th>
              <th style={{ width: 120 }} className="r">Thành tiền (đ)</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t, i) => (
              <tr key={t.id}>
                <td style={{ textAlign: 'center' }}>{i + 1}</td>
                <td>
                  <b>{t.service?.name ?? t.serviceType}</b>
                  <div>{routeText(t)}</div>
                  {t.flightNumber && <div className="muted">Chuyến bay: {t.flightNumber}</div>}
                  {t.itinerary && <pre className="muted">{t.itinerary}</pre>}
                  {t.surcharges.length > 0 && (
                    <div className="muted">
                      Giá xe: {vnd(t.unitPrice)}
                      {t.surcharges.map((s, k) => (
                        <div key={k}>
                          + {s.name}: {vnd(s.amount)}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {fmtTime(t.pickupTime)}
                  {t.days > 1 && <div className="muted">{t.days} ngày</div>}
                </td>
                <td>
                  {t.vehicleType.name}
                  <div className="muted">{t.passengers} khách</div>
                </td>
                <td className="r">{vnd(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="totals" style={{ width: 'auto', marginLeft: 'auto' }}>
          <tbody>
            {(Number(b.discountAmount) > 0 || Number(b.vatPercent) > 0) && (
              <tr>
                <td>Tạm tính:</td>
                <td className="r">{vnd(b.subtotal)} đ</td>
              </tr>
            )}
            {Number(b.discountAmount) > 0 && (
              <tr>
                <td>Giảm giá:</td>
                <td className="r">-{vnd(b.discountAmount)} đ</td>
              </tr>
            )}
            {Number(b.vatPercent) > 0 && (
              <tr>
                <td>VAT {Number(b.vatPercent)}%:</td>
                <td className="r">{vnd(b.vatAmount)} đ</td>
              </tr>
            )}
            <tr>
              <td>
                <b>TỔNG CỘNG:</b>
              </td>
              <td className="r">
                <b style={{ fontSize: 16 }}>{vnd(b.total)} đ</b>
              </td>
            </tr>
            {Number(b.depositAmount) > 0 && (
              <tr>
                <td>Đặt cọc:</td>
                <td className="r">{vnd(b.depositAmount)} đ</td>
              </tr>
            )}
          </tbody>
        </table>

        {b.notes && <pre style={{ marginTop: 12 }}>{b.notes}</pre>}
        {settings.quoteFooter && (
          <div style={{ marginTop: 16 }}>
            <b>Ghi chú:</b>
            <pre>{settings.quoteFooter}</pre>
          </div>
        )}
        {b.quoteValidUntil && <div style={{ marginTop: 8 }}>Báo giá có hiệu lực đến ngày {dayjs(b.quoteValidUntil).format('DD/MM/YYYY')}.</div>}
        {settings.bankInfo && (
          <div style={{ marginTop: 8 }}>
            <b>Thông tin chuyển khoản:</b>
            <pre>{settings.bankInfo}</pre>
          </div>
        )}

        <Flex justify="space-between" style={{ marginTop: 40, textAlign: 'center' }}>
          <div style={{ width: '45%' }}>
            <b>XÁC NHẬN CỦA KHÁCH HÀNG</b>
          </div>
          <div style={{ width: '45%' }}>
            <b>ĐẠI DIỆN CÔNG TY</b>
            <div className="muted">{b.salesUser?.fullName ?? b.createdBy.fullName}</div>
          </div>
        </Flex>
        <div style={{ height: 80 }} />
      </div>
    </>
  );
}
