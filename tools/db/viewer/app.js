// State
let state = {
  items: [],
  page: 1,
  limit: 50,
  totalPages: 1,
  zone: '',
  search: '',
  truncatedOnly: false,
  sortBy: '_id',
  sortOrder: 'asc'
};

let currentEditingId = null;
let currentEditingOriginalBytes = 0;

// DOM Elements
const zoneFilter = document.getElementById('zoneFilter');
const searchInput = document.getElementById('searchInput');
const truncatedFilter = document.getElementById('truncatedFilter');
const tableBody = document.getElementById('tableBody');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
const sortableHeaders = document.querySelectorAll('.sortable');

// Modal Elements
const editModal = document.getElementById('editModal');
const modalEnText = document.getElementById('modalEnText');
const modalZone = document.getElementById('modalZone');
const modalEnLength = document.getElementById('modalEnLength');
const modalViInput = document.getElementById('modalViInput');
const modalViLength = document.getElementById('modalViLength');
const modalWarning = document.getElementById('modalWarning');
const closeModalBtn = document.getElementById('closeModalBtn');
const saveModalBtn = document.getElementById('saveModalBtn');

// Helper: Escape HTML
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

// Helper: Calculate UTF-8 Byte Length
function getUtf8ByteLength(str) {
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) len += 1;
    else if (code <= 0x7ff) len += 2;
    else if (code >= 0xd800 && code <= 0xdfff) { len += 4; i++; }
    else len += 3;
  }
  return len;
}

// Init
async function init() {
  await loadZones();
  await loadData();
  setupEventListeners();
}

