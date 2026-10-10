import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Flex, QRCode, Spin } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { LEGAL_CSS, LegalHead, placeOf } from '../components/ContractDoc';
import { SignatureImage } from '../components/FieldParts';
import { DOC_CSS } from '../components/PrintDoc';
import { contractUrl } from '../contract';

type Driver = { fullName: string; phone: string | null; licenseClass: string | null } | null;

interface TripOrder {
  kind: 'TRIP';
  number: string;
  company: Record<string, string | undefined>;
  trip: {
    pickupTime: string;
    endTime: string;
    pickupAddress: string;
    dropoffAddress: string | null;
    itinerary: string | null;
    passengers: number;
    distanceKm: number | null;
    routeName: string | null;
    signoffName: string | null;
    signoffAt: string | null;
    signoffSvg: string | null;
    signoffNote: string | null;
    vehicleType: { name: string; seats: number };
    vehicle: { plateNumber: string } | null;
    driver: Driver;
    partner: { name: string } | null;
    partnerPlate: string | null;
    partnerDriverName: string | null;
    partnerDriverPhone: string | null;
    booking: { code: string; contactName: string; contactPhone: string; contract: { number: string; signedDate: string; token: string } | null };
  };
}

interface RunOrder {
  kind: 'RUN';
  number: string;
  company: Record<string, string | undefined>;
  run: {
    departAt: string;
    arriveAt: string;
    route: { code: string; name: string; stops: string[] };
    capacity: number;
    vehicleType: { name: string; seats: number };
    plate: string | null;
    driver: Driver;
    partner: { name: string } | null;
    passengers: number;
  };
}

const hm = (s: string) => dayjs(s).format('HH:mm');
const dm = (s: string) => dayjs(s).format('DD/MM/YYYY');

