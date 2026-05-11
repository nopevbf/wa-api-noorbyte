const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('checkin.js', () => {
    it('should parse without syntax errors', () => {
        const filePath = path.join(__dirname, '../../frontend/public/js/checkin.js');
        const code = fs.readFileSync(filePath, 'utf-8');
        
        // This will throw a SyntaxError if the code is invalid
        expect(() => {
            new vm.Script(code);
        }).not.toThrow();
    });
});
