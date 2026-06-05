// ===== DATA LAYER =====
// All data lives in memory. CSV is the only persistence mechanism.
// AppData is mirrored to sessionStorage so it survives page navigation within the same tab.

const CSV_HEADERS = [
  'id', 'player', 'year', 'set', 'cardNumber', 'sport', 'type',
  'grader', 'grade', 'condition', 'purchasePrice', 'purchaseDate',
  'source', 'estimatedValue', 'status', 'salePrice', 'saleDate',
  'platform', 'frontImageUrl', 'backImageUrl', 'notes'
];

const CASH_ID = '__CASH__';
const SESSION_KEY = 'card_manager_data';

// Load from sessionStorage if available, otherwise start empty
function loadSessionData() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { cards: [], cash: 0 };
}

function saveSessionData() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      cards: window.AppData.cards,
      cash: window.AppData.cash,
    }));
  } catch {}
}

// In-memory store — initialised from sessionStorage
const _session = loadSessionData();
window.AppData = {
  cards: _session.cards,
  cash: _session.cash,
};

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function parseNumber(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function escapeCSVField(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function importCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 1) throw new Error('Empty file');

        const headers = parseCSVLine(lines[0]).map(h => h.trim());

        // Validate headers
        const requiredHeaders = ['id', 'player', 'purchasePrice', 'status'];
        const hasRequired = requiredHeaders.every(h => headers.includes(h));
        if (!hasRequired) throw new Error('Invalid CSV format');

        const cards = [];
        let cash = 0;

        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const values = parseCSVLine(lines[i]);
          const obj = {};
          headers.forEach((h, idx) => {
            obj[h] = values[idx] ?? '';
          });

          if (obj.id === CASH_ID) {
            cash = parseNumber(obj.purchasePrice);
            continue;
          }

          cards.push({
            id: obj.id || generateId(),
            player: obj.player || '',
            year: obj.year || '',
            set: obj.set || '',
            cardNumber: obj.cardNumber || '',
            sport: obj.sport || 'Other',
            type: obj.type || 'Raw',
            grader: obj.grader || '',
            grade: obj.grade || '',
            condition: obj.condition || '',
            purchasePrice: parseNumber(obj.purchasePrice),
            purchaseDate: obj.purchaseDate || '',
            source: obj.source || '',
            estimatedValue: parseNumber(obj.estimatedValue),
            status: obj.status || 'In Storage',
            salePrice: parseNumber(obj.salePrice),
            saleDate: obj.saleDate || '',
            platform: obj.platform || '',
            frontImageUrl: obj.frontImageUrl || '',
            backImageUrl: obj.backImageUrl || '',
            notes: obj.notes || '',
          });
        }

        window.AppData.cards = cards;
        window.AppData.cash = cash;
        saveSessionData();
        resolve({ cards, cash });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsText(file);
  });
}

function exportCSV(cards, cash) {
  const rows = [CSV_HEADERS.join(',')];

  // Cash row
  const cashRow = CSV_HEADERS.map(h => {
    if (h === 'id') return CASH_ID;
    if (h === 'purchasePrice') return String(cash);
    return '';
  });
  rows.push(cashRow.join(','));

  // Card rows
  for (const card of cards) {
    const row = CSV_HEADERS.map(h => escapeCSVField(card[h] ?? ''));
    rows.push(row.join(','));
  }

  const csv = rows.join('\n');
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cards_${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function calculatePL(card) {
  const cost = card.purchasePrice || 0;
  if (card.status === 'Sold') {
    return (card.salePrice || 0) - cost;
  }
  return (card.estimatedValue || 0) - cost;
}

function getPortfolioStats(cards, cash) {
  const unsold = cards.filter(c => c.status !== 'Sold');
  const sold = cards.filter(c => c.status === 'Sold');

  const totalCards = unsold.length;
  const portfolioValue = unsold.reduce((sum, c) => sum + (c.estimatedValue || 0), 0);

  const realizedPL = sold.reduce((sum, c) => sum + calculatePL(c), 0);
  const unrealizedPL = unsold.reduce((sum, c) => sum + calculatePL(c), 0);
  const totalPL = realizedPL + unrealizedPL;

  const totalInvested = cards.reduce((sum, c) => sum + (c.purchasePrice || 0), 0);

  return { totalCards, portfolioValue, totalPL, cash, realizedPL, unrealizedPL, totalInvested, soldCount: sold.length };
}

function formatCurrency(val) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatPL(val) {
  const prefix = val >= 0 ? '+' : '';
  return prefix + formatCurrency(val);
}

// Toast notifications
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Theme management
function initTheme() {
  const saved = localStorage.getItem('card_manager_theme') || 'dark';
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (isLight) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('card_manager_theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('card_manager_theme', 'light');
  }
  updateThemeIcon();
}

function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  btn.innerHTML = isLight
    ? '<i class="ti ti-moon"></i>'
    : '<i class="ti ti-sun"></i>';
  btn.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
}

// Navbar setup — shared across all pages
function initNavbar(activePage) {
  initTheme();

  const nav = document.getElementById('main-nav');
  if (!nav) return;

  // Mark active link
  nav.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === activePage);
  });

  updateThemeIcon();

  // Theme toggle
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

  // Import CSV
  document.getElementById('import-btn')?.addEventListener('click', () => {
    document.getElementById('csv-file-input').click();
  });

  document.getElementById('csv-file-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await importCSV(file);
      showToast('CSV imported successfully.', 'success');
      document.dispatchEvent(new CustomEvent('data-loaded'));
    } catch (err) {
      showToast('Invalid CSV format. Please export from this app and re-import.', 'error');
    }
    e.target.value = '';
  });

  // Export CSV
  document.getElementById('export-btn')?.addEventListener('click', () => {
    if (window.AppData.cards.length === 0) {
      showToast('No data to export.', 'warning');
      return;
    }
    exportCSV(window.AppData.cards, window.AppData.cash);
    showToast('CSV exported.', 'success');
  });

  // Settings modal
  document.getElementById('settings-btn')?.addEventListener('click', openSettingsModal);
}

function openSettingsModal() {
  const existing = document.getElementById('settings-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'settings-modal-overlay';
  overlay.className = 'modal-overlay centered';
  overlay.innerHTML = `
    <div class="modal modal-center" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="modal-header">
        <span class="modal-title" id="settings-title">Settings</span>
        <button class="modal-close" id="settings-close" aria-label="Close settings">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="api-key-input">Anthropic API Key</label>
          <input type="password" id="api-key-input" class="form-control" placeholder="sk-ant-..." autocomplete="off"
            value="${sessionStorage.getItem('anthropic_api_key') || ''}">
          <p class="settings-note">Your API key is only stored for this browser session and is never saved to disk or exported in your CSV.</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="settings-cancel">Cancel</button>
        <button class="btn btn-primary" id="settings-save">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.getElementById?.('settings-close')?.addEventListener('click', close);
  document.getElementById('settings-close')?.addEventListener('click', close);
  document.getElementById('settings-cancel')?.addEventListener('click', close);
  document.getElementById('settings-save')?.addEventListener('click', () => {
    const key = document.getElementById('api-key-input').value.trim();
    if (key) sessionStorage.setItem('anthropic_api_key', key);
    else sessionStorage.removeItem('anthropic_api_key');
    showToast('Settings saved.', 'success');
    close();
  });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });

  document.getElementById('api-key-input')?.focus();
}
