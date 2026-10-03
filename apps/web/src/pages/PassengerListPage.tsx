import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Flex, Spin } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { fmtTime, routeText } from '../booking-utils';
import { useSettings } from '../components/common';
import type { Booking } from '../types';

const css = `
  .plist { max-width: 820px; margin: 24px auto; background: #fff; color: #111; padding: 32px 40px; font-size: 13.5px; line-height: 1.45;
           box-shadow: 0 2px 12px rgba(0,0,0,.08); font-family: 'Times New Roman', serif; }
  .plist h1 { text-align: center; font-size: 20px; margin: 18px 0 2px; }
  .plist table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; }
  .plist th, .plist td { border: 1px solid #777; padding: 4px 6px; vertical-align: top; }
  .plist th { background: #f0f0f0; font-weight: 700; }
  .plist .c { text-align: center; }
  .plist .muted { color: #555; }
  .plist h3 { font-size: 14px; margin: 14px 0 0; }
  .toolbar { position: sticky; top: 0; padding: 12px; background: #f5f5f5; z-index: 1; }
  @media (max-width: 700px) { .plist { padding: 16px; margin: 0; } }
  @media print {
    @page { size: A4 portrait; margin: 12mm; }
    .toolbar { display: none; } body { background: #fff !important; }
    .plist { box-shadow: none; margin: 0; max-width: none; padding: 0; }
    tr { page-break-inside: avoid; }
  }
`;

export default function PassengerListPage() {
  const { id } = useParams();
  const settings = useSettings();
  const { data: b, isLoading } = useQuery({ queryKey: ['/bookings', Number(id)], queryFn: () => api<Booking>(`/bookings/${id}`) });

  useEffect(() => {
    if (b) document.title = `Danh sách hành khách ${b.code}`;
  }, [b]);

  if (isLoading || !b) {
    return (
      <Flex justify="center" style={{ padding: 48 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  const trips = b.trips.filter((t) => t.status !== 'HUY');

  return (
    <>
      <style>{css}</style>
      <Flex className="toolbar" justify="center" gap={8}>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          In / Lưu PDF
        </Button>
        <Button onClick={() => window.close()}>Đóng</Button>
      </Flex>

      <div className="plist">
        <Flex justify="space-between">
          <div>
            <b>{settings.companyName}</b>
            {settings.companyAddress && <div className="muted">{settings.companyAddress}</div>}
            {settings.companyPhone && <div className="muted">Hotline: {settings.companyPhone}</div>}
          </div>
          <div style={{ textAlign: 'right' }} className="muted">
            Số: {b.code}
            <br />
            Ngày in: {dayjs().format('DD/MM/YYYY')}
          </div>
        </Flex>

        <h1>DANH SÁCH HÀNH KHÁCH</h1>
        <div className="c muted">
          Đơn vị / khách hàng: <b style={{ color: '#111' }}>{b.customer?.name ?? b.contactName}</b> · Liên hệ: {b.contactName} – {b.contactPhone}
        </div>

        <h3>Thông tin chuyến xe</h3>
        <table>
          <thead>
            <tr>
              <th className="c" style={{ width: 30 }}>
                #
              </th>
              <th style={{ width: 120 }}>Thời gian</th>
              <th>Hành trình</th>
              <th style={{ width: 170 }}>Xe / Lái xe</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t, i) => (
              <tr key={t.id}>
                <td className="c">{i + 1}</td>
                <td>{fmtTime(t.pickupTime)}</td>
                <td>
                  {t.service?.name ?? t.serviceType}: {routeText(t)}
                  {t.flightNumber && <span className="muted"> · Chuyến bay {t.flightNumber}</span>}
                </td>
                <td>
                  {t.vehicle ? (
                    <>
                      {t.vehicle.plateNumber}
                      {t.driver && <div className="muted">{t.driver.fullName}</div>}
                    </>
                  ) : t.partner ? (
                    <>
                      {t.partnerPlate ?? t.vehicleType.name}
                      <div className="muted">{[t.partnerDriverName, t.partnerDriverPhone].filter(Boolean).join(' – ') || t.partner.name}</div>
                    </>
                  ) : (
                    <span className="muted">{t.vehicleType.name} (chưa điều xe)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Danh sách hành khách ({b.passengers.length} người)</h3>
        <table>
          <thead>
            <tr>
              <th className="c" style={{ width: 34 }}>
                STT
              </th>
              <th>Họ và tên</th>
              <th className="c" style={{ width: 54 }}>
                Giới tính
              </th>
              <th className="c" style={{ width: 54 }}>
                Năm sinh
              </th>
              <th style={{ width: 120 }}>CCCD / Hộ chiếu</th>
              <th style={{ width: 80 }}>Quốc tịch</th>
              <th style={{ width: 96 }}>SĐT</th>
              <th style={{ width: 100 }}>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {b.passengers.map((p, i) => (
              <tr key={p.id ?? i}>
                <td className="c">{i + 1}</td>
                <td>{p.fullName}</td>
                <td className="c">{p.gender === 'NAM' ? 'Nam' : p.gender === 'NU' ? 'Nữ' : ''}</td>
                <td className="c">{p.birthYear ?? ''}</td>
                <td>{p.idNumber ?? ''}</td>
                <td>{p.nationality ?? ''}</td>
                <td>{p.phone ?? ''}</td>
                <td>{p.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Flex justify="space-between" style={{ marginTop: 28, textAlign: 'center' }}>
          <div style={{ width: '45%' }}>
            <b>LÁI XE</b>
            <div className="muted">(Ký, ghi rõ họ tên)</div>
          </div>
          <div style={{ width: '45%' }}>
            <b>ĐẠI DIỆN ĐƠN VỊ VẬN TẢI</b>
            <div className="muted">(Ký, ghi rõ họ tên, đóng dấu)</div>
          </div>
        </Flex>
        <div style={{ height: 70 }} />
      </div>
    </>
  );
}
