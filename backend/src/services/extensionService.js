const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

/**
 * Endpoint untuk download extension dalam bentuk ZIP
 */
async function downloadExtensionZip(req, res) {
    const extensionDir = path.join(__dirname, '../../../frontend/public/extension');
    
    // Set header untuk download
    res.attachment('pulse-lcr-extension.zip');
    
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
