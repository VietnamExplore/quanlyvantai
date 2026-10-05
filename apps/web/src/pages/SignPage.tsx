import { FilePdfOutlined, MinusOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Checkbox, Flex, Segmented, Space, Spin, Tooltip } from 'antd';
import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useSignFile } from '../components/BookingExtras';
import { useSettings } from '../components/common';
import { DocLangSwitch, logoUrl, useDocLang } from '../components/PrintDoc';
import { docCompany, docT, localizeBooking } from '../doc-i18n';
import type { Booking } from '../types';

/** Màu bảng đón tự tạo: màu chính (dải đầu / chân trang, tên công ty) và màu nhấn (đường kẻ, chữ chào mừng) */
const THEMES = {
  navy: { label: 'Xanh navy', primary: '#0b3a6e', accent: '#c9a227' },
  blue: { label: 'Xanh dương', primary: '#1559b7', accent: '#f0a500' },
  red: { label: 'Đỏ', primary: '#9f1d20', accent: '#d4a017' },
  green: { label: 'Xanh lá', primary: '#0f5c3a', accent: '#c9a227' },
  black: { label: 'Đen', primary: '#1f1f1f', accent: '#9a9a9a' },
} as const;
type ThemeKey = keyof typeof THEMES;
const THEME_STORE = 'signTheme';

const css = `
  body { background: #e9e9e9; }
  .sign-page, .sign-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sign-page { width: 297mm; height: 210mm; margin: 16px auto; background: #fff; color: #111; box-sizing: border-box;
               display: flex; flex-direction: column; box-shadow: 0 2px 14px rgba(0,0,0,.15); overflow: hidden;
               font-family: 'Be Vietnam Pro', Arial, 'Helvetica Neue', sans-serif; }

  /* Đầu trang: logo + tên công ty + hotline */
  .sb-head { display: flex; align-items: center; gap: 6mm; padding: 7mm 14mm 6mm; border-bottom: 1.4mm solid var(--accent); }
  .sb-logo { height: 22mm; max-width: 60mm; object-fit: contain; flex-shrink: 0; }
  .sb-company { flex: 1; min-width: 0; }
  .sb-name { font-size: 7.6mm; font-weight: 800; line-height: 1.3; text-transform: uppercase; color: var(--primary); letter-spacing: .2mm; }
  .sb-slogan { margin-top: 1.4mm; font-size: 4.2mm; color: #555; letter-spacing: .3mm; }
  .sb-hotline { flex-shrink: 0; text-align: right; padding-left: 6mm; border-left: .4mm solid #ddd; }
  .sb-hotline small { display: block; font-size: 3.4mm; letter-spacing: 1mm; color: #777; text-transform: uppercase; }
  .sb-hotline b { display: block; font-size: 8.4mm; line-height: 1.1; color: var(--primary); white-space: nowrap; }

  /* Thân: dòng chào mừng + tên khách tự co vừa khung */
  .sb-body { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
             text-align: center; padding: 6mm 16mm; overflow: hidden; }
  .sb-watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .sb-watermark img { height: 72%; max-width: 70%; object-fit: contain; opacity: .055; filter: grayscale(1); }
  .sb-welcome { position: relative; display: flex; align-items: center; gap: 5mm; font-size: 7mm; font-weight: 600; letter-spacing: 2.2mm;
                text-transform: uppercase; color: var(--accent); margin-bottom: 5mm; }
  .sb-welcome::before, .sb-welcome::after { content: ''; width: 28mm; height: .5mm; background: var(--accent); }
  .sb-fit { position: relative; flex: 1; min-height: 0; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .sb-title { font-weight: 900; line-height: 1.18; padding-top: .08em; text-transform: uppercase; word-break: break-word; color: #111; }
  .sb-sub { margin-top: 6mm; font-size: 9mm; line-height: 1.2; color: #333; }

  /* Chân trang: dải màu với đầy đủ thông tin liên hệ */
  .sb-foot { background: var(--primary); color: #fff; padding: 4.2mm 14mm; display: flex; flex-wrap: wrap; justify-content: center;
             column-gap: 7mm; row-gap: 1.2mm; font-size: 4mm; line-height: 1.3; }
  .sb-foot span { white-space: nowrap; }
  .sb-foot span.wrap { white-space: normal; }
  .sb-foot b { color: var(--accent); font-weight: 700; margin-right: 1.4mm; }

  .toolbar { position: sticky; top: 0; padding: 12px; background: #f5f5f5; z-index: 1; }
  .theme-dot { width: 18px; height: 18px; border-radius: 50%; display: inline-block; vertical-align: middle; border: 2px solid #fff; box-shadow: 0 0 0 1px #bbb; }
  .zoom { transform-origin: top center; }
  @media print {
    @page { size: A4 landscape; margin: 0; }
    body { background: #fff !important; }
    .toolbar { display: none; }
    .zoom { transform: none !important; height: auto !important; }
    .sign-page { margin: 0; box-shadow: none; }
  }
`;

function loadTheme(): ThemeKey {
  try {
    const v = localStorage.getItem(THEME_STORE);
    return v && v in THEMES ? (v as ThemeKey) : 'navy';
  } catch {
    return 'navy';
  }
}

