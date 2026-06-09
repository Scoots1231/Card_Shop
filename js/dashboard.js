// ===== DASHBOARD PAGE =====

const SPORTS_ENDPOINTS = {
  MLB: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
  NBA: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
  NFL: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  NHL: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
};


document.addEventListener('DOMContentLoaded', () => {
  initNavbar('dashboard');
  startClock();
  renderPortfolioStrip();
  renderExposure();
  initTicker();
  initNewsPanel();
  initYouTubeSidebar();
  document.addEventListener('data-loaded', () => {
    renderPortfolioStrip();
    renderExposure();
  });
});

// ===== SCORE TICKER =====
async function initTicker() {
  await fetchTickerScores();
  setInterval(fetchTickerScores, 60000);
}

async function fetchTickerScores() {
  const items = [];

  await Promise.allSettled(
    Object.entries(SPORTS_ENDPOINTS).map(async ([sport, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        for (const event of (data.events || [])) {
          const comps = event.competitions?.[0];
          const competitors = comps?.competitors || [];
          const home = competitors.find(c => c.homeAway === 'home');
          const away = competitors.find(c => c.homeAway === 'away');
          if (!home || !away) continue;
          const status = comps?.status?.type;
          const isLive = status?.state === 'in';
          const isFinal = status?.state === 'post';
          const statusText = isLive ? (status?.shortDetail || 'LIVE')
            : isFinal ? 'FINAL'
            : (status?.shortDetail || 'SCHED');
          items.push({
            sport,
            away: away.team?.abbreviation || '',
            home: home.team?.abbreviation || '',
            awayScore: away.score ?? '',
            homeScore: home.score ?? '',
            status: statusText,
            isLive,
          });
        }
      } catch {}
    })
  );

  const track = document.getElementById('ticker-track');
  if (!track) return;

  if (items.length === 0) {
    track.innerHTML = '<span class="ticker-item" style="opacity:0.5;">No games today</span>';
    return;
  }

  const html = items.map(g => `
    <span class="ticker-item">
      <span class="ticker-sport">${g.sport}</span>
      ${g.isLive ? '<span class="ticker-live-dot"></span>' : ''}
      <span class="ticker-teams">${g.away} vs ${g.home}</span>
      ${g.awayScore !== '' ? `<span class="ticker-score">${g.awayScore}–${g.homeScore}</span>` : ''}
      <span class="ticker-status">${g.status}</span>
    </span>
  `).join('');

  // Duplicate for seamless loop
  track.innerHTML = html + html;
}

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
    plEl.textContent = formatPL(stats.realizedPL);
    plEl.className = 'metric-value mono ' + (stats.realizedPL >= 0 ? 'text-green' : 'text-red');
  }
}

// ===== EXPOSURE BREAKDOWN =====
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

// ===== NEWS PANEL =====
function initNewsPanel() {
  fetchNews();
  setInterval(fetchNews, 300000);
}

const NEWS_ENDPOINTS = [
  { label: 'MLB', url: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news?limit=6' },
  { label: 'NBA', url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=6' },
  { label: 'NFL', url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=6' },
  { label: 'NHL', url: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news?limit=6' },
];

async function fetchNews() {
  const container = document.getElementById('news-list');
  if (!container) return;

  try {
    const results = await Promise.allSettled(
      NEWS_ENDPOINTS.map(({ label, url }) =>
        fetch(url).then(r => r.ok ? r.json() : Promise.reject()).then(json =>
          (json.articles || []).map(a => ({ ...a, _sport: label }))
        )
      )
    );

    const articles = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0))
      .slice(0, 20);

    if (articles.length === 0) throw new Error('No articles');

    container.innerHTML = articles.map(article => {
      const title = article.headline || '';
      const link = article.links?.web?.href || '#';
      const pubDate = article.published || '';
      const date = pubDate ? new Date(pubDate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <div class="news-item">
          <a href="${link}" target="_blank" rel="noopener noreferrer">${title}</a>
          <div class="news-meta">${article._sport}${date ? ' · ' + date : ''}</div>
        </div>
      `;
    }).join('');
  } catch {
    container.innerHTML = '<p style="padding:16px;color:var(--text-secondary);font-size:12px;">News unavailable</p>';
  }
}

// ===== YOUTUBE SIDEBAR =====
// Channel IDs: visit youtube.com/@handle → right-click → View Page Source → search "channelId"
const YT_CHANNELS = [
  { name: 'Card Collector 2',  id: 'UCbUwX0sho_2c9AweeyA8DlA' },
  { name: 'Roth Cards',        id: 'UCDZl-2hTjbE_6nCNLkfqfxA' },
{ name: "Spitballin' Cards", id: 'UCncldJMnwJNsxI-RFNXolGQ' },
];

async function initYouTubeSidebar() {
  const container = document.getElementById('yt-sidebar');
  if (!container) return;

  const results = await Promise.allSettled(
    YT_CHANNELS.map(ch => {
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`;
      const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}&count=1`;
      return fetch(apiUrl)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
          const item = data.items?.[0];
          if (!item) throw new Error('no items');
          const videoId = item.link?.split('v=')?.[1]?.split('&')?.[0] || '';
          const date = item.pubDate ? new Date(item.pubDate) : null;
          return {
            name: ch.name,
            title: item.title || '',
            link: item.link || '#',
            thumb: videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '',
            date,
          };
        });
    })
  );

  container.innerHTML = results.map((r, i) => {
    if (r.status !== 'fulfilled') {
      return `
        <div class="yt-channel-card">
          <div class="yt-channel-name">${YT_CHANNELS[i].name}</div>
          <div class="yt-video-date" style="color:var(--accent-red);">Unavailable</div>
        </div>`;
    }
    const { name, title, link, thumb, date } = r.value;
    const dateStr = date
      ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
    return `
      <div class="yt-channel-card">
        <div class="yt-channel-name">${name}</div>
        <a class="yt-card-link" href="${link}" target="_blank" rel="noopener noreferrer">
          ${thumb ? `<img class="yt-thumb" src="${thumb}" alt="" loading="lazy">` : ''}
          <div class="yt-video-title">${title}</div>
          <div class="yt-video-date">${dateStr}</div>
        </a>
      </div>`;
  }).join('');
}
