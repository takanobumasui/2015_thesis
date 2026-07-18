/* 建築CAD/CGソフトウェア系譜 3Dネットワーク
 * データ元：2015年度卒業論文『建築デザインとコンピューター発展の関係』資料編
 */

const state = {
  data: null,
  activeTags: new Set(['2dcad', '3dcad', '3dcg', 'bim', 'company', 'acquires']),
  year: null,
  yearMin: 1970,
  yearMax: 2014,
  playing: false,
  playTimer: null,
};

const els = {
  loading: document.getElementById('loading'),
  slider: document.getElementById('year-slider'),
  yearLabel: document.getElementById('year-label'),
  playBtn: document.getElementById('play-btn'),
  chips: Array.from(document.querySelectorAll('.chip')),
  infoToggle: document.getElementById('info-toggle'),
  aboutPanel: document.getElementById('about-panel'),
  aboutClose: document.getElementById('about-close'),
  infoPanel: document.getElementById('info-panel'),
  infoClose: document.getElementById('info-close'),
  infoContent: document.getElementById('info-content'),
};

let Graph = null;

fetch('data/software-graph.json')
  .then(r => r.json())
  .then(json => {
    state.data = computeMeta(json);
    const years = state.data.nodes.map(n => n.appearYear).filter(y => y != null);
    state.yearMin = Math.min(...years);
    state.yearMax = 2014;
    state.year = state.yearMax;

    els.slider.min = state.yearMin;
    els.slider.max = state.yearMax;
    els.slider.value = state.yearMax;
    els.yearLabel.textContent = state.yearMax;

    initGraph();
    render();
    els.loading.classList.add('hidden');
  })
  .catch(err => {
    els.loading.textContent = 'データの読み込みに失敗しました: ' + err.message;
    console.error(err);
  });

// ---------- meta computation (appear year / absorbed year) ----------
function computeMeta(data) {
  const byId = new Map(data.nodes.map(n => [n.id, n]));

  data.nodes.forEach(n => {
    if (n.type === 'software' && n.history && n.history.length) {
      const years = n.history.map(h => h[0]);
      n.firstYear = Math.min(...years);
      n.lastYear = Math.max(...years);
    }
  });

  const datedYears = new Map();
  data.links.forEach(l => {
    if (l.year == null) return;
    [l.source, l.target].forEach(id => {
      if (!datedYears.has(id)) datedYears.set(id, []);
      datedYears.get(id).push(l.year);
    });
  });

  data.nodes.forEach(n => {
    if (n.type === 'company') {
      const years = (datedYears.get(n.id) || []).slice();
      data.links
        .filter(l => l.type === 'develops' && l.source === n.id)
        .forEach(l => {
          const t = byId.get(l.target);
          if (t && t.firstYear != null) years.push(t.firstYear);
        });
      n.appearYear = years.length ? Math.min(...years) : state.yearMin;
    } else if (n.type === 'software') {
      n.appearYear = n.firstYear != null ? n.firstYear : state.yearMin;
    } else if (n.type === 'plugin') {
      const parentLink = data.links.find(l => l.type === 'plugin_of' && l.target === n.id);
      const parent = parentLink ? byId.get(parentLink.source) : null;
      n.appearYear = parent && parent.firstYear != null ? parent.firstYear : 1990;
    }
  });

  data.nodes.forEach(n => {
    if (n.type === 'company' && n.status === 'absorbed') {
      const l = data.links.find(l => l.type === 'acquires' && l.target === n.id);
      n.absorbedYear = l ? l.year : null;
    }
  });

  data._byId = byId;
  // 3d-force-graph mutates link.source/target from id strings into node object
  // references in place once passed to graphData(). Keep a pristine copy with
  // plain string ids for lookups (info panel, tooltips) that survives re-renders.
  data._linksPristine = data.links.map(l => ({ ...l }));
  return data;
}

