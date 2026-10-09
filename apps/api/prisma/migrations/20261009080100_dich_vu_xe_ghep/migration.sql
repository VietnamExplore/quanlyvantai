-- Dịch vụ "Xe ghép (shuttle bus)" để nhập lượt đặt chỗ trong booking (bỏ qua nếu đã có)
INSERT INTO "Service" ("code", "name", "pricingMode", "hasFlight", "color", "names", "sortOrder", "isActive")
VALUES ('XE_GHEP', 'Xe ghép (shuttle bus)', 'XE_GHEP', true, 'cyan', '{"en": "Shared shuttle bus", "ko": "합승 셔틀버스", "zh": "拼车班车", "ja": "乗合シャトルバス"}', 50, true)
ON CONFLICT ("code") DO NOTHING;
