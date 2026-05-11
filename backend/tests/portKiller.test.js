const { killPortProcess } = require('../src/helpers/portKiller');
const child_process = require('child_process');

jest.mock('child_process');

describe('Port Killer', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should reject invalid port numbers to prevent Command Injection', async () => {
    await expect(killPortProcess('4000; rm -rf /')).rejects.toThrow('Invalid port number format. Only digits allowed.');
    await expect(killPortProcess('invalid')).rejects.toThrow('Invalid port number format. Only digits allowed.');
    expect(child_process.exec).not.toHaveBeenCalled();
  });

  it('should not execute in production environment', async () => {
    process.env.NODE_ENV = 'production';
    await expect(killPortProcess(4000)).rejects.toThrow('Port killing is disabled in production');
    expect(child_process.exec).not.toHaveBeenCalled();
  });

  it('should reject system ports (0-1023) to prevent accidental OS damage', async () => {
    await expect(killPortProcess(80)).rejects.toThrow('Cannot kill system ports (0-1023)');
    await expect(killPortProcess(1023)).rejects.toThrow('Cannot kill system ports (0-1023)');
    expect(child_process.exec).not.toHaveBeenCalled();
  });

  it('should handle permission errors gracefully when killing a process', async () => {
    process.env.NODE_ENV = 'development';
    
    // Mock successful find but permission denied on kill
    child_process.exec.mockImplementation((cmd, cb) => {
      if (cmd.includes('netstat') || cmd.includes('lsof')) {
        // Return a clean PID string that works for both split logic
        cb(null, '12345', '');
      } else if (cmd.includes('taskkill') || cmd.includes('kill')) {
        const error = new Error('Command failed');
        error.stderr = 'EPERM: Operation not permitted';
        cb(error, '', error.stderr);
      }
    });

    await expect(killPortProcess(4000)).rejects.toThrow('Akses ditolak (Permission Denied). Coba jalankan sebagai Administrator/Root.');
  });

  it('should attempt to find and kill the process on valid port', async () => {
    process.env.NODE_ENV = 'development';
    
    // Mock successful find and kill
    child_process.exec.mockImplementation((cmd, cb) => {
      if (cmd.includes('netstat') || cmd.includes('lsof')) {
        cb(null, '12345', '');
      } else if (cmd.includes('taskkill') || cmd.includes('kill')) {
        cb(null, 'Success');
      }
    });

    const result = await killPortProcess(4000);
    expect(result).toBe(true);
    expect(child_process.exec).toHaveBeenCalledTimes(2);
  });
});
