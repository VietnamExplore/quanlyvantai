// Đóng gói app lái xe bản web cài lên iPhone (Safari → "Thêm vào Màn hình chính"), phục vụ tại https://<tên miền>/laixe
//   node scripts/build-web.cjs [thư mục ra, mặc định dist-web] [đường dẫn, mặc định /laixe]
// Thêm vào index.html: tên app, biểu tượng, chế độ toàn màn hình, màu thanh trạng thái, manifest (thông báo đẩy cần chế độ cài đặt).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const out = path.resolve(root, process.argv[2] || 'dist-web');
const base = (process.argv[3] || '/laixe').replace(/\/+$/, '');

const r = spawnSync('npx', ['expo', 'export', '-p', 'web', '--output-dir', out, '--clear'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, WEB_BASE_URL: base, NODE_ENV: 'production' },
});
if (r.status !== 0) process.exit(r.status ?? 1);

const file = path.join(out, 'index.html');
let html = fs.readFileSync(file, 'utf8');
const head = `
    <base href="${base}/">
    <link rel="manifest" href="${base}/manifest.webmanifest">
    <link rel="apple-touch-icon" href="${base}/apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="192x192" href="${base}/icon-192.png">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="VNE Driver">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="theme-color" content="#0F6BE0">
    <meta name="format-detection" content="telephone=no">`;
html = html
  .replace(/<title>[^<]*<\/title>/, '<title>Vietnam Explore Driver</title>')
  .replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no">')
  .replace('</head>', `${head}\n  </head>`);
if (!html.includes('rel="manifest"')) throw new Error('Không chèn được thẻ manifest vào index.html');
fs.writeFileSync(file, html);
console.log(`\nXONG: ${out} (đường dẫn ${base}/)`);
