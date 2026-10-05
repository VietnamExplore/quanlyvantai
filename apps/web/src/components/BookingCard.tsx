import { EditOutlined } from '@ant-design/icons';
import { Button, Flex, Typography } from 'antd';
import dayjs from 'dayjs';
import { flightText, routeText } from '../booking-utils';
import { BOOKING_STATUS } from '../labels';
import type { Booking } from '../types';
import { BookingStatusMenu } from './BookingStatusMenu';
import { EnumTag, Money, ServiceTag } from './common';
import { PaidTag } from './finance';

/** Thẻ booking cho điện thoại: thay cho một dòng bảng nhiều cột (không phải vuốt ngang) */
export function BookingCard({ b, canEdit, onEdit }: { b: Booking; canEdit: boolean; onEdit: () => void }) {
  const live = b.trips.filter((t) => t.status !== 'HUY');
  const list = live.length ? live : b.trips;
  const first = list[0];
  const fl = first ? flightText(first) : '';
  return (
    <div className="booking-card">
      <Flex justify="space-between" align="flex-start" gap={8}>
        <div style={{ minWidth: 0 }}>
          <div className="booking-card-code nowrap">{b.code}</div>
          {b.customerRef && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Mã khách: {b.customerRef}</Typography.Text>}
        </div>
        <EnumTag labels={BOOKING_STATUS} value={b.status} />
      </Flex>

      <div className="booking-card-customer">
        <b>{b.customer?.name ?? b.contactName}</b>
        <Typography.Text type="secondary">
          {' · '}
          {b.customer && b.contactName !== b.customer.name ? `${b.contactName} · ` : ''}
          <span className="nowrap">{b.contactPhone}</span>
        </Typography.Text>
      </div>

      {first ? (
        <>
          <Flex align="center" gap={6} wrap style={{ marginTop: 6 }}>
            <span className="nowrap">🕘 {dayjs(first.pickupTime).format('HH:mm dd DD/MM/YYYY')}</span>
            <ServiceTag code={first.serviceType} />
          </Flex>
          <div className="booking-card-route">
            {routeText(first)}
            {fl && <Typography.Text type="secondary"> · ✈ {fl}</Typography.Text>}
            {list.length > 1 && <Typography.Text type="secondary"> (+{list.length - 1} chuyến)</Typography.Text>}
          </div>
        </>
      ) : (
        <Typography.Text type="secondary">Chưa có chuyến</Typography.Text>
      )}

      <Flex justify="space-between" align="center" gap={8} wrap style={{ marginTop: 8 }}>
        <Flex align="center" gap={6} wrap>
          <span style={{ fontSize: 16 }}>
            <Money value={b.total} strong />
          </span>
          {b.status !== 'HUY' && <PaidTag total={b.total} paid={b.paid} />}
          {b.status !== 'HUY' && b.balance > 0 && b.paid > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              còn {b.balance.toLocaleString('vi-VN')} đ
            </Typography.Text>
          )}
        </Flex>
        <Flex gap={6} onClick={(e) => e.stopPropagation()}>
          <Button size="small" icon={<EditOutlined />} onClick={onEdit}>
            {b.status === 'HUY' || !canEdit ? 'Xem' : 'Sửa'}
          </Button>
          {canEdit && <BookingStatusMenu booking={b} compact />}
        </Flex>
      </Flex>
      {b.salesUser && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          NV: {b.salesUser.fullName}
        </Typography.Text>
      )}
    </div>
  );
}
