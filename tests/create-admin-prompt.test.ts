import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { askQuestion } from '@/../scripts/create-admin';

describe('Admin CLI Password Prompt Muting (Aturan 5B S)', () => {
  it('Password input pada mode TTY hidden benar-benar tersembunyi tanpa echo karakter', async () => {
    const originalStdin = process.stdin;
    const stdoutWrites: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((str: unknown) => {
      stdoutWrites.push(String(str));
      return true;
    });

    // Simulasi TTY stdin
    const mockStdin = Object.assign(new EventEmitter(), {
      isTTY: true,
      setRawMode: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      setEncoding: vi.fn(),
    });

    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      configurable: true,
    });

    try {
      const askPromise = askQuestion('Masukkan Password: ', true);

      // Pastikan raw mode diaktifkan
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);

      // Simulasikan pengetikan password karakter demi karakter
      const testSecret = 'RahasiaSuper123!';
      for (const char of testSecret) {
        mockStdin.emit('data', char);
      }
      // Tekan tombol Enter (\r)
      mockStdin.emit('data', '\r');

      const result = await askPromise;

      // Nilai yang dikembalikan harus cocok
      expect(result).toBe(testSecret);

      // Raw mode harus dinonaktifkan kembali
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);

      // Periksa semua output yang ditulis ke stdout
      // Hanya boleh ada query prompt dan newline penutup, TIDAK BOLEH ada karakter password
      const fullOutput = stdoutWrites.join('');
      expect(fullOutput).toContain('Masukkan Password: ');
      expect(fullOutput).toContain('\n');
      expect(fullOutput).not.toContain(testSecret);
      for (const char of testSecret) {
        expect(stdoutWrites.filter(w => w === char).length).toBe(0);
      }
    } finally {
      Object.defineProperty(process, 'stdin', {
        value: originalStdin,
        configurable: true,
      });
      stdoutSpy.mockRestore();
    }
  });

  it('Backspace pada password mode TTY menghapus karakter terakhir', async () => {
    const originalStdin = process.stdin;
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const mockStdin = Object.assign(new EventEmitter(), {
      isTTY: true,
      setRawMode: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      setEncoding: vi.fn(),
    });

    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      configurable: true,
    });

    try {
      const askPromise = askQuestion('Masukkan Password: ', true);

      mockStdin.emit('data', 'A');
      mockStdin.emit('data', 'B');
      mockStdin.emit('data', 'C');
      mockStdin.emit('data', '\b'); // Backspace menghapus C
      mockStdin.emit('data', 'D');
      mockStdin.emit('data', '\n');

      const result = await askPromise;
      expect(result).toBe('ABD');
    } finally {
      Object.defineProperty(process, 'stdin', {
        value: originalStdin,
        configurable: true,
      });
      stdoutSpy.mockRestore();
    }
  });
});