// Load Zones for Filter
async function loadZones() {
  try {
    const res = await fetch('/api/zones');
    const zones = await res.json();
    zones.sort().forEach(z => {
      if (!z) return;
      const opt = document.createElement('option');
      opt.value = z;
      opt.textContent = z;
      zoneFilter.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load zones", err);
  }
}

// Load Data
async function loadData() {
  try {
    const url = new URL('/api/strings', window.location.origin);
    url.searchParams.set('page', state.page);
    url.searchParams.set('limit', state.limit);
    if (state.zone) url.searchParams.set('zone', state.zone);
    if (state.search) url.searchParams.set('search', state.search);
    if (state.truncatedOnly) url.searchParams.set('truncated', 'true');
    url.searchParams.set('sortBy', state.sortBy);
    url.searchParams.set('order', state.sortOrder);

    const res = await fetch(url);
    const data = await res.json();

    state.items = data.items;
    state.totalPages = data.totalPages;
    
    renderTable();
    updatePagination();
    updateSortUI();
  } catch (err) {
    console.error("Failed to load data", err);
  }
}

// Update Sort UI
function updateSortUI() {
  sortableHeaders.forEach(th => {
    th.classList.remove('active');
    let text = th.textContent.replace(' ⬆', '').replace(' ⬇', '').replace(' ↕', '');
    if (th.dataset.sort === state.sortBy) {
      th.classList.add('active');
      th.textContent = text + (state.sortOrder === 'asc' ? ' ⬆' : ' ⬇');
    } else {
      th.textContent = text + ' ↕';
    }
  });
}

// Render Table
function renderTable() {
  tableBody.innerHTML = '';
  
  if (state.items.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem;">Không tìm thấy kết quả.</td></tr>`;
    return;
  }

  state.items.forEach(item => {
    const tr = document.createElement('tr');
    
    // 1. Zone
    const tdZone = document.createElement('td');
    tdZone.innerHTML = `<span class="zone-tag">${esc(item.zone || 'None')}</span>`;
    
    // 2. English Text
    const tdEn = document.createElement('td');
    tdEn.innerHTML = `${esc(item.sourceText)}`;

    // 3. EN Bytes
    const tdEnBytes = document.createElement('td');
    tdEnBytes.innerHTML = `<span class="byte-count">${item.lengthEn}b</span>`;
    
    // 4. Vietnamese Text
    const tdVi = document.createElement('td');
    tdVi.innerHTML = `${esc(item.translatedText)}`;

    // 5. VI Bytes
    const tdViBytes = document.createElement('td');
    const isTooLong = item.lengthVi > item.lengthEn;
    const isTooShort = item.lengthVi < item.lengthEn;
    const lenClass = isTooLong && !item.isDialogZone ? 'danger' : 'safe-text';
    tdViBytes.innerHTML = `<span class="byte-count ${lenClass}">${item.lengthVi}b</span>`;

    // 6. Status
    const tdStatus = document.createElement('td');
    if (isTooLong) {
      tdStatus.innerHTML = `<span class="truncated-text">Vượt ${item.lengthVi - item.lengthEn}b</span>`;
    } else if (isTooShort) {
      tdStatus.innerHTML = `<span class="safe-text" style="color: #facc15">Thấp ${item.lengthEn - item.lengthVi}b</span>`;
    } else {
      tdStatus.innerHTML = `<span class="safe-text">Vừa Khít</span>`;
    }
    
    // 7. Truncated Simulation
    const tdTrunc = document.createElement('td');
    if (item.isDialogZone) {
      tdTrunc.innerHTML = `<span class="safe-text" style="opacity: 0.5; font-size: 0.8rem">BTXT: Không cắt</span>`;
    } else if (isTooLong) {
      tdTrunc.innerHTML = `<span class="truncated-text">${esc(item.simulatedTruncated)}</span>`;
    } else {
      tdTrunc.innerHTML = `<span class="safe-text">${esc(item.translatedText)}</span>`;
    }

    // 8. Actions
    const tdAction = document.createElement('td');
    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn-edit';
    btnEdit.textContent = '✏️ Sửa';
    btnEdit.onclick = () => openEditModal(item);
    tdAction.appendChild(btnEdit);

    tr.appendChild(tdZone);
    tr.appendChild(tdEn);
    tr.appendChild(tdEnBytes);
    tr.appendChild(tdVi);
    tr.appendChild(tdViBytes);
    tr.appendChild(tdStatus);
    tr.appendChild(tdTrunc);
    tr.appendChild(tdAction);
    
    tableBody.appendChild(tr);
  });
}

function updatePagination() {
  pageInfo.textContent = `Page ${state.page} of ${state.totalPages}`;
  prevBtn.disabled = state.page <= 1;
  nextBtn.disabled = state.page >= state.totalPages;
}

function setupEventListeners() {
  sortableHeaders.forEach(th => {
    th.addEventListener('click', () => {
      const sortField = th.dataset.sort;
      if (state.sortBy === sortField) {
        state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortBy = sortField;
        state.sortOrder = 'asc';
      }
      state.page = 1;
      loadData();
    });
  });

  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.search = e.target.value;
      state.page = 1;
      loadData();
    }, 400);
  });

  zoneFilter.addEventListener('change', (e) => {
    state.zone = e.target.value;
    state.page = 1;
    loadData();
  });

  truncatedFilter.addEventListener('change', (e) => {
    state.truncatedOnly = e.target.checked;
    state.page = 1;
    loadData();
  });

  prevBtn.addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      loadData();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (state.page < state.totalPages) {
      state.page++;
      loadData();
    }
  });

  // Modal
  closeModalBtn.addEventListener('click', closeEditModal);
  modalViInput.addEventListener('input', updateModalCounter);
  saveModalBtn.addEventListener('click', saveTranslation);
}

// Modal Functions
function openEditModal(item) {
  currentEditingId = item._id;
  currentEditingOriginalBytes = item.lengthEn;
  
  modalEnText.textContent = item.sourceText;
  modalZone.textContent = item.zone || 'None';
  modalEnLength.textContent = item.lengthEn + ' bytes';
  modalViInput.value = item.translatedText;
  
  updateModalCounter();
  editModal.classList.remove('hidden');
}

function closeEditModal() {
  editModal.classList.add('hidden');
  currentEditingId = null;
}

function updateModalCounter() {
  const text = modalViInput.value;
  const currentBytes = getUtf8ByteLength(text);
  modalViLength.textContent = currentBytes;
  
  if (currentBytes > currentEditingOriginalBytes) {
    modalViLength.classList.add('highlight-byte');
    modalWarning.classList.remove('hidden');
  } else {
    modalViLength.classList.remove('highlight-byte');
    modalWarning.classList.add('hidden');
  }
}

async function saveTranslation() {
  if (!currentEditingId) return;
  const newTextVi = modalViInput.value;
  
  try {
    saveModalBtn.textContent = 'Đang lưu...';
    saveModalBtn.disabled = true;

    const res = await fetch('/api/strings/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentEditingId, newTextVi })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi khi lưu');
    }

    // Refresh data
    await loadData();
    closeEditModal();
  } catch (err) {
    alert("Có lỗi xảy ra: " + err.message);
  } finally {
    saveModalBtn.textContent = 'Lưu Database';
    saveModalBtn.disabled = false;
  }
}

// Start
init();
