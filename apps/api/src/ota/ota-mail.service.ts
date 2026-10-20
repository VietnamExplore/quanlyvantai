import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BookingStatus, Prisma, Role } from '@prisma/client';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { BookingsService } from '../bookings/bookings.service';
import { nationalityFromPhone } from '../common/nationality';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { ShuttleService } from '../shuttle/shuttle.service';
import { isBusProduct, isKnownPlace, routeEnds, WebsiteService } from '../website/website.service';
import { htmlToText, isOtaTransport, type OtaChannel, type OtaMailBooking, parseOtaMail, type ParsedMail } from './ota-mail-parse';
import { otaSalesUserId } from './ota-sales';

/** Cài đặt hộp thư nhận booking OTA (tiền tố "sys." – không trả về trang Thông tin công ty) */
const K = {
  host: 'sys.otaMail.host',
  user: 'sys.otaMail.user',
  pass: 'sys.otaMail.pass',
  folder: 'sys.otaMail.folder',
  enabled: 'sys.otaMail.enabled',
  since: 'sys.otaMail.since',
  state: 'sys.otaMail.state',
};

export interface OtaMailState {
  uidValidity?: string;
  lastUid?: number;
  lastRunAt?: string;
  lastOkAt?: string;
  lastError?: string | null;
  created?: number;
}

export const OTA_MAIL_STATUS: Record<string, string> = {
  CREATED: 'Đã tạo booking',
  DUPLICATE: 'Đã có booking',
  SKIPPED: 'Không phải vận chuyển',
  NOTIFIED: 'Đã báo điều hành',
  UNPARSED: 'Chưa có mẫu – nhập tay',
  ERROR: 'Lỗi',
};
export const OTA_MAIL_KIND: Record<string, string> = { BOOKING: 'Đặt mới', CHANGE: 'Thay đổi', CANCEL: 'Hủy' };

