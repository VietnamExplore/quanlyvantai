import type { ReactNode } from 'react';
import type { Settings } from '../types';

/** Đường dẫn ảnh logo công ty (null = chưa tải logo). Thêm ?v=tên-file để đổi logo là trình duyệt tải ảnh mới. */
export const logoUrl = (s: Settings) => (s.companyLogo ? `/api/settings/logo?v=${encodeURIComponent(s.companyLogo)}` : null);

/**
 * Kiểu trình bày chung cho các bản in khổ A4 dọc (báo giá, danh sách hành khách…):
 * trên màn hình là một tờ giấy A4 có bóng; khi in dùng lề trang của @page.
 */
export const DOC_CSS = `
  body { background: #e9ebee; }
  .doc { width: 210mm; min-height: 297mm; margin: 16px auto; background: #fff; color: #1a1a1a; box-sizing: border-box;
         padding: 14mm 15mm 16mm; box-shadow: 0 2px 14px rgba(0,0,0,.12);
         font-family: 'Times New Roman', Times, serif; font-size: 12.5pt; line-height: 1.4; }
  .doc * { box-sizing: border-box; }
  .doc pre { font-family: inherit; white-space: pre-wrap; margin: 0; }
  .doc .muted { color: #555; }
  .doc .small { font-size: 10.5pt; }
  .doc .r { text-align: right; white-space: nowrap; }
  .doc .c { text-align: center; }

  /* Đầu trang: logo + thông tin công ty | số chứng từ */
  .doc-head { display: flex; align-items: center; gap: 5mm; padding-bottom: 4mm; border-bottom: 0.6mm solid #1f3b64; }
  .doc-logo { flex: none; width: 30mm; height: 22mm; display: flex; align-items: center; justify-content: center; }
  .doc-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .doc-company { flex: 1; min-width: 0; font-size: 10.5pt; line-height: 1.35; color: #333; }
  .doc-company .name { font-size: 13.5pt; font-weight: 700; color: #1f3b64; text-transform: uppercase; line-height: 1.25; margin-bottom: 1mm; }
  .doc-meta { flex: none; text-align: right; font-size: 10.5pt; line-height: 1.5; color: #333; white-space: nowrap; }
  .doc-meta b { color: #1a1a1a; }

  .doc-title { text-align: center; margin: 7mm 0 1mm; font-size: 17pt; font-weight: 700; letter-spacing: .3mm; color: #1f3b64; }
  .doc-subtitle { text-align: center; color: #555; font-size: 11pt; margin-bottom: 5mm; }
  .doc h3 { font-size: 12.5pt; margin: 5mm 0 2mm; color: #1f3b64; }

  /* Khối thông tin 2 cột */
  .doc-info { display: grid; grid-template-columns: 34mm 1fr; gap: 1mm 3mm; margin: 0 0 4mm; }
  .doc-info dt { color: #555; }
  .doc-info dd { margin: 0; font-weight: 600; }

  /* Bảng */
  .doc table.grid { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 11.5pt; }
  .doc table.grid th, .doc table.grid td { border: 0.25mm solid #9aa5b1; padding: 1.6mm 2.2mm; vertical-align: top; }
  .doc table.grid thead th { background: #e8eef7; color: #1f3b64; font-weight: 700; text-align: center; }
  .doc table.grid tbody tr:nth-child(even) td { background: #fafbfc; }
  .doc table.grid tr { page-break-inside: avoid; }

  /* Tổng tiền */
  .doc-totals { margin-left: auto; width: 82mm; border-collapse: collapse; font-size: 12pt; }
  .doc-totals td { padding: 1mm 2mm; }
  .doc-totals tr.grand td { border-top: 0.4mm solid #1f3b64; padding-top: 2mm; font-size: 14pt; font-weight: 700; color: #1f3b64; }

  .doc-box { border: 0.25mm solid #c9d1db; border-radius: 1.5mm; padding: 2.5mm 3.5mm; margin-top: 3mm; background: #fbfcfd; font-size: 11pt; }
  .doc-box b { color: #1f3b64; }

  /* Chữ ký */
  .doc-sign { display: flex; justify-content: space-between; margin-top: 10mm; text-align: center; page-break-inside: avoid; }
  .doc-sign > div { width: 45%; }
  .doc-sign .role { font-weight: 700; text-transform: uppercase; }
  .doc-sign .hint { font-style: italic; color: #666; font-size: 10.5pt; }
  .doc-sign .space { height: 24mm; }

  .toolbar { position: sticky; top: 0; padding: 12px; background: #f5f5f5; z-index: 1; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  @media (max-width: 820px) { .doc { width: auto; min-height: 0; margin: 0; padding: 16px; } .doc-head { flex-wrap: wrap; } }
  @media print {
    @page { size: A4 portrait; margin: 12mm 14mm 14mm; }
    body { background: #fff !important; }
    .toolbar { display: none !important; }
    .doc { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
    .doc, .doc * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc table.grid thead { display: table-header-group; }
  }
`;

/** Đầu trang in: logo + tên, địa chỉ, liên hệ công ty | khối số chứng từ bên phải */
export function PrintHeader({ settings, meta }: { settings: Settings; meta?: ReactNode }) {
  const logo = logoUrl(settings);
  const contact = [settings.companyPhone && `Hotline: ${settings.companyPhone}`, settings.companyEmail && `Email: ${settings.companyEmail}`].filter(Boolean).join(' · ');
  return (
    <div className="doc-head">
      {logo && (
        <div className="doc-logo">
          <img src={logo} alt="Logo" />
        </div>
      )}
      <div className="doc-company">
        <div className="name">{settings.companyName}</div>
        {settings.companyAddress && <div>Địa chỉ: {settings.companyAddress}</div>}
        {contact && <div>{contact}</div>}
        {settings.companyTaxCode && <div>MST: {settings.companyTaxCode}</div>}
      </div>
      {meta && <div className="doc-meta">{meta}</div>}
    </div>
  );
}
