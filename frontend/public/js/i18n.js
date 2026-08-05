// i18n - Dictionary
const i18n = {
    "id": {
        "STANDBY_DI_SERVER": "STANDBY DI SERVER",
        "TERKIRIM": "TERKIRIM",
        "ACCESS_DENIED": "ACCESS DENIED",
        "ERROR_NO_TOKEN": "Bearer Token otorisasi tidak ditemukan. Harap re-initiate bypass.",
        "SECURITY_HALT": "SECURITY HALT",
        "ERROR_GPS_LOCK": "Silakan set & lock koordinat lokasi terlebih dahulu sebelum menginisiasi sinkronisasi.",
        "ERROR_GPS_LOCK_PHOTO": "Silakan klik 'Set Location' untuk mengunci koordinat GPS sebelum mengambil data visual!",
        "PROCESSING": "MEMPROSES...",
        "BYPASS_SUCCESS": "BYPASS SUCCESS",
        "SUCCESS_SYNC": "Data kehadiran diterima. Memulai sinkronisasi log otomatis...",
        "HARDWARE_ERROR": "HARDWARE ERROR",
        "ERROR_CAMERA": "Kamera belum aktif!",
        "TIMEBOMB_FAILED": "TIME-BOMB FAILED",
        "ABSEN": "ABSEN"
    }
};

let currentLang = 'id';

function t(key) {
    return i18n[currentLang][key] || key;
}

// Make globally available
window.t = t;
