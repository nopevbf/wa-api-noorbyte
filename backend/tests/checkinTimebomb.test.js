/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Mock io (Socket.io)
window.io = jest.fn(() => ({
    on: jest.fn((event, callback) => {
        window.socketListeners = window.socketListeners || {};
        window.socketListeners[event] = callback;
    }),
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

window.alert = jest.fn();

// Mock geolocation / camera mediaDevices
navigator.mediaDevices = {
    getUserMedia: jest.fn().mockResolvedValue({
        getTracks: () => [{ stop: jest.fn() }]
    })
};

describe('Checkin Page Time-Bomb Mode Functionality & UI', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        window.socketListeners = {};
        
        // Setup session
        localStorage.setItem("noorbyte_session", "valid_session");
        localStorage.setItem("dparagon_token", "valid_token");
        
        // Load checkin.html DOM structure
        const htmlPath = path.resolve(__dirname, '../../frontend/public/checkin.html');
        const html = fs.readFileSync(htmlPath, 'utf8');
        document.body.innerHTML = html;

        // Mock global functions from sidebar
        window.isJailbreakSessionValid = jest.fn().mockReturnValue(true);
        window.updateJailbreakActivity = jest.fn();
        window.showToast = jest.fn();

        // Mock fetch globally
        window.fetch = jest.fn().mockImplementation((url) => {
            if (url.includes('app-config')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ status: true, data: { dparagonApiUrl: 'https://api.test' } })
                });
            }
            if (url.includes('schedule-timebomb')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ status: true, timer_key: 'test_timer_key_123' })
                });
            }
            if (url.includes('cancel-timebomb')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ status: true, message: 'Timer dibatalkan' })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: true, data: [] }) });
        });
        global.fetch = window.fetch;

        // Clear require cache for checkin.js to reload it fresh
        delete require.cache[require.resolve('../../frontend/public/js/checkin.js')];
    });

    // TEST 1: ABSEN MASUK Time-Bomb Standby Color
    test('Happy Path: Scheduling timebomb for MASUK should change capture button to green standby', async () => {
        require('../../frontend/public/js/checkin.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(resolve => setTimeout(resolve, 10));

        // Set NEXT_ACTION to MASUK
        window.NEXT_ACTION = 'MASUK';

        const cameraFeed = document.getElementById('cameraFeed');
        cameraFeed.srcObject = {};
        const captureCanvas = document.getElementById('captureCanvas');
        captureCanvas.getContext = jest.fn().mockReturnValue({
            translate: jest.fn(),
            scale: jest.fn(),
            drawImage: jest.fn()
        });
        captureCanvas.toDataURL = jest.fn().mockReturnValue('data:image/jpeg;base64,mock');

        // Lock lokasi secara alami
        document.getElementById('inputLat').value = '-7.75';
        document.getElementById('inputLng').value = '110.41';
        document.getElementById('btnSetLocation').click();

        // Ambil foto secara alami (Klik 1)
        const btnCapture = document.getElementById('btnCapture');
        btnCapture.click();

        // Cek saklar timebomb dicentang
        const toggleTimeBomb = document.getElementById('toggleTimeBomb');
        toggleTimeBomb.checked = true;

        // Klik capture lagi untuk memicu modal (Klik 2)
        btnCapture.click();

        // Click confirm di schedule modal
        const btnConfirmSchedule = document.getElementById('btnConfirmSchedule');
        expect(btnConfirmSchedule).toBeDefined();
        await btnConfirmSchedule.click();

        // Tunggu proses async fetch selesai
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verifikasi tombol capture berwarna hijau standby
        expect(btnCapture.innerHTML).toContain('STANDBY DI SERVER');
        expect(btnCapture.classList.contains('bg-emerald-600')).toBe(true);
        expect(btnCapture.classList.contains('hover:bg-emerald-700')).toBe(true);
        expect(btnCapture.disabled).toBe(true);
    });

    // TEST 2: ABSEN KELUAR Time-Bomb Standby Color (Diharapkan Gagal karena classList.replace bg-red-600)
    test('Happy Path: Scheduling timebomb for KELUAR should change capture button to green standby', async () => {
        require('../../frontend/public/js/checkin.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(resolve => setTimeout(resolve, 10));

        // Set NEXT_ACTION to KELUAR
        window.NEXT_ACTION = 'KELUAR';

        const cameraFeed = document.getElementById('cameraFeed');
        cameraFeed.srcObject = {};
        const captureCanvas = document.getElementById('captureCanvas');
        captureCanvas.getContext = jest.fn().mockReturnValue({
            translate: jest.fn(),
            scale: jest.fn(),
            drawImage: jest.fn()
        });
        captureCanvas.toDataURL = jest.fn().mockReturnValue('data:image/jpeg;base64,mock');

        // Lock lokasi secara alami
        document.getElementById('inputLat').value = '-7.75';
        document.getElementById('inputLng').value = '110.41';
        document.getElementById('btnSetLocation').click();

        // Ambil foto secara alami (Klik 1)
        const btnCapture = document.getElementById('btnCapture');
        btnCapture.click();

        const toggleTimeBomb = document.getElementById('toggleTimeBomb');
        toggleTimeBomb.checked = true;

        // Klik capture lagi (Klik 2)
        btnCapture.click();

        const btnConfirmSchedule = document.getElementById('btnConfirmSchedule');
        await btnConfirmSchedule.click();

        await new Promise(resolve => setTimeout(resolve, 10));

        // Verifikasi tombol capture berwarna hijau standby
        expect(btnCapture.innerHTML).toContain('STANDBY DI SERVER');
        expect(btnCapture.classList.contains('bg-emerald-600')).toBe(true);
        expect(btnCapture.classList.contains('hover:bg-emerald-700')).toBe(true);
        expect(btnCapture.disabled).toBe(true);
    });

    // TEST 3: CANCEL TIME-BOMB (Diharapkan Gagal karena isPreviewMode tidak direset)
    test('Happy Path: Cancelling timebomb should reset isPreviewMode and clear photo', async () => {
        require('../../frontend/public/js/checkin.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(resolve => setTimeout(resolve, 10));

        // Simulasikan timer aktif di localstorage & setup preview
        localStorage.setItem('active_timebomb_key', 'test_key');
        
        const cameraFeed = document.getElementById('cameraFeed');
        cameraFeed.srcObject = {};
        const captureCanvas = document.getElementById('captureCanvas');
        captureCanvas.getContext = jest.fn().mockReturnValue({
            translate: jest.fn(),
            scale: jest.fn(),
            drawImage: jest.fn()
        });
        captureCanvas.toDataURL = jest.fn().mockReturnValue('data:image/jpeg;base64,mock');

        // Lock lokasi
        document.getElementById('inputLat').value = '-7.75';
        document.getElementById('inputLng').value = '110.41';
        document.getElementById('btnSetLocation').click();

        // Ambil foto (Klik 1)
        const btnCapture = document.getElementById('btnCapture');
        btnCapture.click();

        // Tunggu efek flash kamera pertama selesai (100ms)
        await new Promise(resolve => setTimeout(resolve, 150));

        const btnCancelTimebomb = document.getElementById('btnCancelTimebomb');
        expect(btnCancelTimebomb).toBeDefined();

        // Klik batal
        btnCancelTimebomb.click();

        await new Promise(resolve => setTimeout(resolve, 10));

        // Klik capture kembali, harusnya memicu "efek flash" / "ambil foto" baru
        // (yaitu isPreviewMode bernilai false)
        const cameraFlash = document.getElementById('cameraFlash');
        expect(cameraFlash.classList.contains('opacity-100')).toBe(false);
        
        btnCapture.click();
        
        // Klik harusnya memicu flash (opacity-100) karena isPreviewMode = false
        expect(cameraFlash.classList.contains('opacity-100')).toBe(true);
    });

    // TEST 4: Socket Success Handler (Diharapkan Gagal karena isPreviewMode tidak direset)
    test('Edge Case: Socket timebomb-success should reset isPreviewMode and clear photo', async () => {
        require('../../frontend/public/js/checkin.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(resolve => setTimeout(resolve, 10));

        const cameraFeed = document.getElementById('cameraFeed');
        cameraFeed.srcObject = {};
        const captureCanvas = document.getElementById('captureCanvas');
        captureCanvas.getContext = jest.fn().mockReturnValue({
            translate: jest.fn(),
            scale: jest.fn(),
            drawImage: jest.fn()
        });
        captureCanvas.toDataURL = jest.fn().mockReturnValue('data:image/jpeg;base64,mock');

        // Lock lokasi
        document.getElementById('inputLat').value = '-7.75';
        document.getElementById('inputLng').value = '110.41';
        document.getElementById('btnSetLocation').click();

        // Ambil foto (Klik 1)
        const btnCapture = document.getElementById('btnCapture');
        btnCapture.click();

        // Tunggu efek flash kamera pertama selesai (100ms)
        await new Promise(resolve => setTimeout(resolve, 150));

        // Picu event socket success
        const successCallback = window.socketListeners[`timebomb-success-valid_session`];
        expect(successCallback).toBeDefined();

        successCallback({ timerKey: 'test_key', message: 'Sukses ditembak' });

        // Klik capture kembali, harusnya memicu "efek flash" / "ambil foto" baru
        const cameraFlash = document.getElementById('cameraFlash');
        expect(cameraFlash.classList.contains('opacity-100')).toBe(false);

        btnCapture.click();
        
        expect(cameraFlash.classList.contains('opacity-100')).toBe(true);
    });
});


