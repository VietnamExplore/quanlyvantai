import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Role } from '@prisma/client';
import { execFile } from 'child_process';
import { mkdirSync, readdirSync, renameSync, statSync, statfsSync, unlinkSync, existsSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { GdriveService } from './gdrive.service';

const run = promisify(execFile);

/** Cài đặt sao lưu & dọn dẹp (lưu ở bảng Setting với tiền tố "sys.", không trả về trang Thông tin công ty) */
export interface MaintenanceConfig {
  /** Bật sao lưu tự động hằng ngày */
  backupEnabled: boolean;
  /** Giờ chạy (giờ Việt Nam, 0–23). Máy tắt lúc đó thì chạy bù ngay khi bật lại trong ngày */
  backupHour: number;
  /** Số bản sao lưu giữ lại (mới nhất); bản cũ hơn tự xóa */
  backupKeep: number;
  /** Nhật ký thao tác giữ bao nhiêu tháng (0 = giữ mãi) */
  auditRetentionMonths: number;
  /** Thông báo đã đọc giữ bao nhiêu ngày (0 = giữ mãi); chưa đọc giữ tối đa 1 năm */
  notificationRetentionDays: number;
}

export const DEFAULT_CONFIG: MaintenanceConfig = { backupEnabled: true, backupHour: 2, backupKeep: 14, auditRetentionMonths: 24, notificationRetentionDays: 90 };

const KEY = (k: string) => `sys.${k}`;
/** Tên file sao lưu: db-20261005-0200.dump / uploads-20261005-0200.tar.gz */
export const BACKUP_FILE = /^(db|uploads)-(\d{8}-\d{4})\.(dump|tar\.gz)$/;

const vnParts = (d = new Date()) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { ymd: `${p.year}${p.month}${p.day}`, hour: Number(p.hour) % 24, hm: `${p.hour}${p.minute}`.replace(/^24/, '00') };
};

