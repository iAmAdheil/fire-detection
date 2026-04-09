/**
 * dashboard.js
 *
 * Renders the analytics dashboard with Chart.js.
 * Uses IncidentLogger for data; seeds mock data if the store is empty.
 */

// ─── Config ──────────────────────────────────────────────────────────────────
const GODOWN_COUNT = 5;
const COLORS = {
    red:    { solid: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
    orange: { solid: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
    green:  { solid: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
    blue:   { solid: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
    purple: { solid: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
    cyan:   { solid: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
};

// ─── Chart.js Global Config ──────────────────────────────────────────────────
Chart.defaults.color = '#71717a';
Chart.defaults.borderColor = '#1e1e22';
Chart.defaults.font.family = "'SF Mono', 'Cascadia Code', 'Fira Code', 'Courier New', monospace";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.plugins.tooltip.backgroundColor = '#1e1e22';
Chart.defaults.plugins.tooltip.borderColor = '#2a2a2e';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.titleFont = { family: Chart.defaults.font.family, size: 11, weight: '600' };
Chart.defaults.plugins.tooltip.bodyFont = { family: Chart.defaults.font.family, size: 11 };
Chart.defaults.elements.point.radius = 0;
Chart.defaults.elements.point.hoverRadius = 4;

// ─── Mock Data Seeder ────────────────────────────────────────────────────────

function seedMockData() {
    if (IncidentLogger.getAll().length > 0) return;

    const types = ['fire', 'smoke', 'fight'];
    const now = Date.now();
    const DAY = 86400000;

    // Weight godowns differently: godown 1 & 3 are high-risk
    const godownWeights = { 1: 0.3, 2: 0.12, 3: 0.28, 4: 0.15, 5: 0.15 };
    // Hour weights — more incidents during working hours & night shifts
    const hourWeights = [
        2,1,1,1,1,2,  // 00-05: night shift
        3,4,5,5,4,3,  // 06-11: morning
        3,4,5,6,5,4,  // 12-17: afternoon peak
        5,6,5,4,3,2,  // 18-23: evening shift
    ];

    const incidents = [];

    for (let day = 90; day >= 0; day--) {
        // Fewer incidents further back, more recent
        const baseCount = day < 30 ? 4 : (day < 60 ? 3 : 2);
        const count = Math.floor(Math.random() * baseCount) + 1;

        for (let j = 0; j < count; j++) {
            // Weighted godown selection
            const rand = Math.random();
            let cumulative = 0;
            let godownId = 1;
            for (const [id, w] of Object.entries(godownWeights)) {
                cumulative += w;
                if (rand <= cumulative) { godownId = parseInt(id); break; }
            }

            // Weighted hour selection
            const totalHourWeight = hourWeights.reduce((a, b) => a + b, 0);
            let hourRand = Math.random() * totalHourWeight;
            let hour = 0;
            for (let h = 0; h < 24; h++) {
                hourRand -= hourWeights[h];
                if (hourRand <= 0) { hour = h; break; }
            }

            const type = types[Math.floor(Math.random() * types.length)];
            const confidence = type === 'fight'
                ? 0.5 + Math.random() * 0.4
                : 0.45 + Math.random() * 0.5;

            const timestamp = new Date(now - day * DAY + hour * 3600000 + Math.random() * 3600000);
            const isResolved = day > 0 || Math.random() > 0.3;

            incidents.push({
                id: `INC-${timestamp.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
                godownId,
                type,
                confidence: Math.round(confidence * 100) / 100,
                timestamp: timestamp.toISOString(),
                status: isResolved ? 'resolved' : 'active',
                alertSent: Math.random() > 0.1,
                ...(isResolved ? {
                    resolvedAt: new Date(timestamp.getTime() + (5 + Math.random() * 55) * 60000).toISOString(),
                } : {}),
            });
        }
    }

    localStorage.setItem('godown_incidents', JSON.stringify(incidents));
}

// ─── Analytics Computations ──────────────────────────────────────────────────

function computeAnalytics() {
    const all = IncidentLogger.getAll();
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 86400000);
    const sixtyDaysAgo  = new Date(now - 60 * 86400000);
    const sevenDaysAgo  = new Date(now - 7 * 86400000);

    const last30 = all.filter(i => new Date(i.timestamp) >= thirtyDaysAgo);
    const prev30 = all.filter(i => {
        const t = new Date(i.timestamp);
        return t >= sixtyDaysAgo && t < thirtyDaysAgo;
    });

    // Summary stats
    const totalIncidents = last30.length;
    const fireCount   = last30.filter(i => i.type === 'fire').length;
    const smokeCount  = last30.filter(i => i.type === 'smoke').length;
    const fightCount  = last30.filter(i => i.type === 'fight').length;
    const alertsSent  = last30.filter(i => i.alertSent).length;
    const activeCount = last30.filter(i => i.status === 'active').length;

    const prevTotal = prev30.length;
    const trendPct  = prevTotal > 0 ? ((totalIncidents - prevTotal) / prevTotal * 100).toFixed(0) : 0;

    const prevFire  = prev30.filter(i => i.type === 'fire').length;
    const prevFight = prev30.filter(i => i.type === 'fight').length;
    const fireTrend  = prevFire > 0 ? ((fireCount - prevFire) / prevFire * 100).toFixed(0) : 0;
    const fightTrend = prevFight > 0 ? ((fightCount - prevFight) / prevFight * 100).toFixed(0) : 0;

    // Average response time (for resolved incidents)
    const resolved = last30.filter(i => i.resolvedAt);
    const avgResponseMin = resolved.length > 0
        ? Math.round(resolved.reduce((sum, i) => sum + (new Date(i.resolvedAt) - new Date(i.timestamp)), 0) / resolved.length / 60000)
        : 0;

    // Daily counts for timeline (last 30 days)
    const dailyCounts = {};
    for (let d = 29; d >= 0; d--) {
        const date = new Date(now - d * 86400000);
        const key = date.toISOString().slice(0, 10);
        dailyCounts[key] = { fire: 0, smoke: 0, fight: 0 };
    }
    last30.forEach(i => {
        const key = i.timestamp.slice(0, 10);
        if (dailyCounts[key]) dailyCounts[key][i.type]++;
    });

    // Per-godown breakdown
    const godownStats = {};
    for (let g = 1; g <= GODOWN_COUNT; g++) {
        const gIncidents = last30.filter(i => i.godownId === g);
        godownStats[g] = {
            total: gIncidents.length,
            fire:  gIncidents.filter(i => i.type === 'fire').length,
            smoke: gIncidents.filter(i => i.type === 'smoke').length,
            fight: gIncidents.filter(i => i.type === 'fight').length,
            avgConf: gIncidents.length > 0
                ? (gIncidents.reduce((s, i) => s + i.confidence, 0) / gIncidents.length)
                : 0,
        };
    }

    // Risk scores (weighted: fire*3 + smoke*2 + fight*2, scaled by confidence)
    const riskScores = {};
    for (let g = 1; g <= GODOWN_COUNT; g++) {
        const s = godownStats[g];
        riskScores[g] = Math.min(100, Math.round(
            (s.fire * 3 + s.smoke * 2 + s.fight * 2) * (0.5 + s.avgConf * 0.5)
        ));
    }

    // Hourly heatmap data (godown x hour)
    const heatmap = {};
    for (let g = 1; g <= GODOWN_COUNT; g++) {
        heatmap[g] = new Array(24).fill(0);
    }
    last30.forEach(i => {
        const hour = new Date(i.timestamp).getHours();
        if (heatmap[i.godownId]) heatmap[i.godownId][hour]++;
    });

    // Severity distribution by confidence
    const severity = { critical: 0, high: 0, medium: 0, low: 0 };
    last30.forEach(i => {
        if (i.confidence >= 0.85)      severity.critical++;
        else if (i.confidence >= 0.7)  severity.high++;
        else if (i.confidence >= 0.55) severity.medium++;
        else                           severity.low++;
    });

    // Peak hours
    const hourlyTotals = new Array(24).fill(0);
    last30.forEach(i => { hourlyTotals[new Date(i.timestamp).getHours()]++; });

    // Weekly trend (last 7 days vs previous 7 days)
    const last7 = all.filter(i => new Date(i.timestamp) >= sevenDaysAgo).length;
    const prev7 = all.filter(i => {
        const t = new Date(i.timestamp);
        return t >= new Date(now - 14 * 86400000) && t < sevenDaysAgo;
    }).length;

    // Average confidence by type
    const avgConfByType = {};
    ['fire', 'smoke', 'fight'].forEach(type => {
        const items = last30.filter(i => i.type === type);
        avgConfByType[type] = items.length > 0
            ? Math.round(items.reduce((s, i) => s + i.confidence, 0) / items.length * 100)
            : 0;
    });

    return {
        totalIncidents, fireCount, smokeCount, fightCount,
        alertsSent, activeCount, trendPct, fireTrend, fightTrend,
        avgResponseMin, dailyCounts, godownStats, riskScores,
        heatmap, severity, hourlyTotals, last7, prev7,
        avgConfByType, recentIncidents: all.slice(-50).reverse(),
    };
}

// ─── Render Functions ────────────────────────────────────────────────────────

function renderSummaryCards(stats) {
    const cards = [
        { id: 'total',  label: 'Total Incidents',  value: stats.totalIncidents, trend: stats.trendPct,  cls: 'total' },
        { id: 'fire',   label: 'Fire Incidents',    value: stats.fireCount,      trend: stats.fireTrend,  cls: 'fire' },
        { id: 'fight',  label: 'Fight Incidents',   value: stats.fightCount,     trend: stats.fightTrend, cls: 'fight' },
        { id: 'alerts', label: 'Alerts Sent',       value: stats.alertsSent,     trend: null,             cls: 'alerts' },
        { id: 'resp',   label: 'Avg Response',      value: `${stats.avgResponseMin}m`, trend: null,       cls: 'uptime' },
    ];

    const row = document.getElementById('summary-row');
    row.innerHTML = cards.map(c => {
        const trendHtml = c.trend !== null
            ? `<span class="summary-trend ${Number(c.trend) > 0 ? 'trend-up' : Number(c.trend) < 0 ? 'trend-down' : 'trend-flat'}">
                   ${Number(c.trend) > 0 ? '+' : ''}${c.trend}% vs prev 30d
               </span>`
            : '';
        return `
            <div class="summary-card ${c.cls}">
                <span class="summary-label">${c.label}</span>
                <span class="summary-value">${c.value}</span>
                ${trendHtml}
            </div>
        `;
    }).join('');
}

function renderTimelineChart(dailyCounts) {
    const labels = Object.keys(dailyCounts).map(d => {
        const date = new Date(d + 'T00:00:00');
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const ctx = document.getElementById('chart-timeline').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Fire',
                    data: Object.values(dailyCounts).map(d => d.fire),
                    borderColor: COLORS.red.solid,
                    backgroundColor: COLORS.red.bg,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                },
                {
                    label: 'Smoke',
                    data: Object.values(dailyCounts).map(d => d.smoke),
                    borderColor: COLORS.orange.solid,
                    backgroundColor: COLORS.orange.bg,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                },
                {
                    label: 'Fight',
                    data: Object.values(dailyCounts).map(d => d.fight),
                    borderColor: COLORS.purple.solid,
                    backgroundColor: COLORS.purple.bg,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 10 },
                },
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 },
                    grid: { color: '#1e1e22' },
                },
            },
            plugins: {
                legend: { position: 'top', align: 'end' },
            },
        },
    });
}

function renderTypeDistribution(stats) {
    const ctx = document.getElementById('chart-distribution').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Fire', 'Smoke', 'Fight'],
            datasets: [{
                data: [stats.fireCount, stats.smokeCount, stats.fightCount],
                backgroundColor: [COLORS.red.solid, COLORS.orange.solid, COLORS.purple.solid],
                borderColor: '#111113',
                borderWidth: 3,
                hoverOffset: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom' },
            },
        },
    });
}

function renderGodownBreakdown(godownStats) {
    const labels = Object.keys(godownStats).map(g => `Godown ${g}`);
    const ctx = document.getElementById('chart-godown').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Fire',  data: Object.values(godownStats).map(s => s.fire),  backgroundColor: COLORS.red.solid },
                { label: 'Smoke', data: Object.values(godownStats).map(s => s.smoke), backgroundColor: COLORS.orange.solid },
                { label: 'Fight', data: Object.values(godownStats).map(s => s.fight), backgroundColor: COLORS.purple.solid },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, ticks: { stepSize: 5 }, grid: { color: '#1e1e22' } },
            },
            plugins: {
                legend: { position: 'top', align: 'end' },
            },
        },
    });
}

function renderPeakHours(hourlyTotals) {
    const labels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
    const maxVal = Math.max(...hourlyTotals);

    const ctx = document.getElementById('chart-hours').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Incidents',
                data: hourlyTotals,
                backgroundColor: hourlyTotals.map(v =>
                    v >= maxVal * 0.8 ? COLORS.red.solid :
                    v >= maxVal * 0.5 ? COLORS.orange.solid :
                    v >= maxVal * 0.25 ? COLORS.blue.solid :
                    '#2a2a2e'
                ),
                borderRadius: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
                y: { beginAtZero: true, grid: { color: '#1e1e22' } },
            },
            plugins: { legend: { display: false } },
        },
    });
}

function renderRiskScores(riskScores) {
    const container = document.getElementById('risk-list');
    const sorted = Object.entries(riskScores).sort((a, b) => b[1] - a[1]);

    container.innerHTML = sorted.map(([g, score]) => {
        const level = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';
        return `
            <div class="risk-item">
                <div class="risk-header">
                    <span class="risk-label">Godown ${g}</span>
                    <span class="risk-score ${level}">${score}/100</span>
                </div>
                <div class="risk-bar-bg">
                    <div class="risk-bar-fill ${level}" style="width: ${score}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderSeverity(severity) {
    const items = [
        { key: 'critical', label: 'Critical', sub: '85%+ confidence' },
        { key: 'high',     label: 'High',     sub: '70-84%' },
        { key: 'medium',   label: 'Medium',   sub: '55-69%' },
        { key: 'low',      label: 'Low',      sub: '<55%' },
    ];
    const container = document.getElementById('severity-grid');
    container.innerHTML = items.map(item => `
        <div class="severity-pill">
            <span class="severity-dot ${item.key}"></span>
            <div class="severity-info">
                <span class="severity-name">${item.label}</span>
                <span class="severity-count">${severity[item.key]}</span>
            </div>
        </div>
    `).join('');
}

function renderHeatmap(heatmap) {
    const container = document.getElementById('heatmap-grid');
    const maxVal = Math.max(...Object.values(heatmap).flatMap(row => row), 1);

    let html = '<div class="heatmap-label"></div>';
    for (let h = 0; h < 24; h++) {
        html += `<div class="heatmap-hour">${h.toString().padStart(2, '0')}</div>`;
    }

    for (let g = 1; g <= GODOWN_COUNT; g++) {
        html += `<div class="heatmap-label">GD-${g}</div>`;
        for (let h = 0; h < 24; h++) {
            const val = heatmap[g][h];
            const intensity = val / maxVal;
            const r = Math.round(239 * intensity);
            const gVal = Math.round(68 * intensity * 0.3);
            const b = Math.round(68 * intensity * 0.3);
            const alpha = 0.1 + intensity * 0.8;
            const bg = val > 0
                ? `rgba(${r}, ${gVal}, ${b}, ${alpha})`
                : 'rgba(30, 30, 34, 0.5)';
            html += `<div class="heatmap-cell" style="background:${bg}" title="Godown ${g}, ${h}:00 — ${val} incidents"></div>`;
        }
    }

    container.innerHTML = html;
}

function renderConfidenceChart(avgConfByType) {
    const ctx = document.getElementById('chart-confidence').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Fire', 'Smoke', 'Fight'],
            datasets: [{
                label: 'Avg Confidence %',
                data: [avgConfByType.fire, avgConfByType.smoke, avgConfByType.fight],
                backgroundColor: [COLORS.red.bg, COLORS.orange.bg, COLORS.purple.bg],
                borderColor: [COLORS.red.solid, COLORS.orange.solid, COLORS.purple.solid],
                borderWidth: 1.5,
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: { beginAtZero: true, max: 100, grid: { color: '#1e1e22' } },
                y: { grid: { display: false } },
            },
            plugins: { legend: { display: false } },
        },
    });
}

function renderIncidentsTable(incidents) {
    const tbody = document.getElementById('incidents-tbody');
    tbody.innerHTML = incidents.slice(0, 50).map(i => {
        const date = new Date(i.timestamp);
        const timeStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            + ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const confPct = Math.round(i.confidence * 100);
        const confColor = confPct >= 85 ? COLORS.red.solid : confPct >= 70 ? COLORS.orange.solid : confPct >= 55 ? COLORS.blue.solid : '#52525b';

        return `
            <tr>
                <td style="color: var(--text-muted); font-size: 0.65rem;">${i.id.slice(0, 12)}</td>
                <td>${timeStr}</td>
                <td>Godown ${i.godownId}</td>
                <td><span class="type-badge ${i.type}">${i.type}</span></td>
                <td>
                    ${confPct}%
                    <span class="confidence-bar-bg">
                        <span class="confidence-bar-fill" style="width:${confPct}%; background:${confColor}"></span>
                    </span>
                </td>
                <td>
                    <span class="status-badge ${i.status}">
                        <span class="status-dot"></span>
                        ${i.status}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

// ─── Time Display ────────────────────────────────────────────────────────────

function updateClock() {
    const el = document.getElementById('clock');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    }) + '  ' + now.toLocaleTimeString('en-US', { hour12: false });
}

// ─── Filter Handlers ─────────────────────────────────────────────────────────

let activeFilter = 'all';

function setupFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            const stats = computeAnalytics();
            filterAndRenderTable(stats.recentIncidents);
        });
    });
}

function filterAndRenderTable(incidents) {
    const filtered = activeFilter === 'all'
        ? incidents
        : incidents.filter(i => i.type === activeFilter);
    renderIncidentsTable(filtered);
}

// ─── Init ────────────────────────────────────────────────────────────────────

function init() {
    seedMockData();
    const stats = computeAnalytics();

    renderSummaryCards(stats);
    renderTimelineChart(stats.dailyCounts);
    renderTypeDistribution(stats);
    renderGodownBreakdown(stats.godownStats);
    renderPeakHours(stats.hourlyTotals);
    renderRiskScores(stats.riskScores);
    renderSeverity(stats.severity);
    renderHeatmap(stats.heatmap);
    renderConfidenceChart(stats.avgConfByType);
    renderIncidentsTable(stats.recentIncidents);

    setupFilters();
    updateClock();
    setInterval(updateClock, 1000);

    // Animate risk bars on load
    requestAnimationFrame(() => {
        document.querySelectorAll('.risk-bar-fill').forEach(bar => {
            const width = bar.style.width;
            bar.style.width = '0%';
            requestAnimationFrame(() => { bar.style.width = width; });
        });
    });
}

document.addEventListener('DOMContentLoaded', init);
