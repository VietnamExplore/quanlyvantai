import { Flex, Grid, Select, Table, Typography, type TableProps } from 'antd';
import type { ColumnType } from 'antd/es/table';
import { isValidElement, useMemo, useState, type ReactNode } from 'react';

type Col<T> = ColumnType<T> & { children?: unknown };

/** Lấy giá trị theo dataIndex: 'code' hoặc ['booking', 'code'] */
function valueOf(record: object, dataIndex: ColumnType<object>['dataIndex']) {
  if (dataIndex === undefined || dataIndex === null) return undefined;
  const path = Array.isArray(dataIndex) ? dataIndex : [dataIndex];
  return path.reduce<unknown>((v, k) => (v == null ? v : (v as Record<string, unknown>)[k as string]), record);
}

function renderCell<T extends object>(c: Col<T>, record: T, index: number): ReactNode {
  const value = valueOf(record, c.dataIndex as ColumnType<object>['dataIndex']);
  const out = c.render ? c.render(value, record, index) : (value as ReactNode);
  // render của antd có thể trả về { children, props }
  if (out && typeof out === 'object' && !isValidElement(out) && 'children' in (out as object)) return (out as { children: ReactNode }).children;
  return out as ReactNode;
}

const isEmpty = (v: ReactNode) => v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0);

const titleText = <T,>(c: Col<T>): ReactNode => (typeof c.title === 'function' ? (c.title as (p: object) => ReactNode)({}) : (c.title as ReactNode));

/** Cột nút thao tác: không có tiêu đề, cố định bên phải, hoặc key là actions / edit */
const isAction = <T,>(c: Col<T>) => !c.title || c.fixed === 'right' || c.key === 'actions' || c.key === 'edit';

const compareOf = <T,>(c: Col<T>) =>
  typeof c.sorter === 'function' ? c.sorter : c.sorter && typeof c.sorter === 'object' && 'compare' in c.sorter ? c.sorter.compare : undefined;

/**
 * Bảng tự chuyển thành thẻ trên điện thoại (< 768px): mỗi dòng là một thẻ, cột đầu làm tiêu đề,
 * các cột khác thành dòng "Tên cột: giá trị", nút thao tác ở cuối thẻ. Cột sắp xếp được → ô "Sắp xếp theo".
 * Máy tính bảng / máy tính: giữ nguyên bảng antd. Thêm cột vào bảng thì thẻ tự có theo.
 */
export function ResponsiveTable<T extends object>(props: TableProps<T> & { mobileCards?: boolean }) {
  const { mobileCards = true, ...tableProps } = props;
  const mobile = Grid.useBreakpoint().md === false && mobileCards;

  const cols = useMemo(
    () => ((tableProps.columns ?? []) as Col<T>[]).filter((c) => !c.hidden && !c.children && titleText(c) !== '#'),
    [tableProps.columns],
  );
  const sortable = useMemo(() => cols.filter((c) => compareOf(c) && titleText(c)), [cols]);
  const defaultSort = sortable.find((c) => c.defaultSortOrder);
  const [sort, setSort] = useState<string | null>(() => (defaultSort ? `${sortable.indexOf(defaultSort)}:${defaultSort.defaultSortOrder}` : null));

  const data = useMemo(() => {
    const src = (tableProps.dataSource ?? []) as T[];
    if (!mobile || !sort) return src;
    const [i, dir] = sort.split(':');
    const cmp = compareOf(sortable[Number(i)]);
    if (!cmp) return src;
    return [...src].sort((a, b) => (dir === 'descend' ? -1 : 1) * cmp(a, b, dir as 'ascend' | 'descend'));
  }, [tableProps.dataSource, mobile, sort, sortable]);

  if (!mobile) return <Table<T> {...tableProps} />;

  const actions = cols.filter(isAction);
  const fields = cols.filter((c) => !isAction(c));
  const [head, ...rest] = fields;

  const card = (record: T, index: number) => {
    const headValue = head ? renderCell(head, record, index) : null;
    return (
      <div className="auto-card">
        {!isEmpty(headValue) && <div className="auto-card-head">{headValue}</div>}
        {rest.map((c, k) => {
          const v = renderCell(c, record, index);
          if (isEmpty(v)) return null;
          return (
            <div className="auto-card-row" key={String(c.key ?? c.dataIndex ?? k)}>
              <span className="auto-card-label">{titleText(c)}</span>
              <div className="auto-card-value">{v}</div>
            </div>
          );
        })}
        {actions.length > 0 && (
          <Flex gap={6} wrap justify="flex-end" className="auto-card-actions" onClick={(e) => e.stopPropagation()}>
            {actions.map((c, k) => (
              <span key={String(c.key ?? k)}>{renderCell(c, record, index)}</span>
            ))}
          </Flex>
        )}
      </div>
    );
  };

  const { columns: _c, scroll: _s, summary: _sum, sticky: _st, rowSelection, ...rest2 } = tableProps;
  return (
    <>
      {sortable.length > 0 && data.length > 1 && (
        <Flex align="center" gap={8} style={{ marginBottom: 10 }}>
          <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
            Sắp xếp theo
          </Typography.Text>
          <Select
            allowClear
            placeholder="Mặc định"
            value={sort}
            onChange={(v) => setSort(v ?? null)}
            style={{ flex: 1, minWidth: 0 }}
            options={sortable.flatMap((c, i) => [
              { value: `${i}:ascend`, label: <>{titleText(c)} ↑</> },
              { value: `${i}:descend`, label: <>{titleText(c)} ↓</> },
            ])}
          />
        </Flex>
      )}
      <Table<T>
        {...rest2}
        className={[tableProps.className, 'auto-cards'].filter(Boolean).join(' ')}
        dataSource={data}
        showHeader={!!rowSelection}
        rowSelection={rowSelection && { ...rowSelection, columnWidth: 44 }}
        columns={[{ key: '__card', title: rowSelection ? <Typography.Text type="secondary">Chọn tất cả</Typography.Text> : undefined, render: (_: unknown, r: T, i: number) => card(r, i) }]}
      />
    </>
  );
}

