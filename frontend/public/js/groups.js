// URL Backend lo (Port 3000)
const API_URL = 'http://localhost:3000/api';

// Fungsi memuat dropdown device
async function loadDevicesForDropdown() {
    const selector = document.getElementById('deviceSelector');
    selector.innerHTML = '<option value="">Memuat device...</option>';
    
    try {
        const isAdmin = localStorage.getItem('connectApi_loggedIn') === 'true';
        const guestApiKey = localStorage.getItem('noorbyte_session');
        const query = isAdmin ? '?role=admin' : (guestApiKey ? `?api_key=${guestApiKey}` : '');
        const response = await fetch(`${API_URL}/get-devices${query}`);
        const result = await response.json();
        
        if (result.status && result.data.length > 0) {
            selector.innerHTML = '<option value="">-- Pilih Device Anda --</option>';
            result.data.forEach(device => {
                // Kasih tanda kalau device lagi offline
                const isOnline = device.status === 'Connected';
                const label = `${device.username} (${device.phone || 'No Number'}) - ${isOnline ? '🟢 Online' : '🔴 Offline'}`;
                
                const option = document.createElement('option');
                option.value = device.api_key;
                option.textContent = label;
                // Disable pilihan jika offline
                if (!isOnline) option.disabled = true;
                
                selector.appendChild(option);
            });
        } else {
            selector.innerHTML = '<option value="">Belum ada device terdaftar.</option>';
        }
    } catch (error) {
        selector.innerHTML = '<option value="">Gagal mengambil data.</option>';
    }
}

// Fungsi narik data grup
async function fetchGroups() {
    const apiKey = document.getElementById('deviceSelector').value;
    const btnText = document.getElementById('btnText');
    const btnIcon = document.getElementById('btnIcon');
    
    if (!apiKey) {
        showModal('Pilih Device', 'Silakan pilih device yang berstatus Online terlebih dahulu.');
        return;
    }

    // Ubah tombol jadi loading
    btnText.innerText = 'Menarik Data...';
    btnIcon.classList.add('animate-spin');
    btnIcon.innerText = 'autorenew';

    try {
        const response = await fetch(`${API_URL}/groups/${apiKey}`);
        const result = await response.json();
        
        if (result.status) {
            renderGroupTable(result.data);
        } else {
            showModal('Gagal', result.message);
        }
    } catch (error) {
        showModal('Error Server', 'Gagal menghubungi server Backend.');
    } finally {
        // Kembalikan tombol ke semula
        btnText.innerText = 'Fetch Groups';
        btnIcon.classList.remove('animate-spin');
        btnIcon.innerText = 'sync';
    }
}

// Fungsi nge-render isi tabel
function renderGroupTable(groups) {
    const emptyState = document.getElementById('emptyState');
    const tableState = document.getElementById('tableState');
    const tableBody = document.getElementById('groupTableBody');
    
    emptyState.classList.add('hidden');
    tableState.classList.remove('hidden');
    tableBody.innerHTML = '';

    if (groups.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-6 text-slate-500">Device ini tidak tergabung dalam grup manapun.</td></tr>`;
        return;
    }

    groups.forEach(group => {
        // Extract data yang penting
        const groupName = group.subject || 'Grup Tanpa Nama';
        const groupId = group.id;
        const participantsCount = group.participants ? group.participants.length : 0;
        const creationDate = new Date(group.creation * 1000).toLocaleDateString(); // Unix timestamp ke date

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors";
        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <span class="material-symbols-outlined">groups</span>
                    </div>
                    <div>
                        <p class="text-sm font-semibold text-slate-900">${groupName}</p>
                        <p class="text-xs text-slate-500">Dibuat: ${creationDate}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2 group-hover:text-primary cursor-pointer" onclick="copyId('${groupId}')" title="Copy Group ID">
                    <code class="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">${groupId}</code>
                    <span class="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 transition-opacity">content_copy</span>
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2 text-sm text-slate-700">
                    <span class="material-symbols-outlined text-sm">person</span>
                    ${participantsCount} members
                </div>
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="copyId('${groupId}')" class="text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg text-sm font-bold uppercase tracking-tight transition-colors">Copy ID</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function copyId(id) {
    navigator.clipboard.writeText(id).then(() => {
        showModal('Disalin!', `Group ID <b>${id}</b> berhasil disalin. Bisa dipakai buat target nomor kirim pesan.`);
    });
}

function showModal(title, message) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMessage').innerHTML = message;
    document.getElementById('globalModal').classList.remove('hidden');
}

// Jalankan load dropdown saat buka halaman
window.onload = loadDevicesForDropdown;