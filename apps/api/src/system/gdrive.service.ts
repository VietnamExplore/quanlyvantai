import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { createReadStream, existsSync, statSync } from 'fs';
import { basename } from 'path';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

/**
 * Đẩy bản sao lưu lên Google Drive của công ty.
 * - Kết nối kiểu "thiết bị nhập liệu hạn chế" (device flow): Admin nhập mã ở google.com/device trên máy bất kỳ,
 *   không cần HTTPS / địa chỉ chuyển hướng nên chạy được cả khi phần mềm mở bằng IP nội bộ.
 * - Quyền drive.file: phần mềm chỉ thấy và xóa được các file do chính nó tạo (thư mục sao lưu), không đọc file khác trên Drive.
 * - Client secret và refresh token lưu ở máy chủ, không bao giờ trả về trình duyệt.
 */
const OAUTH = () => process.env.GOOGLE_OAUTH_BASE ?? 'https://oauth2.googleapis.com';
const API = () => process.env.GOOGLE_API_BASE ?? 'https://www.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'Sao lưu phần mềm vận tải';
const SET_NAME = /^(db|uploads)-(\d{8}-\d{4})\.(dump|tar\.gz)$/;

const K = {
  clientId: 'sys.gdrive.clientId',
  clientSecret: 'sys.gdrive.clientSecret',
  refreshToken: 'sys.gdrive.refreshToken',
  account: 'sys.gdrive.account',
  folderId: 'sys.gdrive.folderId',
  enabled: 'sys.gdrive.enabled',
  keep: 'sys.gdrive.keep',
  last: 'sys.gdrive.lastUpload',
};

interface Pending {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  interval: number;
  expiresAt: number;
  error?: string;
}

export interface UploadResult {
  at: string;
  ok: boolean;
  name?: string;
  files?: { name: string; size: number }[];
  removed?: number;
  error?: string;
  durationMs: number;
}

@Injectable()
export class GdriveService {
  private readonly logger = new Logger('GoogleDrive');
  private pending: Pending | null = null;
  private access: { token: string; until: number } | null = null;
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  private async get(key: string) {
    return (await this.prisma.setting.findUnique({ where: { key } }))?.value?.trim() || null;
  }

