import { CheckCircleFilled, CopyOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, App, Button, Flex, Input, Modal, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { copyText } from '../clipboard';
import { useSettings } from './common';

export interface SendTarget {
  /** Lái xe / nhà xe nhận lệnh */
  label: string;
  name: string;
  phone: string | null | undefined;
}

/** Mở cuộc trò chuyện Zalo theo số điện thoại (Zalo PC / web / điện thoại) */
export const zaloChatUrl = (phone: string) => {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('84')) d = '0' + d.slice(2);
  return `https://zalo.me/${d}`;
};

/**
 * Gán xe xong: tự sao chép lệnh điều xe, mở nhóm Zalo lái xe và Zalo riêng của lái xe / nhà xe để dán gửi.
 * Zalo không cho phần mềm ngoài tự gửi tin vào nhóm / Zalo cá nhân, nên người điều hành chỉ cần dán (Ctrl+V) và bấm Gửi.
 */
export function SendOrderModal({ open, text, targets, onClose }: { open: boolean; text: string; targets: SendTarget[]; onClose: () => void }) {
  const { message } = App.useApp();
  const settings = useSettings();
  const group = settings.zaloDriverGroup?.trim();
  const [copied, setCopied] = useState<boolean | null>(null);
  const last = useRef('');

  // Tự sao chép khi mở (và khi nội dung vừa cập nhật sau khi gán xe)
  useEffect(() => {
    if (!open || !text || last.current === text) return;
    last.current = text;
    copyText(text).then(setCopied);
  }, [open, text]);

  const copyAgain = async () => {
    const ok = await copyText(text);
    setCopied(ok);
    if (ok) message.success('Đã sao chép lệnh điều xe');
  };

  const close = () => {
    last.current = '';
    setCopied(null);
    onClose();
  };

  return (
    <Modal open={open} onCancel={close} footer={null} width={620} title="Gửi lệnh điều xe qua Zalo" destroyOnHidden>
      <Flex vertical gap={12}>
        {copied ? (
          <Alert type="success" showIcon icon={<CheckCircleFilled />} title="Đã sao chép lệnh điều xe. Mở Zalo bên dưới → dán (Ctrl+V) → Gửi." />
        ) : copied === false ? (
          <Alert type="warning" showIcon title="Trình duyệt chưa cho tự sao chép — bấm Sao chép rồi mở Zalo để dán." />
        ) : null}

        <Flex gap={8} wrap>
          {group ? (
            <Button type="primary" icon={<TeamOutlined />} href={group} target="_blank">
              1. Mở nhóm Zalo lái xe
            </Button>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Chưa cài link nhóm Zalo lái xe – thêm ở <Link to="/settings">Cài đặt → Thông tin công ty</Link>.
            </Typography.Text>
          )}
          {targets
            .filter((t) => t.phone)
            .map((t, i) => (
              <Button key={t.label} icon={<UserOutlined />} href={zaloChatUrl(t.phone!)} target="_blank">
                {group ? i + 2 : i + 1}. Mở Zalo {t.label}: {t.name}
              </Button>
            ))}
          <Button icon={<CopyOutlined />} onClick={copyAgain}>
            Sao chép lại
          </Button>
        </Flex>
        {targets.some((t) => !t.phone) && (
          <Typography.Text type="warning" style={{ fontSize: 13 }}>
            {targets
              .filter((t) => !t.phone)
              .map((t) => `${t.label} ${t.name}`)
              .join(', ')}{' '}
            chưa có số điện thoại để mở Zalo.
          </Typography.Text>
        )}
        <Input.TextArea value={text} readOnly autoSize={{ minRows: 6, maxRows: 14 }} style={{ fontSize: 13 }} />
        <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
          Lái xe công ty đồng thời nhận thông báo trên app lái xe. Zalo không cho phần mềm tự gửi tin vào nhóm / Zalo cá nhân, nên bước dán và gửi làm bằng tay.
        </Typography.Text>
      </Flex>
    </Modal>
  );
}
