// ===== INVENTORY PAGE =====

const PAGE_SIZE = 25;

let state = {
  search: '',
  sport: 'All',
  status: 'All',
  sortField: 'purchaseDate',
  sortDir: 'desc',
  page: 1,
  openCompsId: null,
};

document.addEventListener('DOMContentLoaded', () => {
  initNavbar('inventory');
  bindToolbar();
  render();

  document.addEventListener('data-loaded', render);
});

// ===== TOOLBAR =====
function bindToolbar() {
  document.getElementById('search-input')?.addEventListener('input', e => {
    state.search = e.target.value.toLowerCase();
    state.page = 1;
    render();
  });

  document.getElementById('sport-filter')?.addEventListener('change', e => {
    state.sport = e.target.value;
    state.page = 1;
    render();
  });

  document.getElementById('status-filter')?.addEventListener('change', e => {
    state.status = e.target.value;
    state.page = 1;
    render();
  });

  document.getElementById('sort-select')?.addEventListener('change', e => {
    const [field, dir] = e.target.value.split(':');
    state.sortField = field;
    state.sortDir = dir || 'asc';
    render();
  });

  document.getElementById('add-card-btn')?.addEventListener('click', () => openModal(null));
  document.getElementById('add-cash-btn')?.addEventListener('click', openCashModal);
}

