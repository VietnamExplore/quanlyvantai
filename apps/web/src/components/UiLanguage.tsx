import { GlobalOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, ConfigProvider, Dropdown, Tooltip, type ThemeConfig } from 'antd';
import enUS from 'antd/locale/en_US';
import jaJP from 'antd/locale/ja_JP';
import koKR from 'antd/locale/ko_KR';
import viVN from 'antd/locale/vi_VN';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/vi';
import 'dayjs/locale/zh-cn';
import { useEffect, useState, type ReactNode } from 'react';
import { savedUiLang, uiTranslator, UI_LANGS, type UiLang } from '../ui-i18n';

const ANTD_LOCALE = { vi: viVN, en: enUS, ko: koKR, zh: zhCN, ja: jaJP };
const DAYJS_LOCALE: Record<UiLang, string> = { vi: 'vi', en: 'en', ko: 'ko', zh: 'zh-cn', ja: 'ja' };

function useUiTranslator() {
  const [state, setState] = useState({ lang: savedUiLang(), pending: 0, error: null as string | null });
  useEffect(() => uiTranslator.subscribe(setState), []);
  return state;
}

/** Bọc toàn ứng dụng: ngôn ngữ của lịch, phân trang… theo ngôn ngữ giao diện; bật dịch tự động nếu đã chọn trước đó */
export function UiLanguageProvider({ theme, children }: { theme: ThemeConfig; children: ReactNode }) {
  const { lang } = useUiTranslator();
  useEffect(() => {
    const saved = savedUiLang();
    if (saved !== 'vi') void uiTranslator.setLang(saved);
  }, []);
  dayjs.locale(DAYJS_LOCALE[lang]);
  return (
    <ConfigProvider locale={ANTD_LOCALE[lang]} theme={theme}>
      {children}
    </ConfigProvider>
  );
}

/** Nút chọn ngôn ngữ giao diện (đặt trên thanh tiêu đề và trang đăng nhập) */
export function UiLanguageSwitcher({ compact }: { compact?: boolean }) {
  const { lang, pending, error } = useUiTranslator();
  // Đăng nhập xong: lấy bản dịch đã lưu trên máy chủ và dịch nốt câu còn thiếu
  useEffect(() => {
    void uiTranslator.refreshDictionary();
  }, []);
  const current = UI_LANGS.find((l) => l.value === lang)!;
  const icon = pending ? <LoadingOutlined /> : error ? <WarningOutlined style={{ color: '#d97706' }} /> : <GlobalOutlined />;
  return (
    <span className="notranslate" translate="no">
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{
          selectable: true,
          selectedKeys: [lang],
          items: UI_LANGS.map((l) => ({ key: l.value, label: l.label })),
          onClick: ({ key }) => void uiTranslator.setLang(key as UiLang),
        }}
      >
        <Tooltip title={error ? `Chưa dịch được: ${error}` : pending ? 'Đang dịch…' : 'Ngôn ngữ giao diện'}>
          <Button icon={icon}>{compact ? current.short : current.label}</Button>
        </Tooltip>
      </Dropdown>
    </span>
  );
}