/** Lệnh vận chuyển (mẫu Phụ lục IV – TT 36/2024/TT-BGTVT): /transport-orders/trip/:id hoặc /transport-orders/run/:id */
export default function TransportOrderPage() {
  const { kind, id } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ['/transport-orders', kind, Number(id)],
    queryFn: () => api<TripOrder | RunOrder>(`/transport-orders/${kind === 'run' ? 'run' : 'trip'}/${id}`),
  });

  useEffect(() => {
    if (data) document.title = `Lệnh vận chuyển ${data.number}`;
  }, [data]);

  if (isLoading || !data) {
    return (
      <Flex justify="center" style={{ padding: 48 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  // Chuẩn hóa hai loại về cùng nội dung in
  const v =
    data.kind === 'RUN'
      ? {
          usage: 'tuyến cố định (xe ghép)',
          from: data.run.departAt,
          to: data.run.arriveAt,
          driver: data.run.driver,
          plate: data.run.plate,
          seats: data.run.capacity,
          vehicleType: data.run.vehicleType.name,
          start: data.run.route.stops[0] ?? '',
          end: data.run.route.stops[data.run.route.stops.length - 1] ?? '',
          routeCode: data.run.route.code,
          journey: data.run.route.stops.join(' – ') || data.run.route.name,
          passengers: data.run.passengers,
          partner: data.run.partner,
          contract: null,
          contact: null,
        }
      : {
          usage: 'theo hợp đồng',
          from: data.trip.pickupTime,
          to: data.trip.endTime,
          driver: data.trip.driver ?? (data.trip.partnerDriverName ? { fullName: data.trip.partnerDriverName, phone: data.trip.partnerDriverPhone, licenseClass: null } : null),
          plate: data.trip.vehicle?.plateNumber ?? data.trip.partnerPlate,
          seats: data.trip.vehicleType.seats,
          vehicleType: data.trip.vehicleType.name,
          start: data.trip.pickupAddress,
          end: data.trip.dropoffAddress ?? '',
          routeCode: data.trip.booking.code,
          journey: [data.trip.routeName, data.trip.itinerary, data.trip.distanceKm ? `${data.trip.distanceKm} km` : null].filter(Boolean).join(' · '),
          passengers: data.trip.passengers,
          partner: data.trip.partner,
          contract: data.trip.booking.contract,
          contact: `${data.trip.booking.contactName} – ${data.trip.booking.contactPhone}`,
        };
  const company = data.company;

  return (
    <>
      <style>{DOC_CSS + LEGAL_CSS + ORDER_CSS}</style>
      <Flex className="toolbar" justify="center" align="center" gap={8} wrap>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          In / Lưu PDF
        </Button>
        <Button onClick={() => window.close()}>Đóng</Button>
      </Flex>
      <div className="doc" lang="vi">
        <LegalHead company={company} number={data.number} />
        <div className="legal-place">{placeOf(company)}, ngày {dayjs().format('DD')} tháng {dayjs().format('MM')} năm {dayjs().format('YYYY')}</div>
        <div className="legal-title">LỆNH VẬN CHUYỂN</div>
        <div className="legal-sub" style={{ fontStyle: 'normal' }}>
          Dùng cho xe ô tô vận chuyển hành khách {v.usage}
          <br />
          Có giá trị từ ngày <b>{dm(v.from)}</b> đến ngày <b>{dm(v.to)}</b>
        </div>

        <div className="order-top">
          <div>
            <div>
              Cấp cho Lái xe 1: <b>{v.driver?.fullName ?? '…………………………'}</b> &nbsp; hạng GPLX: <b>{v.driver?.licenseClass ?? '……'}</b>
              {v.driver?.phone && <span className="muted"> · ĐT {v.driver.phone}</span>}
            </div>
            <div>Lái xe 2: …………………………………… hạng GPLX: ……</div>
            <div>Nhân viên phục vụ trên xe: ……………………………………</div>
            <div>
              Biển số đăng ký: <b>{v.plate ?? '…………'}</b> &nbsp; Số ghế: <b>{v.seats}</b> &nbsp; Loại xe: <b>{v.vehicleType}</b>
            </div>
            {v.partner && <div>Đơn vị thực hiện (nhà xe đối tác): {v.partner.name}</div>}
            <div>
              Điểm đi, điểm đến: <b>{v.start}</b>
              {v.end && (
                <>
                  {' '}
                  → <b>{v.end}</b>
                </>
              )}{' '}
              &nbsp; {data.kind === 'RUN' ? 'Mã số tuyến' : 'Mã booking'}: <b>{v.routeCode}</b>
            </div>
            {v.journey && <div>Hành trình: {v.journey}</div>}
            {v.contract && (
              <div>
                Kèm theo Hợp đồng vận chuyển số <b>{v.contract.number}</b> ngày {dm(v.contract.signedDate)}
              </div>
            )}
            {v.contact && <div>Người liên hệ: {v.contact}</div>}
          </div>
          <div className="order-boss">
            <div className="role">Thủ trưởng đơn vị</div>
            <div className="hint">(Ký tên và đóng dấu)</div>
            <div className="space" />
            <b>{company.companyRepresentative}</b>
          </div>
        </div>

        <table className="grid order-grid">
          <colgroup>
            <col style={{ width: '22mm' }} />
            <col />
            <col style={{ width: '38mm' }} />
            <col style={{ width: '18mm' }} />
            <col style={{ width: '38mm' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Lượt xe thực hiện</th>
              <th>Điểm (bến xe) đi, đến</th>
              <th>Giờ xe chạy</th>
              <th>Số khách</th>
              <th>Bến xe / điểm đón (ký tên, đóng dấu)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td rowSpan={2} className="c">
                <b>Lượt đi</b>
              </td>
              <td>Đi: {v.start}</td>
              <td>
                Xuất bến {hm(v.from)} ngày {dm(v.from)}
              </td>
              <td rowSpan={2} className="c">
                {v.passengers}
              </td>
              <td rowSpan={2} />
            </tr>
            <tr>
              <td>Đến: {v.end}</td>
              <td>
                Đến bến {hm(v.to)} ngày {dm(v.to)}
              </td>
            </tr>
            <tr>
              <td rowSpan={2} className="c">
                <b>Lượt về</b>
              </td>
              <td>Đi: </td>
              <td>Xuất bến ……giờ ngày ……</td>
              <td rowSpan={2} />
              <td rowSpan={2} />
            </tr>
            <tr>
              <td>Đến: </td>
              <td>Đến bến ……giờ ngày ……</td>
            </tr>
          </tbody>
        </table>

        <div className="order-sign">
          {['Lái xe 1', 'Lái xe 2', 'Nhân viên phục vụ trên xe'].map((r, i) => (
            <div key={r}>
              <div className="role">{r}</div>
              <div className="hint">(Ký và ghi rõ họ tên)</div>
              <div className="space" />
              {i === 0 && <b>{v.driver?.fullName}</b>}
            </div>
          ))}
        </div>

        {data.kind === 'TRIP' && data.trip.signoffAt && data.trip.signoffSvg && (
          <div className="qr-box" style={{ alignItems: 'flex-start' }}>
            <div>
              <b>Khách xác nhận hoàn thành chuyến (ký điện tử trên app lái xe):</b> {data.trip.signoffName} · {dayjs(data.trip.signoffAt).format('HH:mm DD/MM/YYYY')}
              {data.trip.signoffNote && <div>Góp ý: {data.trip.signoffNote}</div>}
              <SignatureImage svg={data.trip.signoffSvg} height={60} />
            </div>
          </div>
        )}

        {v.contract && (
          <div className="qr-box">
            <QRCode value={contractUrl(v.contract.token)} size={80} bordered={false} type="svg" />
            <div>Quét mã để xem hợp đồng vận chuyển điện tử và danh sách hành khách kèm theo.</div>
          </div>
        )}
      </div>
    </>
  );
}

const ORDER_CSS = `
  .order-top { display: flex; gap: 6mm; margin: 2mm 0 3mm; line-height: 1.7; }
  .order-top > div:first-child { flex: 1; }
  .order-boss { width: 48mm; text-align: center; }
  .order-boss .role, .order-sign .role { font-weight: 700; text-transform: uppercase; }
  .order-boss .hint, .order-sign .hint { font-style: italic; color: #666; font-size: 10.5pt; }
  .order-boss .space { height: 20mm; }
  .order-grid td { height: 10mm; }
  .order-sign { display: flex; justify-content: space-between; text-align: center; margin-top: 6mm; page-break-inside: avoid; }
  .order-sign > div { width: 32%; }
  .order-sign .space { height: 20mm; }
`;