// ---------- graph init ----------
function initGraph() {
  Graph = ForceGraph3D()(document.getElementById('graph'))
    .backgroundColor('#0d0d0d')
    .showNavInfo(false)
    .nodeRelSize(4.2)
    .nodeResolution(16)
    .nodeOpacity(0.95)
    .nodeLabel(nodeTooltip)
    .nodeColor(n => n.__color)
    .nodeVal(n => n.__val)
    .linkColor(l => linkColor(l))
    .linkWidth(l => (l.type === 'acquires' ? 1.6 : l.type === 'partners' ? 1.1 : 0.6))
    .linkOpacity(0.45)
    .linkCurvature(0.12)
    .linkDirectionalParticles(l => (l.type === 'acquires' ? 3 : l.type === 'integrates' ? 2 : 0))
    .linkDirectionalParticleWidth(1.6)
    .linkDirectionalParticleSpeed(0.006)
    .linkDirectionalParticleColor(l => linkColor(l))
    .enableNodeDrag(false)
    .onNodeClick(handleNodeClick)
    .onNodeHover(n => {
      document.body.style.cursor = n ? 'pointer' : 'default';
    })
    .onBackgroundClick(() => closeInfo());

  const chargeForce = Graph.d3Force('charge');
  if (chargeForce) chargeForce.strength(-45);
  const linkForce = Graph.d3Force('link');
  if (linkForce) linkForce.distance(l => (l.type === 'develops' ? 26 : l.type === 'acquires' ? 36 : 30));
  // disconnected clusters (e.g. Jw_cad, Illustrator) have nothing pulling them
  // toward the rest of the graph; add a gentle gravity well so everything
  // stays in one visible cloud instead of drifting apart indefinitely.
  Graph.d3Force('radial', radialGravity(0.045));

  let hasFit = false;
  Graph.onEngineStop(() => {
    if (!hasFit) {
      hasFit = true;
      Graph.zoomToFit(800, 40);
    }
  });

  window.addEventListener('resize', () => {
    Graph.width(window.innerWidth).height(window.innerHeight);
  });
}

function radialGravity(strength) {
  let nodes = [];
  function force(alpha) {
    nodes.forEach(n => {
      n.vx -= n.x * strength * alpha;
      n.vy -= n.y * strength * alpha;
      n.vz -= n.z * strength * alpha;
    });
  }
  force.initialize = ns => { nodes = ns; };
  return force;
}

function linkColor(l) {
  switch (l.type) {
    case 'acquires': return '#e66767';
    case 'partners': return '#199e70';
    case 'integrates': return '#9085e9';
    case 'plugin_of': return '#9085e9';
    default: return 'rgba(195,194,183,0.55)'; // develops
  }
}

function nodeTooltip(n) {
  const sub = n.type === 'software'
    ? (developerName(n) || '')
    : n.type === 'company'
      ? (n.status === 'absorbed' ? '企業（買収・統合済み）' : '企業')
      : 'プラグイン';
  return `<div style="font:12px/1.5 system-ui,sans-serif;background:rgba(13,13,13,0.9);border:1px solid rgba(255,255,255,0.15);padding:6px 10px;border-radius:6px;color:#fff">
    <strong>${escapeHtml(n.name)}</strong><br><span style="color:#c3c2b7">${escapeHtml(sub)}</span>
  </div>`;
}

function developerName(softwareNode) {
  const link = state.data._linksPristine.find(l => l.type === 'develops' && l.target === softwareNode.id);
  if (!link) return null;
  const dev = state.data._byId.get(link.source);
  return dev ? dev.name : null;
}

// ---------- render (year + tag filter -> graphData) ----------
function render() {
  const data = state.data;
  const year = state.year;

  const nodes = data.nodes.filter(n => nodeVisible(n, year));
  const visibleIds = new Set(nodes.map(n => n.id));
  // clone from the pristine list every time: 3d-force-graph mutates
  // link.source/target in place, and re-filtering must start from plain ids.
  const links = data._linksPristine
    .filter(l => linkVisible(l, year, visibleIds))
    .map(l => ({ ...l }));

  nodes.forEach(n => {
    const style = styleForNode(n, year, data);
    n.__color = style.color;
    n.__val = style.val;
  });

  Graph.graphData({ nodes, links });
}

function nodeVisible(n, year) {
  if (n.appearYear != null && n.appearYear > year) return false;
  if (n.type === 'software') return state.activeTags.has(n.category);
  if (n.type === 'company') return state.activeTags.has('company');
  return true; // plugin
}

function linkVisible(l, year, visibleIds) {
  if (l.year != null && l.year > year) return false;
  if (!visibleIds.has(l.source) || !visibleIds.has(l.target)) return false;
  if ((l.type === 'acquires' || l.type === 'partners') && !state.activeTags.has('acquires')) return false;
  return true;
}

function styleForNode(n, year, data) {
  if (n.type === 'software') {
    return { color: data.category_colors[n.category] || '#3987e5', val: 3.2 };
  }
  if (n.type === 'plugin') {
    return { color: data.plugin_color, val: 1.5 };
  }
  // company
  if (n.status === 'absorbed') {
    if (n.absorbedYear != null && year >= n.absorbedYear) {
      return { color: data.absorbed_color, val: 1.6 };
    }
    return { color: '#8a8a80', val: 4.2 };
  }
  return { color: data.company_color, val: 6.2 };
}

