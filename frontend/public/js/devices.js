// =========================================
// INISIALISASI WEBSOCKET
// =========================================
// Awalnya: const socket = io();
const socket = io('http://localhost:3000'); // Tembak langsung ke API Port 3000
socket.on('connect', () => console.log('✅ WebSocket Connected ke Backend'));

// =========================================
// SISTEM CUSTOM MODAL PENGGANTI ALERT
// =========================================
function showCustomModal(type, title, message, onConfirm = null) {
    const modal = document.getElementById('globalModal');
    const iconContainer = document.getElementById('modalIconContainer');
    const icon = document.getElementById('modalIcon');
    const titleEl = document.getElementById('modalTitle');
    const messageEl = document.getElementById('modalMessage');
    const actionsEl = document.getElementById('modalActions');

    titleEl.innerText = title;
    messageEl.innerHTML = message;
    actionsEl.innerHTML = ''; 

    if (type === 'success') {
        iconContainer.className = 'mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-green-100 text-green-500 mb-4';
        icon.innerText = 'check_circle';
    } else if (type === 'error') {
        iconContainer.className = 'mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-red-100 text-red-500 mb-4';
        icon.innerText = 'error';
    } else if (type === 'confirm' || type === 'warning') {
        iconContainer.className = 'mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-amber-100 text-amber-500 mb-4';
        icon.innerText = 'warning';
    } else {
        iconContainer.className = 'mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-blue-100 text-blue-500 mb-4';
        icon.innerText = 'info';
    }

    if (type === 'confirm') {
        const btnCancel = document.createElement('button');
        btnCancel.className = 'flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all';
        btnCancel.innerText = 'Batal';
        btnCancel.onclick = () => modal.classList.add('hidden');

        const btnOk = document.createElement('button');
        btnOk.className = 'flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all';
        btnOk.innerText = 'Ya, Lanjutkan';
        btnOk.onclick = () => {
            modal.classList.add('hidden');
            if (onConfirm) onConfirm();
        };

        actionsEl.appendChild(btnCancel);
        actionsEl.appendChild(btnOk);
    } else {
        const btnOk = document.createElement('button');
        btnOk.className = 'w-full px-4 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all';
        btnOk.innerText = 'Tutup';
        btnOk.onclick = () => modal.classList.add('hidden');
        actionsEl.appendChild(btnOk);
    }

    modal.classList.remove('hidden');
}

// =========================================
// LOGIC UTAMA APLIKASI
// =========================================
function toggleAddModal(show) {
    document.getElementById('addModal').classList.toggle('hidden', !show);
}

async function loadDevices() {
    const tableBody = document.getElementById('deviceTableBody');
    tableBody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-500">Loading data...</td></tr>';
    
    try {
        const isAdmin = localStorage.getItem('connectApi_loggedIn') === 'true';
        const guestApiKey = localStorage.getItem('noorbyte_session');
        const query = isAdmin ? '?role=admin' : (guestApiKey ? `?api_key=${guestApiKey}` : '');
        const response = await fetch(`http://localhost:3000/api/get-devices${query}`); // Mengambil data langsung dari API
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
                    <p class="text-sm font-bold text-slate-900 dark:text-white">${device.username}</p>
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
                <span class="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${apiKey.substring(0,8)}...</span>
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
        
        if(dot && text) {
            dot.className = `h-2 w-2 rounded-full ${isNowOnline ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`;
            text.className = `text-xs font-semibold ${isNowOnline ? 'text-green-600 dark:text-green-400' : 'text-slate-500'}`;
            text.innerText = isNowOnline ? 'Online' : 'Offline';
        }
        if(iconBox) {
            iconBox.className = `h-10 w-10 rounded-lg ${isNowOnline ? 'bg-blue-50 text-primary dark:bg-blue-900/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'} flex items-center justify-center transition-colors`;
        }

        updateActionButtons(apiKey, data.status, device.username);

        if (isNowOnline) {
            resetQrPanel();
            showCustomModal('success', 'Terkoneksi!', `Device <b>${device.username}</b> berhasil terhubung ke WhatsApp.`);
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
        await fetch('http://localhost:3000/api/connect-device', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey })
        });
    } catch (error) { 
        showCustomModal('error', 'Gagal', 'Gagal menghubungi server untuk generate QR.');
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
        const res = await fetch('http://localhost:3000/api/add-device', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: document.getElementById('deviceName').value, phone: document.getElementById('devicePhone').value })
        });
        const data = await res.json();
        if(data.status) {
            toggleAddModal(false); 
            document.getElementById('addDeviceForm').reset(); 
            loadDevices();
            showCustomModal('success', 'Device Terdaftar!', `Token Anda:<br><br><span class="font-mono bg-slate-100 dark:bg-slate-800 p-2 rounded block break-all text-primary border border-slate-200 dark:border-slate-700">${data.token || data.data.api_key}</span>`);
        } else {
            showCustomModal('error', 'Gagal Mendaftar', data.message);
        }
    } catch(e) { 
        showCustomModal('error', 'Error Server', 'Terjadi kesalahan pada server saat menyimpan.'); 
    } finally { 
        btn.innerText = 'Register'; btn.disabled = false; 
    }
});

function copyToken(token) {
    navigator.clipboard.writeText(token).then(() => {
        showCustomModal('success', 'Tersalin!', 'Token berhasil disalin ke clipboard.');
    }).catch(err => {
        showCustomModal('error', 'Gagal', 'Tidak dapat menyalin token.');
    });
}

function disconnectDevice(apiKey) {
    showCustomModal('confirm', 'Logout Device', `Apakah Anda yakin ingin melakukan <b>Log Out</b> pada device ini?`, async () => {
        try {
            await fetch('http://localhost:3000/api/disconnect-device', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({api_key: apiKey}) });
        } catch(e) {
            showCustomModal('error', 'Gagal Logout', 'Gagal terhubung ke server.');
        }
    });
}

function deleteDevice(apiKey) {
    showCustomModal('confirm', 'Hapus Permanen', `Data device ini dan semua sesinya akan <b>dihapus secara permanen</b>. Lanjutkan?`, async () => {
        try {
            const res = await fetch('http://localhost:3000/api/delete-device', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({api_key: apiKey}) });
            const data = await res.json();
            if(data.status) {
                showCustomModal('success', 'Terhapus', 'Device berhasil dihapus permanen.');
                loadDevices();
            } else {
                showCustomModal('error', 'Gagal Menghapus', data.message);
            }
        } catch(e) {
            showCustomModal('error', 'Error', 'Gagal menghubungi server.');
        }
    });
}

// Jalankan ketika halaman selesai di-load
window.onload = loadDevices;