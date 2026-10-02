/**
 * qstashScheduler.test.js — TDD Tests for QStash Scheduling Service (Serverless Time-Bomb)
 */
const { 
  scheduleQStashTimebomb, 
  calculateExecutionTimestamp,
  cancelQStashTimebomb
} = require('../src/services/qstashService');
const { DateTime } = require('luxon');

describe('QStash Time-Bomb Scheduler Service', () => {
  const validPayload = {
    latitude: -7.75723,
    longitude: 110.41448,
    image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  };

  const validConfig = {
    token: 'valid_bearer_token_123',
    dpUrl: 'https://api.dparagon.com',
    targetTime: '07:00',
    action: 'MASUK',
    userId: 'user_test_01',
    payload: validPayload
  };

  let mockQStashClient;
  let mockFirestoreDb;

  beforeEach(() => {
    mockQStashClient = {
      publishJSON: jest.fn().resolveValue?.({ messageId: 'msg_qstash_123' }) || jest.fn().mockResolvedValue({ messageId: 'msg_qstash_123' }),
      messages: {
        delete: jest.fn().mockResolvedValue({ success: true })
      }
    };

    mockFirestoreDb = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          set: jest.fn().mockResolvedValue({ writeTime: '2026-10-01T00:00:00Z' }),
          update: jest.fn().mockResolvedValue({ writeTime: '2026-10-01T00:00:00Z' }),
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              status: 'SCHEDULED',
              qstashMessageId: 'msg_qstash_123'
            })
          })
        })
      })
    };
  });

  describe('calculateExecutionTimestamp', () => {
    // 1. Happy Path
    it('should calculate valid Unix epoch timestamp in seconds for a future target time in Asia/Jakarta', () => {
      const now = DateTime.now().setZone('Asia/Jakarta');
      const future = now.plus({ minutes: 30 });
      const targetTime = future.toFormat('HH:mm');

      const timestamp = calculateExecutionTimestamp(targetTime, 'KELUAR');

      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(Math.floor(now.toMillis() / 1000));
    });

    // 2. Edge Case: MASUK subtracts 60 seconds (1 minute buffer)
    it('should deduct 60 seconds for MASUK action', () => {
      const now = DateTime.now().setZone('Asia/Jakarta');
      const future = now.plus({ minutes: 30 });
      const targetTime = future.toFormat('HH:mm');

      const tsKeluar = calculateExecutionTimestamp(targetTime, 'KELUAR');
      const tsMasuk = calculateExecutionTimestamp(targetTime, 'MASUK');

      expect(tsKeluar - tsMasuk).toBe(60);
    });

    // 3. Error Case: Invalid time format
    it('should throw or return null for junk/invalid time format', () => {
      expect(calculateExecutionTimestamp('invalid:time')).toBeNull();
      expect(calculateExecutionTimestamp('25:99')).toBeNull();
    });
  });

  describe('scheduleQStashTimebomb', () => {
    // 4. Happy Path: Schedule successfully to QStash & Firestore
    it('should schedule job to QStash and save metadata to Firestore', async () => {
      const now = DateTime.now().setZone('Asia/Jakarta');
      const future = now.plus({ hours: 2 });
      const config = {
        ...validConfig,
        targetTime: future.toFormat('HH:mm')
      };

      const result = await scheduleQStashTimebomb(config, {
        qstashClient: mockQStashClient,
        firestoreDb: mockFirestoreDb,
        webhookUrl: 'https://wa-api-noorbyte.vercel.app/api/timebomb/execute-webhook'
      });

      expect(result.status).toBe(true);
      expect(result.timer_key).toBeDefined();
      expect(mockQStashClient.publishJSON).toHaveBeenCalled();
      expect(mockFirestoreDb.collection).toHaveBeenCalledWith('timebomb_jobs');
    });

    // 5. Error Case: Missing required parameters
    it('should reject when token or payload is missing', async () => {
      const invalidConfig = { ...validConfig, token: '' };

      const result = await scheduleQStashTimebomb(invalidConfig, {
        qstashClient: mockQStashClient,
        firestoreDb: mockFirestoreDb,
        webhookUrl: 'https://wa-api-noorbyte.vercel.app/api/timebomb/execute-webhook'
      });

      expect(result.status).toBe(false);
      expect(result.message).toMatch(/token.*wajib/i);
    });

    // 6. Error Case: SSRF Protection on dpUrl
    it('should reject local or private IP addresses for dpUrl (SSRF check)', async () => {
      const ssrfConfig = {
        ...validConfig,
        dpUrl: 'http://localhost:4000'
      };

      const result = await scheduleQStashTimebomb(ssrfConfig, {
        qstashClient: mockQStashClient,
        firestoreDb: mockFirestoreDb,
        webhookUrl: 'https://wa-api-noorbyte.vercel.app/api/timebomb/execute-webhook'
      });

      expect(result.status).toBe(false);
      expect(result.message).toMatch(/ssrf|https/i);
    });

    // 7. Error Case: QStash Publish API failure
    it('should handle QStash API network/server errors gracefully', async () => {
      mockQStashClient.publishJSON = jest.fn().mockRejectedValue(new Error('QStash network down'));

      const now = DateTime.now().setZone('Asia/Jakarta');
      const future = now.plus({ hours: 1 });
      const config = { ...validConfig, targetTime: future.toFormat('HH:mm') };

      const result = await scheduleQStashTimebomb(config, {
        qstashClient: mockQStashClient,
        firestoreDb: mockFirestoreDb,
        webhookUrl: 'https://wa-api-noorbyte.vercel.app/api/timebomb/execute-webhook'
      });

      expect(result.status).toBe(false);
      expect(result.message).toMatch(/gagal menjadwalkan ke qstash/i);
    });
  });

  describe('cancelQStashTimebomb', () => {
    // 8. Happy path cancel
    it('should delete message in QStash and update Firestore status to CANCELLED', async () => {
      const result = await cancelQStashTimebomb('timer_key_123', {
        qstashClient: mockQStashClient,
        firestoreDb: mockFirestoreDb
      });

      expect(result.status).toBe(true);
      expect(mockQStashClient.messages.delete).toHaveBeenCalledWith('msg_qstash_123');
    });

    // 9. Error case: Job not found
    it('should return error if job does not exist in Firestore', async () => {
      mockFirestoreDb.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false })
        })
      });

      const result = await cancelQStashTimebomb('non_existent_key', {
        qstashClient: mockQStashClient,
        firestoreDb: mockFirestoreDb
      });

      expect(result.status).toBe(false);
      expect(result.message).toMatch(/tidak ditemukan/i);
    });
  });
});
