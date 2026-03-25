const API_URL = 'http://localhost:3000/api';

// 1. Muat Device ke Dropdown saat halaman dibuka
document.addEventListener("DOMContentLoaded", async () => {
    const selector = document.getElementById('deviceSelector');
    selector.innerHTML = '<option value="">Memuat device...</option>';
    
    try {
        const response = await fetch(`${API_URL}/get-devices`);
        const result = await response.json();
        
        if (result.status && result.data.length > 0) {
            selector.innerHTML = '<option value="">-- Pilih Device Pengirim --</option>';
            result.data.forEach(device => {
                const isOnline = device.status === 'Connected';
                const option = document.createElement('option');
                // Value-nya kita isi API Key untuk otorisasi pengiriman
                option.value = device.api_key; 
                option.textContent = `${device.username} (${device.phone}) - ${isOnline ? '🟢 Online' : '🔴 Offline'}`;
                
                if (!isOnline) option.disabled = true; // Cuma bisa milih device yg connect
                selector.appendChild(option);
            });
        } else {
            selector.innerHTML = '<option value="">Belum ada device terdaftar.</option>';
        }
    } catch (error) {
        selector.innerHTML = '<option value="">Gagal memuat device.</option>';
    }
});

// 2. Aksi saat form disubmit (Send Message)
// Fungsi pembantu untuk mengubah file fisik jadi teks Base64
function getBase64(file) {
   return new Promise((resolve, reject) => {
     const reader = new FileReader();
     reader.readAsDataURL(file);
     reader.onload = () => resolve(reader.result);
     reader.onerror = error => reject(error);
   });
}

// =========================================
// LOGIC FORM DINAMIS (TEXT / IMAGE / DOC)
// =========================================
const msgTypeRadios = document.querySelectorAll('input[name="msg_type"]');
const messageContentWrapper = document.getElementById('messageContentWrapper');
const messageContent = document.getElementById('messageContent');
const attachmentWrapper = document.getElementById('attachmentWrapper');
const fileInput = document.getElementById('fileInput');
const attachmentLabel = document.getElementById('attachmentLabel');
const fileHelpText = document.getElementById('fileHelpText');

// Dengerin setiap klik pada radio button
msgTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        const type = e.target.value;
        
        // Reset file yang udah terlanjur dipilih kalau ganti tipe
        fileInput.value = '';
        document.getElementById('fileNameDisplay').innerText = "Klik atau drag file ke sini";
        document.getElementById('fileNameDisplay').classList.remove('text-primary');

        if (type === 'text') {
            // MODE TEKS            
            messageContentWrapper.classList.remove('hidden');
            messageContent.required = true;
            
            attachmentWrapper.classList.remove('hidden');
            fileInput.required = false;
            fileInput.accept = '';
            attachmentLabel.innerHTML = 'Attachment (Optional)';
            fileHelpText.innerText = 'Batas maksimal ukuran 50MB';
            
        } else if (type === 'image') {
            // MODE GAMBAR
            messageContentWrapper.classList.add('hidden');
            messageContent.required = false;
            messageContent.value = ''; // Kosongkan text
            
            attachmentWrapper.classList.remove('hidden');
            fileInput.required = true; // Jadi WAJIB
            fileInput.accept = 'image/*'; // Filter File Browser HANYA GAMBAR
            attachmentLabel.innerHTML = 'Upload Image <span class="text-red-500">*wajib</span>';
            fileHelpText.innerText = 'Format: PNG, JPG, JPEG (Max 10MB)';
            
        } else if (type === 'document') {
            // MODE DOKUMEN
            messageContentWrapper.classList.add('hidden');
            messageContent.required = false;
            messageContent.value = ''; // Kosongkan text
            
            attachmentWrapper.classList.remove('hidden');
            fileInput.required = true; // Jadi WAJIB
            fileInput.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'; // Filter File Browser HANYA DOKUMEN
            attachmentLabel.innerHTML = 'Upload Document <span class="text-red-500">*wajib</span>';
            fileHelpText.innerText = 'Format: PDF, DOCX, XLSX, TXT (Max 50MB)';
        }
    });
});

