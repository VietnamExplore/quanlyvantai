import type { ThemeConfig } from 'antd';

/** Bảng màu chung của phần mềm (dùng cả trong CSS qua biến --app-*) */
export const BRAND = {
  primary: '#2563eb',
  navy: '#0f1b2d',
  navy2: '#16263f',
  bg: '#f3f5f9',
  text: '#1e293b',
  muted: '#64748b',
  border: '#e2e8f0',
  borderSoft: '#edf1f6',
};

const FONT = "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Giao diện Ant Design: bo góc mềm, khoảng cách thoáng, menu tối, bảng & thẻ nhẹ nhàng */
export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: BRAND.primary,
    colorInfo: BRAND.primary,
    colorSuccess: '#16a34a',
    colorWarning: '#f59e0b',
    colorError: '#dc2626',
    colorText: BRAND.text,
    colorTextSecondary: BRAND.muted,
    colorBorder: BRAND.border,
    colorBorderSecondary: BRAND.borderSoft,
    colorBgLayout: BRAND.bg,
    fontFamily: FONT,
    fontSize: 14,
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 6,
    controlHeight: 36,
    controlHeightLG: 42,
    boxShadowTertiary: '0 1px 2px rgba(15, 23, 42, 0.04), 0 2px 10px rgba(15, 23, 42, 0.04)',
    wireframe: false,
  },
  components: {
    Layout: {
      siderBg: BRAND.navy,
      headerBg: 'rgba(255, 255, 255, 0.86)',
      headerHeight: 64,
      headerPadding: '0 24px',
      bodyBg: BRAND.bg,
      triggerBg: BRAND.navy2,
    },
    Menu: {
      darkItemBg: BRAND.navy,
      darkSubMenuItemBg: BRAND.navy,
      darkItemColor: 'rgba(226, 232, 240, 0.72)',
      darkItemHoverColor: '#ffffff',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.06)',
      darkItemSelectedBg: BRAND.primary,
      darkItemSelectedColor: '#ffffff',
      darkGroupTitleColor: 'rgba(148, 163, 184, 0.65)',
      itemBorderRadius: 10,
      itemMarginInline: 12,
      itemHeight: 40,
      groupTitleFontSize: 11,
      iconSize: 16,
      collapsedIconSize: 18,
    },
    Card: {
      headerFontSize: 15,
      headerHeight: 52,
      paddingLG: 20,
    },
    Table: {
      headerBg: '#f8fafc',
      headerColor: '#475569',
      headerSplitColor: 'transparent',
      rowHoverBg: '#f5f8ff',
      borderColor: BRAND.borderSoft,
      cellPaddingBlock: 12,
      cellPaddingBlockSM: 8,
      headerBorderRadius: 10,
    },
    Button: {
      fontWeight: 500,
      primaryShadow: '0 4px 12px rgba(37, 99, 235, 0.24)',
      defaultShadow: 'none',
      dangerShadow: 'none',
    },
    Modal: {
      titleFontSize: 17,
    },
    Segmented: {
      trackBg: '#eef2f7',
      itemSelectedBg: '#ffffff',
    },
    Statistic: {
      titleFontSize: 13,
      contentFontSize: 26,
    },
    Tag: {
      defaultBg: '#f1f5f9',
    },
    Tabs: {
      titleFontSize: 14,
    },
    Descriptions: {
      labelBg: '#f8fafc',
    },
    Alert: {
      withDescriptionPadding: '14px 18px',
    },
  },
};
