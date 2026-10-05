import {
  CalculatorOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Checkbox,
  Col,
  DatePicker,
  Divider,
  Dropdown,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { api } from "../api";
import { newKey, tripAmount, type TripDraft } from "../booking-utils";
import type { PriceLine, PriceResult, RentalRateRow, RoutePrice, Surcharge } from "../types";
import {
  Money,
  MoneyInput,
  useCustomers,
  useLocations,
  useServices,
  useVehicleTypeOptions,
} from "./common";
import { QuickSelect } from "./QuickCreate";

const CALC_KEYS = [
  "serviceType",
  "vehicleTypeId",
  "routePriceId",
  "pickupTime",
  "days",
  "rentalOption",
  "extraKm",
  "extraHours",
];
const DATETIME_FORMAT = "HH:mm DD/MM/YYYY";

/** Thông tin khách khi tạo lệnh điều xe không có booking sẵn */
export interface QuickContact {
  customerId: number | null;
  contactName: string;
  contactPhone: string;
  source: string;
}

interface Props {
  open: boolean;
  trip: TripDraft | null;
  onCancel: () => void;
  onSave: (trip: TripDraft, contact?: QuickContact) => void;
  /** Tạo lệnh điều xe nhanh: thêm phần khách hàng ở đầu form */
  withContact?: boolean;
  title?: string;
  okText?: string;
  saving?: boolean;
}

export function TripModal({ open, trip, onCancel, onSave, withContact, title, okText, saving }: Props) {
  const customers = useCustomers();
  const [form] = Form.useForm();
  const { vehicleTypes } = useVehicleTypeOptions();
  const locations = useLocations();
  const { data: routes = [] } = useQuery({
    queryKey: ["/route-prices", {}],
    queryFn: () => api<RoutePrice[]>("/route-prices"),
  });
  const { data: rentalTypes = [] } = useQuery({
    queryKey: ["/rental-rates"],
    queryFn: () => api<RentalRateRow[]>("/rental-rates"),
  });
  const { data: surchargeList = [] } = useQuery({
    queryKey: ["/surcharges", {}],
    queryFn: () => api<Surcharge[]>("/surcharges"),
  });

  const [breakdown, setBreakdown] = useState<PriceLine[]>([]);
  const [partnerCost, setPartnerCost] = useState<number | null>(null);
  const [calcMsg, setCalcMsg] = useState<{
    type: "error" | "info";
    text: string;
  } | null>(null);
  const [calculating, setCalculating] = useState(false);

  const serviceType = Form.useWatch("serviceType", form);
  const vehicleTypeId = Form.useWatch("vehicleTypeId", form);
  const routePriceId = Form.useWatch("routePriceId", form);
  const rentalOption: string | undefined = Form.useWatch("rentalOption", form);
  const unitPrice = Form.useWatch("unitPrice", form) ?? 0;
  const surcharges: PriceLine[] = Form.useWatch("surcharges", form) ?? [];

  const { byCode: servicesByCode, options: serviceOptions } = useServices();
  // Dịch vụ tính theo ngày thuê (không bắt buộc tuyến) và dịch vụ có số hiệu chuyến bay
  const isRentalCode = (code?: string) =>
    !!code && servicesByCode[code]?.pricingMode === "THEO_NGAY";
  const isRental = isRentalCode(serviceType);
  const vehicleType = vehicleTypes.find((t) => t.id === vehicleTypeId);
  const amount = tripAmount({ unitPrice, surcharges });
  const estimatedCost: number | null | undefined = Form.useWatch(
    "estimatedCost",
    form,
  );

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setBreakdown([]);
    setPartnerCost(null);
    setCalcMsg(
      trip?.id
        ? {
            type: "info",
            text: "Giá đã lưu. Thay đổi loại xe, tuyến hoặc giờ đón để tính lại.",
          }
        : null,
    );
    form.setFieldsValue(
      trip
        ? {
            ...trip,
            pickupTime: dayjs(trip.pickupTime),
            endTime: trip.endTime ? dayjs(trip.endTime) : null,
          }
        : {
            serviceType: "DON_TIEN_SAN_BAY",
            passengers: 1,
            days: 1,
            extraKm: 0,
            extraHours: 0,
            unitPrice: 0,
            surcharges: [],
            ...(withContact && { source: "HOTLINE", pickupTime: dayjs().add(1, "hour").startOf("hour") }),
          },
    );
  }, [open, trip, form, withContact]);

  const routeOptions = routes
    .filter(
      (r) =>
        r.isActive &&
        (!vehicleTypeId ||
          r.items.some((i) => i.vehicleTypeId === vehicleTypeId)),
    )
    .map((r) => {
      const item = r.items.find((i) => i.vehicleTypeId === vehicleTypeId);
      return {
        value: r.id,
        label: item
          ? `${r.name} — ${Number(item.price).toLocaleString("vi-VN")}đ`
          : r.name,
      };
    });

  // Kiểu thuê theo bảng giá thuê của loại xe: theo ngày, nửa ngày và các dòng giá thêm
  const rate = rentalTypes.find((t) => t.id === vehicleTypeId)?.rentalRate;
  const vnd = (v: number | string) => `${Number(v).toLocaleString("vi-VN")}đ`;
  const rentalOptions = [
    { value: "DAY", label: rate ? `Theo ngày — ${vnd(rate.fullDayPrice)}/ngày (${rate.fullDayHours}h/${rate.fullDayKm}km)` : "Theo ngày" },
    ...(rate?.halfDayPrice ? [{ value: "HALF", label: `Nửa ngày — ${vnd(rate.halfDayPrice)} (${rate.halfDayHours}h/${rate.halfDayKm}km)` }] : []),
    ...(rate?.extraOptions ?? []).map((o, i) => ({
      value: `OPT:${i}`,
      label: `${o.name} — ${vnd(o.price)} (${o.hours}h${o.km ? `/${o.km}km` : ""})`,
    })),
  ];

  async function recalc() {
    const v = form.getFieldsValue();
    if (!v.serviceType || !v.vehicleTypeId || !v.pickupTime) {
      const missing = [
        !v.vehicleTypeId && "loại xe",
        !v.pickupTime && "giờ đón",
      ]
        .filter(Boolean)
        .join(" và ");
      if (v.routePriceId || isRentalCode(v.serviceType))
        setCalcMsg({
          type: "info",
          text: `Chọn ${missing} để hệ thống tính giá.`,
        });
      return;
    }
    if (!v.routePriceId && !isRentalCode(v.serviceType)) {
      setBreakdown([]);
      setCalcMsg({
        type: "info",
        text: "Chọn tuyến để hệ thống tự tính giá, hoặc nhập giá tay bên dưới.",
      });
      return;
    }
    setCalculating(true);
    try {
      const res = await api<PriceResult>("/pricing/calculate", {
        method: "POST",
        body: {
          serviceType: v.serviceType,
          vehicleTypeId: v.vehicleTypeId,
          routePriceId: v.routePriceId ?? null,
          pickupTime: (v.pickupTime as Dayjs).toISOString(),
          // Kiểu thuê: theo ngày (mặc định), nửa ngày, hoặc một dòng giá thêm (vd. thuê 4 tiếng)
          days: !v.rentalOption || v.rentalOption === "DAY" ? v.days || 1 : 1,
          halfDay: v.rentalOption === "HALF",
          optionIndex: String(v.rentalOption ?? "").startsWith("OPT:") ? Number(String(v.rentalOption).slice(4)) : null,
          extraKm: v.extraKm || 0,
          extraHours: v.extraHours || 0,
        },
      });
      const manual = ((v.surcharges ?? []) as PriceLine[]).filter(
        (s) => !s.auto,
      );
      form.setFieldsValue({
        unitPrice: res.unitPrice,
        endTime: dayjs(res.endTime),
        surcharges: [...res.surcharges, ...manual],
      });
      // Tự điền chi phí = giá mua đối tác của tuyến, trừ khi nhân viên đã tự nhập con số khác
      const curCost = v.estimatedCost;
      if (
        res.partnerCost !== null &&
        (curCost === null || curCost === undefined || curCost === partnerCost)
      ) {
        form.setFieldsValue({ estimatedCost: res.partnerCost });
      }
      setBreakdown(res.breakdown);
      setPartnerCost(res.partnerCost);
      setCalcMsg(null);
    } catch (e) {
      setBreakdown([]);
      setCalcMsg({ type: "error", text: (e as Error).message });
    } finally {
      setCalculating(false);
    }
  }

  const onValuesChange = (changed: Record<string, unknown>) => {
    if ("routePriceId" in changed && changed.routePriceId) {
      // Chọn tuyến: tự điền điểm đón / trả nếu còn trống
      const route = routes.find((r) => r.id === changed.routePriceId);
      const cur = form.getFieldsValue();
      if (route?.fromLocation && !cur.pickupAddress)
        form.setFieldsValue({
          pickupLocationId: route.fromLocation.id,
          pickupAddress: route.fromLocation.name,
        });
      if (route?.toLocation && !cur.dropoffAddress)
        form.setFieldsValue({
          dropoffLocationId: route.toLocation.id,
          dropoffAddress: route.toLocation.name,
        });
    }
    if ("vehicleTypeId" in changed) {
      // Mỗi loại xe có bảng kiểu giá riêng: về "Theo ngày"
      form.setFieldsValue({ rentalOption: "DAY" });
      // Tuyến đang chọn không có giá cho loại xe mới thì bỏ chọn
      const route = routes.find(
        (r) => r.id === form.getFieldValue("routePriceId"),
      );
      if (
        route &&
        !route.items.some((i) => i.vehicleTypeId === changed.vehicleTypeId)
      )
        form.setFieldsValue({ routePriceId: null });
    }
    if (Object.keys(changed).some((k) => CALC_KEYS.includes(k))) recalc();
  };

  const fillAddress = (
    field: "pickup" | "dropoff",
    loc: { name: string; address?: string | null },
  ) =>
    form.setFieldsValue({
      [`${field}Address`]: loc.address
        ? `${loc.name} (${loc.address})`
        : loc.name,
    });

  const pickLocation = (
    field: "pickup" | "dropoff",
    id: number | undefined,
  ) => {
    const loc = locations.find((l) => l.id === id);
    if (loc) fillAddress(field, loc);
  };

  const addManualSurcharge = (s?: Surcharge) => {
    const current: PriceLine[] = form.getFieldValue("surcharges") ?? [];
    const line: PriceLine = s
      ? {
          name: s.name,
          amount: s.isPercent
            ? Math.round((unitPrice * Number(s.value)) / 100 / 1000) * 1000
            : Number(s.value),
        }
      : { name: "", amount: 0 };
    form.setFieldsValue({ surcharges: [...current, line] });
  };

  const submit = async () => {
    let v;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    const { rentalOption, customerId, contactName, contactPhone, source, ...rest } = v;
    const contact: QuickContact | undefined = withContact
      ? { customerId: customerId ?? null, contactName: contactName.trim(), contactPhone: contactPhone.trim(), source: source || "HOTLINE" }
      : undefined;
    onSave({
      ...trip,
      ...rest,
      key: trip?.key ?? newKey(),
      vehicleTypeName: vehicleType?.name,
      pickupTime: (v.pickupTime as Dayjs).toISOString(),
      endTime: v.endTime ? (v.endTime as Dayjs).toISOString() : null,
      routePriceId: v.routePriceId ?? null,
      pickupLocationId: v.pickupLocationId ?? null,
      dropoffLocationId: v.dropoffLocationId ?? null,
      dropoffAddress: v.dropoffAddress || null,
      flightNumber: v.flightNumber?.trim().toUpperCase() || null,
      departureFlight: v.departureFlight?.trim().toUpperCase() || null,
      collectAmount: v.collectAmount || null,
      collectNote: v.collectNote?.trim() || null,
      itinerary: v.itinerary || null,
      notes: v.notes || null,
      days: !rentalOption || rentalOption === "DAY" ? v.days || 1 : 1,
      estimatedCost: v.estimatedCost ?? null,
      extraKm: v.extraKm || 0,
      extraHours: v.extraHours || 0,
      surcharges: ((v.surcharges ?? []) as PriceLine[])
        .filter((s) => s.name?.trim())
        .map((s) => ({ ...s, amount: Number(s.amount || 0) })),
    }, contact);
  };

  const locationOptions = locations.map((l) => ({
    value: l.id,
    label: l.name,
  }));
  const manualSurcharges = surchargeList.filter(
    (s) => s.isActive && s.rule === "THU_CONG",
  );

  return (
    <Modal
      title={title ?? (trip?.id ? "Sửa chuyến" : "Thêm chuyến")}
      open={open}
      onCancel={onCancel}
      onOk={submit}
      okText={okText ?? "Xong"}
      confirmLoading={saving}
      cancelText="Hủy"
      width={900}
      forceRender
      styles={{
        body: { maxHeight: "75vh", overflowY: "auto", overflowX: "hidden" },
      }}
    >
      <Form form={form} layout="vertical" onValuesChange={onValuesChange}>
        {withContact && (
          <>
            <Divider titlePlacement="start" style={{ margin: "0 0 12px" }}>
              Khách hàng
            </Divider>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="customerId" label="Khách hàng (không bắt buộc)">
                  <QuickSelect
                    entity="customer"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={customers.map((c) => ({ value: c.id, label: c.name }))}
                    onChange={(id) => {
                      const c = customers.find((x) => x.id === id);
                      if (!c) return;
                      const cur = form.getFieldsValue();
                      form.setFieldsValue({
                        contactName: cur.contactName || c.name,
                        contactPhone: cur.contactPhone || c.phone || undefined,
                        ...(c.type === "DAI_LY" && { source: "DAI_LY" }),
                      });
                    }}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name="contactName" label="Người liên hệ / khách" rules={[{ required: true, whitespace: true, message: "Nhập tên" }]}>
                  <Input placeholder="Tên khách" />
                </Form.Item>
              </Col>
              <Col xs={12} md={5}>
                <Form.Item name="contactPhone" label="SĐT" rules={[{ required: true, whitespace: true, message: "Nhập SĐT" }]}>
                  <Input placeholder="09…" />
                </Form.Item>
              </Col>
              <Col xs={24} md={5}>
                <Form.Item name="source" label="Nguồn khách">
                  <QuickSelect entity="customerSource" showSearch optionFilterProp="label" />
                </Form.Item>
              </Col>
            </Row>
            <Divider titlePlacement="start" style={{ margin: "0 0 12px" }}>
              Chuyến xe
            </Divider>
          </>
        )}
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item
              name="serviceType"
              label="Dịch vụ"
              rules={[{ required: true }]}
            >
              <QuickSelect entity="service" options={serviceOptions} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="pickupTime"
              label="Giờ đón"
              rules={[{ required: true, message: "Chọn giờ đón" }]}
            >
              <DatePicker
                showTime={{ format: "HH:mm", minuteStep: 5 }}
                format={DATETIME_FORMAT}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="endTime"
              label="Kết thúc dự kiến"
              tooltip="Tự tính theo tuyến / số ngày thuê. Dùng để kiểm tra trùng lịch khi điều xe."
            >
              <DatePicker
                showTime={{ format: "HH:mm", minuteStep: 5 }}
                format={DATETIME_FORMAT}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={14} md={8}>
            <Form.Item
              name="vehicleTypeId"
              label="Loại xe"
              rules={[{ required: true, message: "Chọn loại xe" }]}
            >
              <QuickSelect
                entity="vehicleType"
                options={vehicleTypes
                  .filter((t) => t.isActive)
                  .map((t) => ({
                    value: t.id,
                    label: `${t.name} (tối đa ${t.maxPassengers} khách)`,
                  }))}
              />
            </Form.Item>
          </Col>
          <Col xs={10} md={4}>
            <Form.Item
              name="passengers"
              label="Số khách"
              rules={[
                { required: true, message: "Nhập số khách" },
                {
                  validator: (_, v) =>
                    !vehicleType || !v || v <= vehicleType.maxPassengers
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error(
                            `Tối đa ${vehicleType.maxPassengers} khách`,
                          ),
                        ),
                },
              ]}
            >
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="routePriceId"
              label={isRental ? "Tuyến / gói (không bắt buộc)" : "Tuyến"}
              extra={
                isRental ? "Bỏ trống để tính theo giá thuê ngày" : undefined
              }
            >
              <QuickSelect
                entity="route"
                allowClear
                options={routeOptions}
                placeholder="Chọn tuyến có giá cho loại xe này"
                createInitial={{
                  vehicleTypeId,
                  serviceType: serviceType ?? "THEO_TUYEN",
                }}
              />
            </Form.Item>
          </Col>

          {isRental && !routePriceId && (
            <>
              <Col xs={16} md={8}>
                <Form.Item
                  name="rentalOption"
                  label="Kiểu thuê"
                  tooltip="Thêm kiểu giá (thuê 4 tiếng, 6 tiếng…) ở Bảng giá → Giá thuê theo ngày"
                >
                  <Select options={rentalOptions} placeholder="Theo ngày" />
                </Form.Item>
              </Col>
              {(!rentalOption || rentalOption === "DAY") && (
                <Col xs={8} md={4}>
                  <Form.Item name="days" label="Số ngày">
                    <InputNumber min={1} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
              )}
            </>
          )}
          <Col xs={12} md={4}>
            <Form.Item name="extraKm" label="Vượt km">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="extraHours" label="Vượt giờ">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <Divider titlePlacement="start" style={{ margin: "4px 0 12px" }}>
          Hành trình
        </Divider>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="pickupLocationId" label="Điểm đón (chọn nhanh)">
              <QuickSelect
                entity="location"
                allowClear
                options={locationOptions}
                onChange={(id) =>
                  pickLocation("pickup", id as number | undefined)
                }
                onCreated={(loc) =>
                  fillAddress(
                    "pickup",
                    loc as unknown as { name: string; address?: string | null },
                  )
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item
              name="pickupAddress"
              label="Địa chỉ đón"
              rules={[{ required: true, message: "Nhập điểm đón" }]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="dropoffLocationId" label="Điểm trả (chọn nhanh)">
              <QuickSelect
                entity="location"
                allowClear
                options={locationOptions}
                onChange={(id) =>
                  pickLocation("dropoff", id as number | undefined)
                }
                onCreated={(loc) =>
                  fillAddress(
                    "dropoff",
                    loc as unknown as { name: string; address?: string | null },
                  )
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item name="dropoffAddress" label="Địa chỉ trả">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="flightNumber"
              label="Số hiệu chuyến bay đón"
              tooltip="Chuyến bay khách đến (đón tại sân bay). Để trống nếu không có."
              normalize={(v?: string) => v?.toUpperCase()}
            >
              <Input placeholder="VD: VN123" prefix="✈" allowClear />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="departureFlight"
              label="Số hiệu chuyến bay tiễn"
              tooltip="Chuyến bay khách về (tiễn ra sân bay). Để trống nếu không có."
              normalize={(v?: string) => v?.toUpperCase()}
            >
              <Input placeholder="VD: VJ636" prefix="✈" allowClear />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              name="itinerary"
              label="Lịch trình di chuyển"
              tooltip="Các điểm dừng / lịch trình chi tiết. Khi nhân bản chuyến, lịch trình được sao chép theo."
            >
              <Input.TextArea
                autoSize={{ minRows: 2, maxRows: 8 }}
                placeholder={
                  isRental
                    ? "Ngày 1: Sài Gòn – Phan Thiết\nNgày 2: Mũi Né – Bàu Trắng"
                    : "08:00 đón khách sạn → 09:30 Bà Nà → 16:00 về khách sạn"
                }
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="notes" label="Ghi chú chuyến">
              <Input placeholder="Ví dụ: khách có trẻ em, cần ghế trẻ em; đón tại cột số 5…" />
            </Form.Item>
          </Col>
        </Row>

        <Divider titlePlacement="start" style={{ margin: "4px 0 12px" }}>
          Giá{" "}
          <Button
            size="small"
            type="link"
            icon={<CalculatorOutlined />}
            loading={calculating}
            onClick={recalc}
          >
            Tính lại
          </Button>
        </Divider>
        {calcMsg && (
          <Alert
            type={calcMsg.type}
            title={calcMsg.text}
            showIcon
            style={{ marginBottom: 12 }}
          />
        )}
        {breakdown.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {breakdown.map((b, i) => (
              <Flex key={i} justify="space-between">
                <Typography.Text type="secondary">{b.name}</Typography.Text>
                <Money value={b.amount} />
              </Flex>
            ))}
          </div>
        )}
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <Form.Item
              name="unitPrice"
              label="Giá chuyến"
              rules={[{ required: true, message: "Nhập giá" }]}
              extra="Có thể sửa tay"
            >
              <MoneyInput />
            </Form.Item>
          </Col>
          <Col xs={24} md={10}>
            <Form.Item
              name="estimatedCost"
              label="Chi phí dự kiến"
              tooltip="Giá thuê xe đối tác, hoặc chi phí xăng dầu + lương tài xế nếu chạy xe công ty. Dùng để tính lợi nhuận."
              extra={
                partnerCost !== null
                  ? `Giá mua đối tác của tuyến: ${partnerCost.toLocaleString("vi-VN")}đ`
                  : "Để trống nếu chưa biết"
              }
            >
              <MoneyInput />
            </Form.Item>
          </Col>
        </Row>

        <Form.List name="surcharges">
          {(fields, { remove }) => (
            <>
              {fields.map((f) => {
                const isAuto = surcharges[f.name]?.auto;
                return (
                  <Row
                    gutter={8}
                    key={f.key}
                    align="middle"
                    style={{ marginBottom: 8 }}
                  >
                    <Col flex="auto">
                      <Form.Item
                        name={[f.name, "name"]}
                        noStyle
                        rules={[
                          { required: true, message: "Nhập tên phụ thu" },
                        ]}
                      >
                        <Input
                          placeholder="Tên phụ thu"
                          prefix={
                            isAuto ? (
                              <Tag color="geekblue">Tự động</Tag>
                            ) : undefined
                          }
                        />
                      </Form.Item>
                    </Col>
                    <Col style={{ width: 200 }}>
                      <Form.Item name={[f.name, "amount"]} noStyle>
                        <MoneyInput />
                      </Form.Item>
                    </Col>
                    <Col>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(f.name)}
                      />
                    </Col>
                  </Row>
                );
              })}
            </>
          )}
        </Form.List>
        <Dropdown
          menu={{
            items: [
              ...manualSurcharges.map((s) => ({
                key: String(s.id),
                label: `${s.name} (${s.isPercent ? `${Number(s.value)}%` : `${Number(s.value).toLocaleString("vi-VN")}đ`})`,
                onClick: () => addManualSurcharge(s),
              })),
              { type: "divider" as const },
              {
                key: "other",
                label: "Phụ thu khác (nhập tay)",
                onClick: () => addManualSurcharge(),
              },
            ],
          }}
        >
          <Button icon={<PlusOutlined />} size="small">
            Thêm phụ thu
          </Button>
        </Dropdown>

        <Flex
          justify="flex-end"
          align="baseline"
          gap={16}
          wrap
          style={{ marginTop: 16 }}
        >
          {estimatedCost !== null && estimatedCost !== undefined && (
            <Tag
              color={amount - estimatedCost >= 0 ? "green" : "red"}
              style={{ fontSize: 14, padding: "2px 8px" }}
            >
              Lãi dự kiến: {(amount - estimatedCost).toLocaleString("vi-VN")} đ
            </Tag>
          )}
          <Typography.Title level={4} style={{ margin: 0 }}>
            Thành tiền: <Money value={amount} />
          </Typography.Title>
        </Flex>

        <Divider titlePlacement="start" style={{ margin: "16px 0 12px" }}>
          Nhờ lái xe thu tiền khách
        </Divider>
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <Form.Item
              name="collectAmount"
              label="Số tiền lái xe thu"
              tooltip="Số tiền lái xe thu giúp công ty khi đón / trả khách. App lái xe sẽ nhắc thu và có nút xác nhận đã thu; xác nhận xong phần mềm tự tạo phiếu thu."
              extra={
                amount > 0 && (
                  <Typography.Link onClick={() => form.setFieldValue("collectAmount", amount)}>
                    Thu bằng thành tiền ({amount.toLocaleString("vi-VN")}đ)
                  </Typography.Link>
                )
              }
            >
              <MoneyInput placeholder="Không thu" />
            </Form.Item>
          </Col>
          <Col xs={24} md={14}>
            <Form.Item name="collectNote" label="Ghi chú thu tiền">
              <Input placeholder="VD: thu đủ tiền xe trước khi trả khách, khách trả USD quy đổi…" allowClear />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
