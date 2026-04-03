document.addEventListener('DOMContentLoaded', () => {
    // Tangkap target kotaknya
    const logContainer = document.getElementById('jailbreakLogContainer');

    // Konek ke Backend Socket.io
    const socket = typeof io !== 'undefined' ? io() : null;

    if (socket) {
        socket.on('security_log', (data) => {
            if (!logContainer) return;

            // Ganti warna teks berdasarkan tipe (Info=Putih, Error=Merah, Success=Hijau)
            let msgColor = "text-slate-300";
            if (data.type === 'error') msgColor = "text-error font-bold";
            if (data.type === 'success') msgColor = "text-emerald-400";
            if (data.type === 'warning') msgColor = "text-yellow-400";

            // Cetak HTML baru PERSIS SAMA kayak desain asli lo
            const logHtml = `
                <div class="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 border-b border-slate-800/50 pb-2 md:pb-3">
                    <span class="text-error shrink-0">[${data.timestamp}]</span>
                    <span class="${msgColor}">${data.message}</span>
                </div>
            `;

            // Suntik ke dalam layar
            logContainer.insertAdjacentHTML('beforeend', logHtml);

            // Auto-scroll ke dasar terminal biar yang terbaru selalu kelihatan
            logContainer.scrollTop = logContainer.scrollHeight;
        });
    } else {
        console.error("Socket.io library belum di-load di HTML bos!");
    }
});