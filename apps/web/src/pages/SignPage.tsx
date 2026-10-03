import { MinusOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Checkbox, Flex, Space, Spin } from 'antd';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useSettings } from '../components/common';
import type { Booking } from '../types';

const css = `
  body { background: #e9e9e9; }
  .sign-page { width: 297mm; height: 210mm; margin: 16px auto; background: #fff; color: #000; box-sizing: border-box;
               padding: 14mm 16mm; display: flex; flex-direction: column; box-shadow: 0 2px 14px rgba(0,0,0,.15);
               font-family: Arial, 'Helvetica Neue', sans-serif; }
  .sign-head { text-align: center; font-size: 6mm; font-weight: 700; letter-spacing: .5mm; color: #222; border-bottom: .6mm solid #000; padding-bottom: 3mm; }
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
  const [showCompany, setShowCompany] = useState(true);
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
  }, [title, subtitle, showCompany, b]);

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
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          In / Lưu PDF
        </Button>
        <Space.Compact>
          <Button icon={<MinusOutlined />} onClick={() => setScale((s) => Math.max(0.5, s - 0.1))} title="Chữ nhỏ hơn" />
          <Button onClick={() => setScale(1)}>Cỡ chữ {Math.round(scale * 100)}%</Button>
          <Button icon={<PlusOutlined />} onClick={() => setScale((s) => Math.min(1.5, s + 0.1))} title="Chữ to hơn" />
        </Space.Compact>
        <Checkbox checked={showCompany} onChange={(e) => setShowCompany(e.target.checked)}>
          Hiện tên công ty
        </Checkbox>
        <Button onClick={() => window.close()}>Đóng</Button>
      </Flex>

      <div className="zoom" style={{ transform: `scale(${zoom})`, height: zoom < 1 ? `calc(210mm * ${zoom} + 32px)` : undefined }}>
        <div className="sign-page">
          {showCompany && settings.companyName && <div className="sign-head">{settings.companyName}</div>}
          <div className="sign-body" ref={bodyRef}>
            <div className="sign-title" ref={titleRef} style={{ fontSize: `${fitSize * scale}mm` }}>
              {title}
            </div>
            {subtitle && <div className="sign-sub">{subtitle}</div>}
          </div>
          {showCompany && settings.companyPhone && <div className="sign-foot">Hotline: {settings.companyPhone}</div>}
        </div>
      </div>
    </>
  );
}
