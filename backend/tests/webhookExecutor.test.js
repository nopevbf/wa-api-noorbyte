/**
 * webhookExecutor.test.js — TDD Tests for Webhook Executor Service (DParagon Presence Execution)
 */
const { executePresenceWebhook } = require('../src/services/webhookExecutor');

describe('Webhook Executor Service', () => {
  const validJobData = {
    timerKey: 'test_key_abc',
    token: 'valid_bearer_token',
    dpUrl: 'https://api.dparagon.com',
    action: 'MASUK',
    userId: 'user_001',
    payload: {
      latitude: -7.75723,
      longitude: 110.41448,
      image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
    }
  };

  let mockFirestoreDb;
  let mockHttpClient;

  beforeEach(() => {
    mockFirestoreDb = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          update: jest.fn().mockResolvedValue({ writeTime: '2026-10-01T00:00:00Z' })
        })
      })
    };

    mockHttpClient = jest.fn();
  });

  // 1. Happy Path: Successful Presence Submission
  it('should submit presence to DParagon and update Firestore status to SUCCESS', async () => {
    mockHttpClient.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: true,
        message: 'Presensi berhasil dicatat.'
      })
    });

    const result = await executePresenceWebhook(validJobData, {
      httpClient: mockHttpClient,
      firestoreDb: mockFirestoreDb
    });

    expect(result.status).toBe(true);
    expect(result.message).toMatch(/berhasil/i);
    expect(mockHttpClient).toHaveBeenCalledWith(
      'https://api.dparagon.com/attendance/presence',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer valid_bearer_token'
        })
      })
    );
    expect(mockFirestoreDb.collection).toHaveBeenCalledWith('timebomb_jobs');
  });

  // 2. Edge Case: Auto-resolve Late Reason when required by DParagon
  it('should automatically retry with late_reason if DParagon asks for late reason', async () => {
    // First call rejects with "Late reason required"
    mockHttpClient
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          status: false,
          message: 'Alasan terlambat wajib diisi.'
        })
      })
      // Second call succeeds with auto-injected late_reason
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: true,
          message: 'Presensi berhasil dicatat dengan alasan keterlambatan.'
        })
      });

    const result = await executePresenceWebhook(validJobData, {
      httpClient: mockHttpClient,
      firestoreDb: mockFirestoreDb
    });

    expect(result.status).toBe(true);
    expect(mockHttpClient).toHaveBeenCalledTimes(2);
    // Verifikasi call kedua menyertakan late_reason
    const secondCallBody = JSON.parse(mockHttpClient.mock.calls[1][1].body);
    expect(secondCallBody.late_reason).toBe('Urusan Keluarga');
  });

  // 3. Error Case: Token Expired or Unauthorized (401)
  it('should record failure when DParagon returns 401 Unauthorized', async () => {
    mockHttpClient.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        status: false,
        message: 'Unauthenticated / Token expired.'
      })
    });

    const result = await executePresenceWebhook(validJobData, {
      httpClient: mockHttpClient,
      firestoreDb: mockFirestoreDb
    });

    expect(result.status).toBe(false);
    expect(result.message).toMatch(/unauthenticated|token expired/i);
  });

  // 4. Error Case: Missing essential job data
  it('should reject when timerKey or token is missing', async () => {
    const invalidJob = { ...validJobData, token: '' };

    const result = await executePresenceWebhook(invalidJob, {
      httpClient: mockHttpClient,
      firestoreDb: mockFirestoreDb
    });

    expect(result.status).toBe(false);
    expect(result.message).toMatch(/data job tidak lengkap/i);
  });

  // 5. Regression (BUG-TB-001): DParagon returns 200 with "data successfully retrieved" and no boolean status
  it('should treat DParagon HTTP 200 with "data successfully retrieved" as SUCCESS (BUG-TB-001)', async () => {
    mockHttpClient.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        message: 'data successfully retrieved'
      })
    });

    const result = await executePresenceWebhook(validJobData, {
      httpClient: mockHttpClient,
      firestoreDb: mockFirestoreDb
    });

    expect(result.status).toBe(true);
    expect(result.message).toBe('data successfully retrieved');
    expect(mockFirestoreDb.collection().doc().update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SUCCESS',
        responseMessage: 'data successfully retrieved'
      })
    );
  });

  // 6. Edge Case: DParagon returns 200 with string status: 'success'
  it('should treat DParagon HTTP 200 with string status "success" as SUCCESS', async () => {
    mockHttpClient.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        message: 'Presence recorded'
      })
    });

    const result = await executePresenceWebhook(validJobData, {
      httpClient: mockHttpClient,
      firestoreDb: mockFirestoreDb
    });

    expect(result.status).toBe(true);
    expect(mockFirestoreDb.collection().doc().update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SUCCESS' })
    );
  });

  // 7. Error Case: DParagon returns 200 but explicit status: false (rejected by business logic)
  it('should treat DParagon response with explicit status: false as FAILED even if HTTP is 200', async () => {
    mockHttpClient.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: false,
        message: 'Wajah tidak cocok dengan database.'
      })
    });

    const result = await executePresenceWebhook(validJobData, {
      httpClient: mockHttpClient,
      firestoreDb: mockFirestoreDb
    });

    expect(result.status).toBe(false);
    expect(result.message).toBe('Wajah tidak cocok dengan database.');
    expect(mockFirestoreDb.collection().doc().update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' })
    );
  });
});
