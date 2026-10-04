/**
 * Tạo bộ icon app lái xe từ logo công ty (chạy lại khi đổi logo):
 *   node scripts/make-icons.cjs <đường-dẫn-logo>
 * Sinh: assets/icon.png, android-icon-{background,foreground,monochrome}.png, splash-icon.png, favicon.png, logo.png
 */
const Jimp = require('jimp-compact');
const path = require('path');

const SRC = process.argv[2];
const OUT = path.join(__dirname, '..', 'assets');
if (!SRC) {
  console.error('Thiếu đường dẫn logo');
  process.exit(1);
}

// Màu chủ đạo lấy từ logo (#1278FA) và các sắc độ
const DEEP = [8, 58, 160]; // xanh đậm góc trên trái
const MAIN = [18, 120, 250]; // màu logo
const LIGHT = [92, 178, 255]; // xanh sáng góc dưới phải

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

function canvas(w, h, fn) {
  const img = new Jimp(w, h, 0x00000000);
  img.scan(0, 0, w, h, function (x, y, i) {
    const [r, g, b, a] = fn(x, y);
    const d = this.bitmap.data;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = a;
  });
  return img;
}

/** Nền chuyển màu chéo + lớp bóng sáng phía trên (kiểu kính bóng) */
function glossyBackground(size) {
  return canvas(size, size, (x, y) => {
    const t = clamp((x + y) / (2 * size));
    let c = t < 0.55 ? mix(DEEP, MAIN, t / 0.55) : mix(MAIN, LIGHT, (t - 0.55) / 0.45);
    // Vệt sáng hình elip ở nửa trên
    const nx = (x - size * 0.5) / (size * 0.75);
    const ny = (y - size * 0.05) / (size * 0.5);
    const d = nx * nx + ny * ny;
    if (d < 1) c = mix(c, [255, 255, 255], 0.22 * (1 - d) ** 1.5);
    // Tối nhẹ phía dưới cho có chiều sâu
    c = mix(c, [0, 20, 70], 0.18 * clamp((y / size - 0.7) / 0.3));
    return [...c, 255];
  });
}

/** Đĩa trắng có đổ bóng mềm và viền sáng mảnh */
function disc(size, radius) {
  const cx = size / 2;
  const cy = size / 2;
  return canvas(size, size, (x, y) => {
    const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    const shadowDist = Math.hypot(x + 0.5 - cx, y + 0.5 - (cy + radius * 0.05));
    if (dist <= radius) {
      // Viền trong xanh rất nhạt cho cảm giác nổi khối
      const edge = clamp((dist - (radius - radius * 0.035)) / (radius * 0.035));
      const top = clamp(1 - (y - (cy - radius)) / (2 * radius));
      const c = mix([255, 255, 255], [222, 236, 255], edge * 0.9 + (1 - top) * 0.08);
      const aa = clamp(radius - dist + 0.5); // khử răng cưa mép
      return [...c, Math.round(255 * Math.max(aa, 0))];
    }
    // Bóng đổ mềm bên ngoài đĩa
    const s = clamp(1 - (shadowDist - radius) / (radius * 0.12));
    return [0, 30, 80, Math.round(110 * s * s)];
  });
}

/** Logo nền trắng → nền trong suốt (giữ nguyên màu xanh / đỏ) */
async function transparentLogo(src) {
  const img = await Jimp.read(src);
  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, i) {
    const d = this.bitmap.data;
    const m = Math.min(d[i], d[i + 1], d[i + 2]);
    const a = clamp(1 - m / 255);
    if (a < 0.04) {
      d[i + 3] = 0;
      return;
    }
    for (let k = 0; k < 3; k++) d[i + k] = Math.round(clamp((d[i + k] - 255 * (1 - a)) / a / 255) * 255);
    d[i + 3] = Math.round(a * 255);
  });
  return img;
}

function place(base, img, size) {
  const copy = img.clone().resize(size, size, Jimp.RESIZE_BICUBIC);
  base.composite(copy, (base.bitmap.width - size) / 2, (base.bitmap.height - size) / 2);
  return base;
}

(async () => {
  const logo = await transparentLogo(SRC);
  await logo.clone().resize(600, 600, Jimp.RESIZE_BICUBIC).writeAsync(path.join(OUT, 'logo.png'));

  // Icon chính (iOS / bản cũ): nền bóng + đĩa trắng + logo
  const icon = glossyBackground(1024);
  icon.composite(disc(1024, 392), 0, 0);
  place(icon, logo, 700);
  await icon.writeAsync(path.join(OUT, 'icon.png'));

  // Android adaptive: nền riêng, logo riêng (nằm trong vùng an toàn ~66% giữa)
  await glossyBackground(1024).writeAsync(path.join(OUT, 'android-icon-background.png'));
  const fg = disc(1024, 300);
  place(fg, logo, 540);
  await fg.writeAsync(path.join(OUT, 'android-icon-foreground.png'));

  // Đơn sắc (Android 13+ icon theo màu chủ đề): chỉ lấy hình dáng logo
  const mono = logo.clone();
  mono.scan(0, 0, mono.bitmap.width, mono.bitmap.height, function (x, y, i) {
    const d = this.bitmap.data;
    d[i] = d[i + 1] = d[i + 2] = 255;
  });
  await place(new Jimp(1024, 1024, 0x00000000), mono, 560).writeAsync(path.join(OUT, 'android-icon-monochrome.png'));

  // Màn hình chờ và favicon
  const splash = disc(1024, 420);
  place(splash, logo, 760);
  await splash.writeAsync(path.join(OUT, 'splash-icon.png'));
  await icon.clone().resize(48, 48, Jimp.RESIZE_BICUBIC).writeAsync(path.join(OUT, 'favicon.png'));
  console.log('Đã tạo icon trong', OUT);
})();
