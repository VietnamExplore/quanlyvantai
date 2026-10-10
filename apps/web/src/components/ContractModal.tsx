import { CopyOutlined, ExportOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Col, DatePicker, Divider, Flex, Form, Input, InputNumber, Modal, Row, Spin, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useCopyText } from '../clipboard';
import { contractUrl, type ContractForBooking, type TransportContract } from '../contract';

type FormValues = Omit<Partial<TransportContract>, 'signedDate'> & { signedDate: Dayjs; km: Record<string, number | null> };

/**
 * Lập / sửa hợp đồng vận chuyển của booking (NĐ 158/2024 Điều 17): bên thuê, ngày ký, cự ly từng chuyến, thanh toán.
 * Lưu xong in hợp đồng + danh sách hành khách, hoặc gửi link hợp đồng điện tử cho khách xác nhận.
 */
export function ContractModal({ bookingId, open, onClose, canEdit }: { bookingId: number; open: boolean; onClose: () => void; canEdit: boolean }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const copy = useCopyText();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const key = ['/contracts/booking', bookingId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api<ContractForBooking>(`/contracts/booking/${bookingId}`), enabled: open });

  const c = data?.contract;
  const src = c ?? data?.draft;
  const initial: FormValues | undefined = data && {
    ...src,
    signedDate: dayjs(src?.signedDate),
    km: Object.fromEntries(data.trips.map((t) => [String(t.id), t.distanceKm])),
  };
  const maxPax = data?.trips.reduce((m, t) => Math.max(m, t.passengers), 0) ?? 0;
  const missingCompany = data
    ? [
        ['companyRepresentative', 'người đại diện'],
        ['companyTransportLicense', 'số giấy phép kinh doanh vận tải'],
        ['companyTaxCode', 'mã số thuế'],
      ].filter(([k]) => !data.company[k])
    : [];

  const save = async (print: boolean) => {
    const v = await form.validateFields();
    setSaving(true);
    // Mở tab in ngay khi bấm (trình duyệt chặn cửa sổ mở sau khi chờ mạng)
    const win = print ? window.open('about:blank', '_blank') : null;
    try {
      const { km, signedDate, ...rest } = v;
      const saved = await api<TransportContract>(`/contracts/booking/${bookingId}`, {
        method: 'PUT',
        body: {
          ...rest,
          signedDate: signedDate.format('YYYY-MM-DD'),
          trips: Object.entries(km ?? {}).map(([id, distanceKm]) => ({ id: Number(id), distanceKm: distanceKm ?? null })),
        },
      });
      message.success(c ? 'Đã lưu hợp đồng' : `Đã lập hợp đồng số ${saved.number}`);
      await qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['/bookings', bookingId] });
      if (win) win.location.href = `/bookings/${bookingId}/contract`;
    } catch (e) {
      win?.close();
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={820}
      destroyOnHidden
      title={
        <Flex gap={8} align="center" wrap>
          Hợp đồng vận chuyển
          {c && <Tag color="blue">Số {c.number}</Tag>}
          {c?.acceptedAt && <Tag color="green">Khách đã xác nhận</Tag>}
        </Flex>
      }
      footer={
        <Flex justify="space-between" wrap gap={8}>
          <Flex gap={8} wrap>
            {c && (
              <>
                <Button icon={<CopyOutlined />} onClick={() => copy(contractUrl(c.token), 'Đã chép link hợp đồng điện tử – gửi khách để xem và xác nhận')}>
                  Chép link gửi khách
                </Button>
                <Button icon={<ExportOutlined />} href={`/e/hd/${c.token}`} target="_blank">
                  Bản điện tử
                </Button>
              </>
            )}
          </Flex>
          <Flex gap={8} wrap>
            <Button onClick={onClose}>Đóng</Button>
            {c && (
              <Button icon={<PrinterOutlined />} href={`/bookings/${bookingId}/contract`} target="_blank">
                In
              </Button>
            )}
            {canEdit && (
              <>
                <Button loading={saving} onClick={() => save(false)}>
                  {c ? 'Lưu' : 'Lập hợp đồng'}
                </Button>
                <Button type="primary" icon={<PrinterOutlined />} loading={saving} onClick={() => save(true)}>
                  Lưu và in
                </Button>
              </>
            )}
          </Flex>
        </Flex>
      }
    >
      {isLoading || !data || !initial ? (
        <Flex justify="center" style={{ padding: 32 }}>
          <Spin />
        </Flex>
      ) : (
        <>
          <Flex vertical gap={8} style={{ marginBottom: 12 }}>
            {data.shuttleTrips > 0 && (
              <Alert
                type="info"
                showIcon
                title={`${data.shuttleTrips} lượt xe ghép không đưa vào hợp đồng`}
                description="Xe ghép bán vé từng chỗ không phải xe hợp đồng (NĐ 158/2024 cấm xe hợp đồng bán vé, gom khách lẻ); in Lệnh vận chuyển theo chuyến ở trang Xe ghép."
              />
            )}
            {data.passengers.length < maxPax && (
              <Alert
                type="warning"
                showIcon
                title={`Danh sách hành khách mới có ${data.passengers.length}/${maxPax} người`}
                description="Lái xe chỉ được chở khách có trong danh sách kèm hợp đồng. Nhập họ tên, năm sinh ở mục Danh sách hành khách của booking (chưa nhập thì bản in để dòng trống ghi tay)."
              />
            )}
            {missingCompany.length > 0 && (
              <Alert
                type="warning"
                showIcon
                title={`Thông tin công ty còn thiếu: ${missingCompany.map(([, l]) => l).join(', ')}`}
                description={
                  <>
                    Bổ sung ở <Link to="/settings">Cài đặt → Hợp đồng vận chuyển</Link>.
                  </>
                }
              />
            )}
            {c?.acceptedAt && (
              <Alert
                type="success"
                showIcon
                title={`Bên thuê đã xác nhận điện tử: ${c.acceptedName} · ${dayjs(c.acceptedAt).format('HH:mm DD/MM/YYYY')}`}
                description="Sửa nội dung hợp đồng thì khách phải xác nhận lại."
              />
            )}
          </Flex>
          <Form<FormValues> key={c?.id ?? 'new'} form={form} layout="vertical" initialValues={initial} preserve={false} disabled={!canEdit}>
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Form.Item name="signedDate" label="Ngày ký" rules={[{ required: true, message: 'Chọn ngày ký' }]}>
                  <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item name="hirerName" label="Bên thuê vận tải (tổ chức / cá nhân)" rules={[{ required: true, whitespace: true, message: 'Nhập tên bên thuê' }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="hirerIdNumber" label="Số CCCD (bên thuê là cá nhân)">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="hirerTaxCode" label="Mã số thuế (tổ chức)">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="hirerPhone" label="Điện thoại">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="hirerAddress" label="Địa chỉ">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="hirerRepresentative" label="Người đại diện ký">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="hirerPosition" label="Chức vụ">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="hirerRepIdNumber" label="Số CCCD người đại diện">
                  <Input />
                </Form.Item>
              </Col>
            </Row>

            <Divider titlePlacement="start" style={{ margin: '4px 0 8px' }}>
              Cự ly hành trình từng chuyến (km)
            </Divider>
            {data.trips.map((t, i) => (
              <Flex key={t.id} gap={8} align="center" style={{ marginBottom: 6 }}>
                <Typography.Text style={{ flex: 1, minWidth: 0 }} ellipsis={{ tooltip: true }}>
                  {i + 1}. {dayjs(t.pickupTime).format('HH:mm DD/MM')} · {t.pickupAddress}
                  {t.dropoffAddress && ` → ${t.dropoffAddress}`}
                </Typography.Text>
                <Form.Item name={['km', String(t.id)]} noStyle>
                  <InputNumber min={0} max={100000} placeholder="km" suffix="km" style={{ width: 120 }} />
                </Form.Item>
              </Flex>
            ))}

            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col span={24}>
                <Form.Item name="paymentMethod" label="Phương thức thanh toán">
                  <Input placeholder="Ví dụ: Chuyển khoản 100% trước ngày đi" />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="extraTerms" label="Điều khoản bổ sung (riêng hợp đồng này)" extra="Điều khoản chung sửa ở Cài đặt → Hợp đồng vận chuyển">
                  <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </>
      )}
    </Modal>
  );
}
