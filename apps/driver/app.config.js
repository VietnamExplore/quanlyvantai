// Cấu hình chung lấy từ app.json.
// - Bản web đóng gói cho đường dẫn con (vd /laixe) khi đặt biến WEB_BASE_URL
// - Thông báo đẩy Android (Firebase Cloud Messaging): có file google-services.json (tải từ Firebase) thì gắn vào bản build
const fs = require('fs');
const path = require('path');

const firebase = path.join(__dirname, 'google-services.json');

module.exports = ({ config }) => ({
  ...config,
  ...(process.env.WEB_BASE_URL && { experiments: { ...(config.experiments ?? {}), baseUrl: process.env.WEB_BASE_URL } }),
  android: {
    ...config.android,
    ...(fs.existsSync(firebase) && { googleServicesFile: './google-services.json' }),
  },
});
