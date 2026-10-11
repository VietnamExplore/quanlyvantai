import { QRCode } from 'antd';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { contractUrl, DEFAULT_CONTRACT_TERMS, DEFAULT_CONTRACT_TERMS_EN, moneyInWords, moneyInWordsEn, type ContractData, type TransportContract } from '../contract';

/** Kiểu trình bày văn bản hành chính: quốc hiệu, điều khoản, phụ lục ngắt trang (bổ sung cho DOC_CSS) */
export const LEGAL_CSS = `
  .legal-head { display: flex; justify-content: space-between; gap: 6mm; text-align: center; font-size: 11.5pt; line-height: 1.35; }
  .legal-head .unit { width: 46%; }
  .legal-head .unit .name { font-weight: 700; text-transform: uppercase; }
  .legal-head .nation { width: 54%; }
  .legal-head .nation .l1 { font-weight: 700; }
  .legal-head .nation .l2 { font-weight: 700; display: inline-block; border-bottom: 0.3mm solid #1a1a1a; padding-bottom: .5mm; }
  .legal-place { text-align: right; font-style: italic; margin: 3mm 0 0; }
  .legal-title { text-align: center; font-size: 16pt; font-weight: 700; margin: 6mm 0 0; }
  .legal-sub { text-align: center; font-style: italic; margin: 1mm 0 4mm; }
  .legal-basis { font-style: italic; font-size: 11.5pt; margin: 0 0 3mm; }
  .legal-basis > div::before { content: '- '; }
  .doc h4 { font-size: 12.5pt; margin: 4mm 0 1.5mm; text-transform: uppercase; }
  .party { display: grid; grid-template-columns: 50mm 1fr; gap: .6mm 3mm; margin-bottom: 2mm; }
  .party dt { color: #333; }
  .party dd { margin: 0; }
  .party .blank { color: #999; letter-spacing: .3mm; }
  .terms { white-space: pre-wrap; text-align: justify; }
  .terms .art { font-weight: 700; display: block; margin-top: 3mm; }
  .qr-box { display: flex; gap: 3mm; align-items: center; font-size: 9.5pt; color: #444; margin-top: 4mm; page-break-inside: avoid; }
  .e-accepted { color: #237804; font-weight: 600; font-size: 10.5pt; }
  .page-break { page-break-before: always; break-before: page; height: 0; }
  /* Song ngữ: tiếng Anh in nghiêng, màu xám, nhỏ hơn */
  .en { font-style: italic; color: #555; font-weight: 400; text-transform: none; letter-spacing: 0; }
  .en-block { display: block; font-size: .9em; }
  .en-inline { font-size: .88em; }
  .legal-title .en-block { font-size: 12.5pt; font-weight: 700; color: #444; }
  .bi-para { margin-bottom: 1.5mm; }
  @media (max-width: 820px) {
    .legal-head { flex-direction: column; gap: 3mm; }
    .legal-head .unit, .legal-head .nation { width: auto; }
    .party { grid-template-columns: 38% 1fr; }
  }
  @media screen { .page-break { height: 8mm; border-top: 1px dashed #c0c6cf; margin-top: 10mm; } }
`;

