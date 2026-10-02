const request = require('supertest');
const express = require('express');

// Set test environment variables
process.env.ADMIN_PASSWORD = 'test_admin_password_123';
process.env.ADMIN_API_KEY = 'test_admin_api_key_456';

const adminLoginHandler = require('../../api/auth/admin-login');

const app = express();
app.use(express.json());
app.all('/api/auth/admin-login', (req, res) => adminLoginHandler(req, res));

describe('POST /api/auth/admin-login (Vercel Serverless Auth Handler)', () => {
  // 1. Happy Path: Valid admin password
  it('AUTH-ADM-001: should authenticate successfully and return api_key when password is valid', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ password: 'test_admin_password_123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.api_key).toBe('test_admin_api_key_456');
    expect(res.body.message).toContain('berhasil');
  });

  // 2. Edge Case 1: Incorrect password
  it('AUTH-ADM-002: should reject access with 401 when password is incorrect', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ password: 'wrong_password_999' });

    expect(res.statusCode).toBe(401);
    expect(res.body.status).toBe(false);
    expect(res.body.message).toBe('Password admin salah.');
  });

  // 3. Edge Case 2: Missing or empty password
  it('AUTH-ADM-003: should return 400 when password is missing or empty', async () => {
    const resEmpty = await request(app)
      .post('/api/auth/admin-login')
      .send({ password: '' });

    expect(resEmpty.statusCode).toBe(400);
    expect(resEmpty.body.status).toBe(false);
    expect(resEmpty.body.message).toBe('Password wajib diisi.');

    const resNone = await request(app)
      .post('/api/auth/admin-login')
      .send({});

    expect(resNone.statusCode).toBe(400);
    expect(resNone.body.status).toBe(false);
    expect(resNone.body.message).toBe('Password wajib diisi.');
  });

  // 4. Edge Case 3: Invalid HTTP method (GET)
  it('AUTH-ADM-004: should reject non-POST methods with 405 Method Not Allowed', async () => {
    const res = await request(app).get('/api/auth/admin-login');

    expect(res.statusCode).toBe(405);
    expect(res.body.status).toBe(false);
    expect(res.body.message).toContain('Method not allowed');
  });

  // 5. Edge Case 4: CORS Preflight (OPTIONS)
  it('AUTH-ADM-005: should respond 200 with CORS headers on OPTIONS preflight', async () => {
    const res = await request(app).options('/api/auth/admin-login');

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});
