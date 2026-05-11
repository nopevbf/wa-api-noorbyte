const express = require('express');
const axios = require('axios');

describe('Environment Dependencies', () => {
    test('should be able to require express without error', () => {
        expect(express).toBeDefined();
    });

    test('should be able to require axios without error', () => {
        expect(axios).toBeDefined();
    });

    test('should be able to require follow-redirects without module not found error', () => {
        expect(() => require('follow-redirects')).not.toThrow();
    });
});
