import { FilePdfOutlined, MinusOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Checkbox, Flex, Segmented, Space, Spin } from 'antd';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useSignFile } from '../components/BookingExtras';
import { useSettings } from '../components/common';
import { DocLangSwitch, logoUrl, useDocLang } from '../components/PrintDoc';
import { docCompany, docT } from '../doc-i18n';
import type { Booking } from '../types';

const css = `
  body { background: #e9e9e9; }
  .sign-page, .sign-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sign-page { width: 297mm; height: 210mm; margin: 16px auto; background: #fff; color: #000; box-sizing: border-box;
               padding: 14mm 16mm; display: flex; flex-direction: column; box-shadow: 0 2px 14px rgba(0,0,0,.15);
               font-family: Arial, 'Helvetica Neue', sans-serif; }
  .sign-head { display: flex; align-items: center; justify-content: center; gap: 5mm; font-size: 6mm; font-weight: 700; letter-spacing: .5mm; color: #222; border-bottom: .6mm solid #000; padding-bottom: 3mm; text-transform: uppercase; }
  .sign-head img { height: 15mm; max-width: 55mm; object-fit: contain; }
  .sign-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; overflow: hidden; }
  .sign-title { font-weight: 900; line-height: 1.08; text-transform: uppercase; word-break: break-word; }
  .sign-sub { margin-top: 6mm; font-size: 9mm; line-height: 1.2; color: #222; }
  .sign-foot { text-align: center; font-size: 5mm; color: #333; border-top: .4mm solid #999; padding-top: 3mm; }
  .toolbar { position: sticky; top: 0; padding: 12px; background: #f5f5f5; z-index: 1; }
  .zoom { transform-origin: top center; }
  @media print {
    @page { size: A4 landscape; margin: 0; }
    body { background: #fff !important; }
    .toolbar { display: none; }
    .zoom { transform: none !important; }
    .sign-page { margin: 0; box-shadow: none; }
  }
`;

export default function SignPage() {
  const { id } = useParams();
  const settings = useSettings();
  const { data: b, isLoading } = useQuery({ queryKey: ['/bookings', Number(id)], queryFn: () => api<Booking>(`/bookings/${id}`) });
  const [lang, setLang] = useDocLang(b?.docLanguage);
  const [showCompany, setShowCompany] = useState(true);
  // Có file bảng đón khách gửi thì mặc định in file đó
  const signFile = useSignFile(Number(id));
  const hasFile = !!b?.signFile;
  const [mode, setMode] = useState<'file' | 'generated'>('file');
  const showFile = hasFile && mode === 'file';
  const isPdf = b?.signFileType === 'application/pdf';
  const [scale, setScale] = useState(1); // Hệ số người dùng chỉnh thêm
  const [fitSize, setFitSize] = useState(60); // Cỡ chữ (mm) vừa khung
  const [zoom, setZoom] = useState(1); // Thu nhỏ để xem trọn trang trên màn hình nhỏ
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  const title = (b?.signTitle || b?.customer?.name || b?.contactName || '').trim();
  const subtitle = b?.signSubtitle?.trim();

  useEffect(() => {
    if (b) document.title = `Bảng đón ${title}`;
  }, [b, title]);

  // Tìm cỡ chữ lớn nhất mà dòng chính vẫn vừa khung (tối đa 3 dòng)
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const el = titleRef.current;
    if (!body || !el) return;
    const maxH = body.clientHeight * (subtitle ? 0.72 : 0.92);
    let size = 70;
    el.style.fontSize = `${size}mm`;
    while (size > 10 && (el.scrollHeight > maxH || el.scrollWidth > body.clientWidth)) {
      size -= 2;
      el.style.fontSize = `${size}mm`;
    }
    setFitSize(size);
  }, [title, subtitle, showCompany, b, showFile]);

  // Màn hình nhỏ hơn khổ A4: thu nhỏ khi xem (khi in vẫn đúng khổ)
  useEffect(() => {
    const onResize = () => setZoom(Math.min(1, (window.innerWidth - 24) / ((297 * 96) / 25.4)));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (isLoading || !b) {
    return (
      <Flex justify="center" style={{ padding: 48 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  return (
    <>
      <style>{css}</style>
      <Flex className="toolbar" justify="center" align="center" gap={12} wrap>
        {hasFile && (
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as 'file' | 'generated')}
            options={[
              { value: 'file', label: 'Bảng của khách' },
              { value: 'generated', label: 'Bảng tự tạo' },
            ]}
          />
        )}
        {showFile && isPdf ? (
          <Button type="primary" icon={<FilePdfOutlined />} disabled={!signFile.url} onClick={() => signFile.url && window.open(signFile.url, '_blank')}>
            Mở file PDF để in
          </Button>
        ) : (
          <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()} disabled={showFile && !signFile.url}>
            In / Lưu PDF
          </Button>
        )}
        {!showFile && (
          <>
            <Space.Compact>
              <Button icon={<MinusOutlined />} onClick={() => setScale((s) => Math.max(0.5, s - 0.1))} title="Chữ nhỏ hơn" />
              <Button onClick={() => setScale(1)}>Cỡ chữ {Math.round(scale * 100)}%</Button>
              <Button icon={<PlusOutlined />} onClick={() => setScale((s) => Math.min(1.5, s + 0.1))} title="Chữ to hơn" />
            </Space.Compact>
            <Checkbox checked={showCompany} onChange={(e) => setShowCompany(e.target.checked)}>
              Hiện logo, tên công ty
            </Checkbox>
          </>
        )}
        <DocLangSwitch value={lang} onChange={setLang} />
        <Button onClick={() => window.close()}>Đóng</Button>
      </Flex>

      <div className="zoom" style={{ transform: `scale(${zoom})`, height: zoom < 1 ? `calc(210mm * ${zoom} + 32px)` : undefined }}>
        {showFile ? (
          <div className="sign-page" style={{ padding: isPdf ? '14mm 16mm' : 0, alignItems: 'center', justifyContent: 'center' }}>
            {!signFile.url ? (
              <Spin />
            ) : isPdf ? (
              <div style={{ textAlign: 'center', fontSize: '6mm', color: '#333' }}>
                <FilePdfOutlined style={{ fontSize: '24mm', color: '#cf1322' }} />
                <p style={{ margin: '6mm 0 2mm' }}>Bảng đón khách gửi là file PDF: {b.signFileName}</p>
                <p style={{ margin: 0, fontSize: '4.5mm', color: '#666' }}>Bấm “Mở file PDF để in” ở trên, rồi in từ trình xem PDF (chọn khổ A4 ngang).</p>
              </div>
            ) : (
              <img src={signFile.url} alt="Bảng đón khách gửi" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
            )}
          </div>
        ) : (
          <div className="sign-page">
            {showCompany && (settings.companyName || logoUrl(settings)) && (
              <div className="sign-head">
                {logoUrl(settings) && <img src={logoUrl(settings)!} alt="Logo" />}
                {docCompany(settings, lang, 'companyName') && <span>{docCompany(settings, lang, 'companyName')}</span>}
              </div>
            )}
            <div className="sign-body" ref={bodyRef}>
              <div className="sign-title" ref={titleRef} style={{ fontSize: `${fitSize * scale}mm` }}>
                {title}
              </div>
              {subtitle && <div className="sign-sub">{subtitle}</div>}
            </div>
            {showCompany && settings.companyPhone && <div className="sign-foot">
                {docT(lang)('hotline')}: {settings.companyPhone}
              </div>}
          </div>
        )}
      </div>
    </>
  );
}
