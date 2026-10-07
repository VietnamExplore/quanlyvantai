import { CloseOutlined, FontSizeOutlined, PictureOutlined, PrinterOutlined } from '@ant-design/icons';
import { Button, Spin } from 'antd';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiBlob } from '../../api';
import { BrandSign } from './BrandSign';

/**
 * Bảng đón toàn màn hình (giống app lái xe): file bảng đón khách gửi, hoặc bảng chữ kiểu mới có logo và thông tin công ty.
 * Điện thoại cầm dọc thì tự xoay ngang để chữ to nhất; có nút In (A4 ngang).
 */
export function SignBoard({ tripId, title, subtitle, lang, hasFile, onClose }: { tripId: number; title: string; subtitle?: string | null; lang?: string | null; hasFile: boolean; onClose: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kích thước màn hình thật (đơn vị vw/vh trên một số trình duyệt điện thoại không khớp vùng hiển thị)
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const portrait = view.h > view.w && view.w < 900;
  // Có file khách gửi thì mặc định hiện file đó, chuyển qua lại được với bảng chữ kiểu mới
  const [mode, setMode] = useState<'image' | 'text'>(hasFile ? 'image' : 'text');
  const showImage = hasFile && !error && mode === 'image';
  // Nút In / Đóng tự ẩn sau vài giây để không che hotline trên bảng; chạm màn hình để hiện lại
  const [tools, setTools] = useState(true);
  useEffect(() => {
    if (!tools) return;
    const timer = setTimeout(() => setTools(false), 4000);
    return () => clearTimeout(timer);
  }, [tools]);

  useEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!hasFile) return;
    let url: string | null = null;
    apiBlob(`/partner/trips/${tripId}/sign-file`)
      .then((b) => setImg((url = URL.createObjectURL(b))))
      .catch((e) => setError((e as Error).message));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [tripId, hasFile]);

  return createPortal(
    <div className="sign-overlay sign-print-root" onClick={() => setTools(true)}>
      <div
        className={[portrait ? 'sign-stage sign-stage-rotate' : 'sign-stage', showImage ? '' : 'sign-stage-full'].join(' ')}
        style={portrait ? { width: view.h, height: view.w } : { width: view.w, height: view.h }}
      >
        {showImage ? img ? <img src={img} alt="Bảng đón" className="sign-image" /> : <Spin size="large" /> : <BrandSign title={title} subtitle={subtitle} lang={lang} />}
      </div>
      <div className="sign-tools" style={{ opacity: tools ? 1 : 0, pointerEvents: tools ? 'auto' : 'none', transition: 'opacity .3s' }}>
        {hasFile && !error && (
          <Button icon={mode === 'image' ? <FontSizeOutlined /> : <PictureOutlined />} onClick={() => setMode(mode === 'image' ? 'text' : 'image')}>
            {mode === 'image' ? 'Bảng chữ' : 'Ảnh khách gửi'}
          </Button>
        )}
        <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
          In
        </Button>
        <Button type="primary" danger icon={<CloseOutlined />} onClick={onClose}>
          Đóng
        </Button>
      </div>
    </div>,
    document.body,
  );
}
