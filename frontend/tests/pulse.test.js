/**
 * @jest-environment jsdom
 */

// Mock Alpine
const Alpine = {
    data: jest.fn((name, callback) => {
        window.AlpineData = window.AlpineData || {};
        window.AlpineData[name] = callback();
    })
};
window.Alpine = Alpine;

// Mock io
window.io = jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn()
}));

// Mock JSZip
window.JSZip = jest.fn();

// Mock localStorage
const localStorageMock = (function() {
    let store = {};
    return {
        getItem: jest.fn(key => store[key] || null),
        setItem: jest.fn((key, value) => { store[key] = value.toString(); }),
        removeItem: jest.fn(key => { delete store[key]; }),
        clear: jest.fn(() => { store = {}; })
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Import pulse.js
require('../public/js/pulse.js');

describe('pulseController - Task 1: Tag-Based Resource Pool', () => {
    let controller;

    beforeEach(() => {
        // Alpine.data('pulseController', () => ({ ... })) was called during require
        // We can get a fresh instance by calling the registered callback
        controller = window.AlpineData['pulseController'];
        
        // Reset state
        controller.manual.poolTags = [];
        controller.manual.currentInput = '';
        controller.config.name = 'Test User';
        controller.config.ig = 'test_ig';
        controller.config.tt = 'test_tt';
    });

    test('Initial state should have poolTags and currentInput', () => {
        expect(controller.manual.poolTags).toEqual([]);
        expect(controller.manual.currentInput).toBe('');
    });

    test('addTag should add trimmed tags and clear currentInput', () => {
        controller.manual.currentInput = '  Tag 1  ';
        controller.addTag();
        expect(controller.manual.poolTags).toEqual(['Tag 1']);
        expect(controller.manual.currentInput).toBe('');
    });

    test('addTag should handle bulk pasted tags with commas', () => {
        controller.manual.currentInput = 'Tag 1, Tag 2, Tag 3';
        controller.addTag();
        expect(controller.manual.poolTags).toEqual(['Tag 1', 'Tag 2', 'Tag 3']);
    });

    test('removeTag should remove tag at index', () => {
        controller.manual.poolTags = ['Tag 1', 'Tag 2', 'Tag 3'];
        controller.removeTag(1);
        expect(controller.manual.poolTags).toEqual(['Tag 1', 'Tag 3']);
    });

    test('getTagLabel should summarize content using regex', () => {
        const rawText = 'LCR Report\n1. Sate Ayam\n2. Nasi Goreng\nhttp://example.com';
        const label = controller.getTagLabel(rawText);
        expect(label).toBe('2. Nasi Goreng...');
    });

    test('getTagLabel should return truncated raw text if no match found', () => {
        const rawText = 'Just some random text without numbered items';
        const label = controller.getTagLabel(rawText);
        expect(label).toBe('Just some random tex...');
    });

    test('captionPreview should aggregate tags with double-newline spacing', () => {
        // We need a date for parsedDate to work, but parsedDate currently depends on poolText
        // Let's set poolText manually for this test if needed, or see if it works with undefined
        // Actually, let's test if captionPreview works without a date first
        
        controller.manual.poolTags = ['1. Item A', '2. Item B'];
        const preview = controller.captionPreview;
        
        expect(preview).toContain('Test User / 1 / ...');
        expect(preview).toContain('Test User / 2 / ...');
        // Check for double newline between items
        // Wait, current implementation:
        // if tag1 has "1. Item A", block1 = "Name / 1 / Date"
        // if tag2 has "2. Item B", block2 = "Name / 2 / Date"
        // body = [block1, block2].join('\n\n')
        expect(preview).toContain('Test User / 1 / ...\n\nTest User / 2 / ...');
    });

    test('startManual should flatten poolTags into poolText', () => {
        controller.manual.poolTags = ['Tag 1', 'Tag 2'];
        
        // Mock sendToBackend to avoid actual fetch
        controller.sendToBackend = jest.fn();
        
        // We need some links for startManual to not error out
        controller.manual.poolTags = ['1. Item\nhttps://tiktok.com/123'];
        
        controller.startManual();
        
        expect(controller.manual.poolText).toBe('1. Item\nhttps://tiktok.com/123');
    });
});
