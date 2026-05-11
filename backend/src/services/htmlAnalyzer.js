const fs = require('fs/promises');
const cheerio = require('cheerio');
const path = require('path');

/**
 * Analyzes an HTML file to check for specific elements and keywords.
 * @param {string} filePath - Path to the HTML file
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeHtmlFile(filePath) {
  // SQA GUARD: Prevent Path Traversal
  if (filePath.includes('..') || filePath.startsWith('/etc') || filePath.startsWith('C:\\Windows')) {
    throw new Error('Path Traversal terdeteksi! Akses ditolak.');
  }

  const html = await fs.readFile(filePath, 'utf8');
  const $ = cheerio.load(html);

  return {
    hasForm: $('form').length > 0,
    title: $('title').text() || '',
    hasHome: html.includes('Home') || html.includes('Beranda'),
    hasLogin: html.toLowerCase().includes('login'),
    length: html.length
  };
}

module.exports = { analyzeHtmlFile };
