let currentPage = 1;
let totalPages = 1;
let searchTimeout;

const DOM = {
    total: document.getElementById('stat-total'),
    btxt: document.getElementById('stat-btxt'),
    bmd: document.getElementById('stat-bmd'),
    tbody: document.getElementById('translations-body'),
    searchInput: document.getElementById('search-input'),
    methodFilter: document.getElementById('method-filter'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    pageInfo: document.getElementById('page-info')
};

async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        
        // Animate numbers
        animateValue(DOM.total, 0, data.total, 1000);
        animateValue(DOM.btxt, 0, data.btxtCount, 1000);
        animateValue(DOM.bmd, 0, data.bmdCount, 1000);
    } catch (e) {
        console.error('Error fetching stats:', e);
    }
}

async function fetchTranslations() {
    const search = DOM.searchInput.value;
    const method = DOM.methodFilter.value;
    
    try {
        const res = await fetch(`/api/translations?page=${currentPage}&limit=20&search=${encodeURIComponent(search)}&buildMethod=${encodeURIComponent(method)}`);
        const data = await res.json();
        
        totalPages = data.totalPages;
        DOM.pageInfo.textContent = `Page ${data.page} of ${data.totalPages || 1}`;
        DOM.btnPrev.disabled = data.page <= 1;
        DOM.btnNext.disabled = data.page >= data.totalPages;
        
        renderTable(data.items);
    } catch (e) {
        console.error('Error fetching translations:', e);
    }
}

function renderTable(items) {
    DOM.tbody.innerHTML = '';
    
    if (items.length === 0) {
        DOM.tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#94a3b8">No results found</td></tr>';
        return;
    }
    
    items.forEach(item => {
        const tr = document.createElement('tr');
        
        // Truncate long text for display
        const srcText = escapeHTML(item.sourceText).replace(/\n/g, '<br>');
        const tgtText = escapeHTML(item.translatedText).replace(/\n/g, '<br>');
        
        const badgeClass = item.buildMethod === 'BTXT (Python)' ? 'badge-python' : 'badge-node';
        
        tr.innerHTML = `
            <td>${srcText}</td>
            <td>${tgtText}</td>
            <td><span class="badge ${badgeClass}">${item.buildMethod}</span></td>
        `;
        DOM.tbody.appendChild(tr);
    });
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // Ease out quad
        const easeOut = 1 - (1 - progress) * (1 - progress);
        obj.innerHTML = Math.floor(easeOut * (end - start) + start).toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Event Listeners
DOM.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentPage = 1;
        fetchTranslations();
    }, 500);
});

DOM.methodFilter.addEventListener('change', () => {
    currentPage = 1;
    fetchTranslations();
});

DOM.btnPrev.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        fetchTranslations();
    }
});

DOM.btnNext.addEventListener('click', () => {
    if (currentPage < totalPages) {
        currentPage++;
        fetchTranslations();
    }
});

// Init
fetchStats();
fetchTranslations();
