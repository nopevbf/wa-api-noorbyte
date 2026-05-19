/**
 * lcrUtils.test.js — TDD Tests for LCR utility functions
 * 
 * Covers:
 * - normalizeUrl: converts Instagram reel/reels URLs to /p/ format
 * - detectPlatform: identifies instagram/tiktok from URL
 * 
 * These are extracted utility functions that must be testable
 * without requiring puppeteer or browser dependencies.
 */
const { normalizeUrl, detectPlatform } = require('../src/helpers/lcrUtils');

describe('normalizeUrl', () => {
  it('should convert /reel/ to /p/', () => {
    const input = 'https://www.instagram.com/reel/ABC123DEF/';
    const result = normalizeUrl(input);
    expect(result).toBe('https://www.instagram.com/p/ABC123DEF/');
  });

  it('should convert /reels/ (plural) to /p/', () => {
    const input = 'https://www.instagram.com/reels/ABC123DEF/';
    const result = normalizeUrl(input);
    expect(result).toBe('https://www.instagram.com/p/ABC123DEF/');
  });

  it('should be case-insensitive for Reel/ and Reels/', () => {
    const inputReel = 'https://www.instagram.com/Reel/ABC123/';
    const inputReels = 'https://www.instagram.com/Reels/ABC123/';
    expect(normalizeUrl(inputReel)).toBe('https://www.instagram.com/p/ABC123/');
    expect(normalizeUrl(inputReels)).toBe('https://www.instagram.com/p/ABC123/');
  });

  it('should NOT modify a URL that is already /p/', () => {
    const input = 'https://www.instagram.com/p/ABC123DEF/';
    const result = normalizeUrl(input);
    expect(result).toBe('https://www.instagram.com/p/ABC123DEF/');
  });

  it('should NOT modify a TikTok URL', () => {
    const input = 'https://www.tiktok.com/@user/video/123456';
    const result = normalizeUrl(input);
    expect(result).toBe('https://www.tiktok.com/@user/video/123456');
  });

  it('should NOT modify a URL without instagram.com', () => {
    const input = 'https://example.com/reels/abc';
    const result = normalizeUrl(input);
    expect(result).toBe('https://example.com/reels/abc');
  });
});

describe('detectPlatform', () => {
  it('should detect instagram from instagram.com URL', () => {
    expect(detectPlatform('https://www.instagram.com/p/ABC/')).toBe('instagram');
  });

  it('should detect tiktok from tiktok.com URL', () => {
    expect(detectPlatform('https://www.tiktok.com/@user/video/123')).toBe('tiktok');
  });

  it('should return unknown for unrecognized URL', () => {
    expect(detectPlatform('https://www.example.com/post/123')).toBe('unknown');
  });

  it('should be case-insensitive for Instagram.com', () => {
    expect(detectPlatform('https://www.Instagram.com/p/ABC/')).toBe('instagram');
  });
});
