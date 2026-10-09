import { useQuery } from '@tanstack/react-query';
import { Alert, Col, DatePicker, Form, InputNumber, Row, Select, Tag, Typography, type FormInstance } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { api } from '../api';
import type { PriceLine } from '../types';
import { RUN_STATUS, shuttlePrice, stopAddress, type ShuttleRoute, type ShuttleRun } from '../shuttle-types';

const SURCHARGE_NAME = 'Phụ phí khu vực đón / trả';

/**
 * Lượt đặt chỗ xe ghép trong form chuyến: tuyến → ngày → giờ chạy (ghế còn) → điểm đón → điểm trả → người lớn / trẻ em.
 * Tự điền giờ đón, loại xe, địa chỉ điểm dừng cố định và giá vé (sửa tay được).
 */
export function ShuttleTripFields({
  form,
  agent,
  current,
}: {
  form: FormInstance;
  /** Khách của booking là đại lý: dùng giá đại lý */
  agent?: boolean;
  /** Lượt đặt đang sửa: chuyến ghép và số khách cũ (ghế của chính lượt này được tính lại) */
  current?: { runId: number | null; passengers: number };
}) {
  const routeId: number | undefined = Form.useWatch('shuttleRouteId', form);
  const date: Dayjs | undefined = Form.useWatch('shuttleDate', form);
  const runId: number | undefined = Form.useWatch('shuttleRunId', form);
  const pickId: number | undefined = Form.useWatch('shuttlePickupStopId', form);
  const dropId: number | undefined = Form.useWatch('shuttleDropoffStopId', form);
  const passengers: number = Form.useWatch('passengers', form) ?? 1;
  const children: number = Form.useWatch('childCount', form) ?? 0;

  const { data: routes = [] } = useQuery({ queryKey: ['/shuttle/routes'], queryFn: () => api<ShuttleRoute[]>('/shuttle/routes') });
  const ymd = date?.format('YYYY-MM-DD');
  const { data: runs = [], isFetching } = useQuery({
    queryKey: ['/shuttle/runs', { date: ymd, routeId }],
    queryFn: () => api<ShuttleRun[]>('/shuttle/runs', { query: { date: ymd, routeId } }),
    enabled: !!routeId && !!ymd,
  });

  const route = routes.find((r) => r.id === routeId);
  const run = runs.find((r) => r.id === runId);
  const pick = route?.stops.find((s) => s.id === pickId);
  const drop = route?.stops.find((s) => s.id === dropId);
  // Ghế còn cho lượt này (lượt đang sửa ở cùng chuyến: cộng lại số ghế của chính nó)
  const left = (r: ShuttleRun) => r.seatsLeft + (current?.runId === r.id ? current.passengers : 0);

  /** Tính lại giờ đón, loại xe, địa chỉ điểm dừng và giá khi đổi lựa chọn */
  const apply = (patch: { routeId?: number; runId?: number; pickId?: number; dropId?: number; passengers?: number; children?: number }) => {
    const r = routes.find((x) => x.id === (patch.routeId ?? routeId));
    if (!r) return;
    const rn = runs.find((x) => x.id === (patch.runId ?? runId));
    const p = r.stops.find((s) => s.id === (patch.pickId ?? pickId));
    const d = r.stops.find((s) => s.id === (patch.dropId ?? dropId));
    const pax = patch.passengers ?? passengers;
    const ch = Math.min(patch.children ?? children, pax);
    const values: Record<string, unknown> = { vehicleTypeId: rn?.vehicleTypeId ?? r.vehicleTypeId };
    if (rn) {
      const dep = dayjs(rn.departAt);
      const pickOff = p?.offsetMinutes ?? 0;
      const endOff = d && d.offsetMinutes > pickOff ? d.offsetMinutes : r.durationMinutes;
      values.pickupTime = dep.add(pickOff, 'minute');
      values.endTime = dep.add(Math.max(endOff, pickOff + 15), 'minute');
    }
    // Điểm dừng cố định: điền sẵn địa chỉ; khu vực đón: nhân viên nhập khách sạn
    if ('pickId' in patch && p) values.pickupAddress = p.kind === 'DIEM_DUNG' ? stopAddress(p) : '';
    if ('dropId' in patch && d) values.dropoffAddress = d.kind === 'DIEM_DUNG' ? stopAddress(d) : '';
    const price = shuttlePrice(r, { adults: pax - ch, children: ch, agent, pickup: p, dropoff: d });
    values.unitPrice = price.fare;
    const others = ((form.getFieldValue('surcharges') ?? []) as PriceLine[]).filter((s) => s.name !== SURCHARGE_NAME);
    values.surcharges = price.surcharge ? [{ name: SURCHARGE_NAME, amount: price.surcharge, auto: true }, ...others] : others;
    form.setFieldsValue(values);
  };

  const price = route ? shuttlePrice(route, { adults: passengers - Math.min(children, passengers), children: Math.min(children, passengers), agent, pickup: pick, dropoff: drop }) : null;

  return (
    <Row gutter={16}>
      {/* Giờ đón / kết thúc / loại xe: tự điền theo chuyến ghép */}
      <Form.Item name="pickupTime" hidden rules={[{ required: true, message: 'Chọn giờ chạy' }]}>
        <DatePicker />
      </Form.Item>
      <Form.Item name="endTime" hidden>
        <DatePicker />
      </Form.Item>
      <Form.Item name="vehicleTypeId" hidden>
        <InputNumber />
      </Form.Item>
      <Col xs={24} md={10}>
        <Form.Item name="shuttleRouteId" label="Tuyến xe ghép" rules={[{ required: true, message: 'Chọn tuyến' }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={routes.length ? 'Chọn tuyến' : 'Chưa có tuyến: thêm ở Danh mục → Tuyến xe ghép'}
            options={routes.map((r) => ({ value: r.id, label: r.name }))}
            onChange={(v: number) => {
              form.setFieldsValue({ shuttleRunId: undefined, shuttlePickupStopId: undefined, shuttleDropoffStopId: undefined });
              apply({ routeId: v });
            }}
          />
        </Form.Item>
      </Col>
      <Col xs={12} md={6}>
        <Form.Item name="shuttleDate" label="Ngày đi" rules={[{ required: true, message: 'Chọn ngày' }]}>
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} onChange={() => form.setFieldsValue({ shuttleRunId: undefined })} />
        </Form.Item>
      </Col>
      <Col xs={12} md={8}>
        <Form.Item name="shuttleRunId" label="Giờ chạy" rules={[{ required: true, message: 'Chọn giờ chạy' }]}>
          <Select
            loading={isFetching}
            disabled={!routeId || !date}
            placeholder={!routeId || !date ? 'Chọn tuyến và ngày' : runs.length ? 'Chọn giờ' : 'Không có chuyến ngày này'}
            notFoundContent="Không có chuyến – tạo chuyến thêm ở trang Xe ghép"
            options={runs.map((r) => {
              const seats = left(r);
              const closed = r.status !== 'MO_BAN' && current?.runId !== r.id;
              return {
                value: r.id,
                disabled: closed || seats < passengers,
                label: (
                  <span>
                    <b>{dayjs(r.departAt).format('HH:mm')}</b> · còn {seats}/{r.capacity} ghế{' '}
                    {r.status !== 'MO_BAN' && <Tag color={RUN_STATUS[r.status].color}>{RUN_STATUS[r.status].label}</Tag>}
                  </span>
                ),
              };
            })}
            onChange={(v: number) => apply({ runId: v })}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name="shuttlePickupStopId" label="Điểm đón" rules={[{ required: true, message: 'Chọn điểm đón' }]}>
          <Select
            disabled={!route}
            placeholder="Điểm dừng / khu vực đón"
            options={route?.stops
              .filter((s) => s.canPickup)
              .map((s) => ({
                value: s.id,
                label: `${s.kind === 'KHU_VUC' ? '🏨 ' : '📍 '}${s.name}${s.offsetMinutes ? ` (+${s.offsetMinutes} phút)` : ''}${Number(s.surcharge) ? ` · phụ phí ${Number(s.surcharge).toLocaleString('vi-VN')}đ/ghế` : ''}`,
              }))}
            onChange={(v: number) => apply({ pickId: v })}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item
          name="shuttleDropoffStopId"
          label="Điểm trả"
          dependencies={['shuttlePickupStopId']}
          rules={[
            { required: true, message: 'Chọn điểm trả' },
            { validator: (_, v) => (!v || !pick || (route?.stops.find((s) => s.id === v)?.seq ?? 0) > pick.seq ? Promise.resolve() : Promise.reject(new Error('Điểm trả phải sau điểm đón trên tuyến'))) },
          ]}
        >
          <Select
            disabled={!route}
            placeholder="Điểm dừng / khu vực trả"
            options={route?.stops
              .filter((s) => s.canDropoff)
              .map((s) => ({ value: s.id, label: `${s.kind === 'KHU_VUC' ? '🏨 ' : '📍 '}${s.name}${Number(s.surcharge) ? ` · phụ phí ${Number(s.surcharge).toLocaleString('vi-VN')}đ/ghế` : ''}` }))}
            onChange={(v: number) => apply({ dropId: v })}
          />
        </Form.Item>
      </Col>
      <Col xs={12} md={6}>
        <Form.Item
          name="passengers"
          label="Tổng số khách"
          rules={[
            { required: true, message: 'Nhập số khách' },
            { validator: (_, v) => (!run || !v || v <= left(run) ? Promise.resolve() : Promise.reject(new Error(`Chuyến chỉ còn ${left(run)} ghế`))) },
          ]}
        >
          <InputNumber min={1} style={{ width: '100%' }} onChange={(v) => apply({ passengers: Number(v) || 1 })} />
        </Form.Item>
      </Col>
      <Col xs={12} md={6}>
        <Form.Item name="childCount" label="Trong đó trẻ em" tooltip="Tính giá vé trẻ em của tuyến">
          <InputNumber min={0} max={passengers} style={{ width: '100%' }} onChange={(v) => apply({ children: Number(v) || 0 })} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        {route && price && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 30, marginBottom: 0 }}>
            Giá vé{agent && route.agentAdultPrice ? ' đại lý' : ''}: người lớn {price.adult.toLocaleString('vi-VN')}đ · trẻ em {price.child.toLocaleString('vi-VN')}đ
            {run && (
              <>
                {' '}
                · xe {run.vehicleType.name}, xuất bến {dayjs(run.departAt).format('HH:mm DD/MM')}
              </>
            )}
          </Typography.Paragraph>
        )}
      </Col>
      {pick?.kind === 'KHU_VUC' && (
        <Col span={24}>
          <Alert type="info" showIcon style={{ marginBottom: 12 }} title={`Đón tận nơi trong khu vực "${pick.name}": nhập tên / địa chỉ khách sạn ở ô Địa chỉ đón bên dưới.`} />
        </Col>
      )}
    </Row>
  );
}
