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

function isCashDeposit(card) {
  return card.type === 'Cash Deposit';
}

// Load from sessionStorage if available, otherwise start empty
function loadSessionData() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { cards: [] };
}

function saveSessionData() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ cards: window.AppData.cards }));
  } catch {}
}

// In-memory store — initialised from sessionStorage
const _session = loadSessionData();
window.AppData = {
  cards: _session.cards || [],
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

        const requiredHeaders = ['id', 'player', 'purchasePrice', 'status'];
        const hasRequired = requiredHeaders.every(h => headers.includes(h));
        if (!hasRequired) throw new Error('Invalid CSV format');

        const cards = [];

        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const values = parseCSVLine(lines[i]);
          const obj = {};
          headers.forEach((h, idx) => { obj[h] = values[idx] ?? ''; });

          // Legacy __CASH__ row — convert to a Cash Deposit entry
          if (obj.id === CASH_ID) {
            const amount = parseNumber(obj.purchasePrice);
            if (amount > 0) {
              cards.push({
                id: generateId(),
                player: 'CASH DEPOSIT',
                year: '', set: '', cardNumber: '', sport: '',
                type: 'Cash Deposit',
                grader: '', grade: '', condition: '',
                purchasePrice: amount,
                purchaseDate: new Date().toISOString().slice(0, 10),
                source: '', estimatedValue: 0,
                status: 'Cash Deposit',
                salePrice: 0, saleDate: '', platform: '',
                frontImageUrl: '', backImageUrl: '',
                notes: 'Imported from legacy cash balance',
              });
            }
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
        saveSessionData();
        resolve({ cards });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsText(file);
  });
}

function exportCSV(cards) {
  const rows = [CSV_HEADERS.join(',')];
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
  if (isCashDeposit(card)) return 0;
  const cost = card.purchasePrice || 0;
  if (card.status === 'Sold') return (card.salePrice || 0) - cost;
  return (card.estimatedValue || 0) - cost;
}

function getCashOnHand(cards) {
  return cards.filter(isCashDeposit).reduce((sum, c) => sum + (c.purchasePrice || 0), 0);
}

function getPortfolioStats(cards) {
  const realCards = cards.filter(c => !isCashDeposit(c));
  const unsold = realCards.filter(c => c.status !== 'Sold');
  const sold = realCards.filter(c => c.status === 'Sold');

  const totalCards = unsold.length;
  const portfolioValue = unsold.reduce((sum, c) => sum + (c.estimatedValue || 0), 0);
  const realizedPL = sold.reduce((sum, c) => sum + calculatePL(c), 0);
  const unrealizedPL = unsold.reduce((sum, c) => sum + calculatePL(c), 0);
  const totalPL = realizedPL + unrealizedPL;
  const totalInvested = realCards.reduce((sum, c) => sum + (c.purchasePrice || 0), 0);
  const cash = getCashOnHand(cards);

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
  const saved = localStorage.getItem('card_manager_theme') || 'cream';
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('card_manager_theme', 'cream');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('card_manager_theme', 'dark');
  }
  updateThemeIcon();
}

function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  btn.innerHTML = isDark ? '<i class="ti ti-sun"></i>' : '<i class="ti ti-moon"></i>';
  btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

// Navbar setup — shared across all pages
function initNavbar(activePage) {
  initTheme();
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  nav.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === activePage);
  });

  updateThemeIcon();
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

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

  document.getElementById('export-btn')?.addEventListener('click', () => {
    if (window.AppData.cards.length === 0) {
      showToast('No data to export.', 'warning');
      return;
    }
    exportCSV(window.AppData.cards);
    showToast('CSV exported.', 'success');
  });

  document.getElementById('settings-btn')?.addEventListener('click', openSettingsModal);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    if (e.key === 'i' || e.key === 'I') {
      e.preventDefault();
      document.getElementById('csv-file-input')?.click();
    }
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      if (window.AppData.cards.length === 0) { showToast('No data to export.', 'warning'); return; }
      exportCSV(window.AppData.cards);
      showToast('CSV exported.', 'success');
    }
  });
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
          <label for="slack-webhook-input">Slack Webhook URL</label>
          <input type="password" id="slack-webhook-input" class="form-control" placeholder="https://hooks.slack.com/services/..." autocomplete="off"
            value="${sessionStorage.getItem('slack_webhook_url') || ''}">
          <p class="settings-note">Notifications will be posted to your Slack channel when cards are added, sold, or cash is deposited. Stored for this session only.</p>
        </div>
        <div class="form-group" style="margin-top:8px;">
          <button class="btn btn-sm" id="slack-test-btn"><i class="ti ti-brand-slack"></i> Send Test Message</button>
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
  document.getElementById('settings-close')?.addEventListener('click', close);
  document.getElementById('settings-cancel')?.addEventListener('click', close);
  document.getElementById('settings-save')?.addEventListener('click', () => {
    const webhook = document.getElementById('slack-webhook-input').value.trim();
    if (webhook) sessionStorage.setItem('slack_webhook_url', webhook);
    else sessionStorage.removeItem('slack_webhook_url');
    showToast('Settings saved.', 'success');
    close();
  });
  document.getElementById('slack-test-btn')?.addEventListener('click', async () => {
    const webhook = document.getElementById('slack-webhook-input').value.trim();
    if (!webhook) { showToast('Enter a webhook URL first.', 'warning'); return; }
    await sendSlackNotification('👋 Card Manager connected successfully!', webhook);
    showToast('Test message sent — check your Slack channel.', 'success');
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.getElementById('slack-webhook-input')?.focus();
}

async function sendSlackNotification(text, webhookOverride) {
  const url = webhookOverride || sessionStorage.getItem('slack_webhook_url');
  if (!url) return false;
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return true;
  } catch {
    return false;
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

const SPORT_COLORS = {
  MLB: '#4a9eff',
  NBA: '#f5a623',
  NFL: '#00d084',
  NHL: '#cc66ff',
  Other: '#888888',
};
