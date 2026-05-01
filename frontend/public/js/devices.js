// =========================================
// INISIALISASI WEBSOCKET
// =========================================
// Awalnya: const socket = io();
// const socket = io('https://infrastructure-laptop-academic-merger.trycloudflare.com'); // Tembak langsung ke API Port 3000
const socket = io(); // Menggunakan default current domain karena sudah di-proxy di server-ui.js
socket.on('connect', () => console.log('✅ WebSocket Connected ke Backend'));

// =========================================
// SISTEM CUSTOM MODAL PENGGANTI ALERT
// =========================================
// =========================================
// LOGIC UTAMA APLIKASI
// =========================================
function toggleAddModal(show) {
    const modal = document.getElementById('addModal');
    const content = modal.querySelector('.transform');
    
    if (show) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            if(content) content.classList.remove('scale-95');
        }, 10);
    } else {
        modal.classList.add('opacity-0');
        if(content) content.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }
}

async function loadDevices() {
    const tableBody = document.getElementById('deviceTableBody');
    tableBody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-500">Loading data...</td></tr>';

    try {
        const isAdmin = localStorage.getItem('connectApi_loggedIn') === 'true';
        const guestApiKey = localStorage.getItem('noorbyte_session');
        // [MOD] Ensure api_key is passed even for admin role
        const query = isAdmin 
            ? `?role=admin&api_key=${guestApiKey || ''}` 
            : (guestApiKey ? `?api_key=${guestApiKey}` : '');
        const response = await fetch(`/api/get-devices${query}`); // Mengambil data melalui proxy
        const result = await response.json();

        if (result.status && result.data.length > 0) {
            tableBody.innerHTML = '';
            result.data.forEach(device => renderDeviceRow(device));
        } else {
            tableBody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-500">No devices found. Click "Add New Device" to start.</td></tr>';
        }
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-red-500">Failed to load data from server.</td></tr>';
    }
}

function renderDeviceRow(device) {
    const tableBody = document.getElementById('deviceTableBody');
    const apiKey = device.api_key || device.token; // Penyesuaian variabel API Key
    const isOnline = device.status === 'Connected';

    const tr = document.createElement('tr');
    tr.id = `row-${apiKey}`;
    tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors";

    tr.innerHTML = `
        <td class="px-6 py-4">
            <div class="flex items-center gap-3">
                <div id="iconBox-${apiKey}" class="h-10 w-10 rounded-lg ${isOnline ? 'bg-blue-50 text-primary dark:bg-blue-900/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'} flex items-center justify-center transition-colors">
                    <span class="material-symbols-outlined">smartphone</span>
                </div>
                <div>
                    <div class="flex items-center gap-2">
                        <p class="text-sm font-bold text-slate-900 dark:text-white">${device.username}</p>
                        <button onclick="renameDevice('${apiKey}', '${device.username}')" class="text-slate-400 hover:text-primary transition-colors flex items-center justify-center" title="Edit Nama Device">
                            <span class="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                    </div>
                    <p class="text-xs text-slate-500">${device.phone || '-'}</p>
                </div>
            </div>
        </td>
        <td class="px-6 py-4">
            <div class="flex items-center gap-2">
                <span id="dot-${apiKey}" class="h-2 w-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}"></span>
                <span id="text-${apiKey}" class="text-xs font-semibold ${isOnline ? 'text-green-600 dark:text-green-400' : 'text-slate-500'}">${isOnline ? 'Online' : 'Offline'}</span>
            </div>
        </td>
        <td class="px-6 py-4">
            <div class="flex items-center gap-2 group cursor-pointer" onclick="copyToken('${apiKey}')" title="Click to copy">
                <span class="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${apiKey.substring(0, 8)}...</span>
                <span class="material-symbols-outlined text-sm text-slate-400 group-hover:text-primary transition-colors">content_copy</span>
            </div>
        </td>
        <td class="px-6 py-4 text-right">
            <div id="action-${apiKey}" class="flex items-center justify-end gap-2"></div>
        </td>
    `;
    tableBody.appendChild(tr);

    updateActionButtons(apiKey, device.status, device.username);

    // Realtime Listener
    socket.off(`status-${apiKey}`);
    socket.on(`status-${apiKey}`, (data) => {
        const isNowOnline = data.status === 'Connected';

        const dot = document.getElementById(`dot-${apiKey}`);
        const text = document.getElementById(`text-${apiKey}`);
        const iconBox = document.getElementById(`iconBox-${apiKey}`);

        if (dot && text) {
            dot.className = `h-2 w-2 rounded-full ${isNowOnline ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`;
            text.className = `text-xs font-semibold ${isNowOnline ? 'text-green-600 dark:text-green-400' : 'text-slate-500'}`;
            text.innerText = isNowOnline ? 'Online' : 'Offline';
        }
        if (iconBox) {
            iconBox.className = `h-10 w-10 rounded-lg ${isNowOnline ? 'bg-blue-50 text-primary dark:bg-blue-900/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'} flex items-center justify-center transition-colors`;
        }

        updateActionButtons(apiKey, data.status, device.username);

        if (isNowOnline) {
            resetQrPanel();
            showModal({ type: 'success', title: 'Terkoneksi!', message: `Device <b>${device.username}</b> berhasil terhubung ke WhatsApp.` });
        }
    });
}