  private set(key: string, value: string | null) {
    if (value === null) return this.prisma.setting.deleteMany({ where: { key } });
    return this.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  /** Trạng thái cho trang Sao lưu (không gồm secret / token) */
  async status() {
    const [clientId, secret, refresh, account, enabled, keep, last] = await Promise.all([
      this.get(K.clientId),
      this.get(K.clientSecret),
      this.get(K.refreshToken),
      this.get(K.account),
      this.get(K.enabled),
      this.get(K.keep),
      this.get(K.last),
    ]);
    const pending = this.pending && this.pending.expiresAt > Date.now() ? this.pending : null;
    return {
      clientId,
      clientSecretSet: !!secret,
      connected: !!refresh,
      account,
      enabled: enabled !== 'false',
      keep: Number(keep) || 30,
      busy: this.busy,
      lastUpload: last ? (JSON.parse(last) as UploadResult) : null,
      pending: pending && { userCode: pending.userCode, verificationUrl: pending.verificationUrl, expiresAt: new Date(pending.expiresAt).toISOString(), error: pending.error ?? null },
    };
  }

  async saveConfig(c: { clientId?: string; clientSecret?: string; enabled?: boolean; keep?: number }) {
    if (c.clientId !== undefined) {
      const changed = c.clientId.trim() !== ((await this.get(K.clientId)) ?? '');
      await this.set(K.clientId, c.clientId.trim() || null);
      // Đổi ứng dụng Google thì kết nối cũ không dùng được nữa
      if (changed) await this.forget();
    }
    if (c.clientSecret) await this.set(K.clientSecret, c.clientSecret.trim());
    if (c.enabled !== undefined) await this.set(K.enabled, String(c.enabled));
    if (c.keep !== undefined) await this.set(K.keep, String(c.keep));
  }

  private async forget() {
    this.access = null;
    this.pending = null;
    await Promise.all([this.set(K.refreshToken, null), this.set(K.account, null), this.set(K.folderId, null)]);
  }

  /** Bắt đầu kết nối: lấy mã để Admin nhập ở google.com/device, chờ Google xác nhận ở chế độ nền */
  async startConnect() {
    const clientId = await this.get(K.clientId);
    if (!clientId || !(await this.get(K.clientSecret))) throw new Error('Nhập Client ID và Client secret trước');
    const res = await fetch(`${OAUTH()}/device/code`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, scope: SCOPE }) });
    const data = (await res.json().catch(() => ({}))) as Record<string, string | number>;
    if (!res.ok) throw new Error(`Google từ chối: ${data.error_description ?? data.error ?? res.status}. Kiểm tra Client ID (loại "TVs and Limited Input devices") và đã bật Google Drive API.`);
    this.pending = {
      deviceCode: String(data.device_code),
      userCode: String(data.user_code),
      verificationUrl: String(data.verification_url ?? data.verification_uri ?? 'https://www.google.com/device'),
      interval: Number(data.interval ?? 5),
      expiresAt: Date.now() + Number(data.expires_in ?? 1800) * 1000,
    };
    void this.poll(this.pending);
    return this.status();
  }

  private async poll(p: Pending) {
    const [clientId, clientSecret] = await Promise.all([this.get(K.clientId), this.get(K.clientSecret)]);
    let wait = p.interval;
    while (this.pending === p && Date.now() < p.expiresAt) {
      await new Promise((r) => setTimeout(r, wait * 1000));
      if (this.pending !== p) return;
      try {
        const res = await fetch(`${OAUTH()}/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: clientId ?? '', client_secret: clientSecret ?? '', device_code: p.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, string | number>;
        if (res.ok && data.refresh_token) {
          await this.set(K.refreshToken, String(data.refresh_token));
          this.access = { token: String(data.access_token), until: Date.now() + (Number(data.expires_in ?? 3600) - 60) * 1000 };
          this.pending = null;
          await this.afterConnect();
          return;
        }
        if (data.error === 'authorization_pending') continue;
        if (data.error === 'slow_down') {
          wait += 5;
          continue;
        }
        p.error =
          data.error === 'access_denied'
            ? 'Đã từ chối cấp quyền trên Google'
            : data.error === 'invalid_client'
              ? 'Client ID hoặc Client secret không đúng – kiểm tra lại trong Google Cloud Console rồi bấm Kết nối lại'
              : `Google báo lỗi: ${data.error_description ?? data.error ?? res.status}`;
        return;
      } catch (e) {
        this.logger.warn(`Chờ xác nhận Google: ${(e as Error).message}`);
      }
    }
    if (this.pending === p) p.error = 'Mã đã hết hạn, bấm Kết nối lại';
  }

  /** Sau khi kết nối: lấy email tài khoản, tạo thư mục sao lưu */
  private async afterConnect() {
    try {
      const about = await this.drive<{ user?: { emailAddress?: string } }>('GET', '/drive/v3/about?fields=user(emailAddress)');
      await this.set(K.account, about.user?.emailAddress ?? 'Google Drive');
      await this.folder();
      this.logger.log(`Đã kết nối Google Drive ${about.user?.emailAddress ?? ''}`);
    } catch (e) {
      this.logger.error(`Kết nối Google Drive: ${(e as Error).message}`);
    }
  }

  async disconnect() {
    const refresh = await this.get(K.refreshToken);
    if (refresh) await fetch(`${OAUTH()}/revoke?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => undefined);
    await this.forget();
    return this.status();
  }

  private async token() {
    if (this.access && this.access.until > Date.now()) return this.access.token;
    const [clientId, clientSecret, refresh] = await Promise.all([this.get(K.clientId), this.get(K.clientSecret), this.get(K.refreshToken)]);
    if (!refresh) throw new Error('Chưa kết nối Google Drive');
    const res = await fetch(`${OAUTH()}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId ?? '', client_secret: clientSecret ?? '', refresh_token: refresh, grant_type: 'refresh_token' }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, string | number>;
    if (!res.ok) {
      // Quyền bị thu hồi / hết hạn (ứng dụng Google để ở chế độ Testing thì 7 ngày hết hạn): phải kết nối lại
      if (data.error === 'invalid_grant') await this.forget();
      throw new Error(data.error === 'invalid_grant' ? 'Quyền Google Drive đã hết hạn hoặc bị thu hồi, cần kết nối lại' : `Không lấy được quyền Google: ${data.error_description ?? data.error ?? res.status}`);
    }
    this.access = { token: String(data.access_token), until: Date.now() + (Number(data.expires_in ?? 3600) - 60) * 1000 };
    return this.access.token;
  }

  private async drive<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.token()}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) throw new Error(data.error?.message ?? `Google Drive lỗi ${res.status}`);
    return data;
  }

  /** Thư mục sao lưu trên Drive (tạo mới nếu chưa có / đã bị xóa) */
  private async folder() {
    const id = await this.get(K.folderId);
    if (id) {
      const f = await this.drive<{ id: string; trashed: boolean }>('GET', `/drive/v3/files/${id}?fields=id,trashed`).catch(() => null);
      if (f && !f.trashed) return id;
    }
    const created = await this.drive<{ id: string }>('POST', '/drive/v3/files?fields=id', { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' });
    await this.set(K.folderId, created.id);
    return created.id;
  }

  /** Tải một file lên (resumable upload: ổn định với file lớn) */
  private async upload(path: string, folderId: string) {
    const size = statSync(path).size;
    const name = basename(path);
    const mime = name.endsWith('.tar.gz') ? 'application/gzip' : 'application/octet-stream';
    const init = await fetch(`${API()}/upload/drive/v3/files?uploadType=resumable&fields=id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mime,
        'X-Upload-Content-Length': String(size),
      },
      body: JSON.stringify({ name, parents: [folderId] }),
    });
    const location = init.headers.get('location');
    if (!init.ok || !location) throw new Error(`Không bắt đầu tải lên được ${name} (${init.status})`);
    const res = await fetch(location, {
      method: 'PUT',
      headers: { 'Content-Type': mime, 'Content-Length': String(size) },
      body: Readable.toWeb(createReadStream(path)) as unknown as RequestInit['body'],
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    if (!res.ok) throw new Error(`Tải lên ${name} lỗi (${res.status})`);
    return { name, size };
  }

  /** Giữ lại N bản sao lưu mới nhất trên Drive (chỉ xóa file đúng mẫu tên sao lưu, trong thư mục của phần mềm) */
  private async listFolder(folderId: string) {
    const list = await this.drive<{ files: { id: string; name: string }[] }>(
      'GET',
      `/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed = false`)}&fields=files(id,name)&pageSize=1000`,
    );
    return list.files;
  }

  private async prune(folderId: string, keep: number) {
    const files = await this.listFolder(folderId);
    const sets = [...new Set(files.map((f) => SET_NAME.exec(f.name)?.[2]).filter((x): x is string => !!x))].sort().reverse();
    const drop = new Set(sets.slice(Math.max(1, keep)));
    let removed = 0;
    for (const f of files) {
      const m = SET_NAME.exec(f.name);
      if (m && drop.has(m[2])) {
        await this.drive('DELETE', `/drive/v3/files/${f.id}`);
        removed++;
      }
    }
    return removed;
  }

  /** Có bật và đã kết nối thì tải bộ sao lưu (dữ liệu + file tải lên) lên Drive */
  async shouldUpload() {
    const s = await this.status();
    return s.connected && s.enabled;
  }

  async uploadSet(name: string, paths: string[]) {
    if (this.busy) throw new Error('Đang tải lên Google Drive, vui lòng chờ');
    this.busy = true;
    const started = Date.now();
    try {
      const folderId = await this.folder();
      const local = paths.filter((x) => existsSync(x));
      // Đẩy lại cùng một bản (bấm "Đẩy lên ngay" nhiều lần): xóa file trùng tên trên Drive trước để không bị nhân đôi
      const names = new Set(local.map((p) => basename(p)));
      for (const f of (await this.listFolder(folderId)).filter((f) => names.has(f.name))) await this.drive('DELETE', `/drive/v3/files/${f.id}`);
      const files = [];
      for (const p of local) files.push(await this.upload(p, folderId));
      const removed = await this.prune(folderId, (await this.status()).keep);
      const result: UploadResult = { at: new Date().toISOString(), ok: true, name, files, removed, durationMs: Date.now() - started };
      await this.set(K.last, JSON.stringify(result));
      this.logger.log(`Đã tải ${name} lên Google Drive`);
      return result;
    } catch (e) {
      const message = (e as Error).message.slice(0, 400);
      await this.set(K.last, JSON.stringify({ at: new Date().toISOString(), ok: false, name, error: message, durationMs: Date.now() - started } satisfies UploadResult));
      this.logger.error(`Tải lên Google Drive lỗi: ${message}`);
      await this.push.notifyRoles([Role.ADMIN], { type: 'BACKUP_FAILED', title: 'Đẩy sao lưu lên Google Drive bị lỗi', body: message.slice(0, 200), link: '/system' });
      throw new Error(message);
    } finally {
      this.busy = false;
    }
  }
}