// Jalankan saklar pertama kali saat halaman direfresh
document.querySelector('input[name="msg_type"]:checked').dispatchEvent(new Event('change'));

// Bikin nama file berubah pas user milih file
document.getElementById('fileInput').addEventListener('change', function() {
    const display = document.getElementById('fileNameDisplay');
    if (this.files.length > 0) {
        display.innerText = this.files[0].name;
        display.classList.add('text-primary');
    } else {
        display.innerText = "Click to upload or drag and drop";
        display.classList.remove('text-primary');
    }
});

// Aksi saat form disubmit
document.getElementById('testMessageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const apiKey = document.getElementById('deviceSelector').value;
    const targetNumber = document.getElementById('targetNumber').value;
    const messageContent = document.getElementById('messageContent').value;
    
    // Ambil data Message Type dan File
    const msgType = document.querySelector('input[name="msg_type"]:checked').value;
    const fileInput = document.getElementById('fileInput');
    
    const btnText = document.getElementById('btnText');
    const btnIcon = document.getElementById('btnIcon');
    const jsonBox = document.getElementById('responseJson');
    const httpStatus = document.getElementById('httpStatus');

    if (!apiKey) return showModal('Peringatan', 'Pilih device pengirim terlebih dahulu!');
    
    // Validasi kalau pilih Image/Document tapi gak ada file
    if ((msgType === 'image' || msgType === 'document') && fileInput.files.length === 0) {
        return showModal('Peringatan', `Anda memilih tipe ${msgType}, silakan upload file attachment-nya.`);
    }

    btnText.innerText = 'Sending...';
    btnIcon.innerText = 'hourglass_empty';
    btnIcon.classList.add('animate-spin');
    jsonBox.innerText = '// Mengirim request ke server...';
    httpStatus.innerText = 'PROCESSING...';
    httpStatus.className = 'text-[10px] font-mono text-amber-500 uppercase tracking-widest';

    try {
        let mediaBase64 = null;
        let fileName = null;

        // Kalau ada file yang dipilih, konversi ke Base64
        if (fileInput.files.length > 0) {
            mediaBase64 = await getBase64(fileInput.files[0]);
            fileName = fileInput.files[0].name;
        }

        // Susun payload super lengkap
        const payload = {
            number: targetNumber,
            message: messageContent,
            msg_type: msgType,
            media: mediaBase64,
            file_name: fileName
        };

        const response = await fetch(`${API_URL}/send-message`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}` 
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        jsonBox.innerText = JSON.stringify(result, null, 2);

        if (response.ok && result.status === 'success') {
            httpStatus.innerText = 'HTTP 200 OK';
            httpStatus.className = 'text-[10px] font-mono text-emerald-500 uppercase tracking-widest';
            jsonBox.className = 'whitespace-pre-wrap word-break text-emerald-400';
            showModal('Terkirim!', 'Pesan berhasil diteruskan ke mesin WhatsApp.');
        } else {
            httpStatus.innerText = `HTTP ${response.status} ERROR`;
            httpStatus.className = 'text-[10px] font-mono text-red-500 uppercase tracking-widest';
            jsonBox.className = 'whitespace-pre-wrap word-break text-red-400';
        }

    } catch (error) {
        httpStatus.innerText = 'NETWORK ERROR';
        httpStatus.className = 'text-[10px] font-mono text-red-500 uppercase tracking-widest';
        jsonBox.innerText = JSON.stringify({ error: "Gagal terhubung ke Backend API.", details: error.message }, null, 2);
        jsonBox.className = 'whitespace-pre-wrap word-break text-red-400';
    } finally {
        btnText.innerText = 'Send Message';
        btnIcon.innerText = 'send';
        btnIcon.classList.remove('animate-spin');
    }
});

// Fitur pemanis: Copy JSON
function copyJson() {
    const jsonText = document.getElementById('responseJson').innerText;
    navigator.clipboard.writeText(jsonText).then(() => {
        alert('Response JSON disalin ke clipboard!');
    });
}

function showModal(title, message) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMessage').innerHTML = message;
    document.getElementById('globalModal').classList.remove('hidden');
}