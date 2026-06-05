// ===== ANALYTICS PAGE =====

let sportChart = null;
let plSportChart = null;
let plTimeChart = null;

let sportFilter = 'all'; // 'all' | 'storage' | 'sold'
let plMode = 'combined'; // 'realized' | 'unrealized' | 'combined'

const SPORT_COLORS = {
  MLB: '#4a9eff',
  NBA: '#f5a623',
  NFL: '#00d084',
  NHL: '#cc66ff',
  Other: '#888888',
};

document.addEventListener('DOMContentLoaded', () => {
  initNavbar('analytics');
  renderAll();
  document.addEventListener('data-loaded', renderAll);
  bindToggles();
});

function renderAll() {
  renderSummaryStrip();
  renderSportDonut();
  renderPLSportChart();
  renderPLTimeChart();
  renderTopTables();
}

// ===== SUMMARY STRIP =====
function renderSummaryStrip() {
  const stats = getPortfolioStats(window.AppData.cards);
  setText('a-metric-cash', formatCurrency(stats.cash));
  setText('a-metric-cards', stats.totalCards);
  setText('a-metric-value', formatCurrency(stats.portfolioValue));

  const plEl = document.getElementById('a-metric-pl');
  if (plEl) {
    plEl.textContent = formatPL(stats.totalPL);
    plEl.className = 'metric-value mono ' + (stats.totalPL >= 0 ? 'text-green' : 'text-red');
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ===== SPORT DONUT =====
function renderSportDonut() {
  const cards = filterBySportToggle(window.AppData.cards.filter(c => !isCashDeposit(c)));
  const sports = ['MLB', 'NBA', 'NFL', 'NHL', 'Other'];
  const counts = sports.map(s => cards.filter(c => c.sport === s).length);
  const total = counts.reduce((a, b) => a + b, 0);

  const ctx = document.getElementById('sport-donut-chart');
  if (!ctx) return;

  if (sportChart) sportChart.destroy();

  if (total === 0) {
    ctx.parentElement.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);font-size:12px;">No data</div>';
    return;
  }

  sportChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sports,
      datasets: [{
        data: counts,
        backgroundColor: sports.map(s => SPORT_COLORS[s]),
        borderColor: 'var(--bg-secondary)',
        borderWidth: 2,
        hoverOffset: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw} cards (${total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0}%)`,
          },
        },
      },
    },
    plugins: [{
      id: 'centerText',
      afterDraw(chart) {
        const { ctx: c, chartArea: { left, top, right, bottom } } = chart;
        const x = (left + right) / 2;
        const y = (top + bottom) / 2;
        c.save();
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#e8e8e8';
        c.font = 'bold 28px IBM Plex Mono, monospace';
        c.fillText(total, x, y - 10);
        c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#888';
        c.font = '11px Inter, sans-serif';
        c.fillText('CARDS', x, y + 14);
        c.restore();
      },
    }],
  });

  // Legend
  const legend = document.getElementById('sport-donut-legend');
  if (legend) {
    legend.innerHTML = sports.map((s, i) => {
      const count = counts[i];
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
      return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="width:10px;height:10px;background:${SPORT_COLORS[s]};flex-shrink:0;"></div>
          <span style="font-size:12px;font-family:var(--font-mono);color:var(--text-secondary);">${s}</span>
          <span style="font-size:12px;font-family:var(--font-mono);margin-left:auto;color:var(--text-primary);">${count}</span>
          <span style="font-size:11px;font-family:var(--font-mono);color:var(--text-secondary);width:42px;text-align:right;">${pct}%</span>
        </div>
      `;
    }).join('');
  }
}

function filterBySportToggle(cards) {
  if (sportFilter === 'storage') return cards.filter(c => c.status === 'In Storage');
  if (sportFilter === 'sold') return cards.filter(c => c.status === 'Sold');
  return cards;
}

// ===== P&L BY SPORT BAR =====
function renderPLSportChart() {
  const cards = window.AppData.cards.filter(c => !isCashDeposit(c));
  const sports = ['MLB', 'NBA', 'NFL', 'NHL', 'Other'];

  const plValues = sports.map(s => {
    const sportCards = cards.filter(c => c.sport === s);
    if (plMode === 'realized') return sportCards.filter(c => c.status === 'Sold').reduce((sum, c) => sum + calculatePL(c), 0);
    if (plMode === 'unrealized') return sportCards.filter(c => c.status !== 'Sold').reduce((sum, c) => sum + calculatePL(c), 0);
    return sportCards.reduce((sum, c) => sum + calculatePL(c), 0);
  });

  const ctx = document.getElementById('pl-sport-chart');
  if (!ctx) return;

  if (plSportChart) plSportChart.destroy();

  const accentGreen = getComputedStyle(document.documentElement).getPropertyValue('--accent-green').trim() || '#00d084';
  const accentRed = getComputedStyle(document.documentElement).getPropertyValue('--accent-red').trim() || '#ff4d4d';

  plSportChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sports,
      datasets: [{
        data: plValues,
        backgroundColor: plValues.map(v => v >= 0 ? accentGreen + '99' : accentRed + '99'),
        borderColor: plValues.map(v => v >= 0 ? accentGreen : accentRed),
        borderWidth: 1,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + formatCurrency(ctx.raw),
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#888',
            font: { family: 'IBM Plex Mono', size: 11 },
            callback: v => formatCurrency(v),
          },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#888', font: { size: 12 } },
        },
      },
    },
    plugins: [{
      id: 'barLabels',
      afterDatasetsDraw(chart) {
        const { ctx: c, data } = chart;
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const val = data.datasets[0].data[i];
          const label = formatCurrency(val);
          c.save();
          c.fillStyle = val >= 0
            ? (getComputedStyle(document.documentElement).getPropertyValue('--accent-green').trim() || '#00d084')
            : (getComputedStyle(document.documentElement).getPropertyValue('--accent-red').trim() || '#ff4d4d');
          c.font = '11px IBM Plex Mono, monospace';
          c.textBaseline = 'middle';
          c.textAlign = val >= 0 ? 'left' : 'right';
          const x = val >= 0 ? bar.x + 4 : bar.x - 4;
          c.fillText(label, x, bar.y);
          c.restore();
        });
      },
    }],
  });
}

