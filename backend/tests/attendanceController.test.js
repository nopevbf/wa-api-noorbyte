const { executeJailbreak } = require('../src/controllers/attendanceController');

describe('attendanceController - executeJailbreak (Sanitization)', () => {
  it('should reject requests with potentially malicious payload strings (Command Injection)', async () => {
    const req = {
      body: {
        env: 'development',
        email: 'test@example.com',
        password: 'password123',
        fullName: 'John Doe; rm -rf /' // Malicious input
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await executeJailbreak(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: false,
      message: 'Invalid input characters detected'
    });
  });

  it('should handle missing fields gracefully without Uncaught TypeError', async () => {
    const req = { body: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await executeJailbreak(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: false,
      message: 'Payload Incomplete'
    });
  });
});
