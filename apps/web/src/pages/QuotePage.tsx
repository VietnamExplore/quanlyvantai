import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Flex, Spin } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { quoteStaff, routeText } from '../booking-utils';
import { useSettings } from '../components/common';
import { DOC_CSS, DocLangSwitch, PrintHeader, useDocLang } from '../components/PrintDoc';
import { docDate, docFooter, docMoney, docServiceName, docT, docTime, docVehicleName } from '../doc-i18n';
import type { Booking } from '../types';

export default function QuotePage() {
  const { id } = useParams();
  const settings = useSettings();
  const { data: b, isLoading } = useQuery({ queryKey: ['/bookings', Number(id)], queryFn: () => api<Booking>(`/bookings/${id}`) });
  const [lang, setLang] = useDocLang(b?.docLanguage);
  const t = docT(lang);

  useEffect(() => {
    if (b) document.title = `${lang === 'vi' ? 'Báo giá' : 'Quotation'} ${b.code}`;
  }, [b, lang]);

  if (isLoading || !b) {
    return (
      <Flex justify="center" style={{ padding: 48 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  const trips = b.trips.filter((x) => x.status !== 'HUY');
  const money = (v: number | string) => docMoney(v, lang);
  const amount = (v: number | string) => docMoney(v, lang, false);
  const hasAdjust = Number(b.discountAmount) > 0 || Number(b.vatPercent) > 0;
  const staff = quoteStaff(b);
  const footer = docFooter(settings, lang);
  const validUntil = b.quoteValidUntil && `${t('validUntil')} ${docDate(b.quoteValidUntil, lang)}.`;

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
                {t('date')}: {docDate(dayjs(), lang)}
              </div>
              <div>
                {t('staff')}: <b>{staff.fullName}</b>
              </div>
              {staff.phone && (
                <div>
                  {t('tel')}: {staff.phone}
                </div>
              )}
            </>
          }
        />

        <div className="doc-title">{t('quoteTitle')}</div>
        <div className="doc-subtitle">{t('quoteIntro')}</div>

        <dl className="doc-info">
          <dt>{t('to')}:</dt>
          <dd>{b.customer?.name ?? b.contactName}</dd>
          {b.customer && (
            <>
              <dt>{t('contact')}:</dt>
              <dd>{b.contactName}</dd>
            </>
          )}
          <dt>{t('phone')}:</dt>
          <dd>{b.contactPhone}</dd>
          {b.customer?.address && (
            <>
              <dt>{t('address')}:</dt>
              <dd>{b.customer.address}</dd>
            </>
          )}
          {b.customer?.taxCode && (
            <>
              <dt>{t('taxCode')}:</dt>
              <dd>{b.customer.taxCode}</dd>
            </>
          )}
        </dl>

        <table className="grid">
          <colgroup>
            <col style={{ width: '9mm' }} />
            <col />
            <col style={{ width: '32mm' }} />
            <col style={{ width: '28mm' }} />
            <col style={{ width: '30mm' }} />
          </colgroup>
          <thead>
            <tr>
              <th>{t('colNo')}</th>
              <th>{t('colService')}</th>
              <th>{t('colTime')}</th>
              <th>{t('colVehicle')}</th>
              <th>
                {t('colAmount')} ({lang === 'vi' ? 'đ' : 'VND'})
              </th>
            </tr>
          </thead>
          <tbody>
            {trips.map((x, i) => (
              <tr key={x.id}>
                <td className="c">{i + 1}</td>
                <td>
                  <b>{docServiceName(x.service, x.serviceType, lang)}</b>
                  <div>{routeText(x)}</div>
                  {x.flightNumber && (
                    <div className="muted small">
                      {t('flight')}: {x.flightNumber}
                    </div>
                  )}
                  {x.itinerary && <pre className="muted small">{x.itinerary}</pre>}
                  {x.surcharges.length > 0 && (
                    <div className="muted small">
                      {t('basePrice')}: {amount(x.unitPrice)}
                      {x.surcharges.map((s, k) => (
                        <div key={k}>
                          + {s.name}: {amount(s.amount)}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {docTime(x.pickupTime, lang)}
                  {x.days > 1 && (
                    <div className="muted small">
                      {x.days} {t('days')}
                    </div>
                  )}
                </td>
                <td>
                  {docVehicleName(x.vehicleType, lang)}
                  <div className="muted small">
                    {x.passengers} {t('pax')}
                  </div>
                </td>
                <td className="r">{amount(x.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="doc-totals">
          <tbody>
            {hasAdjust && (
              <tr>
                <td>{t('subtotal')}</td>
                <td className="r">{money(b.subtotal)}</td>
              </tr>
            )}
            {Number(b.discountAmount) > 0 && (
              <tr>
                <td>{t('discount')}</td>
                <td className="r">-{money(b.discountAmount)}</td>
              </tr>
            )}
            {Number(b.vatPercent) > 0 && (
              <tr>
                <td>
                  {t('vat')} {Number(b.vatPercent)}%
                </td>
                <td className="r">{money(b.vatAmount)}</td>
              </tr>
            )}
            <tr className="grand">
              <td>{t('grandTotal')}</td>
              <td className="r">{money(b.total)}</td>
            </tr>
            {Number(b.depositAmount) > 0 && (
              <tr>
                <td>{t('deposit')}</td>
                <td className="r">{money(b.depositAmount)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {b.notes && (
          <div className="doc-box">
            <pre>{b.notes}</pre>
          </div>
        )}
        {footer ? (
          <div className="doc-box">
            <b>{t('notes')}</b>
            <pre>{footer}</pre>
            {validUntil && <div style={{ marginTop: '1.5mm' }}>{validUntil}</div>}
          </div>
        ) : (
          validUntil && <div className="doc-box">{validUntil}</div>
        )}
        {settings.bankInfo && (
          <div className="doc-box">
            <b>{t('bank')}</b>
            <pre>{settings.bankInfo}</pre>
          </div>
        )}

        <div className="doc-sign">
          <div>
            <div className="role">{t('customerConfirm')}</div>
            <div className="hint">{t('signHint')}</div>
            <div className="space" />
          </div>
          <div>
            <div className="role">{t('companyRep')}</div>
            <div className="hint">{t('signHint')}</div>
            <div className="space" />
            <div>
              <b>{staff.fullName}</b>
            </div>
            {staff.phone && (
              <div className="small">
                {t('tel')}: {staff.phone}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