const fmtMoney = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;
const fmtDT = (s: string) => dayjs(s).format('HH:mm DD/MM/YYYY');
const dateLong = (s: string | Date) => {
  const d = dayjs(s);
  return `ngày ${d.format('DD')} tháng ${d.format('MM')} năm ${d.format('YYYY')}`;
};
/** Dịch các cách thanh toán thường gặp; câu khác giữ nguyên */
const payEn = (vi: string) => {
  const t = vi.toLowerCase();
  if (/chuyển khoản/.test(t) && /tiền mặt/.test(t)) return 'Bank transfer or cash';
  if (/^chuyển khoản$/.test(t.trim())) return 'Bank transfer';
  if (/^tiền mặt$/.test(t.trim())) return 'Cash';
  return vi;
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dateEn = (s: string | Date) => {
  const d = dayjs(s);
  return `${MONTHS[d.month()]} ${d.date()}, ${d.year()}`;
};

/** Ghép 2 chữ cuối của tên công ty bằng dấu cách không ngắt dòng: xuống dòng thì tên thương hiệu (vd "VIETNAM EXPLORE") luôn nằm cùng một hàng */
const keepBrand = (name: string) => {
  const w = name.trim().split(/\s+/);
  return w.length > 2 ? [...w.slice(0, -2), w.slice(-2).join(' ')].join(' ') : name;
};

/** Song ngữ: tiếng Anh xuống dòng (block) hoặc sau dấu "/" (inline); bản tiếng Việt chỉ hiện phần tiếng Việt */
function T({ vi, en, bi, inline }: { vi: ReactNode; en: ReactNode; bi?: boolean; inline?: boolean }) {
  if (!bi) return <>{vi}</>;
  return inline ? (
    <>
      {vi} <span className="en en-inline">/ {en}</span>
    </>
  ) : (
    <>
      {vi}
      <span className="en en-block">{en}</span>
    </>
  );
}

/** Đầu văn bản: tên đơn vị + số | quốc hiệu, tiêu ngữ */
export function LegalHead({ company, number, bi }: { company: ContractData['company']; number?: string; bi?: boolean }) {
  return (
    <div className="legal-head">
      <div className="unit">
        <div className="name">{keepBrand(company.companyName || 'TÊN ĐƠN VỊ')}</div>
        {number && (
          <div>
            <T bi={bi} inline vi="Số:" en="No." /> {number}
          </div>
        )}
      </div>
      <div className="nation">
        <div className="l1">
          <T bi={bi} vi="CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" en="SOCIALIST REPUBLIC OF VIETNAM" />
        </div>
        <div className="l2">
          <T bi={bi} vi="Độc lập - Tự do - Hạnh phúc" en="Independence - Freedom - Happiness" />
        </div>
      </div>
    </div>
  );
}

export const placeOf = (company: ContractData['company']) => {
  // Lấy tỉnh / thành phố ở cuối địa chỉ công ty làm địa danh
  const parts = (company.companyAddress ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x && !/^(vi[eệ]t\s*nam|vietnam)$/i.test(x));
  return (parts[parts.length - 1] ?? '').replace(/^(TP\.?|Thành phố|Tỉnh)\s*/i, '') || '……';
};

/** Địa danh, ngày (song ngữ: thêm "Da Nang, October 10, 2026") */
function PlaceDate({ company, date, bi }: { company: ContractData['company']; date: string; bi?: boolean }) {
  const place = placeOf(company);
  return (
    <div className="legal-place">
      {place}, {dateLong(date)}
      {bi && <span className="en en-block">{place.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')}, {dateEn(date)}</span>}
    </div>
  );
}

function Party({ rows, bi }: { rows: [string, string, string | null | undefined][]; bi?: boolean }) {
  return (
    <dl className="party">
      {rows.map(([k, en, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>
            {k}:{bi && <span className="en en-block">{en}</span>}
          </dt>
          <dd>{v || <span className="blank">……………………………………………</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tách điều khoản theo "ĐIỀU n" / "ARTICLE n" */
const splitArticles = (text: string, re: RegExp) => {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (re.test(line.trim()) || !out.length) out.push(line);
    else out[out.length - 1] += '\n' + line;
  }
  return out;
};

/** Một khối điều khoản: dòng đầu ("ĐIỀU …" / "ARTICLE …") in đậm */
function Article({ text, en }: { text: string; en?: boolean }) {
  const [head, ...rest] = text.trim().split('\n');
  const isHead = /^(ĐIỀU|ARTICLE)\s+\d+/i.test(head.trim());
  return (
    <div className={`terms${en ? ' en' : ''}`}>
      {isHead ? <span className="art">{head.trim()}</span> : <span>{head}{'\n'}</span>}
      {rest.join('\n').replace(/\n+$/, '')}
    </div>
  );
}

/** Điều khoản từ Điều 4: song ngữ thì xen kẽ từng điều tiếng Việt – tiếng Anh */
function Terms({ vi, en, bi }: { vi: string; en: string | null; bi?: boolean }) {
  const viArts = splitArticles(vi, /^ĐIỀU\s+\d+/i);
  const enArts = bi && en ? splitArticles(en, /^ARTICLE\s+\d+/i) : [];
  return (
    <>
      {viArts.map((a, i) => (
        <div key={i}>
          <Article text={a} />
          {enArts[i] && <Article text={enArts[i]} en />}
        </div>
      ))}
      {enArts.slice(viArts.length).map((a, i) => (
        <Article key={`e${i}`} text={a} en />
      ))}
    </>
  );
}

/** Đoạn văn song ngữ: tiếng Việt rồi tiếng Anh (nghiêng) bên dưới */
function P({ vi, en, bi }: { vi: ReactNode; en: ReactNode; bi?: boolean }) {
  return (
    <div className="bi-para">
      {vi}
      {bi && <div className="en">{en}</div>}
    </div>
  );
}

function ArtHead({ vi, en, bi }: { vi: string; en: string; bi?: boolean }) {
  return (
    <span className="terms">
      <span className="art">
        {vi}
        {bi && <span className="en en-block">{en}</span>}
      </span>
    </span>
  );
}

/**
 * Hợp đồng vận chuyển + Phụ lục danh sách hành khách.
 * bi = song ngữ Việt – Anh (khách nước ngoài, đại lý / OTA quốc tế).
 */
export function ContractDoc({ data, contract, showQr = true, bi }: { data: ContractData; contract: TransportContract; showQr?: boolean; bi?: boolean }) {
  const { company, booking: b, trips } = data;
  const hotline = company.companyHotline || company.companyPhone || '……';
  const customVi = company.contractTerms?.trim();
  const termsVi = (customVi || DEFAULT_CONTRACT_TERMS).replace(/\{hotline\}/g, hotline);
  // Điều khoản tiếng Anh: bản cài đặt; chưa cài mà dùng điều khoản mẫu thì dùng bản dịch mẫu
  const termsEn = (company.contractTerms_en?.trim() || (customVi ? null : DEFAULT_CONTRACT_TERMS_EN))?.replace(/\{hotline\}/g, hotline) ?? null;
  const start = trips.length ? trips.reduce((m, t) => (t.pickupTime < m ? t.pickupTime : m), trips[0].pickupTime) : null;
  const end = trips.length ? trips.reduce((m, t) => (t.endTime > m ? t.endTime : m), trips[0].endTime) : null;
  const maxPax = trips.reduce((m, t) => Math.max(m, t.passengers), 0);
  const totalKm = trips.reduce((s, t) => s + (t.distanceKm ?? 0), 0);
  const pay = contract.paymentMethod || 'Chuyển khoản hoặc tiền mặt';

  return (
    <>
      <LegalHead company={company} number={contract.number} bi={bi} />
      <PlaceDate company={company} date={contract.signedDate} bi={bi} />
      <div className="legal-title">
        <T bi={bi} vi="HỢP ĐỒNG VẬN CHUYỂN HÀNH KHÁCH" en="PASSENGER TRANSPORT CONTRACT" />
      </div>
      <div className="legal-sub">
        <T
          bi={bi}
          vi={`(Vận tải hành khách bằng xe ô tô theo hợp đồng · Booking ${b.code})`}
          en={`(Contract passenger transport by car · Booking ${b.code})`}
        />
      </div>

      <div className="legal-basis">
        <div>
          <T bi={bi} vi="Căn cứ Bộ luật Dân sự năm 2015;" en="Pursuant to the Civil Code 2015;" />
        </div>
        <div>
          <T bi={bi} vi="Căn cứ Luật Đường bộ năm 2024;" en="Pursuant to the Law on Roads 2024;" />
        </div>
        <div>
          <T
            bi={bi}
            vi="Căn cứ Nghị định số 158/2024/NĐ-CP ngày 18/12/2024 của Chính phủ quy định về hoạt động vận tải đường bộ và các văn bản sửa đổi, bổ sung;"
            en="Pursuant to Decree No. 158/2024/ND-CP dated December 18, 2024 of the Government on road transport activities and its amendments;"
          />
        </div>
        <div>
          <T bi={bi} vi="Căn cứ nhu cầu và khả năng của hai bên." en="Based on the needs and capabilities of both parties." />
        </div>
      </div>
      <P bi={bi} vi={<>Hôm nay, {dateLong(contract.signedDate)}, chúng tôi gồm:</>} en={<>Today, {dateEn(contract.signedDate)}, we are:</>} />

      <h4>
        <T bi={bi} vi="Bên A (bên thuê vận tải)" en="Party A (the hirer)" />
      </h4>
      <Party
        bi={bi}
        rows={[
          ['Tên tổ chức / cá nhân', 'Organization / individual', contract.hirerName],
          ['Địa chỉ', 'Address', contract.hirerAddress],
          ['Điện thoại', 'Phone', contract.hirerPhone],
          ['Email', 'Email', contract.hirerEmail],
          ['Mã số thuế', 'Tax code', contract.hirerTaxCode],
          ['Số CCCD (cá nhân)', 'ID / passport no. (individual)', contract.hirerIdNumber],
          ['Người đại diện', 'Representative', contract.hirerRepresentative],
          ['Chức vụ', 'Position', contract.hirerPosition],
          ['Số CCCD người đại diện', "Representative's ID no.", contract.hirerRepIdNumber],
          ['Tài khoản', 'Bank account', contract.hirerBank],
        ]}
      />

      <h4>
        <T bi={bi} vi="Bên B (đơn vị kinh doanh vận tải)" en="Party B (the carrier)" />
      </h4>
      <Party
        bi={bi}
        rows={[
          ['Tên đơn vị', 'Company', company.companyName],
          ['Địa chỉ', 'Address', company.companyAddress],
          ['Điện thoại', 'Phone', company.companyPhone],
          ['Email', 'Email', company.companyEmail],
          ['Mã số thuế', 'Tax code', company.companyTaxCode],
          ['Giấy phép KD vận tải số', 'Transport business licence no.', company.companyTransportLicense],
          ['Người đại diện', 'Representative', company.companyRepresentative],
          ['Chức vụ', 'Position', company.companyRepresentativeTitle],
          ['Số CCCD người đại diện', "Representative's ID no.", company.companyRepresentativeId],
          ['Tài khoản', 'Bank account', company.bankInfo],
        ]}
      />
      <P
        bi={bi}
        vi="Hai bên thỏa thuận ký kết hợp đồng vận chuyển hành khách với các điều khoản sau:"
        en="The two parties agree to sign this passenger transport contract on the following terms:"
      />

      <ArtHead bi={bi} vi="ĐIỀU 1. NỘI DUNG HỢP ĐỒNG" en="ARTICLE 1. SUBJECT OF THE CONTRACT" />
      <P
        bi={bi}
        vi="Bên B nhận vận chuyển hành khách của Bên A bằng xe ô tô theo hợp đồng (thuê nguyên xe), theo thời gian, hành trình và danh sách hành khách kèm theo hợp đồng này. Bên B chỉ vận chuyển đúng hành khách có trong danh sách, đón trả khách tại các địa điểm ghi trong hợp đồng."
        en="Party B agrees to transport Party A's passengers by car under contract (whole-vehicle hire), according to the schedule, itinerary and passenger list attached to this contract. Party B carries only the passengers on the list and picks up / drops off only at the places stated in the contract."
      />

      <ArtHead bi={bi} vi="ĐIỀU 2. THỜI GIAN, HÀNH TRÌNH VÀ PHƯƠNG TIỆN THỰC HIỆN" en="ARTICLE 2. SCHEDULE, ITINERARY AND VEHICLES" />
      {start && end && (
        <P
          bi={bi}
          vi={
            <>
              Thời gian thực hiện: từ <b>{fmtDT(start)}</b> đến <b>{fmtDT(end)}</b>. Số lượng khách: <b>{maxPax}</b> người
              {totalKm > 0 && (
                <>
                  . Tổng cự ly: <b>{totalKm.toLocaleString('vi-VN')} km</b>
                </>
              )}
              .
            </>
          }
          en={
            <>
              Period: from {fmtDT(start)} to {fmtDT(end)}. Number of passengers: {maxPax}
              {totalKm > 0 && <>. Total distance: {totalKm.toLocaleString('en-US')} km</>}.
            </>
          }
        />
      )}
      <table className="grid">
        <colgroup>
          <col style={{ width: '8mm' }} />
          <col style={{ width: '30mm' }} />
          <col />
          <col style={{ width: '15mm' }} />
          <col style={{ width: '13mm' }} />
          <col style={{ width: '30mm' }} />
        </colgroup>
        <thead>
          <tr>
            <th>
              <T bi={bi} vi="TT" en="No." />
            </th>
            <th>
              <T bi={bi} vi="Thời gian" en="Time" />
            </th>
            <th>
              <T bi={bi} vi="Điểm đầu – điểm cuối, điểm đón trả" en="Route, pick-up / drop-off points" />
            </th>
            <th>
              <T bi={bi} vi="Cự ly (km)" en="Distance (km)" />
            </th>
            <th>
              <T bi={bi} vi="Số khách" en="Pax" />
            </th>
            <th>
              <T bi={bi} vi="Loại xe / biển số" en="Vehicle / plate" />
            </th>
          </tr>
        </thead>
        <tbody>
          {trips.map((t, i) => (
            <tr key={t.id}>
              <td className="c">{i + 1}</td>
              <td>
                {fmtDT(t.pickupTime)}
                <div className="muted small">
                  <T bi={bi} inline vi="đến" en="to" /> {fmtDT(t.endTime)}
                </div>
              </td>
              <td>
                <b>
                  <T bi={bi} inline vi="Đón" en="Pick-up" />:
                </b>{' '}
                {t.pickupAddress}
                {t.dropoffAddress && (
                  <>
                    <br />
                    <b>
                      <T bi={bi} inline vi="Trả" en="Drop-off" />:
                    </b>{' '}
                    {t.dropoffAddress}
                  </>
                )}
                {t.itinerary && (
                  <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
                    <T bi={bi} inline vi="Lịch trình" en="Itinerary" />: {t.itinerary}
                  </div>
                )}
                <div className="muted small">{t.service.name}</div>
              </td>
              <td className="c">{t.distanceKm ?? ''}</td>
              <td className="c">{t.passengers}</td>
              <td>
                {t.vehicleType.name}
                {(t.vehicle?.plateNumber || t.partnerPlate) && <div>{t.vehicle?.plateNumber ?? t.partnerPlate}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ArtHead bi={bi} vi="ĐIỀU 3. GIÁ TRỊ HỢP ĐỒNG VÀ PHƯƠNG THỨC THANH TOÁN" en="ARTICLE 3. CONTRACT VALUE AND PAYMENT" />
      <P
        bi={bi}
        vi={
          <>
            Giá trị hợp đồng: <b>{fmtMoney(b.total)}</b>
            {b.invoiceRequired && b.vatPercent > 0 ? (
              <>
                {' '}
                (đã gồm thuế GTGT {b.vatPercent}%: {fmtMoney(b.vatAmount)}; giá chưa thuế {fmtMoney(b.taxable)})
              </>
            ) : null}
            .
          </>
        }
        en={
          <>
            Contract value: {fmtMoney(b.total)}
            {b.invoiceRequired && b.vatPercent > 0 ? (
              <>
                {' '}
                (including VAT {b.vatPercent}%: {fmtMoney(b.vatAmount)}; before VAT {fmtMoney(b.taxable)})
              </>
            ) : null}
            .
          </>
        }
      />
      <P
        bi={bi}
        vi={
          <>
            Bằng chữ: <i>{moneyInWords(b.total)}</i>.
          </>
        }
        en={<>In words: {moneyInWordsEn(b.total)}.</>}
      />
      {b.depositAmount > 0 && <P bi={bi} vi={<>Đặt cọc: {fmtMoney(b.depositAmount)}.</>} en={<>Deposit: {fmtMoney(b.depositAmount)}.</>} />}
      <P
        bi={bi}
        vi={<>Phương thức thanh toán: {pay}.</>}
        en={<>Payment method: {payEn(pay)}.</>}
      />

      <Terms vi={termsVi} en={termsEn} bi={bi} />
      {contract.extraTerms && (
        <>
          <ArtHead bi={bi} vi="ĐIỀU KHOẢN BỔ SUNG" en="ADDITIONAL TERMS" />
          <div style={{ whiteSpace: 'pre-wrap' }}>{contract.extraTerms}</div>
        </>
      )}

      <div className="doc-sign">
        <div>
          <div className="role">
            <T bi={bi} vi="Đại diện Bên A" en="For Party A" />
          </div>
          <div className="hint">
            <T bi={bi} vi="(Ký, ghi rõ họ tên, đóng dấu nếu có)" en="(Signature, full name, seal if any)" />
          </div>
          <div className="space" />
          {contract.acceptedAt ? (
            <div className="e-accepted">
              ✔ <T bi={bi} inline vi="Đã xác nhận điện tử" en="Accepted electronically" />: {contract.acceptedName}
              <div className="small">{fmtDT(contract.acceptedAt)}</div>
            </div>
          ) : (
            <b>{contract.hirerRepresentative || contract.hirerName}</b>
          )}
        </div>
        <div>
          <div className="role">
            <T bi={bi} vi="Đại diện Bên B" en="For Party B" />
          </div>
          <div className="hint">
            <T bi={bi} vi="(Ký, ghi rõ họ tên, đóng dấu)" en="(Signature, full name, seal)" />
          </div>
          <div className="space" />
          <b>{company.companyRepresentative}</b>
        </div>
      </div>

      {showQr && (
        <div className="qr-box">
          <QRCode value={contractUrl(contract.token)} size={88} bordered={false} type="svg" />
          <div>
            <T bi={bi} inline vi="Hợp đồng điện tử số" en="Electronic contract no." /> <b>{contract.number}</b>
            <br />
            <T bi={bi} inline vi="Quét mã để xem, đối chiếu hợp đồng và danh sách hành khách." en="Scan to view the contract and passenger list." />
            <br />
            <span className="small">{contractUrl(contract.token)}</span>
          </div>
        </div>
      )}

      <div className="page-break" />
      <PassengerAnnex data={data} contract={contract} bi={bi} />
    </>
  );
}

/** Danh sách hành khách kèm hợp đồng (mẫu Phụ lục V – TT 36/2024/TT-BGTVT) */
export function PassengerAnnex({ data, contract, bi }: { data: ContractData; contract: TransportContract; bi?: boolean }) {
  const { company, passengers } = data;
  const maxPax = data.trips.reduce((m, t) => Math.max(m, t.passengers), 0);
  // Chưa nhập danh sách: in dòng trống đủ số khách để ghi tay
  const blank = passengers.length ? 0 : maxPax || 10;
  return (
    <>
      <LegalHead company={company} number={contract.number} bi={bi} />
      <PlaceDate company={company} date={contract.signedDate} bi={bi} />
      <div className="legal-title">
        <T bi={bi} vi="DANH SÁCH HÀNH KHÁCH" en="PASSENGER LIST" />
      </div>
      <div className="legal-sub">
        <T
          bi={bi}
          vi={`(Kèm theo Hợp đồng vận chuyển số ${contract.number} ${dateLong(contract.signedDate)})`}
          en={`(Attached to Transport Contract No. ${contract.number} dated ${dateEn(contract.signedDate)})`}
        />
      </div>
      <table className="grid">
        <colgroup>
          <col style={{ width: '12mm' }} />
          <col />
          <col style={{ width: '26mm' }} />
          <col style={{ width: '55mm' }} />
        </colgroup>
        <thead>
          <tr>
            <th>
              <T bi={bi} vi="STT" en="No." />
            </th>
            <th>
              <T bi={bi} vi="Họ tên hành khách" en="Passenger name" />
            </th>
            <th>
              <T bi={bi} vi="Năm sinh" en="Year of birth" />
            </th>
            <th>
              <T bi={bi} vi="Ghi chú" en="Notes" />
            </th>
          </tr>
        </thead>
        <tbody>
          {passengers.map((p, i) => (
            <tr key={p.seq}>
              <td className="c">{i + 1}</td>
              <td>{p.fullName}</td>
              <td className="c">{p.birthYear ?? ''}</td>
              <td>{p.note ?? ''}</td>
            </tr>
          ))}
          {Array.from({ length: blank }, (_, i) => (
            <tr key={`b${i}`}>
              <td className="c">{i + 1}</td>
              <td>&nbsp;</td>
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <T bi={bi} inline vi="Tổng số" en="Total" />: <b>{passengers.length || maxPax || '……'}</b> <T bi={bi} inline vi="người" en="persons" />.
      </div>
      <div className="doc-sign">
        <div>
          <div className="role">
            <T bi={bi} vi="Đại diện bên thuê vận tải" en="For the hirer" />
          </div>
          <div className="hint">
            <T bi={bi} vi="(Ký tên, đóng dấu (nếu có))" en="(Signature, seal if any)" />
          </div>
          <div className="space" />
          {contract.acceptedAt ? (
            <div className="e-accepted">
              ✔ <T bi={bi} inline vi="Đã xác nhận điện tử" en="Accepted electronically" />: {contract.acceptedName}
            </div>
          ) : (
            <b>{contract.hirerRepresentative || contract.hirerName}</b>
          )}
        </div>
        <div>
          <div className="role">
            <T bi={bi} vi="Đơn vị kinh doanh vận tải" en="For the carrier" />
          </div>
          <div className="hint">
            <T bi={bi} vi="(Ký tên, đóng dấu (nếu có))" en="(Signature, seal if any)" />
          </div>
          <div className="space" />
          <b>{company.companyRepresentative}</b>
        </div>
      </div>
      <div className="muted small" style={{ marginTop: 6 }}>
        <T
          bi={bi}
          vi="Trường hợp có nhiều trang, đơn vị kinh doanh đóng dấu treo vào tất cả các trang của danh sách."
          en="If the list has several pages, the carrier stamps every page."
        />
      </div>
    </>
  );
}