@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Maintenance');
  /** Thư mục lưu bản sao lưu (máy văn phòng: D:\TRANSFER\backups) */
  readonly dir = resolve(process.env.BACKUP_DIR ?? join(__dirname, '..', '..', 'backups'));
  private readonly uploadDir = resolve(process.env.UPLOAD_DIR ?? join(__dirname, '..', '..', 'uploads'));
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly gdrive: GdriveService,
  ) {}

  onModuleInit() {
    mkdirSync(this.dir, { recursive: true });
    // Kiểm tra mỗi phút; lần đầu sau 30 giây để API khởi động xong
    this.timer = setInterval(() => void this.tick(), 60_000);
    setTimeout(() => void this.tick(), 30_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async config(): Promise<MaintenanceConfig> {
    const rows = await this.prisma.setting.findMany({ where: { key: { startsWith: 'sys.' } } });
    const get = (k: keyof MaintenanceConfig) => rows.find((r) => r.key === KEY(k))?.value;
    const num = (k: keyof MaintenanceConfig) => {
      const v = Number(get(k));
      return get(k) === undefined || !Number.isFinite(v) ? (DEFAULT_CONFIG[k] as number) : v;
    };
    return {
      backupEnabled: get('backupEnabled') === undefined ? DEFAULT_CONFIG.backupEnabled : get('backupEnabled') === 'true',
      backupHour: num('backupHour'),
      backupKeep: num('backupKeep'),
      auditRetentionMonths: num('auditRetentionMonths'),
      notificationRetentionDays: num('notificationRetentionDays'),
    };
  }

  async saveConfig(c: Partial<MaintenanceConfig>) {
    const entries = Object.entries(c).filter(([k, v]) => k in DEFAULT_CONFIG && v !== undefined && v !== null);
    await this.prisma.$transaction(
      entries.map(([k, v]) => this.prisma.setting.upsert({ where: { key: KEY(k) }, create: { key: KEY(k), value: String(v) }, update: { value: String(v) } })),
    );
    return this.config();
  }

  private async getJson<T>(k: string): Promise<T | null> {
    const v = (await this.prisma.setting.findUnique({ where: { key: KEY(k) } }))?.value;
    try {
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  }

  private setValue(k: string, v: unknown) {
    const value = typeof v === 'string' ? v : JSON.stringify(v);
    return this.prisma.setting.upsert({ where: { key: KEY(k) }, create: { key: KEY(k), value }, update: { value } });
  }

  /** Mỗi ngày một lần, từ giờ đã cài trở đi: dọn nhật ký / thông báo rồi sao lưu */
  private async tick() {
    if (this.busy) return;
    try {
      const cfg = await this.config();
      const now = vnParts();
      if (now.hour < cfg.backupHour) return;
      const last = (await this.prisma.setting.findUnique({ where: { key: KEY('lastDailyRun') } }))?.value;
      if (last === now.ymd) return;
      await this.setValue('lastDailyRun', now.ymd);
      await this.cleanup().catch((e) => this.logger.error(`Dọn dẹp lỗi: ${(e as Error).message}`));
      if (cfg.backupEnabled) await this.backup('auto').catch(() => undefined);
    } catch (e) {
      this.logger.error((e as Error).message);
    }
  }

  /** Xóa nhật ký thao tác và thông báo quá hạn giữ */
  async cleanup() {
    const cfg = await this.config();
    const now = new Date();
    let auditDeleted = 0;
    let notificationsDeleted = 0;
    if (cfg.auditRetentionMonths > 0) {
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - cfg.auditRetentionMonths);
      auditDeleted = (await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
    }
    if (cfg.notificationRetentionDays > 0) {
      const read = new Date(now.getTime() - cfg.notificationRetentionDays * 86_400_000);
      const any = new Date(now.getTime() - Math.max(365, cfg.notificationRetentionDays) * 86_400_000);
      notificationsDeleted = (
        await this.prisma.notification.deleteMany({ where: { OR: [{ readAt: { not: null }, createdAt: { lt: read } }, { createdAt: { lt: any } }] } })
      ).count;
    }
    const result = { at: now.toISOString(), auditDeleted, notificationsDeleted };
    await this.setValue('lastCleanup', result);
    this.logger.log(`Dọn dẹp: xóa ${auditDeleted} nhật ký, ${notificationsDeleted} thông báo`);
    return result;
  }

  /** Sao lưu cơ sở dữ liệu (pg_dump) + file tải lên (tar.gz), giữ lại N bản mới nhất */
  async backup(trigger: 'auto' | 'manual', by?: string) {
    if (this.busy) throw new Error('Đang sao lưu, vui lòng chờ');
    this.busy = true;
    const started = Date.now();
    const ts = (() => {
      const p = vnParts();
      return `${p.ymd}-${p.hm}`;
    })();
    const dbFile = join(this.dir, `db-${ts}.dump`);
    const upFile = join(this.dir, `uploads-${ts}.tar.gz`);
    try {
      mkdirSync(this.dir, { recursive: true });
      // pg_dump không hiểu tham số "?schema=" của Prisma
      const url = (process.env.DATABASE_URL ?? '').split('?')[0];
      await run('pg_dump', ['-Fc', '-f', `${dbFile}.tmp`, '--dbname', url], { timeout: 15 * 60_000, maxBuffer: 10 * 1024 * 1024 });
      renameSync(`${dbFile}.tmp`, dbFile);
      if (existsSync(this.uploadDir)) {
        // Bỏ qua file cài app lái xe (APK lớn, tải lại được từ bản build)
        await run('tar', ['czf', `${upFile}.tmp`, `--exclude=${basename(this.uploadDir)}/app`, '-C', dirname(this.uploadDir), basename(this.uploadDir)], { timeout: 30 * 60_000, maxBuffer: 10 * 1024 * 1024 });
        renameSync(`${upFile}.tmp`, upFile);
      }
      const removed = this.prune((await this.config()).backupKeep);
      const result = {
        at: new Date().toISOString(),
        ok: true,
        trigger,
        by: by ?? null,
        name: ts,
        dbSize: statSync(dbFile).size,
        uploadsSize: existsSync(upFile) ? statSync(upFile).size : 0,
        durationMs: Date.now() - started,
        removed,
      };
      await this.setValue('lastBackup', result);
      // Đã kết nối Google Drive: đẩy bản vừa sao lưu lên (chạy nền, lỗi thì báo Admin)
      if (await this.gdrive.shouldUpload()) void this.gdrive.uploadSet(ts, [dbFile, upFile]).catch(() => undefined);
      this.logger.log(`Sao lưu xong ${ts} (${Math.round((result.dbSize + result.uploadsSize) / 1024)} KB)`);
      return result;
    } catch (e) {
      for (const f of [`${dbFile}.tmp`, `${upFile}.tmp`]) if (existsSync(f)) unlinkSync(f);
      const message = ((e as { stderr?: string }).stderr || (e as Error).message || '').toString().trim().slice(0, 500);
      await this.setValue('lastBackup', { at: new Date().toISOString(), ok: false, trigger, by: by ?? null, error: message, durationMs: Date.now() - started });
      this.logger.error(`Sao lưu lỗi: ${message}`);
      await this.push.notifyRoles([Role.ADMIN], { type: 'BACKUP_FAILED', title: 'Sao lưu dữ liệu bị lỗi', body: message.slice(0, 200), link: '/system' });
      throw new Error(`Sao lưu lỗi: ${message}`);
    } finally {
      this.busy = false;
    }
  }

  /** Danh sách bản sao lưu (mỗi bản gồm file dữ liệu + file tải lên cùng thời điểm), mới nhất trước */
  list() {
    const sets = new Map<string, { name: string; db?: { file: string; size: number }; uploads?: { file: string; size: number } }>();
    for (const f of readdirSync(this.dir)) {
      const m = BACKUP_FILE.exec(f);
      if (!m) continue;
      const set = sets.get(m[2]) ?? { name: m[2] };
      set[m[1] as 'db' | 'uploads'] = { file: f, size: statSync(join(this.dir, f)).size };
      sets.set(m[2], set);
    }
    return [...sets.values()].sort((a, b) => b.name.localeCompare(a.name));
  }

  private prune(keep: number) {
    const removed: string[] = [];
    for (const set of this.list().slice(Math.max(1, keep))) {
      for (const f of [set.db?.file, set.uploads?.file]) {
        if (f) {
          unlinkSync(join(this.dir, f));
          removed.push(f);
        }
      }
    }
    return removed;
  }

  /** Đẩy bộ sao lưu mới nhất trên máy lên Google Drive (nút Đẩy lên ngay) */
  async uploadLatest() {
    if (!(await this.gdrive.status()).connected) throw new Error('Chưa kết nối Google Drive');
    const set = this.list()[0];
    if (!set) throw new Error('Chưa có bản sao lưu nào, bấm Sao lưu ngay trước');
    return this.gdrive.uploadSet(set.name, [set.db?.file, set.uploads?.file].filter((f): f is string => !!f).map((f) => join(this.dir, f)));
  }

  async status() {
    const [config, lastBackup, lastCleanup, auditCount, auditOldest, notificationCount, dbSize] = await Promise.all([
      this.config(),
      this.getJson('lastBackup'),
      this.getJson('lastCleanup'),
      this.prisma.auditLog.count(),
      this.prisma.auditLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      this.prisma.notification.count(),
      this.prisma.$queryRaw<{ size: bigint }[]>`select pg_database_size(current_database()) as size`,
    ]);
    let disk: { free: number; total: number } | null = null;
    try {
      const s = statfsSync(this.dir);
      disk = { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
    } catch {
      disk = null;
    }
    return {
      config,
      lastBackup,
      lastCleanup,
      backups: this.list(),
      busy: this.busy,
      dir: process.env.BACKUP_DIR_LABEL ?? this.dir,
      gdrive: await this.gdrive.status(),
      disk,
      stats: { auditCount, auditOldest: auditOldest?.createdAt ?? null, notificationCount, dbSize: Number(dbSize[0]?.size ?? 0) },
    };
  }
}
