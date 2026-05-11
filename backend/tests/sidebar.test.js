const fs = require('fs');
const path = require('path');

describe('Sidebar Component', () => {
    const sidebarPath = path.join(__dirname, '../../frontend/public/components/sidebar.html');
    
    test('should contain system version text below logout button', () => {
        const html = fs.readFileSync(sidebarPath, 'utf8');
        
        // Check if there's a small text or div with version info
        // We'll look for something like 'v1.0.0' or a tag with version related class
        const versionRegex = /v\d+\.\d+\.\d+/;
        const hasVersion = versionRegex.test(html);
        
        expect(hasVersion).toBe(true);
    });

    test('should have a dedicated container for system version', () => {
        const html = fs.readFileSync(sidebarPath, 'utf8');
        expect(html).toContain('id="system-version"');
    });
});
