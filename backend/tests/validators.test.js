const { validateManualTasks, validateSaveSettings, normalizePhoneNumber } = require('../src/helpers/validators');

describe('normalizePhoneNumber', () => {
  it('should normalize Indonesian number starting with 08 to 628', () => {
    expect(normalizePhoneNumber('082298507500')).toBe('6282298507500');
  });

  it('should keep number starting with 62 as is', () => {
    expect(normalizePhoneNumber('6282298507500')).toBe('6282298507500');
  });

  it('should clean non-numeric characters and normalize', () => {
    expect(normalizePhoneNumber('+62 822-9850-7500')).toBe('6282298507500');
    expect(normalizePhoneNumber('0822 9850 7500')).toBe('6282298507500');
    });

    it('should handle "+" prefix correctly', () => {
    expect(normalizePhoneNumber('+6282298507500')).toBe('6282298507500');
    expect(normalizePhoneNumber('+1234567890')).toBe('1234567890');
    });

    it('should handle international numbers (non-62)', () => {
    expect(normalizePhoneNumber('14155552671')).toBe('14155552671'); // USA
    expect(normalizePhoneNumber('+442079460958')).toBe('442079460958'); // UK
    });

    it('should return empty string for null/undefined/empty', () => {

    expect(normalizePhoneNumber(null)).toBe('');
    expect(normalizePhoneNumber(undefined)).toBe('');
    expect(normalizePhoneNumber('')).toBe('');
  });

  it('should handle numbers without country code prefix by just cleaning them if not starting with 0', () => {
    expect(normalizePhoneNumber('82298507500')).toBe('82298507500');
  });
});

describe('validateManualTasks — field contract: { date, description }', () => {

  // --- Happy path: backend should accept { date, description } ---
  it('should PASS with correct fields { date, description }', () => {
    const tasks = [{ date: '2025-05-05', description: 'Laporan Harian' }];
    const result = validateManualTasks(tasks);
    expect(result.valid).toBe(true);
    expect(result.data[0]).toHaveProperty('date', '2025-05-05');
    expect(result.data[0]).toHaveProperty('description', 'Laporan Harian');
  });

  it('should PASS with multiple valid tasks', () => {
    const tasks = [
      { date: '2025-05-05', description: 'Task A' },
      { date: '2025-05-06', description: 'Task B' },
    ];
    const result = validateManualTasks(tasks);
    expect(result.valid).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  // --- Edge: missing date ---
  it('should FAIL when date is missing', () => {
    const tasks = [{ description: 'Laporan Harian' }];
    const result = validateManualTasks(tasks);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/date/i);
  });

  // --- Edge: missing description ---
  it('should FAIL when description is missing', () => {
    const tasks = [{ date: '2025-05-05' }];
    const result = validateManualTasks(tasks);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/description/i);
  });

  // --- Edge: empty string fields ---
  it('should FAIL when date is empty string', () => {
    const tasks = [{ date: '', description: 'Task' }];
    const result = validateManualTasks(tasks);
    expect(result.valid).toBe(false);
  });

  it('should FAIL when description is empty string', () => {
    const tasks = [{ date: '2025-05-05', description: '' }];
    const result = validateManualTasks(tasks);
    expect(result.valid).toBe(false);
  });

  // --- Edge: empty array → valid ---
  it('should PASS with empty array', () => {
    const result = validateManualTasks([]);
    expect(result.valid).toBe(true);
    expect(result.data).toEqual([]);
  });

  // --- Edge: null/undefined → valid (optional field) ---
  it('should PASS with null (field omitted)', () => {
    const result = validateManualTasks(null);
    expect(result.valid).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should PASS with undefined (field omitted)', () => {
    const result = validateManualTasks(undefined);
    expect(result.valid).toBe(true);
    expect(result.data).toEqual([]);
  });

  // --- Edge: not an array ---
  it('should FAIL when manual_tasks is a plain object (not array)', () => {
    const result = validateManualTasks({ date: 'x', description: 'y' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/array/i);
  });

  // --- Extra field stripping ---
  it('should STRIP unknown fields, keeping only date and description', () => {
    const tasks = [{ date: '2025-05-05', description: 'Task A', extra: 'ignored', task_name: 'stripped' }];
    const result = validateManualTasks(tasks);
    expect(result.valid).toBe(true);
    expect(result.data[0]).not.toHaveProperty('extra');
    expect(result.data[0]).not.toHaveProperty('task_name');
    expect(result.data[0]).toHaveProperty('date');
    expect(result.data[0]).toHaveProperty('description');
  });
});

describe('validateSaveSettings', () => {
  it('should PASS with valid settings', () => {
    const body = { is_active: true, frequency: 'daily' };
    const result = validateSaveSettings(body);
    expect(result.valid).toBe(true);
  });

  it('should PASS with partial valid settings (optional fields)', () => {
    expect(validateSaveSettings({ is_active: false }).valid).toBe(true);
    expect(validateSaveSettings({ frequency: 'weekly' }).valid).toBe(true);
  });

  it('should FAIL with invalid frequency', () => {
    const result = validateSaveSettings({ frequency: 'invalid' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/frequency/i);
  });

  it('should FAIL with invalid is_active (non-boolean)', () => {
    const result = validateSaveSettings({ is_active: 'yes' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/is_active/i);
  });

  it('should NOT crash with null/undefined body', () => {
    // Current implementation crashes here! Fix needed.
    expect(() => validateSaveSettings(null)).not.toThrow();
    expect(validateSaveSettings(null).valid).toBe(false);
  });
});


describe('AI Settings Validation', () => {
  const { validateAiSettings } = require('../src/helpers/validators');

  it('should pass if ai_system_prompt is within 10000 characters', () => {
    const okPrompt = 'a'.repeat(10000);
    const result = validateAiSettings({ ai_system_prompt: okPrompt });
    expect(result.valid).toBe(true);
  });

  it('should fail if ai_system_prompt is 10001 characters', () => {
    const longPrompt = 'a'.repeat(10001);
    const result = validateAiSettings({ ai_system_prompt: longPrompt });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('ai_system_prompt maksimal 10000 karakter');
  });

  it('should pass if ai_system_prompt is missing', () => {
    const result = validateAiSettings({});
    expect(result.valid).toBe(true);
  });
});

