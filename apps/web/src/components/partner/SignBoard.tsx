import { CloseOutlined, PrinterOutlined } from '@ant-design/icons';
import { Button, Spin } from 'antd';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiBlob } from '../../api';

/**
 * Bảng đón toàn màn hình (giống app lái xe): file bảng đón khách gửi, hoặc chữ tên đoàn tự co vừa khung.
 * Điện thoại cầm dọc thì tự xoay ngang để chữ to nhất; có nút In (A4 ngang).
 */
export function SignBoard({ tripId, title, subtitle, hasFile, onClose }: { tripId: number; title: string; subtitle?: string | null; hasFile: boolean; onClose: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kích thước màn hình thật (đơn vị vw/vh trên một số trình duyệt điện thoại không khớp vùng hiển thị)
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const portrait = view.h > view.w && view.w < 900;

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
    <div className="sign-overlay sign-print-root">
      <div
        className={portrait ? 'sign-stage sign-stage-rotate' : 'sign-stage'}
        style={portrait ? { width: view.h, height: view.w } : { width: view.w, height: view.h }}
      >
        {hasFile ? (
          img ? (
            <img src={img} alt="Bảng đón" className="sign-image" />
          ) : error ? (
            <TextBoard title={title} subtitle={subtitle} />
          ) : (
            <Spin size="large" />
          )
        ) : (
          <TextBoard title={title} subtitle={subtitle} />
        )}
      </div>
      <div className="sign-tools">
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

/** Chữ tên đoàn tự co vừa khung: dòng chính to nhất có thể, dòng phụ nhỏ hơn */
function TextBoard({ title, subtitle }: { title: string; subtitle?: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(64);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth * 0.92;
      const h = el.clientHeight * (subtitle ? 0.6 : 0.8);
      const longest = Math.max(...title.split(/\n/).map((l) => l.length), 1);
      const lines = Math.max(1, Math.ceil((longest * 0.62 * h * 0.5) / w));
      setSize(Math.max(18, Math.min(w / (longest * 0.62), h / (lines * 1.15))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [title, subtitle]);
  return (
    <div ref={box} className="sign-text-board">
      <div style={{ fontSize: size, fontWeight: 800, lineHeight: 1.1, textTransform: 'uppercase', wordBreak: 'break-word' }}>{title || '—'}</div>
      {subtitle && <div style={{ fontSize: Math.max(14, size * 0.32), marginTop: size * 0.25 }}>{subtitle}</div>}
    </div>
  );
}
