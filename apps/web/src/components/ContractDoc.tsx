import { QRCode } from 'antd';
import dayjs from 'dayjs';
import { contractUrl, DEFAULT_CONTRACT_TERMS, moneyInWords, type ContractData, type TransportContract } from '../contract';

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
  .legal-basis div::before { content: '- '; }
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

/** Ghép 2 chữ cuối của tên công ty bằng dấu cách không ngắt dòng: xuống dòng thì tên thương hiệu (vd "VIETNAM EXPLORE") luôn nằm cùng một hàng */
const keepBrand = (name: string) => {
  const w = name.trim().split(/\s+/);
  return w.length > 2 ? [...w.slice(0, -2), w.slice(-2).join(' ')].join(' ') : name;
};

/** Đầu văn bản: tên đơn vị + số | quốc hiệu, tiêu ngữ */
export function LegalHead({ company, number }: { company: ContractData['company']; number?: string }) {
  return (
    <div className="legal-head">
      <div className="unit">
        <div className="name">{keepBrand(company.companyName || 'TÊN ĐƠN VỊ')}</div>
        {number && <div>Số: {number}</div>}
      </div>
      <div className="nation">
        <div className="l1">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
        <div className="l2">Độc lập - Tự do - Hạnh phúc</div>
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

function Party({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <dl className="party">
      {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}:</dt>
            <dd>{v || <span className="blank">……………………………………………</span>}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Điều khoản: dòng bắt đầu bằng "ĐIỀU …" in đậm */
function Terms({ text }: { text: string }) {
  return (
    <div className="terms">
      {text.split('\n').map((line, i) =>
        /^ĐIỀU\s+\d+/i.test(line.trim()) ? (
          <span key={i} className="art">
            {line.trim()}
          </span>
        ) : (
          <span key={i}>
            {line}
            {'\n'}
          </span>
        ),
      )}
    </div>
  );
}

/** Hợp đồng vận chuyển + Phụ lục danh sách hành khách */
export function ContractDoc({ data, contract, showQr = true }: { data: ContractData; contract: TransportContract; showQr?: boolean }) {
  const { company, booking: b, trips } = data;
  const hotline = company.companyHotline || company.companyPhone || '……';
  const terms = (company.contractTerms?.trim() || DEFAULT_CONTRACT_TERMS).replace(/\{hotline\}/g, hotline);
  const start = trips.length ? trips.reduce((m, t) => (t.pickupTime < m ? t.pickupTime : m), trips[0].pickupTime) : null;
  const end = trips.length ? trips.reduce((m, t) => (t.endTime > m ? t.endTime : m), trips[0].endTime) : null;
  const maxPax = trips.reduce((m, t) => Math.max(m, t.passengers), 0);
  const totalKm = trips.reduce((s, t) => s + (t.distanceKm ?? 0), 0);

  return (
    <>
      <LegalHead company={company} number={contract.number} />
      <div className="legal-place">
        {placeOf(company)}, {dateLong(contract.signedDate)}
      </div>
      <div className="legal-title">HỢP ĐỒNG VẬN CHUYỂN HÀNH KHÁCH</div>
      <div className="legal-sub">(Vận tải hành khách bằng xe ô tô theo hợp đồng · Booking {b.code})</div>

      <div className="legal-basis">
        <div>Căn cứ Bộ luật Dân sự năm 2015;</div>
        <div>Căn cứ Luật Đường bộ năm 2024;</div>
        <div>Căn cứ Nghị định số 158/2024/NĐ-CP ngày 18/12/2024 của Chính phủ quy định về hoạt động vận tải đường bộ và các văn bản sửa đổi, bổ sung;</div>
        <div>Căn cứ nhu cầu và khả năng của hai bên.</div>
      </div>
      <div>Hôm nay, {dateLong(contract.signedDate)}, chúng tôi gồm:</div>

      <h4>Bên A (bên thuê vận tải)</h4>
      <Party
        rows={[
          ['Tên tổ chức / cá nhân', contract.hirerName],
          ['Địa chỉ', contract.hirerAddress],
          ['Điện thoại', contract.hirerPhone],
          ['Email', contract.hirerEmail],
          ['Mã số thuế', contract.hirerTaxCode],
          ['Số CCCD (cá nhân)', contract.hirerIdNumber],
          ['Người đại diện', contract.hirerRepresentative],
          ['Chức vụ', contract.hirerPosition],
          ['Số CCCD người đại diện', contract.hirerRepIdNumber],
          ['Tài khoản', contract.hirerBank],
        ]}
      />

      <h4>Bên B (đơn vị kinh doanh vận tải)</h4>
      <Party
        rows={[
          ['Tên đơn vị', company.companyName],
          ['Địa chỉ', company.companyAddress],
          ['Điện thoại', company.companyPhone],
          ['Email', company.companyEmail],
          ['Mã số thuế', company.companyTaxCode],
          ['Giấy phép KD vận tải số', company.companyTransportLicense],
          ['Người đại diện', company.companyRepresentative],
          ['Chức vụ', company.companyRepresentativeTitle],
          ['Số CCCD người đại diện', company.companyRepresentativeId],
          ['Tài khoản', company.bankInfo],
        ]}
      />
      <div>Hai bên thỏa thuận ký kết hợp đồng vận chuyển hành khách với các điều khoản sau:</div>

      <span className="terms">
        <span className="art">ĐIỀU 1. NỘI DUNG HỢP ĐỒNG</span>
      </span>
      <div>
        Bên B nhận vận chuyển hành khách của Bên A bằng xe ô tô theo hợp đồng (thuê nguyên xe), theo thời gian, hành trình và danh sách hành khách kèm theo hợp
        đồng này. Bên B chỉ vận chuyển đúng hành khách có trong danh sách, đón trả khách tại các địa điểm ghi trong hợp đồng.
      </div>

      <span className="terms">
        <span className="art">ĐIỀU 2. THỜI GIAN, HÀNH TRÌNH VÀ PHƯƠNG TIỆN THỰC HIỆN</span>
      </span>
      {start && end && (
        <div>
          Thời gian thực hiện: từ <b>{fmtDT(start)}</b> đến <b>{fmtDT(end)}</b>. Số lượng khách: <b>{maxPax}</b> người
          {totalKm > 0 && (
            <>
              . Tổng cự ly: <b>{totalKm.toLocaleString('vi-VN')} km</b>
            </>
          )}
          .
        </div>
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
            <th>TT</th>
            <th>Thời gian</th>
            <th>Điểm đầu – điểm cuối, điểm đón trả</th>
            <th>Cự ly (km)</th>
            <th>Số khách</th>
            <th>Loại xe / biển số</th>
          </tr>
        </thead>
        <tbody>
          {trips.map((t, i) => (
            <tr key={t.id}>
              <td className="c">{i + 1}</td>
              <td>
                {fmtDT(t.pickupTime)}
                <div className="muted small">đến {fmtDT(t.endTime)}</div>
              </td>
              <td>
                <b>Đón:</b> {t.pickupAddress}
                {t.dropoffAddress && (
                  <>
                    <br />
                    <b>Trả:</b> {t.dropoffAddress}
                  </>
                )}
                {t.itinerary && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>Lịch trình: {t.itinerary}</div>}
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

      <span className="terms">
        <span className="art">ĐIỀU 3. GIÁ TRỊ HỢP ĐỒNG VÀ PHƯƠNG THỨC THANH TOÁN</span>
      </span>
      <div>
        Giá trị hợp đồng: <b>{fmtMoney(b.total)}</b>
        {b.invoiceRequired && b.vatPercent > 0 ? (
          <>
            {' '}
            (đã gồm thuế GTGT {b.vatPercent}%: {fmtMoney(b.vatAmount)}; giá chưa thuế {fmtMoney(b.taxable)})
          </>
        ) : null}
        .
      </div>
      <div>
        Bằng chữ: <i>{moneyInWords(b.total)}</i>.
      </div>
      {b.depositAmount > 0 && <div>Đặt cọc: {fmtMoney(b.depositAmount)}.</div>}
      <div>Phương thức thanh toán: {contract.paymentMethod || 'Chuyển khoản hoặc tiền mặt'}.</div>

      <Terms text={terms} />
      {contract.extraTerms && (
        <>
          <span className="terms">
            <span className="art">ĐIỀU KHOẢN BỔ SUNG</span>
          </span>
          <div style={{ whiteSpace: 'pre-wrap' }}>{contract.extraTerms}</div>
        </>
      )}

      <div className="doc-sign">
        <div>
          <div className="role">Đại diện Bên A</div>
          <div className="hint">(Ký, ghi rõ họ tên, đóng dấu nếu có)</div>
          <div className="space" />
          {contract.acceptedAt ? (
            <div className="e-accepted">
              ✔ Đã xác nhận điện tử: {contract.acceptedName}
              <div className="small">{fmtDT(contract.acceptedAt)}</div>
            </div>
          ) : (
            <b>{contract.hirerRepresentative || contract.hirerName}</b>
          )}
        </div>
        <div>
          <div className="role">Đại diện Bên B</div>
          <div className="hint">(Ký, ghi rõ họ tên, đóng dấu)</div>
          <div className="space" />
          <b>{company.companyRepresentative}</b>
        </div>
      </div>

      {showQr && (
        <div className="qr-box">
          <QRCode value={contractUrl(contract.token)} size={88} bordered={false} type="svg" />
          <div>
            Hợp đồng điện tử số <b>{contract.number}</b>
            <br />
            Quét mã để xem, đối chiếu hợp đồng và danh sách hành khách.
            <br />
            <span className="small">{contractUrl(contract.token)}</span>
          </div>
        </div>
      )}

      <div className="page-break" />
      <PassengerAnnex data={data} contract={contract} />
    </>
  );
}

/** Danh sách hành khách kèm hợp đồng (mẫu Phụ lục V – TT 36/2024/TT-BGTVT) */
export function PassengerAnnex({ data, contract }: { data: ContractData; contract: TransportContract }) {
  const { company, passengers } = data;
  const maxPax = data.trips.reduce((m, t) => Math.max(m, t.passengers), 0);
  // Chưa nhập danh sách: in dòng trống đủ số khách để ghi tay
  const blank = passengers.length ? 0 : maxPax || 10;
  return (
    <>
      <LegalHead company={company} number={contract.number} />
      <div className="legal-place">
        {placeOf(company)}, {dateLong(contract.signedDate)}
      </div>
      <div className="legal-title">DANH SÁCH HÀNH KHÁCH</div>
      <div className="legal-sub">
        (Kèm theo Hợp đồng vận chuyển số {contract.number} {dateLong(contract.signedDate)})
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
            <th>STT</th>
            <th>Họ tên hành khách</th>
            <th>Năm sinh</th>
            <th>Ghi chú</th>
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
        Tổng số: <b>{passengers.length || maxPax || '……'}</b> người.
      </div>
      <div className="doc-sign">
        <div>
          <div className="role">Đại diện bên thuê vận tải</div>
          <div className="hint">(Ký tên, đóng dấu (nếu có))</div>
          <div className="space" />
          {contract.acceptedAt ? <div className="e-accepted">✔ Đã xác nhận điện tử: {contract.acceptedName}</div> : <b>{contract.hirerRepresentative || contract.hirerName}</b>}
        </div>
        <div>
          <div className="role">Đơn vị kinh doanh vận tải</div>
          <div className="hint">(Ký tên, đóng dấu (nếu có))</div>
          <div className="space" />
          <b>{company.companyRepresentative}</b>
        </div>
      </div>
      <div className="muted small" style={{ marginTop: 6 }}>
        Trường hợp có nhiều trang, đơn vị kinh doanh đóng dấu treo vào tất cả các trang của danh sách.
      </div>
    </>
  );
}
