import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { api, getServer } from './api';

/** Thông tin công ty in trên bảng đón (GET /settings/branding, dùng chung với web) */
interface Branding {
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

type Lang = 'vi' | 'en' | 'ko' | 'zh' | 'ja';
const toLang = (v?: string | null): Lang => (['vi', 'en', 'ko', 'zh', 'ja'].includes(v ?? '') ? (v as Lang) : 'vi');

/** Chữ trên bảng đón theo ngôn ngữ giấy tờ của booking (giống bản in của văn phòng) */
const T: Record<'welcome' | 'hotline' | 'email' | 'website' | 'taxCode' | 'address', Record<Lang, string>> = {
  welcome: { vi: 'Chào mừng', en: 'Welcome', ko: '환영합니다', zh: '欢迎', ja: 'ようこそ' },
  hotline: { vi: 'Hotline', en: 'Hotline', ko: '핫라인', zh: '热线', ja: 'ホットライン' },
  email: { vi: 'Email', en: 'Email', ko: '이메일', zh: '邮箱', ja: 'メール' },
  website: { vi: 'Website', en: 'Website', ko: '웹사이트', zh: '网站', ja: 'ウェブサイト' },
  taxCode: { vi: 'MST', en: 'Tax code', ko: '사업자번호', zh: '税号', ja: '税番号' },
  address: { vi: 'Địa chỉ', en: 'Address', ko: '주소', zh: '地址', ja: '住所' },
};

/** Số dòng khi xuống dòng theo từ với độ rộng ký tự ước lượng */
function lineCount(text: string, maxW: number, px: number) {
  const cw = px * 0.72;
  let lines = 1;
  let cur = 0;
  for (const w of text.split(/\s+/)) {
    const len = w.length * cw;
    if (len > maxW) return Infinity; // từ dài hơn một dòng: phải giảm cỡ chữ
    const add = cur === 0 ? len : cur + cw + len;
    if (add > maxW) {
      lines++;
      cur = len;
    } else cur = add;
  }
  return lines;
}

/** Cỡ chữ lớn nhất (≤ maxPx) để tên khách vừa khung rộng maxW, cao maxH (dòng cao 1,18 cỡ chữ) */
function fitTitle(text: string, maxW: number, maxH: number, maxPx: number) {
  if (maxW <= 0 || maxH <= 0) return 0;
  let px = Math.floor(maxPx);
  while (px > 12 && lineCount(text, maxW, px) * px * 1.18 > maxH) px = Math.floor(px * 0.94);
  return px;
}

const PRIMARY = '#0b3a6e';
const ACCENT = '#c9a227';
const LOGO = require('../assets/logo.png');

// Nhớ thông tin công ty trong lúc mở app (ít thay đổi)
let cache: Branding | null = null;

/**
 * Bảng đón kiểu mới (giống bản in A4 của văn phòng): đầu bảng logo + tên công ty + hotline,
 * dòng Chào mừng, tên khách tự co vừa khung và luôn nằm giữa, chân bảng thông tin liên hệ.
 * Kích thước tính theo chiều cao màn hình (đang xoay ngang) nên cân đối trên mọi điện thoại.
 */
export function BrandSign({ title, subtitle, lang: rawLang }: { title: string; subtitle?: string | null; lang?: string | null }) {
  const [brand, setBrand] = useState<Branding | null>(cache);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [body, setBody] = useState({ w: 0, h: 0 });
  const lang = toLang(rawLang);

  useEffect(() => {
    if (cache) return;
    api<Branding>('/settings/branding')
      .then((b) => {
        cache = b;
        setBrand(b);
      })
      .catch(() => undefined); // mất mạng: vẫn hiện bảng với logo có sẵn trong app
  }, []);

  const name = (lang !== 'vi' && brand?.nameByLang?.[lang]) || brand?.name || '';
  const address = (lang !== 'vi' && brand?.addressByLang?.[lang]) || brand?.address || '';
  const contacts = [
    brand?.phone && [T.hotline[lang], brand.phone],
    brand?.email && [T.email[lang], brand.email],
    brand?.website && [T.website[lang], brand.website],
    brand?.taxCode && [T.taxCode[lang], brand.taxCode],
    address && [T.address[lang], address],
  ].filter(Boolean) as [string, string][];
  const logo = brand?.logo && getServer() ? { uri: `${getServer()}${brand.logo}` } : LOGO;

  const u = size.h / 100; // 1% chiều cao màn hình
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const welcomeH = 3.4 * u * 1.4 + 2 * u;
  const subH = subtitle ? 4.2 * u * 1.3 * 2 + 2.4 * u : 0;
  // Chiều cao dành cho tên khách: phần giữa trừ dòng Chào mừng, dòng phụ và lề
  const titleMax = Math.max(40, body.h - welcomeH - subH - 5 * u);
  const text = (title || '—').toUpperCase();
  // Cỡ chữ tên khách lớn nhất vừa khung: giả lập xuống dòng theo từ (chữ in đậm rộng khoảng 0,72 cỡ chữ).
  // Tính trước thay vì đo lại sau mỗi lần vẽ: chạy giống nhau trên Android, iPhone và bản web xem thử.
  const titlePx = fitTitle(text, body.w - 10 * u, titleMax, 30 * u);

  return (
    <View style={s.board} onLayout={onLayout}>
      {size.h > 0 && (
        <>
          <View style={[s.head, { paddingVertical: 2.4 * u, paddingHorizontal: 4 * u, borderBottomWidth: Math.max(2, 0.7 * u), gap: 2.4 * u }]}>
            <Image source={logo} style={{ height: 10 * u, width: 22 * u }} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              {name ? (
                <Text style={[s.name, { fontSize: 3.6 * u }]} numberOfLines={2}>
                  {name.toUpperCase()}
                </Text>
              ) : null}
              {brand?.slogan ? <Text style={[s.slogan, { fontSize: 2.1 * u }]} numberOfLines={1}>{brand.slogan}</Text> : null}
            </View>
            {brand?.phone ? (
              <View style={[s.hotline, { paddingLeft: 2.4 * u }]}>
                <Text style={[s.hotlineLabel, { fontSize: 1.7 * u }]}>{T.hotline[lang].toUpperCase()}</Text>
                <Text style={[s.hotlineValue, { fontSize: 4 * u }]}>{brand.phone}</Text>
              </View>
            ) : null}
          </View>

          <View style={[s.body, { paddingHorizontal: 5 * u }]} onLayout={(e) => setBody({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            <Image source={logo} style={s.watermark} resizeMode="contain" />
            <View style={[s.welcomeRow, { gap: 2.4 * u, marginBottom: 2 * u }]}>
              <View style={[s.line, { width: 12 * u }]} />
              <Text style={[s.welcome, { fontSize: 3.4 * u, letterSpacing: 0.9 * u }]}>{T.welcome[lang].toUpperCase()}</Text>
              <View style={[s.line, { width: 12 * u }]} />
            </View>
            {titlePx > 0 && <Text style={[s.title, { fontSize: titlePx, lineHeight: Math.round(titlePx * 1.18) }]}>{text}</Text>}
            {subtitle ? (
              <Text style={[s.sub, { fontSize: 4.2 * u, marginTop: 2.4 * u }]} adjustsFontSizeToFit numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          {contacts.length > 0 && (
            <View style={[s.foot, { paddingVertical: 1.6 * u, paddingHorizontal: 4 * u, columnGap: 3 * u }]}>
              {contacts.map(([label, value]) => (
                <Text key={label} style={[s.footText, { fontSize: 1.9 * u }]}>
                  <Text style={s.footLabel}>{label}: </Text>
                  {value}
                </Text>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  board: { flex: 1, backgroundColor: '#fff' },
  head: { flexDirection: 'row', alignItems: 'center', borderBottomColor: ACCENT },
  name: { color: PRIMARY, fontWeight: '800' },
  slogan: { color: '#555', marginTop: 2 },
  hotline: { alignItems: 'flex-end', borderLeftWidth: 1, borderLeftColor: '#ddd' },
  hotlineLabel: { color: '#777', letterSpacing: 3 },
  hotlineValue: { color: PRIMARY, fontWeight: '800' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  watermark: { position: 'absolute', width: '60%', height: '72%', opacity: 0.06, alignSelf: 'center' },
  welcomeRow: { flexDirection: 'row', alignItems: 'center' },
  line: { height: 2, backgroundColor: ACCENT },
  welcome: { color: ACCENT, fontWeight: '700' },
  title: { color: '#111', fontWeight: '900', textAlign: 'center', width: '100%' },
  sub: { color: '#333', textAlign: 'center', width: '100%' },
  foot: { backgroundColor: PRIMARY, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 2 },
  footText: { color: '#fff' },
  footLabel: { color: ACCENT, fontWeight: '700' },
});
