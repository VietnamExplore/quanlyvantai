import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Flex, Spin } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { fmtTime, routeText } from '../booking-utils';
import { useSettings } from '../components/common';
import { DOC_CSS, PrintHeader } from '../components/PrintDoc';
import type { Booking } from '../types';

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
                  Mã của khách: <b>{b.customerRef}</b>
                </div>
              )}
              <div>Ngày in: {dayjs().format('DD/MM/YYYY')}</div>
            </>
          }
        />

        <div className="doc-title">DANH SÁCH HÀNH KHÁCH</div>
        <div className="doc-subtitle">
          Đơn vị / khách hàng: <b style={{ color: '#1a1a1a' }}>{b.customer?.name ?? b.contactName}</b> · Liên hệ: {b.contactName} – {b.contactPhone}
        </div>

        <h3>Thông tin chuyến xe</h3>
        <table className="grid">
          <colgroup>
            <col style={{ width: '9mm' }} />
            <col style={{ width: '30mm' }} />
            <col />
            <col style={{ width: '44mm' }} />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Thời gian</th>
              <th>Hành trình</th>
              <th>Xe / Lái xe</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t, i) => (
              <tr key={t.id}>
                <td className="c">{i + 1}</td>
                <td>{fmtTime(t.pickupTime)}</td>
                <td>
                  {t.service?.name ?? t.serviceType}: {routeText(t)}
                  {t.flightNumber && <span className="muted small"> · Chuyến bay {t.flightNumber}</span>}
                </td>
                <td>
                  {t.vehicle ? (
                    <>
                      {t.vehicle.plateNumber}
                      {t.driver && <div className="muted small">{t.driver.fullName}</div>}
                    </>
                  ) : t.partner ? (
                    <>
                      {t.partnerPlate ?? t.vehicleType.name}
                      <div className="muted small">{[t.partnerDriverName, t.partnerDriverPhone].filter(Boolean).join(' – ') || t.partner.name}</div>
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
        <table className="grid">
          <colgroup>
            <col style={{ width: '10mm' }} />
            <col />
            <col style={{ width: '14mm' }} />
            <col style={{ width: '15mm' }} />
            <col style={{ width: '30mm' }} />
            <col style={{ width: '20mm' }} />
            <col style={{ width: '24mm' }} />
            <col style={{ width: '22mm' }} />
          </colgroup>
          <thead>
            <tr>
              <th>STT</th>
              <th>Họ và tên</th>
              <th>Giới tính</th>
              <th>Năm sinh</th>
              <th>CCCD / Hộ chiếu</th>
              <th>Quốc tịch</th>
              <th>SĐT</th>
              <th>Ghi chú</th>
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

        <div className="doc-sign">
          <div>
            <div className="role">Lái xe</div>
            <div className="hint">(Ký, ghi rõ họ tên)</div>
            <div className="space" />
          </div>
          <div>
            <div className="role">Đại diện đơn vị vận tải</div>
            <div className="hint">(Ký, ghi rõ họ tên, đóng dấu)</div>
            <div className="space" />
          </div>
        </div>
      </div>
    </>
  );
}
