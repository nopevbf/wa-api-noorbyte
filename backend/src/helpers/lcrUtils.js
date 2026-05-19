/**
 * lcrUtils.js — Pure utility functions for LCR Engine
 *
 * Extracted from lcrEngine.js so they can be unit-tested
 * independently of puppeteer/browser dependencies.
 */
'use strict';

/**
 * Normalize Instagram URLs: converts /reel/ and /reels/ to /p/
 * so the correct post layout is always loaded.
 *
 * @param {string} url - Raw URL from user input
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  return url.replace(/instagram\.com\/reels?\/(?=[a-zA-Z0-9_-])/i, 'instagram.com/p/');
}

/**
 * Detect social media platform from a URL.
 *
 * @param {string} url
 * @returns {'instagram' | 'tiktok' | 'unknown'}
 */
function detectPlatform(url) {
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return 'unknown';
}

module.exports = { normalizeUrl, detectPlatform };
