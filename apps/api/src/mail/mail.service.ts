import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

const K = {
  enabled: 'sys.smtp.enabled',
  /** Dùng chung tài khoản hộp thư booking OTA (Gmail, mật khẩu ứng dụng đã nhập ở mục Email booking OTA) */
  useOta: 'sys.smtp.useOta',
  host: 'sys.smtp.host',
  port: 'sys.smtp.port',
  user: 'sys.smtp.user',
  pass: 'sys.smtp.pass',
  fromName: 'sys.smtp.fromName',
  state: 'sys.smtp.state',
};
const OTA_USER = 'sys.otaMail.user';
const OTA_PASS = 'sys.otaMail.pass';

interface MailState {
  lastSentAt?: string | null;
  lastError?: string | null;
  sent?: number;
}

/**
 * Email gửi đi của phần mềm (SMTP): lệnh điều xe / thay đổi / hủy chuyến gửi nhà xe đối tác.
 * Cài ở trang Hệ thống: dùng chung tài khoản Gmail của hộp thư booking OTA hoặc tài khoản riêng.
 * Mật khẩu do Admin nhập, không trả về giao diện.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async get() {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: [...Object.values(K), OTA_USER, OTA_PASS] } } });
    const v = (k: string) => rows.find((r) => r.key === k)?.value ?? '';
    let state: MailState = {};
    try {
      state = JSON.parse(v(K.state) || '{}');
    } catch {
      state = {};
    }
    const useOta = v(K.useOta) !== '0';
    return {
      enabled: v(K.enabled) === '1',
      useOta,
      host: useOta ? 'smtp.gmail.com' : v(K.host) || 'smtp.gmail.com',
      port: useOta ? 465 : Number(v(K.port)) || 465,
      user: useOta ? v(OTA_USER) : v(K.user),
      pass: useOta ? v(OTA_PASS) : v(K.pass),
      ownHost: v(K.host),
      ownPort: Number(v(K.port)) || null,
      ownUser: v(K.user),
      hasOwnPass: !!v(K.pass),
      otaUser: v(OTA_USER),
      fromName: v(K.fromName) || 'Vietnam Explore – Điều hành',
      state,
    };
  }

  private set(key: string, value: string) {
    return this.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  /** Cho trang Hệ thống (không trả mật khẩu) */
  async status() {
    const c = await this.get();
    return {
      enabled: c.enabled,
      useOta: c.useOta,
      otaUser: c.otaUser || null,
      host: c.ownHost || 'smtp.gmail.com',
      port: c.ownPort ?? 465,
      user: c.ownUser,
      hasPass: c.hasOwnPass,
      fromName: c.fromName,
      sender: c.user || null,
      ready: !!(c.user && c.pass),
      state: c.state,
    };
  }

  async saveConfig(dto: { enabled?: boolean; useOta?: boolean; host?: string; port?: number; user?: string; pass?: string; fromName?: string }) {
    if (dto.enabled !== undefined) await this.set(K.enabled, dto.enabled ? '1' : '0');
    if (dto.useOta !== undefined) await this.set(K.useOta, dto.useOta ? '1' : '0');
    if (dto.host !== undefined) await this.set(K.host, dto.host.trim());
    if (dto.port !== undefined) await this.set(K.port, String(dto.port));
    if (dto.user !== undefined) await this.set(K.user, dto.user.trim());
    // Mật khẩu ứng dụng Gmail hiển thị dạng "abcd efgh ijkl mnop"; bỏ trống = giữ mật khẩu cũ
    if (dto.pass) await this.set(K.pass, dto.pass.replace(/\s+/g, ''));
    if (dto.fromName !== undefined) await this.set(K.fromName, dto.fromName.trim());
    return this.status();
  }

  private transport(c: Awaited<ReturnType<MailService['get']>>) {
    return createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass }, connectionTimeout: 20_000, socketTimeout: 30_000 });
  }

  private static error(e: unknown) {
    const err = e as { code?: string; responseCode?: number; message?: string };
    if (err.code === 'EAUTH' || err.responseCode === 535) return 'Máy chủ email từ chối đăng nhập: kiểm tra email và mật khẩu ứng dụng (Gmail: bật Xác minh 2 bước, tạo Mật khẩu ứng dụng)';
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNECTION' || err.code === 'ESOCKET') return 'Không kết nối được máy chủ email (kiểm tra máy chủ / cổng SMTP)';
    return err.message ?? 'Lỗi gửi email';
  }

  /** Gửi thử tới một địa chỉ (bấm "Gửi thử" ở trang Hệ thống) */
  async test(to: string) {
    const c = await this.get();
    if (!c.user || !c.pass) throw new BadRequestException(c.useOta ? 'Chưa kết nối hộp thư booking OTA (email + mật khẩu ứng dụng)' : 'Chưa nhập email và mật khẩu gửi đi');
    try {
      await this.transport(c).sendMail({
        from: { name: c.fromName, address: c.user },
        to,
        subject: 'Thử gửi email từ phần mềm điều hành',
        text: 'Email gửi đi của phần mềm đã hoạt động. Nhà xe đối tác có email sẽ nhận lệnh điều xe, thay đổi và hủy chuyến qua địa chỉ này.',
      });
      await this.set(K.state, JSON.stringify({ ...c.state, lastError: null }));
      return { ok: true };
    } catch (e) {
      throw new BadRequestException(MailService.error(e));
    }
  }

  /**
   * Gửi email (đã bật và đủ cấu hình); trả 'sent' / 'off' (chưa bật) / lỗi. Không ném lỗi: không làm hỏng thao tác điều xe.
   */
  async send(m: { to: string[]; subject: string; text: string }): Promise<{ ok: true } | { ok: false; reason: string; off?: boolean }> {
    const to = [...new Set(m.to.map((x) => x.trim()).filter(Boolean))];
    if (!to.length) return { ok: false, reason: 'Không có email nhận', off: true };
    const c = await this.get();
    if (!c.enabled || !c.user || !c.pass) return { ok: false, reason: 'Chưa bật email gửi đi', off: true };
    try {
      await this.transport(c).sendMail({ from: { name: c.fromName, address: c.user }, to, subject: m.subject, text: m.text });
      await this.set(K.state, JSON.stringify({ lastSentAt: new Date().toISOString(), lastError: null, sent: (c.state.sent ?? 0) + 1 }));
      return { ok: true };
    } catch (e) {
      const reason = MailService.error(e);
      this.logger.warn(`Gửi email thất bại: ${reason}`);
      await this.set(K.state, JSON.stringify({ ...c.state, lastError: reason }));
      return { ok: false, reason };
    }
  }
}
