/* 建築CAD/CGソフトウェア系譜 3Dネットワーク
 * データ元：2015年度卒業論文『建築デザインとコンピューター発展の関係』資料編
 *
 * 表現方針：発光する微粒子＋細いフィラメントの集合として描く。
 * ノードは「小さな光の芯＋柔らかいハロー」のスプライト、
 * リンクは低不透明度の細線、全体にブルームとフォグをかける。
 */
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import SpriteText from 'three-spritetext';

const PALETTE = {
  '2dcad': '#5aa7ff',
  '3dcad': '#41e6a4',
  '3dcg': '#ff6fb3',
  'bim': '#ffc45e',
  plugin: '#a99df5',
  company: '#f4f1e6',
  companyHalo: '#cfd8e8',
  absorbed: '#5d5c55',
  linkDevelops: '#7f96ad',
  linkAcquires: '#ff5d5d',
  linkPartners: '#3fd6a0',
  linkIntegrates: '#a99df5',
};

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

// ---------- glow sprite textures ----------
function makeGlowTexture(innerStop, midStop) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(innerStop, 'rgba(255,255,255,0.55)');
  g.addColorStop(midStop, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const coreTexture = makeGlowTexture(0.18, 0.42);
const haloTexture = makeGlowTexture(0.05, 0.22);

function makeSprite(texture, color, scale, opacity) {
  const mat = new THREE.SpriteMaterial({
    map: texture,
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false, // keep node glow bright regardless of camera distance
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

// ---------- data load ----------
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

// ---------- meta computation ----------
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
  // 3d-force-graph mutates link.source/target into object references once
  // rendered; keep a pristine string-id copy for lookups and re-filtering.
  data._linksPristine = data.links.map(l => ({ ...l }));
  return data;
}

// ---------- node visual construction ----------
function nodeVisual(n) {
  const group = new THREE.Group();
  const style = currentStyle(n);

  const halo = makeSprite(haloTexture, style.color, style.haloScale, 0.85);
  const core = makeSprite(coreTexture, style.coreColor, style.coreScale, 1.0);
  group.add(halo);
  group.add(core);

  let label = null;
  if (n.type !== 'plugin') {
    label = new SpriteText(n.name);
    label.color = style.labelColor;
    label.textHeight = n.type === 'company' ? 4.2 : 3.4;
    label.fontFace = 'Avenir Next, Helvetica Neue, Segoe UI, Hiragino Sans, sans-serif';
    label.fontWeight = '500';
    label.material.transparent = true;
    label.material.opacity = style.labelOpacity;
    label.material.depthWrite = false;
    label.material.fog = false;
    label.center.set(0.5, 1.7);
    group.add(label);
  }

  n.__halo = halo;
  n.__core = core;
  n.__label = label;
  return group;
}

function currentStyle(n) {
  const year = state.year;
  if (n.type === 'software') {
    const c = PALETTE[n.category] || PALETTE['3dcad'];
    return { color: c, coreColor: c, coreScale: 7, haloScale: 24, labelColor: '#c8d2da', labelOpacity: 0.85 };
  }
  if (n.type === 'plugin') {
    return { color: PALETTE.plugin, coreColor: PALETTE.plugin, coreScale: 4.5, haloScale: 13, labelColor: '#9a93c9', labelOpacity: 0.6 };
  }
  // company
  if (n.status === 'absorbed' && n.absorbedYear != null && year >= n.absorbedYear) {
    return { color: PALETTE.absorbed, coreColor: '#8a897f', coreScale: 4, haloScale: 10, labelColor: '#6f6e66', labelOpacity: 0.55 };
  }
  return { color: PALETTE.companyHalo, coreColor: PALETTE.company, coreScale: 7.5, haloScale: 24, labelColor: '#efe9d6', labelOpacity: 0.95 };
}

function applyStyles(nodes) {
  nodes.forEach(n => {
    if (!n.__core) return;
    const s = currentStyle(n);
    n.__core.material.color.set(s.coreColor);
    n.__core.scale.set(s.coreScale, s.coreScale, 1);
    n.__halo.material.color.set(s.color);
    n.__halo.scale.set(s.haloScale, s.haloScale, 1);
    if (n.__label) {
      n.__label.color = s.labelColor;
      n.__label.material.opacity = s.labelOpacity;
    }
  });
}

// ---------- graph init ----------
function initGraph() {
  Graph = ForceGraph3D()(document.getElementById('graph'))
    .backgroundColor('#05060a')
    .showNavInfo(false)
    .nodeThreeObject(nodeVisual)
    .nodeLabel(nodeTooltip)
    .linkColor(l => linkColor(l))
    .linkWidth(0)                    // width 0 -> plain THREE.Line (thin filament)
    .linkOpacity(0.5)
    .linkCurvature(0.18)
    .linkDirectionalParticles(l => (l.type === 'acquires' ? 4 : l.type === 'integrates' ? 2 : 0))
    .linkDirectionalParticleWidth(1.4)
    .linkDirectionalParticleSpeed(0.0045)
    .linkDirectionalParticleColor(l => linkColor(l))
    .enableNodeDrag(false)
    .onNodeClick(handleNodeClick)
    .onNodeHover(n => { document.body.style.cursor = n ? 'pointer' : 'default'; })
    .onBackgroundClick(() => closeInfo());

  const chargeForce = Graph.d3Force('charge');
  if (chargeForce) chargeForce.strength(-60);
  const linkForce = Graph.d3Force('link');
  if (linkForce) linkForce.distance(l => (l.type === 'develops' ? 34 : l.type === 'acquires' ? 48 : 40));
  Graph.d3Force('radial', radialGravity(0.05));

  // --- atmosphere: fog + dust particles ---
  const scene = Graph.scene();
  scene.fog = new THREE.FogExp2(0x05060a, 0.0011);
  scene.add(makeDust());

  // --- bloom ---
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.9,    // strength
    0.45,   // radius
    0.08    // threshold: keep the dark background from washing out
  );
  Graph.postProcessingComposer().addPass(bloom);

  // --- cinematic slow rotation, paused while the user interacts ---
  const controls = Graph.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;
  let idleTimer = null;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
  });
  controls.addEventListener('end', () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { controls.autoRotate = true; }, 9000);
  });

  let hasFit = false;
  Graph.onEngineStop(() => {
    if (!hasFit) {
      hasFit = true;
      Graph.zoomToFit(1200, 10);
    }
  });

  window.addEventListener('resize', () => {
    Graph.width(window.innerWidth).height(window.innerHeight);
    bloom.setSize(window.innerWidth, window.innerHeight);
  });

  // console access for the curious
  window.GRAPH = Graph;
}