// ===== P&L OVER TIME =====
function renderPLTimeChart() {
  const cards = window.AppData.cards.filter(c => !isCashDeposit(c));

  // Build transaction list
  const events = [];
  for (const card of cards) {
    if (card.purchaseDate) {
      events.push({ date: card.purchaseDate, pl: -(card.purchasePrice || 0), label: `Buy: ${card.player}` });
    }
    if (card.status === 'Sold' && card.saleDate) {
      events.push({ date: card.saleDate, pl: card.salePrice || 0, label: `Sell: ${card.player}` });
    }
  }
  // Add unrealized values as of today
  const today = new Date().toISOString().slice(0, 10);
  for (const card of cards.filter(c => c.status !== 'Sold')) {
    if (card.estimatedValue && card.purchaseDate) {
      events.push({ date: today, pl: card.estimatedValue - (card.purchasePrice || 0), label: `Unrealized: ${card.player}` });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  const points = [];
  for (const ev of events) {
    running += ev.pl;
    points.push({ x: ev.date, y: parseFloat(running.toFixed(2)), label: ev.label });
  }

  const ctx = document.getElementById('pl-time-chart');
  if (!ctx) return;

  if (plTimeChart) plTimeChart.destroy();

  if (points.length === 0) {
    ctx.parentElement.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);font-size:12px;">No transaction data</div>';
    return;
  }

  const accentGreen = getComputedStyle(document.documentElement).getPropertyValue('--accent-green').trim() || '#00d084';
  const accentRed = getComputedStyle(document.documentElement).getPropertyValue('--accent-red').trim() || '#ff4d4d';
  const lastVal = points[points.length - 1]?.y || 0;
  const lineColor = lastVal >= 0 ? accentGreen : accentRed;

  plTimeChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        data: points.map(p => ({ x: p.x, y: p.y })),
        borderColor: lineColor,
        backgroundColor: lineColor + '22',
        fill: true,
        tension: 0.2,
        pointRadius: points.length < 30 ? 4 : 2,
        pointHoverRadius: 6,
        pointBackgroundColor: lineColor,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => items[0]?.raw.x || '',
            label: item => ` Cumulative P&L: ${formatCurrency(item.raw.y)}`,
          },
        },
      },
      scales: {
        x: {
          type: 'category',
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#888', font: { family: 'IBM Plex Mono', size: 10 }, maxTicksLimit: 12 },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#888',
            font: { family: 'IBM Plex Mono', size: 11 },
            callback: v => formatCurrency(v),
          },
        },
      },
    },
  });
}

// ===== TOP WINNERS / LOSERS =====
function renderTopTables() {
  const cards = window.AppData.cards.filter(c => !isCashDeposit(c));
  const sorted = cards.map(c => ({ ...c, pl: calculatePL(c), pct: c.purchasePrice > 0 ? (calculatePL(c) / c.purchasePrice) * 100 : 0 }))
    .sort((a, b) => b.pl - a.pl);

  const winners = sorted.filter(c => c.pl >= 0).slice(0, 10);
  const losers = sorted.filter(c => c.pl < 0).slice(-10).reverse();

  renderTopTable('winners-tbody', winners, true);
  renderTopTable('losers-tbody', losers, false);
}

function renderTopTable(tbodyId, cards, isWinner) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (cards.length === 0) {
    tbody.innerHTML = `<tr class="no-data-row"><td colspan="9">No data</td></tr>`;
    return;
  }

  tbody.innerHTML = cards.map((card, i) => {
    const pctStr = (card.pct >= 0 ? '+' : '') + card.pct.toFixed(1) + '%';
    const plStr = formatPL(card.pl);
    const cls = isWinner ? 'text-green' : 'text-red';
    const valueSold = card.status === 'Sold' ? formatCurrency(card.salePrice) : formatCurrency(card.estimatedValue);

    return `
      <tr>
        <td>${i + 1}</td>
        <td class="text-col">${card.player}</td>
        <td>${card.year}</td>
        <td class="text-col">${card.set}</td>
        <td>${card.type}</td>
        <td>${formatCurrency(card.purchasePrice)}</td>
        <td>${valueSold}</td>
        <td class="${cls}">${plStr}</td>
        <td class="${cls}">${pctStr}</td>
      </tr>
    `;
  }).join('');
}

// ===== TOGGLE BUTTONS =====
function bindToggles() {
  // Sport donut toggle
  document.querySelectorAll('.sport-donut-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sport-donut-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sportFilter = btn.dataset.filter;
      renderSportDonut();
    });
  });

  // P&L mode toggle
  document.querySelectorAll('.pl-mode-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pl-mode-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      plMode = btn.dataset.mode;
      renderPLSportChart();
    });
  });
}