const LANG: Record<string, string> = { japanese: 'ja', korean: 'ko', chinese: 'zh', mandarin: 'zh', cantonese: 'zh', vietnamese: 'vi' };
const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;
/** Chữ thường không dấu, chỉ chữ + số (so khớp tên điểm dừng, tên khách) */
const fold = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
/** Tên điểm dừng khớp địa chỉ khách: chứa nhau, hoặc ≥ 60% từ của tên ngắn hơn có trong tên dài hơn */
function stopMatches(stop: string, place: string) {
  const a = fold(stop);
  const b = fold(place);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const [short, long] = a.split(' ').length <= b.split(' ').length ? [a, b] : [b, a];
  const words = short.split(' ').filter((w) => w.length > 1);
  const longWords = new Set(long.split(' '));
  return words.length >= 2 && words.filter((w) => longWords.has(w)).length / words.length >= 0.6;
}
const when = (iso: string | null | undefined) => (iso ? `${iso.slice(11, 16)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '?');

/**
 * Quét hộp thư nhận booking của các kênh OTA (IMAP, mật khẩu ứng dụng do Admin nhập ở trang Hệ thống): mỗi 5 phút đọc email mới,
 * chỉ lấy email đặt / đổi / hủy của các kênh OTA và chỉ booking dịch vụ vận chuyển (bus / xe ghép, xe riêng, đưa đón, thuê xe).
 * Kênh đã có mẫu (GetYourGuide) tự tạo booking: nguồn + khách hàng = kênh (ghi công nợ), giá giữ nguyên số trên email, không xuất hóa đơn.
 * Email đổi / hủy: ghi chú vào booking và báo điều hành (không tự sửa). Kênh chưa có mẫu: báo điều hành nhập tay.
 */
@Injectable()
export class OtaMailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OtaMailService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly push: PushService,
    private readonly website: WebsiteService,
    private readonly shuttle: ShuttleService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.scan().catch(() => undefined), 300_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async get() {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: Object.values(K) } } });
    const v = (k: string) => rows.find((r) => r.key === k)?.value ?? '';
    let state: OtaMailState = {};
    try {
      state = JSON.parse(v(K.state) || '{}');
    } catch {
      state = {};
    }
    return { host: v(K.host) || 'imap.gmail.com', user: v(K.user), pass: v(K.pass), folder: v(K.folder) || 'INBOX', enabled: v(K.enabled) === '1', since: v(K.since), state };
  }

  private set(key: string, value: string) {
    return this.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  /** Trạng thái cho trang Hệ thống (không trả mật khẩu) */
  async status() {
    const c = await this.get();
    const emails = await this.prisma.otaEmail.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 30,
      select: { id: true, channel: true, kind: true, ref: true, subject: true, receivedAt: true, status: true, note: true, booking: { select: { id: true, code: true } } },
    });
    return {
      host: c.host,
      user: c.user,
      folder: c.folder,
      enabled: c.enabled,
      since: c.since || null,
      hasPass: !!c.pass,
      state: c.state,
      emails: emails.map((e) => ({ ...e, statusLabel: OTA_MAIL_STATUS[e.status] ?? e.status, kindLabel: OTA_MAIL_KIND[e.kind] ?? e.kind })),
    };
  }

  async saveConfig(dto: { host?: string; user?: string; pass?: string; folder?: string; enabled?: boolean; since?: string }) {
    const before = await this.get();
    if (dto.host !== undefined) await this.set(K.host, dto.host.trim() || 'imap.gmail.com');
    if (dto.user !== undefined) await this.set(K.user, dto.user.trim());
    // Mật khẩu ứng dụng Gmail hiển thị dạng "abcd efgh ijkl mnop"
    if (dto.pass) await this.set(K.pass, dto.pass.replace(/\s+/g, ''));
    if (dto.folder !== undefined) await this.set(K.folder, dto.folder.trim() || 'INBOX');
    if (dto.since !== undefined) await this.set(K.since, dto.since);
    if (dto.enabled !== undefined) {
      await this.set(K.enabled, dto.enabled ? '1' : '0');
      // Bật lần đầu: chỉ đọc email từ hôm nay (không nhận lại booking cũ đã nhập tay)
      if (dto.enabled && !before.since && !dto.since) await this.set(K.since, new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()));
    }
    // Đổi hộp thư / thư mục: đọc lại từ đầu (email đã xử lý không xử lý lại)
    if ((dto.user !== undefined && dto.user.trim() !== before.user) || (dto.folder !== undefined && (dto.folder.trim() || 'INBOX') !== before.folder)) {
      await this.set(K.state, JSON.stringify({ ...before.state, lastUid: undefined, uidValidity: undefined, lastError: null }));
    }
    return this.status();
  }

  private client(c: Awaited<ReturnType<OtaMailService['get']>>) {
    return new ImapFlow({ host: c.host, port: 993, secure: true, auth: { user: c.user, pass: c.pass }, logger: false, socketTimeout: 60_000 });
  }

  private static imapError(e: unknown) {
    const err = e as { authenticationFailed?: boolean; responseText?: string; message?: string; code?: string };
    if (err.authenticationFailed) return 'Hộp thư từ chối đăng nhập: kiểm tra địa chỉ email và mật khẩu ứng dụng (Gmail: bật Xác minh 2 bước, tạo Mật khẩu ứng dụng; bật IMAP trong cài đặt Gmail)';
    if (err.code === 'ENOTFOUND') return 'Không tìm thấy máy chủ thư (IMAP)';
    return err.responseText || err.message || 'Lỗi kết nối hộp thư';
  }

  /** Kiểm tra kết nối: đăng nhập, đếm email trong thư mục */
  async test() {
    const c = await this.get();
    if (!c.user || !c.pass) return { ok: false, message: 'Chưa nhập địa chỉ email và mật khẩu ứng dụng' };
    const imap = this.client(c);
    try {
      await imap.connect();
      const st = await imap.status(c.folder, { messages: true });
      return { ok: true, message: `Kết nối được hộp thư ${c.user} · thư mục ${c.folder}: ${st.messages ?? 0} email` };
    } catch (e) {
      return { ok: false, message: OtaMailService.imapError(e) };
    } finally {
      await imap.logout().catch(() => undefined);
    }
  }

  /** Đọc email mới. force = bấm "Quét ngay" (chạy cả khi đang tắt tự động) */
  async scan(force = false) {
    if (this.running) return { skipped: true };
    const c = await this.get();
    if ((!c.enabled && !force) || !c.user || !c.pass) return { skipped: true };
    this.running = true;
    const state: OtaMailState = { ...c.state, lastRunAt: new Date().toISOString() };
    const counts = { read: 0, created: 0, notified: 0 };
    const imap = this.client(c);
    try {
      const sinceDay = c.since || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
      const since = new Date(`${sinceDay}T00:00:00+07:00`);
      await imap.connect();
      const lock = await imap.getMailboxLock(c.folder);
      try {
        const box = imap.mailbox && typeof imap.mailbox === 'object' ? imap.mailbox : null;
        const validity = String(box?.uidValidity ?? '');
        if (validity !== state.uidValidity) {
          state.uidValidity = validity;
          state.lastUid = 0;
        }
        // IMAP SINCE theo ngày (bỏ giờ): lấy rộng hơn 1 ngày, lọc chính xác theo giờ nhận bên dưới
        const found = await imap.search({ since: new Date(since.getTime() - 86_400_000) }, { uid: true });
        const uids = (Array.isArray(found) ? found : []).filter((u) => u > (state.lastUid ?? 0)).sort((a, b) => a - b).slice(0, 300);
        for (const uid of uids) {
          const msg = await imap.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
          if (msg && msg.source) {
            const r = await this.handle(msg.source, msg.internalDate ? new Date(msg.internalDate) : null, since);
            if (r && r !== 'SEEN') {
              counts.read++;
              if (r === 'CREATED') counts.created++;
              if (r === 'NOTIFIED' || r === 'UNPARSED') counts.notified++;
            }
          }
          state.lastUid = uid;
        }
      } finally {
        lock.release();
      }
      state.lastOkAt = new Date().toISOString();
      state.lastError = null;
      state.created = (state.created ?? 0) + counts.created;
      return { ok: true, ...counts };
    } catch (e) {
      state.lastError = OtaMailService.imapError(e);
      this.logger.warn(`Không đọc được hộp thư booking OTA: ${state.lastError}`);
      return { ok: false, message: state.lastError };
    } finally {
      await imap.logout().catch(() => undefined);
      await this.set(K.state, JSON.stringify(state));
      this.running = false;
    }
  }

  /** Xử lý một email (nội dung gốc). Không phải email booking OTA: trả null, không lưu */
  async handle(source: Buffer, internalDate: Date | null, since: Date | null) {
    const mail = await simpleParser(source);
    const receivedAt = mail.date ?? internalDate ?? new Date();
    if (since && receivedAt < since) return null;
    const sender = mail.from?.value?.[0]?.address ?? mail.from?.text ?? '';
    const subject = (mail.subject ?? '').trim();
    const text = mail.html ? htmlToText(mail.html) : (mail.text ?? '');
    const parsed = parseOtaMail({ sender, subject, text, receivedAt });
    if (!parsed.channel || parsed.kind === 'OTHER') return null;
    const messageId = mail.messageId ?? `${sender}|${subject}|${receivedAt.toISOString()}`;
    // Đã xử lý (quét lại / tải file lại): bỏ qua
    if (await this.prisma.otaEmail.findUnique({ where: { messageId }, select: { id: true } })) return 'SEEN';
    let res: { status: string; note?: string | null; bookingId?: number | null };
    try {
      res = await this.process(parsed, subject);
    } catch (e) {
      res = { status: 'ERROR', note: (e as Error).message };
      this.logger.warn(`Email OTA "${subject}": ${(e as Error).message}`);
    }
    await this.prisma.otaEmail.create({
      data: {
        messageId,
        channel: parsed.channel.code,
        kind: parsed.kind,
        ref: parsed.ref,
        subject: subject.slice(0, 500),
        sender,
        receivedAt,
        status: res.status,
        note: res.note ?? null,
        data: (parsed.booking ?? undefined) as Prisma.InputJsonValue | undefined,
        bookingId: res.bookingId ?? null,
      },
    });
    return res.status;
  }

  private async process(p: ParsedMail, subject: string): Promise<{ status: string; note?: string | null; bookingId?: number | null }> {
    const ch = p.channel!;
    const b = p.booking;
    // Kênh chưa có mẫu đọc: báo điều hành mở email nhập tay
    if (!b) {
      await this.push.notifyRoles([Role.ADMIN, Role.DIEU_HANH], {
        type: 'OTA_EMAIL',
        title: `📧 ${ch.name}: email ${OTA_MAIL_KIND[p.kind]?.toLowerCase() ?? ''} booking`,
        body: `${subject} – chưa có mẫu đọc tự động, mở hộp thư booking để xử lý (chỉ booking vận chuyển)`,
        link: '/system',
      });
      return { status: 'UNPARSED', note: 'Kênh chưa có mẫu đọc tự động' };
    }
    // Chỉ booking vận chuyển / xe ghép (tour, vé tham quan… không nhập)
    const transport = !!b.transport || (!!b.product && isOtaTransport(b.product));
    const existing = p.ref ? await this.prisma.booking.findFirst({ where: { customerRef: p.ref }, orderBy: { id: 'asc' }, select: { id: true, code: true, internalNotes: true } }) : null;

    if (p.kind === 'BOOKING') {
      if (!transport) return { status: 'SKIPPED', note: b.product ?? null };
      if (existing) return { status: 'DUPLICATE', bookingId: existing.id, note: `Đã có booking ${existing.code}` };
      const manual = await this.manualTwin(b);
      if (manual) return { status: 'DUPLICATE', bookingId: manual.id, note: `Có thể trùng booking ${manual.code} nhập tay (cùng ngày, cùng khách) – kiểm tra, thêm mã ${p.ref} vào booking nếu đúng` };
      return this.createBooking(ch, b as Partial<OtaMailBooking> & { ref: string });
    }

    // Đổi / hủy: ghi chú vào booking, báo điều hành tự sửa / hủy
    if (!existing && !transport) return { status: 'SKIPPED', note: b.product ?? null };
    const detail =
      p.kind === 'CANCEL'
        ? `${ch.name} báo HỦY booking ${p.ref ?? ''}${b.pickupTime ? ` (đón ${when(b.pickupTime)})` : ''}`
        : `${ch.name} báo THAY ĐỔI booking ${p.ref ?? ''}: ${[b.pickupTime && `giờ đón ${when(b.pickupTime)}`, b.pickup && `điểm đón ${b.pickup}`, b.adults && `${b.adults} khách`].filter(Boolean).join(' · ') || 'xem email'}`;
    const more = (b.extra ?? []).filter((x) => /hủy|còn/i.test(x));
    if (existing) {
      const line = `⚠ ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}: ${detail}.`;
      await this.prisma.booking.update({ where: { id: existing.id }, data: { internalNotes: [line, ...more, existing.internalNotes].filter(Boolean).join('\n') } });
    }
    await this.push.notifyRoles([Role.ADMIN, Role.DIEU_HANH], {
      type: 'OTA_EMAIL',
      title: `📧 ${detail}`,
      body: existing ? `${more.length ? `${more.join(' · ')} · ` : ''}Booking ${existing.code} – kiểm tra và ${p.kind === 'CANCEL' ? 'hủy booking / chuyến' : 'sửa booking'}` : `Chưa tìm thấy booking mã ${p.ref ?? '?'} trong phần mềm – kiểm tra`,
      link: existing ? `/bookings/${existing.id}` : '/system',
    });
    return { status: 'NOTIFIED', bookingId: existing?.id ?? null, note: detail };
  }

  /**
   * Khách hàng của kênh (ghi công nợ): khách hàng văn phòng đã tạo (vd "Getyourguide VNE", "Vé Xe Rẻ", "12Go"), chưa có thì tạo.
   * Nguồn khách: "OTA" (danh mục có sẵn), chưa có thì tạo nguồn theo mã kênh.
   */
  private async ensureChannel(ch: OtaChannel) {
    const ota = await this.prisma.customerSource.findUnique({ where: { code: 'OTA' }, select: { code: true } });
    const source = ota?.code ?? ch.code;
    if (!ota) await this.prisma.customerSource.upsert({ where: { code: ch.code }, update: {}, create: { code: ch.code, name: ch.name, sortOrder: 50 } });
    const all = await this.prisma.customer.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true } });
    const found = all.find((c) => ch.alias.test(c.name) || fold(c.name) === fold(ch.name));
    if (found) return { customerId: found.id, source };
    const agent = await this.prisma.customerKind.findFirst({ where: { isAgent: true }, orderBy: { sortOrder: 'asc' }, select: { code: true } });
    const c = await this.prisma.customer.create({
      data: { name: ch.name, type: agent?.code ?? 'KHACH_LE', notes: `Kênh OTA ${ch.name}. Booking tự nhập từ email thông báo đặt chỗ; giá = giá trên email.` },
    });
    return { customerId: c.id, source };
  }

  /** Booking văn phòng đã nhập tay (không có mã đặt chỗ): cùng ngày đi, cùng SĐT hoặc cùng tên khách */
  private async manualTwin(b: Partial<OtaMailBooking>) {
    if (!b.pickupTime) return null;
    const day = new Date(`${b.pickupTime.slice(0, 10)}T00:00:00+07:00`);
    const list = await this.prisma.booking.findMany({
      where: { status: { not: BookingStatus.HUY }, trips: { some: { pickupTime: { gte: day, lt: new Date(day.getTime() + 86_400_000) } } } },
      select: { id: true, code: true, contactName: true, contactPhone: true, passengers: { select: { fullName: true, phone: true } } },
    });
    const phone = (b.phone ?? '').replace(/\D/g, '').slice(-9);
    const name = fold(b.customerName ?? '');
    const sameName = (x: string | null | undefined) => !!x && name.length >= 5 && (fold(x) === name || fold(x).split(' ').sort().join(' ') === name.split(' ').sort().join(' '));
    return (
      list.find(
        (x) =>
          (phone.length >= 8 && [x.contactPhone, ...x.passengers.map((p) => p.phone)].some((v) => (v ?? '').replace(/\D/g, '').slice(-9) === phone)) ||
          sameName(x.contactName) ||
          x.passengers.some((p) => sameName(p.fullName)),
      ) ?? null
    );
  }

  /** Tạo booking từ email đặt chỗ: bus / xe ghép → chuyến xe ghép đúng tuyến + giờ; xe riêng / đưa đón → loại xe vừa số khách */
  private async createBooking(ch: OtaChannel, b: Partial<OtaMailBooking> & { ref: string }) {
    const bot = await this.website.botUser();
    const { customerId, source } = await this.ensureChannel(ch);
    const salesUserId = await otaSalesUserId(this.prisma);
    const product = b.product || ch.name;
    const pax = Math.max(1, (b.adults ?? 0) + (b.children ?? 0));
    const vndPrice = b.currency === 'VND' && b.price ? Math.round(b.price) : 0;
    const origin = `${ch.name} ${b.ref}`;
    const skipped: string[] = [];
    let trip: Record<string, unknown> | null = null;
    if (!b.pickupTime) skipped.push('không đọc được ngày / giờ đi');
    else {
      // Xe ghép / bus: tuyến theo email (Vé xe rẻ: "thuộc tuyến Đà Nẵng - Hội An") hoặc theo tên sản phẩm
      // ("shuttle bus kèm vé cáp treo" vẫn là xe ghép)
      const shared = isBusProduct(product) || (/\bbus\b|shuttle|shared/i.test(product) && !/private/i.test(product));
      const ends = (b.busRoute ? routeEnds(b.busRoute) : null) ?? (shared ? routeEnds(product) : null);
      const services = await this.prisma.service.findMany({ where: { isActive: true }, select: { code: true } });
      const has = (c: string) => services.some((s) => s.code === c);
      if (ends && has('XE_GHEP')) {
        // Chỉ tự tạo tuyến mới khi 2 đầu là địa danh rõ ràng (12Go chỉ ghi địa chỉ đường phố)
        const found = await this.website.shuttleFor(ends, product, b.pickupTime, pax ? Math.round(vndPrice / pax) : vndPrice, origin, {
          routes: await this.website.shuttleRoutes(),
          types: await this.prisma.vehicleType.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
          noCreate: !isKnownPlace(ends.from) || !isKnownPlace(ends.to),
        });
        if (typeof found === 'string') skipped.push(found);
        else {
          // Điểm đón / trả trên tuyến khớp địa chỉ khách (vd "Bảo tàng Điêu khắc Chăm Đà Nẵng" → điểm "Bảo tàng Chăm")
          const pick = (b.pickup && found.route.stops.find((x) => x.canPickup && stopMatches(x.name, b.pickup!))) || found.pick;
          const drop = (b.dropoff && [...found.route.stops].reverse().find((x) => x.canDropoff && x.seq > pick.seq && stopMatches(x.name, b.dropoff!))) || found.drop;
          trip = {
            serviceType: 'XE_GHEP',
            pickupTime: b.pickupTime,
            pickupAddress: b.pickup || pick.name,
            dropoffAddress: b.dropoff || drop.name,
            passengers: pax,
            childCount: b.children ?? 0,
            vehicleTypeId: found.route.vehicleTypeId,
            unitPrice: vndPrice,
            shuttleRunId: found.runId,
            shuttlePickupStopId: pick.id,
            shuttleDropoffStopId: drop.id,
            notes: [`${origin}: ${product}${b.pickup ? ` · khách đón tại ${b.pickup}` : ''}`, b.review].filter(Boolean).join(' · '),
          };
        }
      } else if (b.busRoute) {
        skipped.push(`không nhận ra tuyến xe ghép "${b.busRoute}"`);
      } else {
        const airport = /airport|san bay|sân bay/i.test(product);
        const service = airport && has('DON_TIEN_SAN_BAY') ? 'DON_TIEN_SAN_BAY' : 'THEO_TUYEN';
        const type = await this.prisma.vehicleType.findFirst({ where: { isActive: true, maxPassengers: { gte: pax } }, orderBy: [{ maxPassengers: 'asc' }, { id: 'asc' }], select: { id: true } });
        if (!type || !has(service)) skipped.push(`chưa có loại xe cho ${pax} khách / dịch vụ ${service}`);
        else
          trip = {
            serviceType: service,
            pickupTime: b.pickupTime,
            pickupAddress: b.pickup || product,
            dropoffAddress: b.dropoff || null,
            passengers: pax,
            vehicleTypeId: type.id,
            unitPrice: vndPrice,
            itinerary: product,
            notes: `${origin} · loại xe tự chọn theo số khách, kiểm tra lại`,
          };
      }
    }
    const lang = LANG[(b.language ?? '').toLowerCase()] ?? 'en';
    const nationality = b.phone ? nationalityFromPhone(b.phone) : null;
    const notes = [
      `Tự nhập từ email ${ch.name} · mã đặt chỗ ${b.ref}`,
      `Sản phẩm: ${product}`,
      `Số khách: ${b.adults ?? 0} người lớn${b.children ? `, ${b.children} trẻ em` : ''}`,
      b.customerEmail ? `Email khách (qua ${ch.name}): ${b.customerEmail}` : null,
      b.language ? `Ngôn ngữ khách: ${b.language}` : null,
      b.priceText ? `Giá trên email: ${b.priceText}${b.currency && b.currency !== 'VND' ? ' – ngoại tệ, nhập giá VNĐ tay' : ''}` : 'Email không có giá – nhập giá tay',
      `Ghi công nợ khách hàng ${ch.name} · không xuất hóa đơn`,
      ...(b.extra ?? []),
      b.review ?? null,
      ...skipped.map((x) => `Chưa tự tạo chuyến: ${x}`),
    ].filter(Boolean);
    const dto = {
      customerId,
      customerRef: b.ref,
      source,
      salesUserId,
      contactName: b.customerName || ch.name,
      contactPhone: b.phone ?? '',
      ...(b.phone && { leaderName: b.customerName || null, leaderPhone: b.phone }),
      docLanguage: lang,
      signTitle: b.customerName || null,
      invoiceRequired: false,
      vatPercent: 0,
      internalNotes: notes.join('\n'),
      passengers: b.customerName ? [{ fullName: b.customerName, phone: b.phone ?? null, nationality, note: `Người đặt trên ${ch.name}` }] : [],
      trips: trip ? [trip] : [],
    } as unknown as Parameters<BookingsService['create']>[0];
    let booking: Awaited<ReturnType<BookingsService['create']>>;
    try {
      booking = await this.bookings.create(dto, bot, BookingStatus.NHAP);
    } catch (e) {
      // Không tạo được chuyến: vẫn nhận booking, điều hành thêm chuyến tay
      booking = await this.bookings.create({ ...dto, trips: [], internalNotes: `${dto.internalNotes}\nKhông tự tạo được chuyến: ${(e as Error).message}` }, bot, BookingStatus.NHAP);
      trip = null;
    }
    // Đơn OTA đã xác nhận: có chuyến thì chuyển Đã xác nhận (báo điều hành xếp xe); chưa có chuyến thì để Nháp và báo nhập chuyến
    // (tạo booking / xác nhận đã tự báo Admin, Điều hành; chỉ báo thêm khi phải thêm chuyến tay)
    // (email thiếu số khách / giá – 12Go: để Nháp cho điều hành kiểm tra)
    if (trip && !b.review) {
      if (b.pickupTime && new Date(b.pickupTime).getTime() > Date.now()) await this.bookings.changeStatus(booking.id, { status: BookingStatus.XAC_NHAN }, bot);
      else {
        // Chuyến đã qua (email cũ nhập lại): chỉ đổi trạng thái, không báo điều xe
        await this.prisma.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.XAC_NHAN } });
        await this.shuttle.syncRuns([trip.shuttleRunId as number | undefined]);
      }
    }
    else if (b.review)
      await this.push.notifyRoles([Role.ADMIN, Role.DIEU_HANH], {
        type: 'OTA_EMAIL',
        title: `📧 Booking ${ch.name} ${b.ref} – cần kiểm tra`,
        body: `${b.customerName ?? ''} · ${product} · ${when(b.pickupTime)} · ${b.review}`,
        link: `/bookings/${booking.id}`,
      });
    else
      await this.push.notifyRoles([Role.ADMIN, Role.DIEU_HANH], {
        type: 'OTA_EMAIL',
        title: `📧 Booking ${ch.name} ${b.ref} – cần thêm chuyến tay`,
        body: `${b.customerName ?? ''} · ${product} · ${when(b.pickupTime)} · ${pax} khách${vndPrice ? ` · ${vnd(vndPrice)}` : ''} · ${skipped.join('; ') || 'không tự tạo được chuyến'}`,
        link: `/bookings/${booking.id}`,
      });
    return { status: 'CREATED', bookingId: booking.id, note: trip ? null : skipped.join('; ') || 'Chưa tạo chuyến' };
  }
}
