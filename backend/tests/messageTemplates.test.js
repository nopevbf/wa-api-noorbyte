const { buildMagicLinkMessage } = require('../src/helpers/messageTemplates');

describe('buildMagicLinkMessage', () => {
  const sampleLink = 'http://localhost:4000/verify?token=513e98ff887a97bf83f53d9cf9ccf76a';

  // --- Happy path: Jaksel vibes, link present ---
  it('should include the magic link in the message', () => {
    const msg = buildMagicLinkMessage(sampleLink);
    expect(msg).toContain(sampleLink);
  });

  it('should contain a single-use warning note', () => {
    const msg = buildMagicLinkMessage(sampleLink);
    // note: link hanya berlaku sekali
    expect(msg.toLowerCase()).toMatch(/sekali/);
  });

  it('should contain an expiry note (10 menit)', () => {
    const msg = buildMagicLinkMessage(sampleLink);
    // note: berlaku 10 menit
    expect(msg).toMatch(/10\s*menit/i);
  });

  it('should have Jaksel-style opener (casual Indonesia + English mix)', () => {
    const msg = buildMagicLinkMessage(sampleLink);
    // Jaksel vibe: ada kata kasual seperti "hey", "btw", "nih", "yuk", "bro", "link-nya", dll
    const jaкselKeywords = /hey|btw|nih|yuk|bro|link.nya|which is|basically|actually|so|anyway/i;
    expect(msg).toMatch(jaкselKeywords);
  });

  it('should use bold formatting for the header (*text*)', () => {
    const msg = buildMagicLinkMessage(sampleLink);
    expect(msg).toMatch(/\*.+\*/);
  });

  it('should use italic formatting for the disclaimer (_text_)', () => {
    const msg = buildMagicLinkMessage(sampleLink);
    // Garis miring di WA = underscore wrapping
    expect(msg).toMatch(/_.*sekali.*_|_.*10 menit.*_/i);
  });

  // --- Edge: empty link ---
  it('should still return a string even with an empty link', () => {
    const msg = buildMagicLinkMessage('');
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  // --- Edge: long token link ---
  it('should embed the full link without truncation', () => {
    const longLink = 'https://api.noorbyte.app/verify?token=' + 'a'.repeat(64);
    const msg = buildMagicLinkMessage(longLink);
    expect(msg).toContain(longLink);
  });
});