export default function SignPage() {
  const { id } = useParams();
  const settings = useSettings();
  const { data: raw, isLoading } = useQuery({ queryKey: ['/bookings', Number(id)], queryFn: () => api<Booking>(`/bookings/${id}`) });
  const [lang, setLang] = useDocLang(raw?.docLanguage);
  // Nội dung đã dịch (điểm đón / trả, lịch trình…) theo ngôn ngữ đang in
  const b = useMemo(() => raw && localizeBooking(raw, lang), [raw, lang]);
  const [showCompany, setShowCompany] = useState(true);
  const [showContact, setShowContact] = useState(true);
  const [theme, setThemeState] = useState<ThemeKey>(loadTheme);
  const setTheme = (t: ThemeKey) => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_STORE, t);
    } catch {
      /* trình duyệt chặn lưu: chỉ đổi màu lần này */
    }
  };
  // Có file bảng đón khách gửi thì mặc định in file đó
  const signFile = useSignFile(Number(id));
  const hasFile = !!b?.signFile;
  const [mode, setMode] = useState<'file' | 'generated'>('file');
  const showFile = hasFile && mode === 'file';
  const isPdf = b?.signFileType === 'application/pdf';
  const [scale, setScale] = useState(1); // Hệ số người dùng chỉnh thêm
  const [fitSize, setFitSize] = useState(60); // Cỡ chữ (mm) vừa khung
  const [zoom, setZoom] = useState(1); // Thu nhỏ để xem trọn trang trên màn hình nhỏ
  const fitRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  const title = (b?.signTitle || b?.customer?.name || b?.contactName || '').trim();
  const subtitle = b?.signSubtitle?.trim();
  const t = docT(lang);
  const logo = logoUrl(settings);
  const companyName = docCompany(settings, lang, 'companyName');
  const address = docCompany(settings, lang, 'companyAddress');
  const colors = THEMES[theme];
  const contacts = [
    settings.companyPhone && { label: t('hotline'), value: settings.companyPhone },
    settings.companyEmail && { label: t('email'), value: settings.companyEmail },
    settings.companyWebsite && { label: t('website'), value: settings.companyWebsite },
    settings.companyTaxCode && { label: t('taxCode'), value: settings.companyTaxCode },
    address && { label: t('address'), value: address, wrap: true },
  ].filter(Boolean) as { label: string; value: string; wrap?: boolean }[];
  const head = showCompany && (companyName || logo);
  const foot = showContact && contacts.length > 0;

  useEffect(() => {
    if (b) document.title = `Bảng đón ${title}`;
  }, [b, title]);

  // Tìm cỡ chữ lớn nhất mà dòng chính vẫn vừa khung
  useLayoutEffect(() => {
    const box = fitRef.current;
    const el = titleRef.current;
    if (!box || !el) return;
    const maxH = box.clientHeight * (subtitle ? 0.7 : 0.95);
    let size = 70;
    el.style.fontSize = `${size}mm`;
    while (size > 10 && (el.scrollHeight > maxH || el.scrollWidth > box.clientWidth)) {
      size -= 2;
      el.style.fontSize = `${size}mm`;
    }
    setFitSize(size);
  }, [title, subtitle, head, foot, b, showFile, lang]);

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
            <Segmented<ThemeKey>
              value={theme}
              onChange={setTheme}
              options={(Object.keys(THEMES) as ThemeKey[]).map((k) => ({
                value: k,
                label: (
                  <Tooltip title={THEMES[k].label}>
                    <span className="theme-dot" style={{ background: `linear-gradient(135deg, ${THEMES[k].primary} 60%, ${THEMES[k].accent} 60%)` }} />
                  </Tooltip>
                ),
              }))}
            />
            <Checkbox checked={showCompany} onChange={(e) => setShowCompany(e.target.checked)}>
              Logo, tên công ty
            </Checkbox>
            <Checkbox checked={showContact} onChange={(e) => setShowContact(e.target.checked)}>
              Thông tin liên hệ
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
          <div className="sign-page" lang={lang} style={{ ['--primary' as string]: colors.primary, ['--accent' as string]: colors.accent }}>
            {head && (
              <div className="sb-head">
                {logo && <img className="sb-logo" src={logo} alt="Logo" />}
                <div className="sb-company">
                  {companyName && <div className="sb-name">{companyName}</div>}
                  {settings.companySlogan && <div className="sb-slogan">{settings.companySlogan}</div>}
                </div>
                {settings.companyPhone && (
                  <div className="sb-hotline">
                    <small>{t('hotline')}</small>
                    <b>{settings.companyPhone}</b>
                  </div>
                )}
              </div>
            )}
            <div className="sb-body">
              {showCompany && logo && (
                <div className="sb-watermark">
                  <img src={logo} alt="" />
                </div>
              )}
              <div className="sb-welcome">{t('welcome')}</div>
              <div className="sb-fit" ref={fitRef}>
                <div className="sb-title" ref={titleRef} style={{ fontSize: `${fitSize * scale}mm` }}>
                  {title}
                </div>
                {subtitle && <div className="sb-sub">{subtitle}</div>}
              </div>
            </div>
            {foot && (
              <div className="sb-foot">
                {contacts.map((c) => (
                  <span key={c.label} className={c.wrap ? 'wrap' : undefined}>
                    <b>{c.label}:</b>
                    {c.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
