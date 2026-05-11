/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');

// Read the devices.js content
const devicesJsPath = path.resolve(__dirname, '../../frontend/public/js/devices.js');
let devicesJs = fs.readFileSync(devicesJsPath, 'utf8');

// Read the devices.html content
const devicesHtmlPath = path.resolve(__dirname, '../../frontend/public/devices.html');
const devicesHtml = fs.readFileSync(devicesHtmlPath, 'utf8');

describe('Add Device Modal UI', () => {
    beforeEach(() => {
        // Use the actual HTML for testing
        document.body.innerHTML = devicesHtml;
        
        // Mock socket.io and other globals
        global.io = jest.fn(() => ({
            on: jest.fn(),
            off: jest.fn()
        }));
        global.localStorage = {
            getItem: jest.fn(),
            setItem: jest.fn()
        };
        global.showModal = jest.fn();

        // Eval the code to load functions into global scope
        window.eval(devicesJs);
    });

    it('should have a z-index higher than the sidebar (z-[100])', () => {
        const modal = document.getElementById('addModal');
        expect(modal.className).toContain('z-[100]');
    });

    it('should make the modal visible (removing hidden and opacity-0) when toggleAddModal(true) is called', (done) => {
        const modal = document.getElementById('addModal');
        const content = modal.querySelector('.transform');
        
        toggleAddModal(true);
        
        expect(modal.classList.contains('hidden')).toBe(false);
        
        setTimeout(() => {
            try {
                expect(modal.classList.contains('opacity-0')).toBe(false);
                expect(content.classList.contains('scale-95')).toBe(false);
                done();
            } catch (err) {
                done(err);
            }
        }, 50);
    });
});
