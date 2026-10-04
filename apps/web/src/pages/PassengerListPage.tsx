import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Flex, Spin } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { routeText } from '../booking-utils';
import { useSettings } from '../components/common';
import { DOC_CSS, DocLangSwitch, PrintHeader, useDocLang } from '../components/PrintDoc';
import { docDate, docServiceName, docT, docTime, docVehicleName, localizeBooking } from '../doc-i18n';
import type { Booking } from '../types';

export default function PassengerListPage() {
  const { id } = useParams();
  const settings = useSettings();
  const { data: raw, isLoading } = useQuery({ queryKey: ['/bookings', Number(id)], queryFn: () => api<Booking>(`/bookings/${id}`) });
  const [lang, setLang] = useDocLang(raw?.docLanguage);
  // Nội dung đã dịch (điểm đón / trả, lịch trình…) theo ngôn ngữ đang in
  const b = useMemo(() => raw && localizeBooking(raw, lang), [raw, lang]);
  const t = docT(lang);

  useEffect(() => {
    if (b) document.title = `${lang === 'vi' ? 'Danh sách hành khách' : 'Passenger list'} ${b.code}`;
  }, [b, lang]);

  if (isLoading || !b) {
    return (
      <Flex justify="center" style={{ padding: 48 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  const trips = b.trips.filter((x) => x.status !== 'HUY');

  return (
    <>
      <style>{DOC_CSS}</style>
      <Flex className="toolbar" justify="center" align="center" gap={8} wrap>
        <DocLangSwitch value={lang} onChange={setLang} />
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          In / Lưu PDF
        </Button>
        <Button onClick={() => window.close()}>Đóng</Button>
      </Flex>

      <div className="doc" lang={lang}>
        <PrintHeader
          settings={settings}
          lang={lang}
          meta={
            <>
              <div>
                {t('no')}: <b>{b.code}</b>
              </div>
              {b.customerRef && (
                <div>
                  {t('yourRef')}: <b>{b.customerRef}</b>
                </div>
              )}
              <div>
                {t('printDate')}: {docDate(dayjs(), lang)}
              </div>
            </>
          }
        />

        <div className="doc-title">{t('paxTitle')}</div>
        <div className="doc-subtitle">
          {t('paxCustomer')}: <b style={{ color: '#1a1a1a' }}>{b.customer?.name ?? b.contactName}</b> · {t('paxContact')}: {b.contactName} – {b.contactPhone}
        </div>

        <h3>{t('tripInfo')}</h3>
        <table className="grid">
          <colgroup>
            <col style={{ width: '9mm' }} />
            <col style={{ width: '32mm' }} />
            <col />
            <col style={{ width: '44mm' }} />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>{t('colTime')}</th>
              <th>{t('colRoute')}</th>
              <th>{t('colVehicleDriver')}</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((x, i) => (
              <tr key={x.id}>
                <td className="c">{i + 1}</td>
                <td>{docTime(x.pickupTime, lang)}</td>
                <td>
                  {docServiceName(x.service, x.serviceType, lang)}: {routeText(x)}
                  {x.flightNumber && (
                    <span className="muted small">
                      {' '}
                      · {t('flight')} {x.flightNumber}
                    </span>
                  )}
                </td>
                <td>
                  {x.vehicle ? (
                    <>
                      {x.vehicle.plateNumber}
                      {x.driver && <div className="muted small">{x.driver.fullName}</div>}
                    </>
                  ) : x.partner ? (
                    <>
                      {x.partnerPlate ?? docVehicleName(x.vehicleType, lang)}
                      <div className="muted small">{[x.partnerDriverName, x.partnerDriverPhone].filter(Boolean).join(' – ') || x.partner.name}</div>
                    </>
                  ) : (
                    <span className="muted">
                      {docVehicleName(x.vehicleType, lang)} ({t('notDispatched')})
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>
          {t('paxListTitle')} ({b.passengers.length} {t('persons')})
        </h3>
        <table className="grid">
          <colgroup>
            <col style={{ width: '10mm' }} />
            <col />
            <col style={{ width: '15mm' }} />
            <col style={{ width: '16mm' }} />
            <col style={{ width: '30mm' }} />
            <col style={{ width: '20mm' }} />
            <col style={{ width: '24mm' }} />
            <col style={{ width: '22mm' }} />
          </colgroup>
          <thead>
            <tr>
              <th>{t('colNo')}</th>
              <th>{t('fullName')}</th>
              <th>{t('gender')}</th>
              <th>{t('birthYear')}</th>
              <th>{t('idNumber')}</th>
              <th>{t('nationality')}</th>
              <th>{t('paxPhone')}</th>
              <th>{t('notes')}</th>
            </tr>
          </thead>
          <tbody>
            {b.passengers.map((p, i) => (
              <tr key={p.id ?? i}>
                <td className="c">{i + 1}</td>
                <td>{p.fullName}</td>
                <td className="c">{p.gender === 'NAM' ? t('male') : p.gender === 'NU' ? t('female') : ''}</td>
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
            <div className="role">{t('driver')}</div>
            <div className="hint">{t('signHint')}</div>
            <div className="space" />
          </div>
          <div>
            <div className="role">{t('carrierRep')}</div>
            <div className="hint">{t('signStampHint')}</div>
            <div className="space" />
          </div>
        </div>
      </div>
    </>
  );
}