// ---------- info panel ----------
function handleNodeClick(node) {
  const distance = 85;
  const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
  Graph.cameraPosition(
    { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
    node,
    900
  );
  showInfo(node);
}

function showInfo(node) {
  els.infoContent.innerHTML = buildInfoHtml(node);
  els.infoPanel.classList.remove('hidden');
}

function closeInfo() {
  els.infoPanel.classList.add('hidden');
}

function buildInfoHtml(node) {
  const data = state.data;
  let html = '';
  const typeLabel = node.type === 'software' ? 'ソフトウェア' : node.type === 'company' ? '企業 / 組織' : 'プラグイン';
  html += `<h2>${escapeHtml(node.name)}</h2>`;

  if (node.type === 'software') {
    const dev = developerName(node);
    html += `<div class="meta">${typeLabel}${dev ? ' ・ 開発元: ' + escapeHtml(dev) : ''}</div>`;
    if (node.tags && node.tags.length) {
      html += '<div class="tag-row">' + node.tags.map(t => `<span class="tag-pill">#${escapeHtml(t)}</span>`).join('') + '</div>';
    }
    if (node.notes) html += `<div class="notes">${escapeHtml(node.notes)}</div>`;
    if (node.history && node.history.length) {
      html += '<h3>沿革</h3>';
      node.history.slice().sort((a, b) => a[0] - b[0]).forEach(([y, text]) => {
        html += `<div class="history-item"><span class="history-year">${y}</span><span class="history-text">${escapeHtml(text)}</span></div>`;
      });
    }
    if (node.plugins && node.plugins.length) {
      html += '<h3>プラグイン・拡張機能</h3><ul class="plugin-list">' + node.plugins.map(p => `<li>${escapeHtml(p)}</li>`).join('') + '</ul>';
    }
  } else if (node.type === 'company') {
    html += `<div class="meta">${typeLabel}${node.status === 'absorbed' ? ' ・ 買収・統合済み' : ''}</div>`;
    if (node.notes) html += `<div class="notes">${escapeHtml(node.notes)}</div>`;

    const develops = data._linksPristine.filter(l => l.type === 'develops' && l.source === node.id)
      .map(l => data._byId.get(l.target)).filter(Boolean);
    if (develops.length) {
      html += '<h3>開発したソフトウェア</h3><ul class="link-list">' +
        develops.map(s => `<li>${escapeHtml(s.name)}</li>`).join('') + '</ul>';
    }

    const events = data._linksPristine.filter(l => (l.type === 'acquires' || l.type === 'partners') && (l.source === node.id || l.target === node.id));
    if (events.length) {
      html += '<h3>買収・提携の経緯</h3><ul class="link-list">' +
        events.sort((a, b) => (a.year || 0) - (b.year || 0)).map(l => {
          return `<li>${l.year != null ? `<span class="link-year">${l.year}</span>` : ''}${escapeHtml(l.label || '')}</li>`;
        }).join('') + '</ul>';
    }
  } else {
    html += `<div class="meta">${typeLabel}</div>`;
    if (node.notes) html += `<div class="notes">${escapeHtml(node.notes)}</div>`;
    const parentLink = data._linksPristine.find(l => l.type === 'plugin_of' && l.target === node.id);
    const parent = parentLink ? data._byId.get(parentLink.source) : null;
    if (parent) html += `<div class="meta">対応ソフトウェア: ${escapeHtml(parent.name)}</div>`;
  }

  return html;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- controls ----------
els.slider.addEventListener('input', () => {
  state.year = Number(els.slider.value);
  els.yearLabel.textContent = state.year;
  render();
});

els.chips.forEach(chip => {
  chip.classList.add('active');
  chip.addEventListener('click', () => {
    const tag = chip.dataset.tag;
    if (state.activeTags.has(tag)) {
      state.activeTags.delete(tag);
      chip.classList.remove('active');
    } else {
      state.activeTags.add(tag);
      chip.classList.add('active');
    }
    render();
  });
});

els.playBtn.addEventListener('click', () => {
  if (state.playing) {
    stopPlay();
  } else {
    startPlay();
  }
});

function startPlay() {
  state.playing = true;
  els.playBtn.textContent = '⏸';
  if (state.year >= state.yearMax) {
    state.year = state.yearMin;
  }
  state.playTimer = setInterval(() => {
    state.year += 1;
    if (state.year > state.yearMax) {
      stopPlay();
      return;
    }
    els.slider.value = state.year;
    els.yearLabel.textContent = state.year;
    render();
  }, 450);
}

function stopPlay() {
  state.playing = false;
  els.playBtn.textContent = '▶';
  clearInterval(state.playTimer);
}

els.infoToggle.addEventListener('click', () => {
  els.aboutPanel.classList.toggle('hidden');
});
els.aboutClose.addEventListener('click', () => els.aboutPanel.classList.add('hidden'));
els.infoClose.addEventListener('click', closeInfo);