// ===== FILTERING & SORTING =====
function getFilteredCards() {
  let cards = window.AppData.cards.slice();

  // Cash deposits: always show unless a specific non-cash status filter is active
  if (state.search) {
    cards = cards.filter(c => c.player.toLowerCase().includes(state.search));
  }
  if (state.sport !== 'All') {
    // Cash deposits have no sport — hide them when a sport filter is active
    cards = cards.filter(c => isCashDeposit(c) ? false : c.sport === state.sport);
  }
  if (state.status !== 'All') {
    // Cash deposits have status 'Cash Deposit' — hide when filtering by In Storage/Sold
    cards = cards.filter(c => c.status === state.status);
  }

  // Sort cash deposits to the bottom regardless of sort field
  cards.sort((a, b) => {
    const aCash = isCashDeposit(a), bCash = isCashDeposit(b);
    if (aCash && !bCash) return 1;
    if (!aCash && bCash) return -1;
    let va, vb;
    switch (state.sortField) {
      case 'player': va = a.player.toLowerCase(); vb = b.player.toLowerCase(); break;
      case 'purchasePrice': va = a.purchasePrice; vb = b.purchasePrice; break;
      case 'estimatedValue': va = a.estimatedValue; vb = b.estimatedValue; break;
      case 'pl': va = calculatePL(a); vb = calculatePL(b); break;
      default: va = a.purchaseDate || ''; vb = b.purchaseDate || ''; break;
    }
    if (va < vb) return state.sortDir === 'asc' ? -1 : 1;
    if (va > vb) return state.sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return cards;
}

// ===== RENDER =====
function render() {
  renderStatsBar();
  renderTable();
}

function renderStatsBar() {
  const all = window.AppData.cards;
  const cards = all.filter(c => !isCashDeposit(c));
  const unsold = cards.filter(c => c.status !== 'Sold');
  const sold = cards.filter(c => c.status === 'Sold');
  const totalInvested = cards.reduce((s, c) => s + (c.purchasePrice || 0), 0);
  const currentValue = unsold.reduce((s, c) => s + (c.estimatedValue || 0), 0);

  setText('stat-total', cards.length);
  setText('stat-storage', unsold.length);
  setText('stat-sold', sold.length);
  setText('stat-invested', formatCurrency(totalInvested));
  setText('stat-value', formatCurrency(currentValue));
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderTable() {
  const filtered = getFilteredCards();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages);

  const start = (state.page - 1) * PAGE_SIZE;
  const pageCards = filtered.slice(start, start + PAGE_SIZE);

  const tbody = document.getElementById('inventory-tbody');
  if (!tbody) return;

  if (pageCards.length === 0) {
    tbody.innerHTML = `<tr class="no-data-row"><td colspan="19">${window.AppData.cards.length === 0 ? 'No data loaded. Import a CSV to get started.' : 'No cards match your filters.'}</td></tr>`;
  } else {
    tbody.innerHTML = pageCards.map((card, i) => renderRow(card, start + i + 1)).join('');
    attachRowHandlers(tbody, pageCards);
  }

  renderPagination(total, totalPages);
}

function renderRow(card, rowNum) {
  // ---- Cash Deposit row ----
  if (isCashDeposit(card)) {
    const isPositive = (card.purchasePrice || 0) >= 0;
    const amtColor = isPositive ? 'var(--accent-green)' : 'var(--accent-red)';
    const amtText = isPositive ? `+${formatCurrency(card.purchasePrice)}` : formatCurrency(card.purchasePrice);
    const badgeClass = isPositive ? 'badge-green' : 'badge-gray';
    return `
      <tr data-id="${card.id}" data-row="${rowNum}" style="opacity:0.8;">
        <td>${rowNum}</td>
        <td class="text-col" colspan="8" style="color:${amtColor};font-weight:600;letter-spacing:0.04em;font-size:11px;">
          <i class="ti ti-cash" style="margin-right:6px;"></i>${card.player}
        </td>
        <td style="color:${amtColor};font-weight:600;">${amtText}</td>
        <td>${card.purchaseDate || ''}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
        <td><span class="badge ${badgeClass}">CASH</span></td>
        <td>
          <div class="action-cell" onclick="event.stopPropagation()">
            <button class="btn-delete" data-id="${card.id}" aria-label="Delete deposit"
              style="color:var(--accent-red);border-color:var(--accent-red);padding:2px 7px;font-size:11px;font-weight:600;letter-spacing:0.04em;">
              <i class="ti ti-trash"></i> DELETE
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  // ---- Normal card row ----
  const pl = calculatePL(card);
  const plClass = pl >= 0 ? 'text-green' : 'text-red';
  const plText = formatPL(pl);
  const statusBadge = card.status === 'Sold'
    ? '<span class="badge badge-gray">SOLD</span>'
    : '<span class="badge badge-blue">IN STORAGE</span>';
  const hasImages = card.frontImageUrl || card.backImageUrl;
  const condDisplay = conditionValue(card);

  return `
    <tr data-id="${card.id}" data-row="${rowNum}">
      <td>${rowNum}</td>
      <td class="text-col">${card.player || ''}</td>
      <td>${card.year || ''}</td>
      <td class="text-col">${card.set || ''}</td>
      <td>${card.cardNumber || ''}</td>
      <td class="text-col">${card.sport || ''}</td>
      <td>${card.type || ''}</td>
      <td colspan="2">${condDisplay}</td>
      <td>${card.purchasePrice ? formatCurrency(card.purchasePrice) : ''}</td>
      <td>${card.purchaseDate || ''}</td>
      <td class="text-col">${card.source || ''}</td>
      <td>${card.estimatedValue ? formatCurrency(card.estimatedValue) : ''}</td>
      <td>${card.salePrice ? formatCurrency(card.salePrice) : ''}</td>
      <td>${card.saleDate || ''}</td>
      <td class="text-col">${card.platform || ''}</td>
      <td class="${plClass}">${plText}</td>
      <td>${statusBadge}</td>
      <td>
        <div class="action-cell" onclick="event.stopPropagation()">
          ${hasImages ? `<button class="btn-img" data-id="${card.id}" title="View images" aria-label="View card images"><i class="ti ti-camera"></i></button>` : ''}
          <button class="btn-edit" data-id="${card.id}" aria-label="Edit card"><i class="ti ti-pencil"></i></button>
          ${card.status !== 'Sold' ? `<button class="btn-sold" data-id="${card.id}" aria-label="Mark as sold"
            style="color:var(--accent-green);border-color:var(--accent-green);padding:2px 7px;font-size:11px;font-weight:600;letter-spacing:0.04em;">
            <i class="ti ti-currency-dollar"></i> SOLD
          </button>` : ''}
          <button class="btn-delete" data-id="${card.id}" aria-label="Delete card"
            style="color:var(--accent-red);border-color:var(--accent-red);padding:2px 7px;font-size:11px;font-weight:600;letter-spacing:0.04em;">
            <i class="ti ti-trash"></i> DELETE
          </button>
          <button class="btn-comps" data-id="${card.id}" aria-label="Check comps">COMPS</button>
        </div>
      </td>
    </tr>
  `;
}

function attachRowHandlers(tbody, cards) {
  // Row click → edit (skip cash deposit rows)
  tbody.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', e => {
      if (e.target.closest('.action-cell')) return;
      const card = cards.find(c => c.id === tr.dataset.id);
      if (card && !isCashDeposit(card)) openModal(card);
    });
  });

  // Edit buttons
  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const card = window.AppData.cards.find(c => c.id === btn.dataset.id);
      if (card) openModal(card);
    });
  });

  // Delete buttons
  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm('Delete this card?')) return;
      window.AppData.cards = window.AppData.cards.filter(c => c.id !== btn.dataset.id);
      saveSessionData();
      showToast('Card deleted.', 'success');
      render();
    });
  });

  // Image buttons
  tbody.querySelectorAll('.btn-img').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const card = window.AppData.cards.find(c => c.id === btn.dataset.id);
      if (card) openLightbox(card);
    });
  });

  // Sold buttons
  tbody.querySelectorAll('.btn-sold').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const card = window.AppData.cards.find(c => c.id === btn.dataset.id);
      if (card) openSoldModal(card);
    });
  });

  // Comps buttons
  tbody.querySelectorAll('.btn-comps').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (state.openCompsId === id) {
        closeCompsPanel();
      } else {
        openCompsPanel(id);
      }
    });
  });
}

// ===== PAGINATION =====
function renderPagination(total, totalPages) {
  const info = document.getElementById('pagination-info');
  const controls = document.getElementById('pagination-controls');
  if (!info || !controls) return;

  const start = Math.min((state.page - 1) * PAGE_SIZE + 1, total);
  const end = Math.min(state.page * PAGE_SIZE, total);
  info.textContent = total === 0 ? '0 records' : `${start}–${end} of ${total}`;

  controls.innerHTML = '';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'page-btn';
  prevBtn.textContent = '‹';
  prevBtn.disabled = state.page <= 1;
  prevBtn.addEventListener('click', () => { state.page--; render(); });
  controls.appendChild(prevBtn);

  const maxVisible = 7;
  let pageNums = [];
  if (totalPages <= maxVisible) {
    pageNums = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else {
    pageNums = [1];
    let lo = Math.max(2, state.page - 2);
    let hi = Math.min(totalPages - 1, state.page + 2);
    if (lo > 2) pageNums.push('...');
    for (let p = lo; p <= hi; p++) pageNums.push(p);
    if (hi < totalPages - 1) pageNums.push('...');
    pageNums.push(totalPages);
  }

  pageNums.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (p === state.page ? ' active' : '');
    btn.textContent = p;
    if (p === '...') {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => { state.page = p; render(); });
    }
    controls.appendChild(btn);
  });

  const nextBtn = document.createElement('button');
  nextBtn.className = 'page-btn';
  nextBtn.textContent = '›';
  nextBtn.disabled = state.page >= totalPages;
  nextBtn.addEventListener('click', () => { state.page++; render(); });
  controls.appendChild(nextBtn);
}

// ===== ADD/EDIT MODAL =====
function openModal(card) {
  const existing = document.getElementById('card-modal-overlay');
  if (existing) existing.remove();

  const isEdit = !!card;
  const overlay = document.createElement('div');
  overlay.id = 'card-modal-overlay';
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <span class="modal-title" id="modal-title">${isEdit ? 'EDIT CARD' : 'ADD CARD'}</span>
        <button class="modal-close" id="modal-close-btn" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <form id="card-form" novalidate>
          <div class="form-row">
            <div class="form-group" style="grid-column:1/-1">
              <label for="f-player">Player Name <span class="required">*</span></label>
              <input type="text" id="f-player" class="form-control" required value="${esc(card?.player)}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="f-year">Year <span class="required">*</span></label>
              <input type="number" id="f-year" class="form-control mono" min="1800" max="2100" required value="${esc(card?.year)}">
            </div>
            <div class="form-group">
              <label for="f-sport">Sport <span class="required">*</span></label>
              <select id="f-sport" class="form-control">
                ${['MLB','NBA','NFL','NHL','Other'].map(s => `<option${card?.sport===s?' selected':''}>${s}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="f-set">Set <span class="required">*</span></label>
              <input type="text" id="f-set" class="form-control" required value="${esc(card?.set)}">
            </div>
            <div class="form-group">
              <label for="f-cardnum">Card #</label>
              <input type="text" id="f-cardnum" class="form-control mono" value="${esc(card?.cardNumber)}">
            </div>
          </div>

          <hr class="form-divider">
          <p class="form-section-title">Condition</p>

          <div class="form-group">
            <label for="f-condition">Condition <span class="required">*</span></label>
            <select id="f-condition" class="form-control">
              <optgroup label="PSA">
                ${[10,9,8,7,6,5,4,3,2,1].map(n => {
                  const val = `PSA ${n}`;
                  const sel = conditionValue(card) === val ? ' selected' : '';
                  return `<option${sel}>${val}</option>`;
                }).join('')}
              </optgroup>
              <optgroup label="BGS">
                ${[10,9.5,9,8.5,8,7.5,7,6.5,6,5.5,5,4.5,4,3.5,3,2.5,2,1.5,1].map(n => {
                  const val = `BGS ${n}`;
                  const sel = conditionValue(card) === val ? ' selected' : '';
                  return `<option${sel}>${val}</option>`;
                }).join('')}
              </optgroup>
              <option value="Sealed"${conditionValue(card)==='Sealed'?' selected':''}>Sealed</option>
              <option value="Raw"${(!card||conditionValue(card)==='Raw'||conditionValue(card)==='')?' selected':''}>Raw</option>
            </select>
          </div>

          <hr class="form-divider">
          <p class="form-section-title">Purchase Info</p>

          <div class="form-row">
            <div class="form-group">
              <label for="f-price">Purchase Price <span class="required">*</span></label>
              <input type="number" id="f-price" class="form-control mono" min="0" step="0.01" required value="${card?.purchasePrice ?? ''}">
            </div>
            <div class="form-group">
              <label for="f-date">Purchase Date <span class="required">*</span></label>
              <input type="date" id="f-date" class="form-control" required value="${esc(card?.purchaseDate)}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="f-source">Source</label>
              <input type="text" id="f-source" class="form-control" value="${esc(card?.source)}">
            </div>
            <div class="form-group">
              <label for="f-estval">Est. Value</label>
              <input type="number" id="f-estval" class="form-control mono" min="0" step="0.01" value="${card?.estimatedValue ?? ''}">
            </div>
          </div>

          <hr class="form-divider">
          <p class="form-section-title">Status</p>

          <div class="form-group">
            <label>Status <span class="required">*</span></label>
            <div class="radio-group">
              <label><input type="radio" name="f-status" value="In Storage" ${(!card||card.status==='In Storage')?'checked':''}> In Storage</label>
              <label><input type="radio" name="f-status" value="Sold" ${card?.status==='Sold'?'checked':''}> Sold</label>
            </div>
          </div>

          <div id="sold-fields" style="display:${card?.status==='Sold'?'block':'none'}">
            <div class="form-row">
              <div class="form-group">
                <label for="f-saleprice">Sale Price</label>
                <input type="number" id="f-saleprice" class="form-control mono" min="0" step="0.01" value="${card?.salePrice ?? ''}">
              </div>
              <div class="form-group">
                <label for="f-saledate">Sale Date</label>
                <input type="date" id="f-saledate" class="form-control" value="${esc(card?.saleDate)}">
              </div>
            </div>
            <div class="form-group">
              <label for="f-platform">Platform</label>
              <input type="text" id="f-platform" class="form-control" value="${esc(card?.platform)}">
            </div>
          </div>

          <hr class="form-divider">
          <p class="form-section-title">Images &amp; Notes</p>

          <div class="form-group">
            <label for="f-front">Front Image URL (Imgur)</label>
            <input type="url" id="f-front" class="form-control" placeholder="https://i.imgur.com/..." value="${esc(card?.frontImageUrl)}">
          </div>
          <div class="form-group">
            <label for="f-back">Back Image URL (Imgur)</label>
            <input type="url" id="f-back" class="form-control" placeholder="https://i.imgur.com/..." value="${esc(card?.backImageUrl)}">
          </div>
          <div class="form-group">
            <label for="f-notes">Notes</label>
            <textarea id="f-notes" class="form-control" rows="3">${esc(card?.notes)}</textarea>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn" id="modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="modal-save-btn">${isEdit ? 'Save Changes' : 'Add Card'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Status radio toggle
  overlay.querySelectorAll('input[name="f-status"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('sold-fields').style.display = r.value === 'Sold' ? 'block' : 'none';
    });
  });

  const close = () => overlay.remove();
  document.getElementById('modal-close-btn')?.addEventListener('click', close);
  document.getElementById('modal-cancel-btn')?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  document.getElementById('modal-save-btn')?.addEventListener('click', () => {
    saveCard(card?.id);
  });

  document.getElementById('f-player')?.focus();
}

// Returns the unified condition string for a card (used to pre-select modal dropdown)
function conditionValue(card) {
  if (!card) return 'Raw';
  if (card.type === 'Graded' && card.grader && card.grade) return `${card.grader} ${card.grade}`;
  if (card.condition) return card.condition;
  return 'Raw';
}

function esc(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function saveCard(existingId) {
  const player = document.getElementById('f-player').value.trim();
  const year = document.getElementById('f-year').value.trim();
  const set = document.getElementById('f-set').value.trim();
  const purchasePrice = document.getElementById('f-price').value;
  const purchaseDate = document.getElementById('f-date').value;

  if (!player || !year || !set || !purchasePrice || !purchaseDate) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const condVal = document.getElementById('f-condition').value;
  const status = document.querySelector('input[name="f-status"]:checked')?.value || 'In Storage';

  // Parse condition into type/grader/grade/condition fields
  let type = 'Raw', grader = '', grade = '', condition = condVal;
  if (condVal.startsWith('PSA ')) {
    type = 'Graded'; grader = 'PSA'; grade = condVal.slice(4); condition = '';
  } else if (condVal.startsWith('BGS ')) {
    type = 'Graded'; grader = 'BGS'; grade = condVal.slice(4); condition = '';
  } else {
    type = condVal === 'Sealed' ? 'Sealed' : 'Raw';
    condition = condVal;
  }

  const cardData = {
    id: existingId || generateId(),
    player,
    year,
    set,
    cardNumber: document.getElementById('f-cardnum').value.trim(),
    sport: document.getElementById('f-sport').value,
    type,
    grader,
    grade,
    condition,
    purchasePrice: parseFloat(purchasePrice) || 0,
    purchaseDate,
    source: document.getElementById('f-source').value.trim(),
    estimatedValue: parseFloat(document.getElementById('f-estval').value) || 0,
    status,
    salePrice: status === 'Sold' ? parseFloat(document.getElementById('f-saleprice').value) || 0 : 0,
    saleDate: status === 'Sold' ? document.getElementById('f-saledate').value : '',
    platform: status === 'Sold' ? document.getElementById('f-platform').value.trim() : '',
    frontImageUrl: document.getElementById('f-front').value.trim(),
    backImageUrl: document.getElementById('f-back').value.trim(),
    notes: document.getElementById('f-notes').value.trim(),
  };

  if (existingId) {
    const prev = window.AppData.cards.find(c => c.id === existingId);
    const idx = window.AppData.cards.findIndex(c => c.id === existingId);
    if (idx >= 0) window.AppData.cards[idx] = cardData;

    // If purchase price changed, adjust cash by the difference (deduct more or refund)
    const priceDiff = (cardData.purchasePrice || 0) - (prev?.purchasePrice || 0);
    if (priceDiff !== 0) {
      addCashEntry(
        priceDiff > 0
          ? `PURCHASE ADJUSTMENT — ${cardData.player}`
          : `PURCHASE REFUND — ${cardData.player}`,
        -priceDiff,
        cardData.purchaseDate
      );
    }

    // If card newly marked Sold (wasn't sold before), add sale price to cash
    if (cardData.status === 'Sold' && prev?.status !== 'Sold') {
      addCashEntry(`SALE — ${cardData.player}`, cardData.salePrice || 0, cardData.saleDate || cardData.purchaseDate);
    }
    // If card un-sold (was sold, now in storage), reverse the sale
    if (cardData.status !== 'Sold' && prev?.status === 'Sold') {
      addCashEntry(`SALE REVERSAL — ${cardData.player}`, -(prev?.salePrice || 0), cardData.purchaseDate);
    }
    // If card was already sold and sale price changed, adjust the difference
    if (cardData.status === 'Sold' && prev?.status === 'Sold') {
      const saleDiff = (cardData.salePrice || 0) - (prev?.salePrice || 0);
      if (saleDiff !== 0) {
        addCashEntry(`SALE ADJUSTMENT — ${cardData.player}`, saleDiff, cardData.saleDate || cardData.purchaseDate);
      }
    }
  } else {
    window.AppData.cards.push(cardData);
    // New card purchased — deduct purchase price from cash
    addCashEntry(`PURCHASE — ${cardData.player}`, -(cardData.purchasePrice || 0), cardData.purchaseDate);
    // If added directly as Sold — also add the sale proceeds
    if (cardData.status === 'Sold' && cardData.salePrice) {
      addCashEntry(`SALE — ${cardData.player}`, cardData.salePrice, cardData.saleDate || cardData.purchaseDate);
    }
  }

  saveSessionData();
  document.getElementById('card-modal-overlay')?.remove();
  showToast(existingId ? 'Card updated.' : 'Card added.', 'success');
  render();
}

function addCashEntry(label, amount, date) {
  if (amount === 0) return;
  window.AppData.cards.push({
    id: generateId(),
    player: label,
    year: '', set: '', cardNumber: '', sport: '',
    type: 'Cash Deposit',
    grader: '', grade: '', condition: '',
    purchasePrice: amount,
    purchaseDate: date || new Date().toISOString().slice(0, 10),
    source: '', estimatedValue: 0,
    status: 'Cash Deposit',
    salePrice: 0, saleDate: '', platform: '',
    frontImageUrl: '', backImageUrl: '', notes: '',
  });
}

// ===== SOLD MODAL =====
function openSoldModal(card) {
  const existing = document.getElementById('sold-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'sold-modal-overlay';
  overlay.className = 'modal-overlay centered';

  overlay.innerHTML = `
    <div class="modal modal-center" role="dialog" aria-modal="true" aria-labelledby="sold-modal-title">
      <div class="modal-header">
        <span class="modal-title" id="sold-modal-title">Mark as Sold</span>
        <button class="modal-close" id="sold-modal-close" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:16px;padding:10px 14px;background:var(--bg-tertiary);border:1px solid var(--border);">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${esc(card.player)}</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:3px;">${card.year} ${card.set}${card.cardNumber ? ' #' + card.cardNumber : ''} · ${conditionValue(card)}</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Paid: <span style="font-family:var(--font-mono);color:var(--text-primary);">${formatCurrency(card.purchasePrice)}</span></div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="sold-price">Sale Price <span style="color:var(--accent-red);">*</span></label>
            <input type="number" id="sold-price" class="form-control mono" min="0" step="0.01" placeholder="0.00" autofocus>
          </div>
          <div class="form-group">
            <label for="sold-date">Sale Date <span style="color:var(--accent-red);">*</span></label>
            <input type="date" id="sold-date" class="form-control" value="${new Date().toISOString().slice(0,10)}">
          </div>
        </div>
        <div class="form-group">
          <label for="sold-platform">Platform</label>
          <input type="text" id="sold-platform" class="form-control" placeholder="eBay, PWCC, etc.">
        </div>
        <div id="sold-pl-preview" style="font-size:12px;font-family:var(--font-mono);margin-top:4px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="sold-modal-cancel">Cancel</button>
        <button class="btn btn-success" id="sold-modal-save"><i class="ti ti-check"></i> Confirm Sale</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const priceInput = document.getElementById('sold-price');
  const plPreview = document.getElementById('sold-pl-preview');

  priceInput?.addEventListener('input', () => {
    const sp = parseFloat(priceInput.value) || 0;
    const pl = sp - (card.purchasePrice || 0);
    if (sp > 0) {
      plPreview.textContent = `P&L: ${formatPL(pl)}`;
      plPreview.style.color = pl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    } else {
      plPreview.textContent = '';
    }
  });

  const close = () => overlay.remove();
  document.getElementById('sold-modal-close')?.addEventListener('click', close);
  document.getElementById('sold-modal-cancel')?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  document.getElementById('sold-modal-save')?.addEventListener('click', () => {
    const salePrice = parseFloat(priceInput?.value);
    const saleDate = document.getElementById('sold-date').value;
    const platform = document.getElementById('sold-platform').value.trim();

    if (!salePrice || salePrice <= 0) {
      showToast('Enter a valid sale price.', 'error');
      return;
    }
    if (!saleDate) {
      showToast('Enter a sale date.', 'error');
      return;
    }

    const idx = window.AppData.cards.findIndex(c => c.id === card.id);
    if (idx < 0) return;

    window.AppData.cards[idx] = {
      ...window.AppData.cards[idx],
      status: 'Sold',
      salePrice,
      saleDate,
      platform,
    };

    // Add sale proceeds to cash
    addCashEntry(`SALE — ${card.player}`, salePrice, saleDate);

    saveSessionData();
    showToast(`${card.player} marked as sold for ${formatCurrency(salePrice)}.`, 'success');
    close();
    render();
  });

  priceInput?.focus();
}

// ===== COMPS — eBay sold search (no API key required) =====
function openCompsPanel(cardId) {
  const card = window.AppData.cards.find(c => c.id === cardId);
  if (!card) return;

  // Build a focused eBay sold-listings search query
  const parts = [card.player, card.year, card.set];
  if (card.cardNumber) parts.push('#' + card.cardNumber);
  const cond = conditionValue(card);
  if (cond && cond !== 'Raw') parts.push(cond);

  const query = parts.filter(Boolean).join(' ');
  const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
  window.open(ebayUrl, '_blank', 'noopener,noreferrer');
}

function closeCompsPanel() {
  // No-op — comps now opens a new tab, nothing inline to close
}

// ===== CASH DEPOSIT MODAL =====
function openCashModal() {
  const existing = document.getElementById('cash-modal-overlay');
  if (existing) existing.remove();

  const current = getCashOnHand(window.AppData.cards);
  const overlay = document.createElement('div');
  overlay.id = 'cash-modal-overlay';
  overlay.className = 'modal-overlay centered';

  overlay.innerHTML = `
    <div class="modal modal-center" role="dialog" aria-modal="true" aria-labelledby="cash-modal-title">
      <div class="modal-header">
        <span class="modal-title" id="cash-modal-title">Add Cash Deposit</span>
        <button class="modal-close" id="cash-modal-close" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label style="color:var(--text-secondary);font-size:11px;text-transform:uppercase;letter-spacing:.06em;">Current Cash on Hand</label>
          <div style="font-family:var(--font-mono);font-size:22px;font-weight:500;margin:6px 0 16px;">${formatCurrency(current)}</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="cash-deposit-input">Deposit Amount <span style="color:var(--accent-red);">*</span></label>
            <input type="number" id="cash-deposit-input" class="form-control mono" min="0.01" step="0.01" placeholder="0.00">
          </div>
          <div class="form-group">
            <label for="cash-deposit-date">Date <span style="color:var(--accent-red);">*</span></label>
            <input type="date" id="cash-deposit-date" class="form-control" value="${new Date().toISOString().slice(0,10)}">
          </div>
        </div>
        <div id="cash-new-total" style="font-size:12px;color:var(--text-secondary);margin-top:4px;font-family:var(--font-mono);"></div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="cash-modal-cancel">Cancel</button>
        <button class="btn btn-success" id="cash-modal-save"><i class="ti ti-plus"></i> Add Deposit</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = document.getElementById('cash-deposit-input');
  const newTotalEl = document.getElementById('cash-new-total');

  input?.addEventListener('input', () => {
    const amt = parseFloat(input.value) || 0;
    newTotalEl.textContent = amt > 0 ? `New total: ${formatCurrency(current + amt)}` : '';
  });

  const close = () => overlay.remove();
  document.getElementById('cash-modal-close')?.addEventListener('click', close);
  document.getElementById('cash-modal-cancel')?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  document.getElementById('cash-modal-save')?.addEventListener('click', () => {
    const amt = parseFloat(input?.value);
    const date = document.getElementById('cash-deposit-date').value;
    if (!amt || amt <= 0) {
      showToast('Enter a valid deposit amount.', 'error');
      return;
    }
    const entry = {
      id: generateId(),
      player: 'CASH DEPOSIT',
      year: '', set: '', cardNumber: '', sport: '',
      type: 'Cash Deposit',
      grader: '', grade: '', condition: '',
      purchasePrice: amt,
      purchaseDate: date,
      source: '', estimatedValue: 0,
      status: 'Cash Deposit',
      salePrice: 0, saleDate: '', platform: '',
      frontImageUrl: '', backImageUrl: '', notes: '',
    };
    window.AppData.cards.push(entry);
    saveSessionData();
    showToast(`${formatCurrency(amt)} cash deposit added.`, 'success');
    close();
    render();
  });

  input?.focus();
}

// ===== LIGHTBOX =====
function openLightbox(card) {
  const existing = document.getElementById('lightbox-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'lightbox-overlay';
  overlay.className = 'lightbox-overlay';

  const imgs = [];
  if (card.frontImageUrl) imgs.push(`<img src="${card.frontImageUrl}" alt="Front of ${esc(card.player)}">`);
  if (card.backImageUrl) imgs.push(`<img src="${card.backImageUrl}" alt="Back of ${esc(card.player)}">`);

  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="Close lightbox">&times;</button>
    ${imgs.join('')}
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.lightbox-close')?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }, { once: true });
}
