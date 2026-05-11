const fs = require('fs/promises');
const cheerio = require('cheerio');

/**
 * Analyzes an HTML file to check for specific elements and keywords.
 * @param {string} filePath - Path to the HTML file
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeHtmlFile(filePath) {
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

// Execute analysis if run as a standalone script
if (require.main === module) {
  (async () => {
    try {
      const targetFile = process.argv[2] || 'ig_test.html';
      console.log(`Analyzing ${targetFile}...`);
      const result = await analyzeHtmlFile(targetFile);
      console.log('Analysis Result:', result);
    } catch (err) {
      console.error(`Error analyzing file [${err.code}]:`, err.message);
      process.exit(1);
    }
  })();
}

module.exports = { analyzeHtmlFile };