function updateActionButtons(apiKey, status, username) {
    const actionArea = document.getElementById(`action-${apiKey}`);
    if (!actionArea) return;
    actionArea.innerHTML = '';

    if (status === 'Connected') {
        actionArea.innerHTML = `
            <button onclick="disconnectDevice('${apiKey}')" class="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all border border-slate-200 dark:border-slate-700">Logout</button>
        `;
    } else {
        actionArea.innerHTML = `
            <button onclick="triggerQr('${apiKey}', '${username}')" class="px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-all border border-primary/20">Connect</button>
            <button onclick="deleteDevice('${apiKey}')" class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"><span class="material-symbols-outlined text-lg">delete</span></button>
        `;
    }
}

async function triggerQr(apiKey, username) {
    document.getElementById('qrPanelTitle').innerText = `Link: ${username}`;
    document.getElementById('qrPanelDesc').innerText = "Menunggu server men-generate QR Code...";

    const loadingBox = document.getElementById('qrLoading');
    const imgBox = document.getElementById('qrImage');

    loadingBox.innerHTML = '<span class="material-symbols-outlined text-4xl mb-2 animate-spin text-primary">autorenew</span><p class="text-xs font-semibold text-primary">Generating...</p>';
    loadingBox.classList.remove('hidden');
    imgBox.classList.add('hidden');

    socket.off(`qr-${apiKey}`);
    socket.on(`qr-${apiKey}`, (data) => {
        loadingBox.classList.add('hidden');
        imgBox.src = data.qrImageUrl;
        imgBox.classList.remove('hidden');
        document.getElementById('qrPanelDesc').innerText = "Silakan scan QR Code ini pakai WhatsApp Anda.";
    });

    try {
        await fetch('/api/connect-device', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey })
        });
    } catch (error) {
        showModal({ type: 'error', title: 'Gagal', message: 'Gagal menghubungi server untuk generate QR.' });
    }
}

function resetQrPanel() {
    document.getElementById('qrPanelTitle').innerText = "QR Scanner";
    document.getElementById('qrPanelDesc').innerText = "Pilih 'Connect' pada salah satu device.";
    document.getElementById('qrLoading').innerHTML = '<span class="material-symbols-outlined text-4xl mb-2">qr_code_scanner</span><p class="text-xs font-semibold">Standby</p>';
    document.getElementById('qrLoading').classList.remove('hidden');
    document.getElementById('qrImage').classList.add('hidden');
    document.getElementById('qrImage').src = "";
}

// =========================================
// AKSI FORM & TOMBOL
// =========================================

