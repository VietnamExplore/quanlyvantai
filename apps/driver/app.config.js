// Cấu hình chung lấy từ app.json; bản web đóng gói cho đường dẫn con (vd /laixe) khi đặt biến WEB_BASE_URL
module.exports = ({ config }) => ({
  ...config,
  ...(process.env.WEB_BASE_URL && { experiments: { ...(config.experiments ?? {}), baseUrl: process.env.WEB_BASE_URL } }),
});