function makeDust() {
  const count = 700;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // uniform-ish in a large sphere shell so dust surrounds the graph
    const r = 240 + Math.random() * 520;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.9,
    map: coreTexture,
    color: 0x2c3a55,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
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
    case 'acquires': return PALETTE.linkAcquires;
    case 'partners': return PALETTE.linkPartners;
    case 'integrates': return PALETTE.linkIntegrates;
    case 'plugin_of': return PALETTE.linkIntegrates;
    default: return PALETTE.linkDevelops;
  }
}

function nodeTooltip(n) {
  const sub = n.type === 'software'
    ? (developerName(n) || '')
    : n.type === 'company'
      ? (n.status === 'absorbed' ? '企業（買収・統合済み）' : '企業')
      : 'プラグイン';
  return `<div style="font:12px/1.5 system-ui,sans-serif;background:rgba(5,6,10,0.88);border:1px solid rgba(255,255,255,0.14);padding:6px 10px;border-radius:6px;color:#fff;letter-spacing:0.02em">
    <strong>${escapeHtml(n.name)}</strong><br><span style="color:#9fa8b5">${escapeHtml(sub)}</span>
  </div>`;
}

function developerName(softwareNode) {
  const link = state.data._linksPristine.find(l => l.type === 'develops' && l.target === softwareNode.id);
  if (!link) return null;
  const dev = state.data._byId.get(link.source);
  return dev ? dev.name : null;
}

// ---------- render ----------
function render() {
  const data = state.data;
  const year = state.year;

  const nodes = data.nodes.filter(n => nodeVisible(n, year));
  const visibleIds = new Set(nodes.map(n => n.id));
  const links = data._linksPristine
    .filter(l => linkVisible(l, year, visibleIds))
    .map(l => ({ ...l }));

  Graph.graphData({ nodes, links });
  applyStyles(nodes);
}

function nodeVisible(n, year) {
  if (n.appearYear != null && n.appearYear > year) return false;
  if (n.type === 'software') return state.activeTags.has(n.category);
  if (n.type === 'company') return state.activeTags.has('company');
  return true;
}

function linkVisible(l, year, visibleIds) {
  if (l.year != null && l.year > year) return false;
  if (!visibleIds.has(l.source) || !visibleIds.has(l.target)) return false;
  if ((l.type === 'acquires' || l.type === 'partners') && !state.activeTags.has('acquires')) return false;
  return true;
}

// ---------- info panel ----------
function handleNodeClick(node) {
  const distance = 95;
  const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
  Graph.cameraPosition(
    { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
    node,
    1100
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
  if (state.playing) stopPlay();
  else startPlay();
});

function startPlay() {
  state.playing = true;
  els.playBtn.textContent = '⏸';
  if (state.year >= state.yearMax) state.year = state.yearMin;
  state.playTimer = setInterval(() => {
    state.year += 1;
    if (state.year > state.yearMax) { stopPlay(); return; }
    els.slider.value = state.year;
    els.yearLabel.textContent = state.year;
    render();
  }, 500);
}

function stopPlay() {
  state.playing = false;
  els.playBtn.textContent = '▶';
  clearInterval(state.playTimer);
}

els.infoToggle.addEventListener('click', () => els.aboutPanel.classList.toggle('hidden'));
els.aboutClose.addEventListener('click', () => els.aboutPanel.classList.add('hidden'));
els.infoClose.addEventListener('click', closeInfo);
