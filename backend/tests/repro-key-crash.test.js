const { encrypt } = require('../src/helpers/security');

describe('Security Helper - Late Env Loading', () => {
    test('should fail if ENCRYPTION_KEY is set AFTER require', () => {
        // Clear env
        const original = process.env.ENCRYPTION_KEY;
        delete process.env.ENCRYPTION_KEY;
        
        // This simulates what happens if security.js is loaded when env is missing
        // Since it's already loaded in this process, we might need to isolate
        
        jest.isolateModules(() => {
            const { encrypt } = require('../src/helpers/security');
            process.env.ENCRYPTION_KEY = 'f3e1c9b2d5a8e7f6g5h4i3j2k1l0m9n8';
            
            // If key is top-level, this will fail because key was created as empty Buffer
            expect(() => encrypt('test')).not.toThrow(RangeError);
        });
        
        process.env.ENCRYPTION_KEY = original;
    });
});
