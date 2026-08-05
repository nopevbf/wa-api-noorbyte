const { encrypt } = require('../src/helpers/security');

describe('Security Helper - Late Env Loading', () => {
    test('should throw error if ENCRYPTION_KEY is missing at startup (fail fast)', () => {
        // Clear env
        const original = process.env.ENCRYPTION_KEY;
        delete process.env.ENCRYPTION_KEY;
        
        jest.isolateModules(() => {
            // It should throw immediately on require since it's validated at startup
            expect(() => {
                require('../src/helpers/security');
            }).toThrow();
        });
        
        process.env.ENCRYPTION_KEY = original;
    });
});
