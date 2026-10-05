import { useQuery } from '@tanstack/react-query';
import { Card, Checkbox, DatePicker, Flex, Input, Select, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { AUDIT_ENTITY, ChangesList, type AuditEntry } from '../components/AuditLog';
import { ResponsiveTable } from '../components/ResponsiveTable';

interface AuditResponse {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  users: { id: number; name: string | null }[];
}

const PAGE_SIZE = 100;

/** Nhật ký thao tác toàn hệ thống (chỉ Admin): ai làm gì, lúc nào, thay đổi những gì */
export default function AuditLogPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()]);
  const [userId, setUserId] = useState<number | undefined>();
  const [entity, setEntity] = useState<string | undefined>();
  const [q, setQ] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);

  const query = {
    from: range[0].format('YYYY-MM-DD'),
    to: range[1].format('YYYY-MM-DD'),
    userId,
    entity,
    q,
    failed: failed ? 1 : undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const { data, isFetching } = useQuery({ queryKey: ['/audit-logs', query], queryFn: () => api<AuditResponse>('/audit-logs', { query }) });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <Card title="Nhật ký thao tác">
      <Typography.Paragraph type="secondary">
        Ghi lại mọi thao tác thêm / sửa / xóa / đổi trạng thái của nhân viên và lái xe, kèm chi tiết thay đổi "trước → sau", và các lần đăng nhập. Mật khẩu không bao giờ được ghi. Nhật ký giữ 2 năm.
      </Typography.Paragraph>
      <Flex gap={8} wrap style={{ marginBottom: 12 }}>
        <DatePicker.RangePicker format="DD/MM/YYYY" allowClear={false} value={range} onChange={(v) => v?.[0] && v[1] && reset(setRange)([v[0], v[1]])} />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Người thao tác"
          style={{ width: 200 }}
          value={userId}
          onChange={reset(setUserId)}
          options={(data?.users ?? []).map((u) => ({ value: u.id, label: u.name ?? `#${u.id}` }))}
        />
        <Select
          allowClear
          placeholder="Loại"
          style={{ width: 190 }}
          value={entity}
          onChange={reset(setEntity)}
          options={Object.entries(AUDIT_ENTITY).map(([value, label]) => ({ value, label }))}
        />
        <Input.Search allowClear placeholder="Mã booking, biển số, tên, thao tác…" style={{ width: 260 }} onSearch={(v) => reset(setQ)(v.trim() || undefined)} />
        <Checkbox checked={failed} onChange={(e) => reset(setFailed)(e.target.checked)}>
          Chỉ thao tác thất bại (đăng nhập sai…)
        </Checkbox>
      </Flex>

      <ResponsiveTable<AuditEntry>
        rowKey="id"
        size="small"
        loading={isFetching}
        dataSource={data?.items ?? []}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: setPage,
          showSizeChanger: false,
          showTotal: (total, [a, b]) => `${a}–${b} / ${total} dòng`,
        }}
        locale={{ emptyText: 'Không có thao tác nào trong khoảng này' }}
        columns={[
          { title: 'Thời gian', dataIndex: 'createdAt', width: 150, render: (v) => <span className="nowrap">{dayjs(v).format('HH:mm:ss DD/MM/YYYY')}</span> },
          { title: 'Người thao tác', dataIndex: 'userName', render: (v) => v ?? <Typography.Text type="secondary">—</Typography.Text> },
          {
            title: 'Thao tác',
            dataIndex: 'action',
            render: (v, l) => (
              <>
                {v}
                {!l.success && (
                  <Tag color="red" style={{ marginLeft: 6 }}>
                    Thất bại
                  </Tag>
                )}
              </>
            ),
          },
          {
            title: 'Đối tượng',
            render: (_, l) =>
              l.entityLabel ? (
                l.bookingId ? (
                  <Link to={`/bookings/${l.bookingId}`}>{l.entityLabel}</Link>
                ) : (
                  l.entityLabel
                )
              ) : null,
          },
          {
            title: 'Chi tiết',
            render: (_, l) => (
              <div style={{ minWidth: 200, maxWidth: 520 }}>
                {l.detail && <div>{l.detail}</div>}
                <ChangesList changes={l.changes} />
              </div>
            ),
          },
          { title: 'IP', dataIndex: 'ip', responsive: ['xl'], render: (v) => <Typography.Text type="secondary">{v}</Typography.Text> },
        ]}
      />
    </Card>
  );
}
