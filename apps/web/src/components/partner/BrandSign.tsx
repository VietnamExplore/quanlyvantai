import { useQuery } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { docT, toDocLang } from '../../doc-i18n';

/** Thông tin công ty in trên bảng đón (GET /settings/branding) */
export interface Branding {
  name: string | null;
  nameByLang: Record<string, string | null>;
  slogan: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxCode: string | null;
  address: string | null;
  addressByLang: Record<string, string | null>;
  logo: string | null;
}

export function useBranding() {
  return useQuery({ queryKey: ['/settings/branding'], queryFn: () => api<Branding>('/settings/branding'), staleTime: 10 * 60_000 });
}

/** Màu giống bảng đón A4 của văn phòng (bộ màu Xanh navy) */
const PRIMARY = '#0b3a6e';
const ACCENT = '#c9a227';

/**
 * Bảng đón kiểu mới (giống bản in A4 của văn phòng): đầu bảng logo + tên công ty + hotline,
 * dòng Chào mừng theo ngôn ngữ giấy tờ, tên khách tự co vừa khung và luôn nằm giữa, chân bảng thông tin liên hệ.
 * Mọi kích thước tính theo chiều cao khung nên hiển thị cân đối trên điện thoại lẫn máy tính.
 */
export function BrandSign({ title, subtitle, lang: rawLang }: { title: string; subtitle?: string | null; lang?: string | null }) {
  const { data: brand } = useBranding();
  const lang = toDocLang(rawLang);
  const t = docT(lang);
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const welcome = useRef<HTMLDivElement>(null);
  const sub = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(400);
  const [size, setSize] = useState(60);

  const name = (lang !== 'vi' && brand?.nameByLang?.[lang]) || brand?.name || '';
  const address = (lang !== 'vi' && brand?.addressByLang?.[lang]) || brand?.address || '';
  const contacts = [
    brand?.phone && [t('hotline'), brand.phone],
    brand?.email && [t('email'), brand.email],
    brand?.website && [t('website'), brand.website],
    brand?.taxCode && [t('taxCode'), brand.taxCode],
    address && [t('address'), address],
  ].filter(Boolean) as [string, string][];

  // Theo dõi chiều cao khung (xoay máy, đổi cỡ cửa sổ)
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight || 400));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cỡ chữ lớn nhất để tên khách vừa phần giữa (trừ dòng Chào mừng và dòng phụ)
  useLayoutEffect(() => {
    const b = body.current;
    const el = titleRef.current;
    if (!b || !el) return;
    const outer = (x: HTMLElement | null) => (x ? x.offsetHeight + parseFloat(getComputedStyle(x).marginTop) + parseFloat(getComputedStyle(x).marginBottom) : 0);
    const cs = getComputedStyle(b);
    const maxW = b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const maxH = (b.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - outer(welcome.current) - outer(sub.current)) * 0.96;
    let px = Math.round(h * 0.3);
    el.style.fontSize = `${px}px`;
    while (px > 12 && (el.scrollHeight > maxH || el.scrollWidth > maxW)) {
      px -= Math.max(1, Math.round(px * 0.05));
      el.style.fontSize = `${px}px`;
    }
    setSize(px);
  }, [title, subtitle, h, brand, lang]);

  const u = h / 100; // 1% chiều cao khung
  return (
    <div ref={box} className="bs-board" lang={lang} style={{ ['--primary' as string]: PRIMARY, ['--accent' as string]: ACCENT }}>
      {(brand?.logo || name) && (
        <div className="bs-head" style={{ padding: `${2.6 * u}px ${4 * u}px`, gap: `${2.4 * u}px`, borderBottomWidth: Math.max(2, 0.7 * u) }}>
          {brand?.logo && <img src={brand.logo} alt="" style={{ height: 10 * u, maxWidth: 30 * u }} />}
          <div className="bs-company">
            {name && <div className="bs-name" style={{ fontSize: 3.6 * u }}>{name}</div>}
            {brand?.slogan && <div className="bs-slogan" style={{ fontSize: 2.1 * u }}>{brand.slogan}</div>}
          </div>
          {brand?.phone && (
            <div className="bs-hotline" style={{ paddingLeft: 2.4 * u }}>
              <small style={{ fontSize: 1.7 * u }}>{t('hotline')}</small>
              <b style={{ fontSize: 4 * u }}>{brand.phone}</b>
            </div>
          )}
        </div>
      )}
      <div ref={body} className="bs-body" style={{ padding: `${2.5 * u}px ${5 * u}px` }}>
        {brand?.logo && <img className="bs-watermark" src={brand.logo} alt="" />}
        <div className="bs-group">
          <div ref={welcome} className="bs-welcome" style={{ fontSize: 3.4 * u, gap: 2.4 * u, marginBottom: 2 * u, letterSpacing: 0.9 * u }}>
            <i style={{ width: 12 * u }} />
            {t('welcome')}
            <i style={{ width: 12 * u }} />
          </div>
          <div ref={titleRef} className="bs-title" style={{ fontSize: size }}>
            {title || '—'}
          </div>
          {subtitle && (
            <div ref={sub} className="bs-sub" style={{ fontSize: 4.2 * u, marginTop: 2.4 * u }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {contacts.length > 0 && (
        <div className="bs-foot" style={{ padding: `${1.8 * u}px ${4 * u}px`, fontSize: 1.9 * u, columnGap: 3 * u }}>
          {contacts.map(([label, value]) => (
            <span key={label} className={label === t('address') ? 'wrap' : undefined}>
              <b>{label}:</b> {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
