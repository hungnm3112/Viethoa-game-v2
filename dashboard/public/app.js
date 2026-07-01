document.addEventListener('DOMContentLoaded', () => {
    // Nav logic
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(n => n.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            item.classList.add('active');
            document.getElementById(`view-${item.dataset.view}`).classList.add('active');
        });
    });

    // Dashboard Data
    async function loadStats() {
        try {
            const res = await fetch('/api/stats');
            const data = await res.json();

            // Update global
            const globalBar = document.getElementById('global-progress-bar');
            const globalText = document.getElementById('global-progress-text');
            globalBar.style.width = `${data.percentage}%`;
            globalText.textContent = `${data.translated} / ${data.total} (${data.percentage}%)`;

            // Render Zones
            const grid = document.getElementById('zones-grid');
            grid.innerHTML = '';
            
            const zoneDescriptions = {
                "Dialog_Subtitle": "Phụ đề, hội thoại cốt truyện",
                "Other": "Các văn bản không phân loại",
                "Characters": "Tên nhân vật, tiểu sử",
                "Items": "Vật phẩm, vũ khí, trang bị",
                "Missions": "Nhiệm vụ, thông báo mục tiêu",
                "Skills_Traits": "Kỹ năng, đặc điểm sinh tồn",
                "Base_Facilities": "Căn cứ, công trình",
                "UI_Icons": "Nút bấm, giao diện",
                "Menu": "Menu chính, tùy chọn"
            };

            data.zones.forEach(zone => {
                const desc = zoneDescriptions[zone.name] || "Phân khu hệ thống";
                const card = document.createElement('div');
                card.className = 'stat-card';
                card.innerHTML = `
                    <h3>${zone.name}</h3>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: -10px; margin-bottom: 16px; font-style: italic;">${desc}</div>
                    <div class="stat-value">${zone.percentage}%</div>
                    <div class="stat-desc">${zone.translated} / ${zone.total} đã dịch</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${zone.percentage}%"></div>
                    </div>
                `;
                grid.appendChild(card);
            });

            // Populate Filter
            const filterZone = document.getElementById('filter-zone');
            if (filterZone.options.length <= 1) {
                data.zones.forEach(zone => {
                    const opt = document.createElement('option');
                    opt.value = zone.name;
                    opt.textContent = zone.name;
                    filterZone.appendChild(opt);
                });
            }

        } catch (err) {
            console.error('Lỗi tải thống kê:', err);
        }
    }

    // Database Logic
    let currentPage = 1;
    
    async function loadTranslations() {
        const search = document.getElementById('search-input').value;
        const zone = document.getElementById('filter-zone').value;
        const status = document.getElementById('filter-status').value;
        
        try {
            const res = await fetch(`/api/translations?page=${currentPage}&limit=20&search=${encodeURIComponent(search)}&zone=${encodeURIComponent(zone)}&status=${status}`);
            const data = await res.json();
            
            const tbody = document.getElementById('db-body');
            tbody.innerHTML = '';
            
            data.items.forEach(item => {
                const tr = document.createElement('tr');
                const isTranslated = !!item.translatedText;
                tr.innerHTML = `
                    <td><span class="zone-badge">${item.zone || 'Unknown'}</span></td>
                    <td class="text-source">${escapeHtml(item.sourceText)}</td>
                    <td class="text-translated ${isTranslated ? 'done' : 'empty'}">${isTranslated ? escapeHtml(item.translatedText) : '[Chưa dịch]'}</td>
                `;
                tbody.appendChild(tr);
            });
            
            document.getElementById('page-info').textContent = `Trang ${data.currentPage} / ${data.totalPages || 1}`;
            
            document.getElementById('page-prev').disabled = data.currentPage <= 1;
            document.getElementById('page-next').disabled = data.currentPage >= data.totalPages;
            
        } catch (err) {
            console.error('Lỗi tải dữ liệu db:', err);
        }
    }

    // Events
    document.getElementById('search-btn').addEventListener('click', () => {
        currentPage = 1;
        loadTranslations();
    });
    
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentPage = 1;
            loadTranslations();
        }
    });

    document.getElementById('filter-zone').addEventListener('change', () => {
        currentPage = 1;
        loadTranslations();
    });

    document.getElementById('filter-status').addEventListener('change', () => {
        currentPage = 1;
        loadTranslations();
    });

    document.getElementById('page-prev').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadTranslations();
        }
    });

    document.getElementById('page-next').addEventListener('click', () => {
        currentPage++;
        loadTranslations();
    });

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    // Init
    loadStats();
    loadTranslations();
});
