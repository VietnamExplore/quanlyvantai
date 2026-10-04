import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Flex, Spin } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { fmtTime, quoteStaff, routeText } from '../booking-utils';
import { formatVnd, useSettings } from '../components/common';
import { DOC_CSS, PrintHeader } from '../components/PrintDoc';
import type { Booking } from '../types';

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
  const hasAdjust = Number(b.discountAmount) > 0 || Number(b.vatPercent) > 0;

  return (
    <>
      <style>{DOC_CSS}</style>
      <Flex className="toolbar" justify="center" gap={8}>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          In / Lưu PDF
        </Button>
        <Button onClick={() => window.close()}>Đóng</Button>
      </Flex>

      <div className="doc">
        <PrintHeader
          settings={settings}
          meta={
            <>
              <div>
                Số: <b>{b.code}</b>
              </div>
              {b.customerRef && (
                <div>
                  Mã của Quý khách: <b>{b.customerRef}</b>
                </div>
              )}
              <div>Ngày: {dayjs().format('DD/MM/YYYY')}</div>
              <div>
                NV báo giá: <b>{quoteStaff(b).fullName}</b>
              </div>
              {quoteStaff(b).phone && <div>ĐT: {quoteStaff(b).phone}</div>}
            </>
          }
        />

        <div className="doc-title">BÁO GIÁ DỊCH VỤ VẬN CHUYỂN</div>
        <div className="doc-subtitle">Kính gửi Quý khách báo giá dịch vụ xe như sau</div>

        <dl className="doc-info">
          <dt>Kính gửi:</dt>
          <dd>{b.customer?.name ?? b.contactName}</dd>
          {b.customer && (
            <>
              <dt>Người liên hệ:</dt>
              <dd>{b.contactName}</dd>
            </>
          )}
          <dt>Điện thoại:</dt>
          <dd>{b.contactPhone}</dd>
          {b.customer?.address && (
            <>
              <dt>Địa chỉ:</dt>
              <dd>{b.customer.address}</dd>
            </>
          )}
          {b.customer?.taxCode && (
            <>
              <dt>MST:</dt>
              <dd>{b.customer.taxCode}</dd>
            </>
          )}
        </dl>

        <table className="grid">
          <colgroup>
            <col style={{ width: '9mm' }} />
            <col />
            <col style={{ width: '30mm' }} />
            <col style={{ width: '27mm' }} />
            <col style={{ width: '30mm' }} />
          </colgroup>
          <thead>
            <tr>
              <th>STT</th>
              <th>Dịch vụ / Hành trình</th>
              <th>Thời gian</th>
              <th>Loại xe</th>
              <th>Thành tiền (đ)</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t, i) => (
              <tr key={t.id}>
                <td className="c">{i + 1}</td>
                <td>
                  <b>{t.service?.name ?? t.serviceType}</b>
                  <div>{routeText(t)}</div>
                  {t.flightNumber && <div className="muted small">Chuyến bay: {t.flightNumber}</div>}
                  {t.itinerary && <pre className="muted small">{t.itinerary}</pre>}
                  {t.surcharges.length > 0 && (
                    <div className="muted small">
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
                  {t.days > 1 && <div className="muted small">{t.days} ngày</div>}
                </td>
                <td>
                  {t.vehicleType.name}
                  <div className="muted small">{t.passengers} khách</div>
                </td>
                <td className="r">{vnd(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="doc-totals">
          <tbody>
            {hasAdjust && (
              <tr>
                <td>Tạm tính</td>
                <td className="r">{vnd(b.subtotal)} đ</td>
              </tr>
            )}
            {Number(b.discountAmount) > 0 && (
              <tr>
                <td>Giảm giá</td>
                <td className="r">-{vnd(b.discountAmount)} đ</td>
              </tr>
            )}
            {Number(b.vatPercent) > 0 && (
              <tr>
                <td>VAT {Number(b.vatPercent)}%</td>
                <td className="r">{vnd(b.vatAmount)} đ</td>
              </tr>
            )}
            <tr className="grand">
              <td>TỔNG CỘNG</td>
              <td className="r">{vnd(b.total)} đ</td>
            </tr>
            {Number(b.depositAmount) > 0 && (
              <tr>
                <td>Đặt cọc</td>
                <td className="r">{vnd(b.depositAmount)} đ</td>
              </tr>
            )}
          </tbody>
        </table>

        {b.notes && (
          <div className="doc-box">
            <pre>{b.notes}</pre>
          </div>
        )}
        {settings.quoteFooter && (
          <div className="doc-box">
            <b>Ghi chú</b>
            <pre>{settings.quoteFooter}</pre>
            {b.quoteValidUntil && <div style={{ marginTop: '1.5mm' }}>Báo giá có hiệu lực đến ngày {dayjs(b.quoteValidUntil).format('DD/MM/YYYY')}.</div>}
          </div>
        )}
        {!settings.quoteFooter && b.quoteValidUntil && (
          <div className="doc-box">Báo giá có hiệu lực đến ngày {dayjs(b.quoteValidUntil).format('DD/MM/YYYY')}.</div>
        )}
        {settings.bankInfo && (
          <div className="doc-box">
            <b>Thông tin chuyển khoản</b>
            <pre>{settings.bankInfo}</pre>
          </div>
        )}

        <div className="doc-sign">
          <div>
            <div className="role">Xác nhận của khách hàng</div>
            <div className="hint">(Ký, ghi rõ họ tên)</div>
            <div className="space" />
          </div>
          <div>
            <div className="role">Đại diện công ty</div>
            <div className="hint">(Ký, ghi rõ họ tên)</div>
            <div className="space" />
            <div>
              <b>{quoteStaff(b).fullName}</b>
            </div>
            {quoteStaff(b).phone && <div className="small">ĐT: {quoteStaff(b).phone}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
