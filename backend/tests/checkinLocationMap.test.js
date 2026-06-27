/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Mock io (Socket.io)
window.io = jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn()
}));

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

// Mock window.alert to prevent jsdom warning
window.alert = jest.fn();

// Mock geolocation / camera mediaDevices
navigator.mediaDevices = {
    getUserMedia: jest.fn().mockResolvedValue({
        getTracks: () => [{ stop: jest.fn() }]
    })
};

describe('Location Map Integration on Checkin Page', () => {
    let mockMap;
    let mockMarker;

    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        
        // Setup session
        localStorage.setItem("noorbyte_session", "valid_session");
        localStorage.setItem("dparagon_token", "valid_token");
        localStorage.setItem("jailbreak_last_activity", Date.now().toString());

        // Load checkin.html DOM structure
        const htmlPath = path.resolve(__dirname, '../../frontend/public/checkin.html');
        const html = fs.readFileSync(htmlPath, 'utf8');
        document.body.innerHTML = html;

        // Mock Leaflet L global object
        mockMap = {
            setView: jest.fn().mockReturnThis(),
            on: jest.fn((event, callback) => {
                mockMap._events = mockMap._events || {};
                mockMap._events[event] = callback;
            }),
            invalidateSize: jest.fn()
        };
        mockMarker = {
            addTo: jest.fn().mockReturnThis(),
            on: jest.fn((event, callback) => {
                mockMarker._events = mockMarker._events || {};
                mockMarker._events[event] = callback;
            }),
            setLatLng: jest.fn().mockReturnThis(),
            getLatLng: jest.fn().mockReturnValue({ lat: -7.75723, lng: 110.41448 })
        };
        
        window.L = {
            map: jest.fn(() => mockMap),
            tileLayer: jest.fn(() => ({ addTo: jest.fn() })),
            marker: jest.fn(() => mockMarker),
            icon: jest.fn(() => ({}))
        };

        // Mock fetch globally
        window.fetch = jest.fn().mockImplementation((url) => {
            if (url.includes('app-config')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ status: true, data: { dparagonApiUrl: 'https://api.test', env: 'development' } })
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ status: true, data: [] })
            });
        });

        // Mock global functions from sidebar
        window.isJailbreakSessionValid = jest.fn().mockReturnValue(true);
        window.updateJailbreakActivity = jest.fn();

        // Clear require cache for checkin.js to reload it fresh
        delete require.cache[require.resolve('../../frontend/public/js/checkin.js')];
    });

    // 1. HAPPY PATH: Check map UI elements and toggle visibility
    test('Happy Path: Should toggle map visiblity and initialize Leaflet map on first click', async () => {
        // Load checkin.js logic
        require('../../frontend/public/js/checkin.js');

        // Trigger DOMContentLoaded manually
        document.dispatchEvent(new Event('DOMContentLoaded'));
        
        // Wait for async init inside DOMContentLoaded to complete
        await new Promise(resolve => setTimeout(resolve, 10));

        const btnToggleMap = document.getElementById('btnToggleMap');
        const mapContainer = document.getElementById('mapContainer');

        expect(btnToggleMap).toBeDefined();
        expect(mapContainer).toBeDefined();
        expect(mapContainer.classList.contains('hidden')).toBe(true);

        // Click to open map
        btnToggleMap.click();

        expect(mapContainer.classList.contains('hidden')).toBe(false);
        expect(btnToggleMap.innerHTML).toContain('close');
        expect(window.L.map).toHaveBeenCalledWith('map');
        expect(window.L.marker).toHaveBeenCalled();
    });

    // 2. EDGE CASE: Manual coordinate changes update map marker
    test('Edge Case: Map marker should sync when inputLat and inputLng coordinates are modified', async () => {
        require('../../frontend/public/js/checkin.js');
        
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(resolve => setTimeout(resolve, 10));

        const btnToggleMap = document.getElementById('btnToggleMap');
        const inputLat = document.getElementById('inputLat');
        const inputLng = document.getElementById('inputLng');

        // Open map
        btnToggleMap.click();

        // Simulate manual input changes
        inputLat.value = '-6.20000';
        inputLng.value = '106.81666';
        
        // Trigger change event
        inputLat.dispatchEvent(new Event('input'));
        inputLng.dispatchEvent(new Event('input'));

        expect(mockMarker.setLatLng).toHaveBeenCalledWith([-6.20000, 106.81666]);
    });

    // 3. EDGE CASE: Leaflet object missing (undefined) handled gracefully
    test('Edge Case: Should log a warning and not crash when Leaflet library (L) is missing', async () => {
        window.L = undefined;
        console.warn = jest.fn();

        // Load checkin.js
        require('../../frontend/public/js/checkin.js');
        
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(resolve => setTimeout(resolve, 10));

        const btnToggleMap = document.getElementById('btnToggleMap');
        const mapContainer = document.getElementById('mapContainer');

        // Click button should not throw error, instead warn
        expect(() => {
            btnToggleMap.click();
        }).not.toThrow();

        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Leaflet'));
        // Container should remain hidden if Leaflet is not available
        expect(mapContainer.classList.contains('hidden')).toBe(true);
    });

    // 4. HAPPY PATH: Search location using Nominatim API updates map & inputs
    test('Happy Path: Search location using Nominatim API should fetch and update map view, marker, and inputs', async () => {
        require('../../frontend/public/js/checkin.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(resolve => setTimeout(resolve, 10));

        // Open map
        document.getElementById('btnToggleMap').click();

        const mapSearchInput = document.getElementById('mapSearchInput');
        const btnMapSearch = document.getElementById('btnMapSearch');
        const inputLat = document.getElementById('inputLat');
        const inputLng = document.getElementById('inputLng');

        expect(mapSearchInput).toBeDefined();
        expect(btnMapSearch).toBeDefined();

        // Mock fetch response for nominatim search
        window.fetch.mockImplementationOnce(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
                { lat: '-7.797068', lon: '110.370529', display_name: 'Malioboro, Yogyakarta' }
            ])
        }));

        mapSearchInput.value = 'Malioboro';
        btnMapSearch.click();

        // Wait for async search fetch to complete
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('nominatim.openstreetmap.org/search'));
        expect(mockMap.setView).toHaveBeenCalledWith([-7.797068, 110.370529], 15);
        expect(mockMarker.setLatLng).toHaveBeenCalledWith([-7.797068, 110.370529]);
        expect(inputLat.value).toBe('-7.797068');
        expect(inputLng.value).toBe('110.370529');
    });

    // 5. EDGE CASE: Search returns empty results
    test('Edge Case: Search returns empty results should call showToast with warning', async () => {
        window.showToast = jest.fn();
        
        require('../../frontend/public/js/checkin.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(resolve => setTimeout(resolve, 10));

        // Open map
        document.getElementById('btnToggleMap').click();

        const mapSearchInput = document.getElementById('mapSearchInput');
        const btnMapSearch = document.getElementById('btnMapSearch');

        // Mock empty response
        window.fetch.mockImplementationOnce(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve([])
        }));

        mapSearchInput.value = 'nonexistent_location_query';
        btnMapSearch.click();

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('tidak ditemukan'), 'warning');
    });

    // 6. HAPPY PATH: Type location name should populate datalist recommendations with debounce
    test('Happy Path: Typing in search input should populate datalist options after debounce', async () => {
        require('../../frontend/public/js/checkin.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(resolve => setTimeout(resolve, 10));

        // Open map
        document.getElementById('btnToggleMap').click();

        const mapSearchInput = document.getElementById('mapSearchInput');
        const mapSearchSuggestions = document.getElementById('mapSearchSuggestions');

        expect(mapSearchInput).toBeDefined();
        expect(mapSearchSuggestions).toBeDefined();

        // Check relationship
        expect(mapSearchInput.getAttribute('list')).toBe('mapSearchSuggestions');

        // Mock response for recommendations API
        window.fetch.mockImplementationOnce(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
                { display_name: 'Malioboro Mall, Yogyakarta' },
                { display_name: 'Malioboro Street, Yogyakarta' }
            ])
        }));

        mapSearchInput.value = 'Malio';
        mapSearchInput.dispatchEvent(new Event('input'));

        // Fast-forward wait for debounce (e.g. 350ms)
        await new Promise(resolve => setTimeout(resolve, 400));

        expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('nominatim.openstreetmap.org/search'));
        const options = mapSearchSuggestions.querySelectorAll('option');
        expect(options.length).toBe(2);
        expect(options[0].value).toBe('Malioboro Mall, Yogyakarta');
        expect(options[1].value).toBe('Malioboro Street, Yogyakarta');
    });

    // 7. EDGE CASE: Input less than 3 characters should NOT trigger recommendation API
    test('Edge Case: Input less than 3 characters should not trigger fetch suggestions API', async () => {
        require('../../frontend/public/js/checkin.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(resolve => setTimeout(resolve, 10));

        // Open map
        document.getElementById('btnToggleMap').click();

        const mapSearchInput = document.getElementById('mapSearchInput');
        
        mapSearchInput.value = 'Ma';
        mapSearchInput.dispatchEvent(new Event('input'));

        // Wait for debounce
        await new Promise(resolve => setTimeout(resolve, 400));

        // window.fetch should not be called with search query
        const hasNominatimCall = window.fetch.mock.calls.some(call => call[0].includes('nominatim.openstreetmap.org'));
        expect(hasNominatimCall).toBe(false);
    });

    // 8. HAPPY PATH: Clear button functionality
    test('Happy Path: Typing in search input should reveal clear button and clicking it clears the text', async () => {
        require('../../frontend/public/js/checkin.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(resolve => setTimeout(resolve, 10));

        // Open map
        document.getElementById('btnToggleMap').click();

        const mapSearchInput = document.getElementById('mapSearchInput');
        const btnMapSearchClear = document.getElementById('btnMapSearchClear');
        const mapSearchSuggestions = document.getElementById('mapSearchSuggestions');

        expect(mapSearchInput).toBeDefined();
        expect(btnMapSearchClear).toBeDefined();
        
        // Default should be hidden
        expect(btnMapSearchClear.classList.contains('hidden')).toBe(true);

        // Type text
        mapSearchInput.value = 'Malioboro';
        mapSearchInput.dispatchEvent(new Event('input'));

        // Clear button should become visible
        expect(btnMapSearchClear.classList.contains('hidden')).toBe(false);

        // Click clear button
        btnMapSearchClear.click();

        // Values should be reset
        expect(mapSearchInput.value).toBe('');
        expect(btnMapSearchClear.classList.contains('hidden')).toBe(true);
        expect(mapSearchSuggestions.innerHTML).toBe('');
    });
});
