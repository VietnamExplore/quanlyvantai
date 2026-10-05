import { ClearOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, DatePicker, Flex, Input, Segmented, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { DATE_FORMAT } from './common';

export type DebtFilter = 'all' | 'owe' | 'paid' | 'overdue';

export interface FinanceFilterValue {
  /** Kỳ đối chiếu: lọc theo ngày đi (khách) / ngày chạy (nhà xe) */
  range: [Dayjs, Dayjs] | null;
  /** Khách hàng / nhà xe được chọn (trống = tất cả) */
  ids: string[];
  /** Tìm theo mã booking, mã của khách, biển số… */
  q: string;
  debt: DebtFilter;
  invoice: 'all' | 'yes' | 'no';
  /** Công nợ khách: lọc theo nhân viên kinh doanh */
  sales: string | null;
  /** Công nợ nhà xe: chỉ chuyến có phát sinh chờ duyệt */
  pendingExtra: boolean;
}

export const EMPTY_FILTER: FinanceFilterValue = { range: null, ids: [], q: '', debt: 'all', invoice: 'all', sales: null, pendingExtra: false };

export const isFiltered = (f: FinanceFilterValue) =>
  !!f.range || f.ids.length > 0 || !!f.q.trim() || f.debt !== 'all' || f.invoice !== 'all' || !!f.sales || f.pendingExtra;

/** Ngày nằm trong kỳ lọc (không có kỳ = luôn đúng; không có ngày mà có kỳ = loại) */
export function inRange(f: FinanceFilterValue, date: string | Date | null | undefined) {
  if (!f.range) return true;
  if (!date) return false;
  const d = dayjs(date);
  return !d.isBefore(f.range[0].startOf('day')) && !d.isAfter(f.range[1].endOf('day'));
}

/** Mô tả bộ lọc để ghi vào file Excel */
export function describeFilter(f: FinanceFilterValue, debtLabels: Partial<Record<DebtFilter, string>>) {
  return [
    f.range ? `Kỳ: ${f.range[0].format(DATE_FORMAT)} – ${f.range[1].format(DATE_FORMAT)}` : 'Kỳ: tất cả thời gian',
    f.debt !== 'all' && `Tình trạng: ${debtLabels[f.debt]}`,
    f.invoice !== 'all' && (f.invoice === 'yes' ? 'Chỉ có hóa đơn' : 'Chỉ không hóa đơn'),
    f.sales && `NV kinh doanh: ${f.sales}`,
    f.pendingExtra && 'Chỉ chuyến có phát sinh chờ duyệt',
    f.q.trim() && `Tìm: "${f.q.trim()}"`,
  ]
    .filter(Boolean)
    .join(' · ');
}

const today = () => dayjs();
const PRESETS: { label: string; value: [Dayjs, Dayjs] }[] = [
  { label: 'Tháng này', value: [today().startOf('month'), today().endOf('month')] },
  { label: 'Tháng trước', value: [today().subtract(1, 'month').startOf('month'), today().subtract(1, 'month').endOf('month')] },
  { label: 'Quý này', value: [today().startOf('month').subtract(today().month() % 3, 'month'), today().startOf('month').subtract(today().month() % 3, 'month').add(2, 'month').endOf('month')] },
  { label: 'Năm nay', value: [today().startOf('year'), today().endOf('year')] },
  { label: '30 ngày qua', value: [today().subtract(29, 'day'), today()] },
];

/** Thanh lọc dùng chung cho Công nợ khách hàng và Công nợ nhà xe */
export function FinanceFilterBar({
  value,
  onChange,
  entityLabel,
  entities,
  searchPlaceholder,
  debtLabels,
  salesOptions,
  showPendingExtra,
}: {
  value: FinanceFilterValue;
  onChange: (v: FinanceFilterValue) => void;
  entityLabel: string;
  entities: { value: string; label: string }[];
  searchPlaceholder: string;
  debtLabels: Partial<Record<DebtFilter, string>>;
  salesOptions?: string[];
  showPendingExtra?: boolean;
}) {
  const set = (patch: Partial<FinanceFilterValue>) => onChange({ ...value, ...patch });
  return (
    <Flex gap={8} wrap align="center" style={{ marginBottom: 16 }}>
      <DatePicker.RangePicker
        format={DATE_FORMAT}
        presets={PRESETS}
        placeholder={['Từ ngày', 'Đến ngày']}
        value={value.range}
        onChange={(v) => set({ range: v?.[0] && v[1] ? [v[0], v[1]] : null })}
        style={{ width: 250, maxWidth: '100%' }}
      />
      <Select
        mode="multiple"
        allowClear
        showSearch
        optionFilterProp="label"
        maxTagCount="responsive"
        placeholder={`Tất cả ${entityLabel}`}
        options={entities}
        value={value.ids}
        onChange={(ids) => set({ ids })}
        style={{ minWidth: 220, maxWidth: '100%', flex: '1 1 220px' }}
      />
      <Input allowClear prefix={<SearchOutlined />} placeholder={searchPlaceholder} value={value.q} onChange={(e) => set({ q: e.target.value })} style={{ width: 200, maxWidth: '100%' }} />
      <Segmented<DebtFilter>
        value={value.debt}
        onChange={(debt) => set({ debt })}
        options={(Object.keys(debtLabels) as DebtFilter[]).map((k) => ({ value: k, label: debtLabels[k] }))}
        style={{ maxWidth: '100%', overflowX: 'auto' }}
      />
      <Select
        value={value.invoice}
        onChange={(invoice) => set({ invoice })}
        style={{ width: 150 }}
        options={[
          { value: 'all', label: 'Hóa đơn: tất cả' },
          { value: 'yes', label: 'Có hóa đơn' },
          { value: 'no', label: 'Không hóa đơn' },
        ]}
      />
      {salesOptions && (
        <Select allowClear placeholder="NV kinh doanh" value={value.sales} onChange={(sales) => set({ sales: sales ?? null })} options={salesOptions.map((s) => ({ value: s, label: s }))} style={{ width: 170 }} />
      )}
      {showPendingExtra && (
        <Segmented
          value={value.pendingExtra ? 'y' : 'n'}
          onChange={(v) => set({ pendingExtra: v === 'y' })}
          options={[
            { value: 'n', label: 'Mọi chuyến' },
            { value: 'y', label: 'Phát sinh chờ duyệt' },
          ]}
        />
      )}
      {isFiltered(value) && (
        <Button icon={<ClearOutlined />} onClick={() => onChange(EMPTY_FILTER)}>
          Xóa lọc
        </Button>
      )}
    </Flex>
  );
}

/** Tên file an toàn từ tên khách / nhà xe */
export function fileSlug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'doi-tuong'
  );
}

/** Hậu tố kỳ cho tên file: _20261001-20261031 */
export const rangeSuffix = (f: FinanceFilterValue) => (f.range ? `_${f.range[0].format('YYYYMMDD')}-${f.range[1].format('YYYYMMDD')}` : `_${dayjs().format('YYYYMMDD')}`);
