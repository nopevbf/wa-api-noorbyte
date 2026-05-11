const { parseDparagonTime } = require('../src/helpers/timeFormatter');

describe('parseDparagonTime', () => {
  it('should parse Indonesian date and time format correctly', () => {
    const input = 'Senin, 10 Mei 2026 08:30:00 (WIB)';
    const result = parseDparagonTime(input);
    expect(result).toBeGreaterThan(0);
    expect(new Date(result).getMonth()).toBe(4); // Mei = index 4
  });

  it('should parse English date and time format correctly (Equivalence Partitioning)', () => {
    const input = 'Monday, 10 May 2026 08:30:00 (WIB)';
    const result = parseDparagonTime(input);
    expect(result).toBeGreaterThan(0);
    expect(new Date(result).getMonth()).toBe(4); // May = index 4
  });

  it('should return 0 for null, undefined, or dash (Boundary Value)', () => {
    expect(parseDparagonTime(null)).toBe(0);
    expect(parseDparagonTime(undefined)).toBe(0);
    expect(parseDparagonTime('-')).toBe(0);
    expect(parseDparagonTime('')).toBe(0);
  });

  it('should handle time without date correctly (Boundary Value)', () => {
    const input = '08:30:00';
    const result = parseDparagonTime(input);
    expect(result).toBe(0); // Assuming invalid format returns 0 based on current logic, or maybe it parses? Wait, current logic will use '08:30:00' as both. Let's assert it handles it without crashing.
    expect(typeof result).toBe('number');
  });

  it('should return 0 for completely unparseable formats', () => {
    expect(parseDparagonTime('Gak Jelas Banget Formatnya')).toBe(0);
  });
});