// Form Tambah Device
document.getElementById('addDeviceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmit'); btn.innerText = 'Wait...'; btn.disabled = true;
    try {
        const apiKey = localStorage.getItem('noorbyte_session') || '';
        const res = await fetch('/api/add-device', {
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ name: document.getElementById('deviceName').value, phone: document.getElementById('devicePhone').value })
        });
        const data = await res.json();
        if (data.status) {
            toggleAddModal(false);
            document.getElementById('addDeviceForm').reset();
            loadDevices();
            showModal({ type: 'success', title: 'Device Terdaftar!', message: `Token Anda:<br><br><span class="font-mono bg-slate-100 dark:bg-slate-800 p-2 rounded block break-all text-primary border border-slate-200 dark:border-slate-700">${data.token || data.data.api_key}</span>` });
        } else {
            showModal({ type: 'error', title: 'Gagal Mendaftar', message: data.message });
        }
    } catch (e) {
        showModal({ type: 'error', title: 'Error Server', message: 'Terjadi kesalahan pada server saat menyimpan.' });
    } finally {
        btn.innerText = 'Register'; btn.disabled = false;
    }
});

function copyToken(token) {
    navigator.clipboard.writeText(token).then(() => {
        showModal({ type: 'success', title: 'Tersalin!', message: 'Token berhasil disalin ke clipboard.' });
    }).catch(err => {
        showModal({ type: 'error', title: 'Gagal', message: 'Tidak dapat menyalin token.' });
    });
}

function disconnectDevice(apiKey) {
    showModal({
        type: 'confirm',
        title: 'Logout Device',
        message: `Apakah Anda yakin ingin melakukan <b>Log Out</b> pada device ini?`,
        onConfirm: async () => {
            try {
                await fetch('/api/disconnect-device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey }) });
            } catch (e) {
                showModal({ type: 'error', title: 'Gagal Logout', message: 'Gagal terhubung ke server.' });
            }
        }
    });
}

function deleteDevice(apiKey) {
    showModal({
        type: 'confirm',
        title: 'Hapus Permanen',
        message: `Data device ini dan semua sesinya akan <b>dihapus secara permanen</b>. Lanjutkan?`,
        onConfirm: async () => {
            try {
                const res = await fetch('/api/delete-device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey }) });
                const data = await res.json();
                if (data.status) {
                    showModal({ type: 'success', title: 'Terhapus', message: 'Device berhasil dihapus permanen.' });
                    loadDevices();
                } else {
                    showModal({ type: 'error', title: 'Gagal Menghapus', message: data.message });
                }
            } catch (e) {
                showModal({ type: 'error', title: 'Error', message: 'Gagal menghubungi server.' });
            }
        }
    });
}

function renameDevice(apiKey, currentName) {
    // 1. Bikin form input HTML yang mau disuntik ke modal
    const inputHtml = `
        <div class="mt-4 text-left">
            <label class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-2">Masukkan Nama Baru</label>
            <input type="text" id="renameInput-${apiKey}" value="${currentName}" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-sm rounded-lg p-3 focus:outline-none focus:border-primary transition-all" autocomplete="off">
        </div>
    `;

    // 2. Panggil custom modal lo dengan tipe 'confirm'
    showModal({
        type: 'confirm',
        title: 'Rename Device',
        message: `Silakan ubah nama untuk device ini: ${inputHtml}`,
        onConfirm: async () => {

            // Tangkap isi ketikan user
            const newName = document.getElementById(`renameInput-${apiKey}`).value.trim();

            // Validasi Kosong
            if (!newName) {
                setTimeout(() => showModal({ type: 'error', title: 'Validasi Gagal', message: 'Nama device tidak boleh kosong!' }), 350);
                return;
            }

            // Kalau namanya nggak diganti, nggak usah tembak API (hemat resource)
            if (newName === currentName) return;

            try {
                // 3. Tembak API Backend
                const res = await fetch('/api/rename-device', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ api_key: apiKey, new_name: newName })
                });

                const data = await res.json();

                if (data.status) {
                    // Kasih delay dikit biar animasi modal confirm selesai nutup dulu
                    setTimeout(() => showModal({ type: 'success', title: 'Berhasil', message: 'Nama device berhasil diperbarui.' }), 350);
                    loadDevices(); // Refresh isi tabel secara otomatis
                } else {
                    setTimeout(() => showModal({ type: 'error', title: 'Gagal Rename', message: data.message }), 350);
                }
            } catch (e) {
                setTimeout(() => showModal({ type: 'error', title: 'Error Server', message: 'Gagal menghubungi server untuk rename.' }), 350);
            }
        }
    });
}

// Jalankan ketika halaman selesai di-load
window.onload = loadDevices;