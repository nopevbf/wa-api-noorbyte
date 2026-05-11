const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

/**
 * Endpoint untuk download extension dalam bentuk ZIP
 */
async function downloadExtensionZip(req, res) {
    const baseDir = path.resolve(__dirname, '../../../frontend/public');
    // Jika req.query.path digunakan di masa depan, kita aman:
    const targetFolder = req.query.folder || 'extension';
    const extensionDir = path.resolve(baseDir, targetFolder);
    
    // Mencegah Path Traversal (OWASP)
    if (!extensionDir.startsWith(baseDir)) {
        console.warn(`[SECURITY] Path Traversal Attack Detected: ${extensionDir}`);
        return res.status(403).json({ error: 'Access Denied: Invalid directory path' });
    }

    if (!fs.existsSync(extensionDir)) {
        return res.status(404).json({ error: 'Extension directory not found' });
    }
    
    // Set header untuk download
    res.attachment(`pulse-lcr-${targetFolder}.zip`);
    
    const archive = archiver('zip', {
        zlib: { level: 9 } // Compression level maksimal
    });

    archive.on('error', (err) => {
        res.status(500).send({ error: err.message });
    });

    // Pipe archive data ke response
    archive.pipe(res);

    // Tambahkan file dari direktori extension
    archive.directory(extensionDir, false);

    // Finalize archive
    await archive.finalize();
}

module.exports = { downloadExtensionZip };
