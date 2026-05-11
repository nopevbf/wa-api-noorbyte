const { validateManualTasks } = require('../src/helpers/validators');

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
