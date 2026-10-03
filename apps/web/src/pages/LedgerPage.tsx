import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, DatePicker, Flex, Row, Segmented, Statistic, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { DATE_FORMAT, EnumTag, formatVnd } from '../components/common';
import { downloadCsv } from '../csv';
import { PAYMENT_METHOD } from '../labels';
import type { PaymentMethod } from '../types';

interface Entry {
  key: string;
  type: 'THU' | 'CHI';
  source: 'PAYMENT' | 'PARTNER_PAYMENT' | 'TRIP_COST';
  date: string;
  category: string;
  amount: number;
  description: string;
  bookingId: number | null;
  method: PaymentMethod | null;
  reference: string | null;
  note: string | null;
  by: string;
}

interface Ledger {
  from: string;
  to: string;
  income: number;
  expense: number;
  net: number;
  entries: Entry[];
}

export default function LedgerPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [type, setType] = useState<'ALL' | 'THU' | 'CHI'>('ALL');
  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');
  const { data, isLoading } = useQuery({ queryKey: ['/finance', 'ledger', from, to], queryFn: () => api<Ledger>('/finance/ledger', { query: { from, to } }) });

  const entries = (data?.entries ?? []).filter((e) => type === 'ALL' || e.type === type);

  function exportCsv() {
    downloadCsv(
      `so-thu-chi-${from}-${to}.csv`,
      ['Ngày', 'Loại', 'Khoản mục', 'Diễn giải', 'Thu', 'Chi', 'Hình thức', 'Chứng từ', 'Ghi chú', 'Người ghi'],
      entries.map((e) => [
        dayjs(e.date).format(DATE_FORMAT),
        e.type === 'THU' ? 'Thu' : 'Chi',
        e.category,
        e.description,
        e.type === 'THU' ? e.amount : '',
        e.type === 'CHI' ? e.amount : '',
        e.method ? PAYMENT_METHOD[e.method].label : '',
        e.reference,
        e.note,
        e.by,
      ]),
    );
  }

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Sổ thu chi
        </Typography.Title>
        <Flex gap={8} wrap>
          <DatePicker.RangePicker format="DD/MM/YYYY" allowClear={false} value={range} onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])} />
          <Segmented
            value={type}
            onChange={(v) => setType(v as typeof type)}
            options={[
              { value: 'ALL', label: 'Tất cả' },
              { value: 'THU', label: 'Thu' },
              { value: 'CHI', label: 'Chi' },
            ]}
          />
          <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!entries.length}>
            Xuất Excel
          </Button>
        </Flex>
      </Flex>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Tổng thu" value={data?.income ?? 0} formatter={(v) => `${formatVnd(Number(v))} đ`} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title="Tổng chi" value={data?.expense ?? 0} formatter={(v) => `${formatVnd(Number(v))} đ`} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title="Chênh lệch thu − chi" value={data?.net ?? 0} formatter={(v) => `${formatVnd(Number(v))} đ`} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Table<Entry>
          rowKey="key"
          size="middle"
          loading={isLoading}
          dataSource={entries}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          locale={{ emptyText: 'Không có khoản thu chi trong khoảng thời gian này' }}
          columns={[
            { title: 'Ngày', dataIndex: 'date', render: (v) => dayjs(v).format(DATE_FORMAT) },
            { title: 'Loại', dataIndex: 'type', render: (v) => (v === 'THU' ? <Tag color="green">Thu</Tag> : <Tag color="red">Chi</Tag>) },
            { title: 'Khoản mục', dataIndex: 'category' },
            { title: 'Diễn giải', render: (_, e) => (e.bookingId ? <Link to={`/bookings/${e.bookingId}`}>{e.description}</Link> : e.description) },
            { title: 'Thu', align: 'right', render: (_, e) => (e.type === 'THU' ? <Typography.Text style={{ color: '#3f8600' }}>{formatVnd(e.amount)}</Typography.Text> : '') },
            { title: 'Chi', align: 'right', render: (_, e) => (e.type === 'CHI' ? <Typography.Text type="danger">{formatVnd(e.amount)}</Typography.Text> : '') },
            { title: 'Hình thức', dataIndex: 'method', render: (v) => (v ? <EnumTag labels={PAYMENT_METHOD} value={v} /> : '') },
            { title: 'Chứng từ / ghi chú', render: (_, e) => [e.reference, e.note].filter(Boolean).join(' · ') },
            { title: 'Người ghi', dataIndex: 'by' },
          ]}
        />
      </Card>
    </Flex>
  );
}
