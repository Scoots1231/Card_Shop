// ===== DASHBOARD PAGE =====

const SPORTS_ENDPOINTS = {
  MLB: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
  NBA: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
  NFL: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  NHL: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
};

let currentSport = 'MLB';

document.addEventListener('DOMContentLoaded', () => {
  initNavbar('dashboard');
  startClock();
  renderPortfolioStrip();
  renderExposure();
  initScoresPanel();
  initNewsPanel();
  document.addEventListener('data-loaded', () => {
    renderPortfolioStrip();
    renderExposure();
  });
});

// ===== LIVE CLOCK =====
function startClock() {
  const el = document.getElementById('live-clock');
  if (!el) return;
  const update = () => {
    const now = new Date();
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const day = days[now.getDay()];
    const date = `${months[now.getMonth()]} ${String(now.getDate()).padStart(2, '0')}, ${now.getFullYear()}`;
    const time = now.toLocaleTimeString('en-US', { hour12: false });
    el.textContent = `${day}  ${date}  ${time}`;
  };
  update();
  setInterval(update, 1000);
}

// ===== PORTFOLIO STRIP =====
function renderPortfolioStrip() {
  const stats = getPortfolioStats(window.AppData.cards);

  const cashEl = document.getElementById('metric-cash');
  if (cashEl) cashEl.textContent = formatCurrency(stats.cash);

  const cardsEl = document.getElementById('metric-cards');
  if (cardsEl) cardsEl.textContent = stats.totalCards;

  const valueEl = document.getElementById('metric-value');
  if (valueEl) valueEl.textContent = formatCurrency(stats.portfolioValue);

  const plEl = document.getElementById('metric-pl');
  if (plEl) {
    plEl.textContent = formatPL(stats.totalPL);
    plEl.className = 'metric-value mono ' + (stats.totalPL >= 0 ? 'text-green' : 'text-red');
  }
}

// ===== EXPOSURE BREAKDOWN =====
const SPORT_COLORS = {
  MLB: '#4a9eff',
  NBA: '#f5a623',
  NFL: '#00d084',
  NHL: '#cc66ff',
  Other: '#888888',
};

function renderExposure() {
  const container = document.getElementById('exposure-rows');
  const totalEl = document.getElementById('exposure-total');
  if (!container) return;

  // Only real cards (exclude cash deposits) count toward exposure
  const cards = window.AppData.cards.filter(c => !isCashDeposit(c));
  const sports = ['MLB', 'NBA', 'NFL', 'NHL', 'Other'];

  const costs = {};
  let totalCost = 0;
  sports.forEach(s => { costs[s] = 0; });

  for (const card of cards) {
    const sport = sports.includes(card.sport) ? card.sport : 'Other';
    costs[sport] += card.purchasePrice || 0;
    totalCost += card.purchasePrice || 0;
  }

  if (totalEl) {
    totalEl.textContent = totalCost > 0 ? `TOTAL COST BASIS: ${formatCurrency(totalCost)}` : '';
  }

  if (totalCost === 0) {
    container.innerHTML = '<span style="color:var(--text-secondary);font-size:11px;">No data loaded</span>';
    return;
  }

  container.innerHTML = sports.map((sport, i) => {
    const cost = costs[sport];
    const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
    const color = SPORT_COLORS[sport];
    const divider = i < sports.length - 1 ? '<div class="exposure-divider"></div>' : '';
    return `
      <div class="exposure-sport">
        <span class="exposure-sport-label">${sport}</span>
        <div class="exposure-bar-track">
          <div class="exposure-bar-fill" style="width:${pct.toFixed(1)}%;background:${color};"></div>
        </div>
        <span class="exposure-pct" style="color:${color};">${pct.toFixed(1)}%</span>
        <span class="exposure-cost">${formatCurrency(cost)}</span>
      </div>
      ${divider}
    `;
  }).join('');
}

// ===== SCORES PANEL =====
function initScoresPanel() {
  const tabs = document.querySelectorAll('.sport-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentSport = tab.dataset.sport;
      fetchScores();
    });
  });
  fetchScores();
  setInterval(fetchScores, 60000);
}

async function fetchScores() {
  const container = document.getElementById('scores-list');
  if (!container) return;
  try {
    const res = await fetch(SPORTS_ENDPOINTS[currentSport]);
    if (!res.ok) throw new Error('Network error');
    renderScores(await res.json(), container);
  } catch {
    container.innerHTML = '<p style="padding:16px;color:var(--text-secondary);font-size:12px;">Scores unavailable</p>';
  }
}

function renderScores(data, container) {
  const events = data.events || [];
  if (events.length === 0) {
    container.innerHTML = '<p style="padding:16px;color:var(--text-secondary);font-size:12px;">No games scheduled</p>';
    return;
  }
  container.innerHTML = events.map(event => {
    const comps = event.competitions?.[0];
    const competitors = comps?.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    const status = comps?.status?.type;
    const isLive = status?.state === 'in';
    const isFinal = status?.state === 'post';
    const statusText = isLive ? (status?.shortDetail || 'LIVE') : isFinal ? 'FINAL' : (status?.shortDetail || status?.description || 'SCHEDULED');
    return `
      <div class="score-item">
        <div class="score-team">${away?.team?.abbreviation || ''}</div>
        <div class="score-center">
          <span class="score-value" style="color:var(--accent-amber);">${away?.score ?? '-'} - ${home?.score ?? '-'}</span>
          <span class="score-status">${isLive ? '<span class="live-dot"></span>' : ''}${statusText}</span>
        </div>
        <div class="score-team home">${home?.team?.abbreviation || ''}</div>
      </div>
    `;
  }).join('');
}

// ===== NEWS PANEL =====
function initNewsPanel() {
  fetchNews();
  setInterval(fetchNews, 300000);
}

async function fetchNews() {
  const container = document.getElementById('news-list');
  if (!container) return;
  try {
    const rssUrl = 'https://www.espn.com/espn/rss/news';
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`);
    if (!res.ok) throw new Error('Failed');
    const json = await res.json();
    const xml = new DOMParser().parseFromString(json.contents, 'text/xml');
    const items = Array.from(xml.querySelectorAll('item')).slice(0, 15);
    if (items.length === 0) throw new Error('No items');
    container.innerHTML = items.map(item => {
      const title = item.querySelector('title')?.textContent || '';
      const link = item.querySelector('link')?.textContent || '#';
      const pubDate = item.querySelector('pubDate')?.textContent || '';
      const date = pubDate ? new Date(pubDate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <div class="news-item">
          <a href="${link}" target="_blank" rel="noopener noreferrer">${title}</a>
          <div class="news-meta">ESPN${date ? ' · ' + date : ''}</div>
        </div>
      `;
    }).join('');
  } catch {
    container.innerHTML = '<p style="padding:16px;color:var(--text-secondary);font-size:12px;">News unavailable</p>';
  }
}
