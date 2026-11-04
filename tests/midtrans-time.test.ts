import { describe, it, expect } from 'vitest';
import { parseMidtransTime } from '@/lib/midtrans/time';

describe('Midtrans Time Parsing (WIB UTC+07:00)', () => {
  it('mem-parse format YYYY-MM-DD HH:mm:ss sebagai WIB (+07:00) yang tepat', () => {
    const input = '2026-11-04 18:30:00';
    const parsed = parseMidtransTime(input);

    // 18:30:00 WIB (UTC+7) setara dengan 11:30:00 UTC
    expect(parsed.toISOString()).toBe('2026-11-04T11:30:00.000Z');
  });

  it('mem-parse waktu pergantian hari WIB ke UTC dengan benar', () => {
    const input = '2026-11-04 03:15:00';
    const parsed = parseMidtransTime(input);

    // 03:15 WIB tanggal 4 Nov setara dengan 20:15 UTC tanggal 3 Nov
    expect(parsed.toISOString()).toBe('2026-11-03T20:15:00.000Z');
  });

  it('fallback ke Date sekarang jika waktu kosong atau null', () => {
    const before = Date.now();
    const parsed = parseMidtransTime(null);
    const after = Date.now();

    expect(parsed.getTime()).toBeGreaterThanOrEqual(before);
    expect(parsed.getTime()).toBeLessThanOrEqual(after);
  });
});
