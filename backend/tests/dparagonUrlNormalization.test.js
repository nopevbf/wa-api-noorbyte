const { normalizeDpApiUrl } = require('../src/services/dparagonService');

describe('normalizeDpApiUrl helper', () => {
  it('DP-NORM-001: should return normalized URL when input already has /v2', () => {
    expect(normalizeDpApiUrl('https://api.dparagon.com/v2')).toBe('https://api.dparagon.com/v2');
  });

  it('DP-NORM-002: should append /v2 when input is missing /v2', () => {
    expect(normalizeDpApiUrl('https://api.dparagon.com')).toBe('https://api.dparagon.com/v2');
    expect(normalizeDpApiUrl('https://api.dparagon.com/')).toBe('https://api.dparagon.com/v2');
  });

  it('DP-NORM-003: should replace management. with api. and ensure /v2', () => {
    expect(normalizeDpApiUrl('https://management.dparagon.com')).toBe('https://api.dparagon.com/v2');
    expect(normalizeDpApiUrl('https://management.dparagon6.persona-it.com')).toBe('https://api.dparagon6.persona-it.com/v2');
  });

  it('DP-NORM-004: should fallback to default prod URL when empty or null', () => {
    expect(normalizeDpApiUrl('')).toBe('https://api.dparagon.com/v2');
    expect(normalizeDpApiUrl(null)).toBe('https://api.dparagon.com/v2');
    expect(normalizeDpApiUrl(undefined)).toBe('https://api.dparagon.com/v2');
  });
});
