/* ─── Tabs ──────────────────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'historial')  loadHistorial();
    if (btn.dataset.tab === 'mis-emails') loadRefs();
    if (btn.dataset.tab === 'guardadas')  loadGuardadasTab();
  });
});

/* ─── Zona chips ────────────────────────────────────────────── */
let zonaSeleccionada = 'GBA / Conurbano Bonaerense';

document.querySelectorAll('.zona-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.zona-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    zonaSeleccionada = chip.dataset.zona;
  });
});

/* ─── Estado global de búsqueda ─────────────────────────────── */
let _resultados     = [];
let _guardadas      = [];
let _todasGuardadas = [];
let _nicho          = '';
let _zona           = '';

/* ─── Buscar ────────────────────────────────────────────────── */
const nichInput  = document.getElementById('nicho-input');
const btnBuscar  = document.getElementById('btn-buscar');
const statusEl   = document.getElementById('search-status');
const resultados = document.getElementById('resultados');

btnBuscar.addEventListener('click', buscar);
nichInput.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });

async function buscar() {
  const nicho = nichInput.value.trim();
  if (!nicho) return;

  btnBuscar.disabled = true;
  resultados.innerHTML = '';
  document.getElementById('guardadas-section').classList.add('hidden');
  showStatus('loading', `<span class="spinner"></span>Buscando empresas de <strong>${nicho}</strong> en <strong>${zonaSeleccionada}</strong>…`);

  try {
    const res = await fetch('/api/buscar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nicho, zona: zonaSeleccionada }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error desconocido');

    if (data.error === 'sin_web_search') {
      _nicho = nicho;
      _zona  = data.zona || zonaSeleccionada;
      _guardadas = data.guardadasPrevias || [];
      renderSinWebSearch(nicho, data.sugerencias || []);
      renderGuardadas(_guardadas);
      return;
    }

    _resultados = data.resultados;
    _guardadas  = data.guardadasPrevias || [];
    _nicho      = nicho;
    _zona       = data.zona || zonaSeleccionada;

    hideStatus();
    renderResultados(_resultados);
    renderGuardadas(_guardadas);
  } catch (err) {
    showStatus('error', `❌ ${err.message}`);
  } finally {
    btnBuscar.disabled = false;
  }
}

function showStatus(type, html) {
  statusEl.className = `status ${type}`;
  statusEl.innerHTML = html;
  statusEl.classList.remove('hidden');
}
function hideStatus() { statusEl.classList.add('hidden'); }

/* ─── Sin web search: mostrar sugerencias ───────────────────── */
function renderSinWebSearch(nicho, sugerencias) {
  hideStatus();
  resultados.innerHTML = `
    <div class="sin-web-search">
      <div class="sin-web-search-icon">🔌</div>
      <h3>Búsqueda web no disponible</h3>
      <p>No se pudo acceder a internet para buscar empresas de <strong>${esc(nicho)}</strong> en tiempo real.</p>
      <p class="sin-web-search-sub">Podés buscarlas manualmente:</p>
      <ul class="sin-web-search-lista">
        ${sugerencias.map(s => `<li>${esc(s)}</li>`).join('')}
      </ul>
    </div>
  `;
}

/* ─── Render resultados (sin email aún) ─────────────────────── */
function renderResultados(empresas) {
  resultados.innerHTML = '';
  empresas.forEach((e, i) => {
    const card = document.createElement('div');
    card.className = 'empresa-card';
    card.innerHTML = `
      <div class="empresa-header">
        <div>
          <div class="empresa-nombre">${esc(e.nombre)}</div>
          <div class="empresa-meta">
            ${e.sitio_web ? `<a class="empresa-web-btn" href="${esc(e.sitio_web)}" target="_blank" rel="noopener">🌐 Sitio web</a>` : ''}
            ${e.email ? `<span class="empresa-email-tag">📧 ${esc(e.email)}</span>` : ''}
          </div>
        </div>
        ${e.tiene_rse ? '<span class="badge-rse">✅ Tiene RSE</span>' : ''}
      </div>
      <div class="empresa-body" id="body-r-${i}">
        ${renderEmailPlaceholder('r', i, e.nota_email)}
      </div>
    `;
    resultados.appendChild(card);
  });
}

/* ─── Render guardadas ──────────────────────────────────────── */
function renderGuardadas(empresas) {
  const section = document.getElementById('guardadas-section');
  const grid    = document.getElementById('guardadas-grid');

  if (!empresas.length) { section.classList.add('hidden'); return; }

  document.getElementById('guardadas-nicho-label').textContent = `${_nicho} · ${_zona}`;
  document.getElementById('guardadas-count').textContent =
    `${empresas.length} empresa${empresas.length !== 1 ? 's' : ''}`;

  grid.innerHTML = '';
  empresas.forEach(e => {
    const card = document.createElement('div');
    card.className = 'empresa-card guardada';
    card.id = `guardada-card-${e.id}`;
    card.innerHTML = `
      <div class="empresa-header">
        <div>
          <div class="empresa-nombre">${esc(e.nombre)}</div>
          <div class="empresa-meta">
            ${e.sitio_web ? `<a class="empresa-web-btn" href="${esc(e.sitio_web)}" target="_blank" rel="noopener">🌐 Sitio web</a>` : ''}
            ${e.email ? `<span class="empresa-email-tag">📧 ${esc(e.email)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          ${e.tiene_rse ? '<span class="badge-rse">✅ Tiene RSE</span>' : ''}
          <button class="btn-sm btn-danger" onclick="eliminarGuardada(${e.id})">🗑️</button>
        </div>
      </div>
      <div class="empresa-body" id="body-g-${e.id}">
        ${e.asunto
          ? renderEmailArea('g', e.id, e)
          : renderEmailPlaceholder('g', e.id, e.nota_email)}
      </div>
    `;
    grid.appendChild(card);
  });

  section.classList.remove('hidden');
}

/* ─── HTML helpers ──────────────────────────────────────────── */
function renderEmailPlaceholder(tipo, index, nota) {
  return `
    <div class="email-placeholder">
      ${nota ? `<div class="nota-email" style="margin-bottom:14px">ℹ️ ${esc(nota)}</div>` : ''}
      <button class="btn-primary" onclick="generarEmailCard('${tipo}', ${index})">✉️ Generar email</button>
    </div>
  `;
}

function renderEmailArea(tipo, index, e) {
  const tid = `cuerpo-${tipo}-${index}`;
  return `
    <div class="idea-box">
      <strong>💡 Idea de referencia</strong>
      <p>${esc(e.idea_referencia)}</p>
    </div>
    <div class="email-section">
      <label>Asunto</label>
      <div class="asunto-box">${esc(e.asunto)}</div>
      <label>Cuerpo del email</label>
      <textarea class="cuerpo-textarea" id="${tid}">${esc(e.cuerpo)}</textarea>
      ${e.nota_email ? `<div class="nota-email">ℹ️ ${esc(e.nota_email)}</div>` : ''}
    </div>
    <div class="card-actions">
      <button class="btn-sm btn-copy" onclick="copiarEmailCard('${tid}', this)">📋 Copiar email</button>
      <button class="btn-sm btn-audio" id="btn-audio-${tipo}-${index}" onclick="escuchar('${tid}', 'btn-audio-${tipo}-${index}', '${esc(e.asunto)}')">🔊 Escuchar</button>
      <button class="btn-sm btn-send" onclick="marcarEnviadoCard('${tipo}', ${index}, this)">✅ Marcar como enviado</button>
    </div>
  `;
}

/* ─── Generar email on demand ───────────────────────────────── */
async function generarEmailCard(tipo, index) {
  const bodyEl = document.getElementById(`body-${tipo}-${index}`);
  bodyEl.innerHTML = `<div class="status loading" style="margin:0"><span class="spinner"></span>Generando email…</div>`;

  try {
    const empresa = tipo === 'r'
      ? _resultados[index]
      : tipo === 'g'
      ? _guardadas.find(e => e.id === index)
      : _todasGuardadas.find(e => e.id === index);

    const nicho = tipo === 't' ? empresa.nicho : _nicho;
    const zona  = tipo === 't' ? empresa.zona  : _zona;

    const refs = await fetch('/api/emails-referencia').then(r => r.json());
    const res  = await fetch('/api/generar-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa,
        nicho,
        zona,
        guardadaId: empresa.guardadaId ?? empresa.id,
        emailsReferencia: refs,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error desconocido');

    Object.assign(empresa, data);
    bodyEl.innerHTML = renderEmailArea(tipo, index, empresa);
  } catch (err) {
    bodyEl.innerHTML = `
      <div class="status error" style="margin:0">
        ❌ ${esc(err.message)}
        <button class="btn-sm btn-danger" style="margin-left:10px" onclick="generarEmailCard('${tipo}', ${index})">Reintentar</button>
      </div>`;
  }
}

/* ─── Copiar email ──────────────────────────────────────────── */
function copiarEmailCard(textareaId, btn) {
  const textarea = document.getElementById(textareaId);
  navigator.clipboard.writeText(textarea.value).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✅ Copiado';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}

/* ─── TTS ───────────────────────────────────────────────────── */
let currentAudio = null;

async function escuchar(textareaId, btnId, asunto) {
  const textarea = document.getElementById(textareaId);
  const btn      = document.getElementById(btnId);
  const texto    = `Asunto: ${asunto}\n\n${textarea.value}`;

  if (currentAudio) { currentAudio.pause(); currentAudio = null; }

  btn.disabled = true;
  btn.textContent = '⏳ Generando audio…';

  try {
    const res = await fetch('/api/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    });
    if (!res.ok) throw new Error('Error al generar el audio');

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.play();
    btn.textContent = '🔊 Reproduciendo…';
    currentAudio.onended = () => { btn.textContent = '🔊 Escuchar'; btn.disabled = false; };
  } catch (err) {
    alert(err.message);
    btn.textContent = '🔊 Escuchar';
    btn.disabled = false;
  }
}

/* ─── Marcar como enviado ───────────────────────────────────── */
async function marcarEnviadoCard(tipo, index, btn) {
  const empresa = tipo === 'r'
    ? _resultados[index]
    : tipo === 'g'
    ? _guardadas.find(e => e.id === index)
    : _todasGuardadas.find(e => e.id === index);
  const textarea = document.getElementById(`cuerpo-${tipo}-${index}`);

  const payload = {
    empresa: empresa.nombre,
    nicho:   tipo === 't' ? empresa.nicho : _nicho,
    sitio_web:    empresa.sitio_web    || '',
    email_empresa: empresa.email       || '',
    asunto:       empresa.asunto       || '',
    cuerpo:       textarea.value,
    idea_referencia: empresa.idea_referencia || '',
    estado: 'enviado',
  };

  try {
    await fetch('/api/historial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    btn.textContent = '✅ Guardado en historial';
    btn.disabled = true;
  } catch (err) {
    alert('No se pudo guardar: ' + err.message);
  }
}

/* ─── Eliminar guardada ─────────────────────────────────────── */
async function eliminarGuardada(id) {
  if (!confirm('¿Quitar esta empresa de las guardadas?')) return;
  await fetch(`/api/empresas-guardadas/${id}`, { method: 'DELETE' });
  document.getElementById(`guardada-card-${id}`)?.remove();
  const remaining = document.querySelectorAll('.empresa-card.guardada').length;
  if (!remaining) {
    document.getElementById('guardadas-section').classList.add('hidden');
  } else {
    document.getElementById('guardadas-count').textContent =
      `${remaining} empresa${remaining !== 1 ? 's' : ''}`;
  }
}

/* ─── Tab Guardadas ─────────────────────────────────────────── */
async function loadGuardadasTab() {
  _todasGuardadas = await fetch('/api/empresas-guardadas').then(r => r.json());
  renderGuardadasTab(_todasGuardadas);

  document.getElementById('guardadas-tab-filtro').oninput = function () {
    const q = this.value.toLowerCase();
    renderGuardadasTab(_todasGuardadas.filter(e =>
      (e.nombre || '').toLowerCase().includes(q) ||
      (e.nicho  || '').toLowerCase().includes(q) ||
      (e.zona   || '').toLowerCase().includes(q)
    ));
  };
}

function renderGuardadasTab(empresas) {
  const grid  = document.getElementById('guardadas-tab-grid');
  const vacio = document.getElementById('guardadas-tab-vacio');
  const stats = document.getElementById('guardadas-tab-stats');

  const total  = _todasGuardadas.length;
  const nichos = [...new Set(_todasGuardadas.map(e => e.nicho).filter(Boolean))].length;
  stats.innerHTML = `
    <span class="stat-chip">📁 ${total} empresa${total !== 1 ? 's' : ''}</span>
    <span class="stat-chip">🏷️ ${nichos} rubro${nichos !== 1 ? 's' : ''}</span>
  `;

  if (!empresas.length) {
    grid.innerHTML = '';
    vacio.classList.remove('hidden');
    return;
  }
  vacio.classList.add('hidden');
  grid.innerHTML = '';

  empresas.forEach(e => {
    const card = document.createElement('div');
    card.className = 'empresa-card guardada';
    card.id = `tab-card-${e.id}`;
    card.innerHTML = `
      <div class="empresa-header">
        <div>
          <div class="empresa-nombre">${esc(e.nombre)}</div>
          <div class="empresa-meta">
            ${e.sitio_web ? `<a class="empresa-web-btn" href="${esc(e.sitio_web)}" target="_blank" rel="noopener">🌐 Sitio web</a>` : ''}
            ${e.email ? `<span class="empresa-email-tag">📧 ${esc(e.email)}</span>` : ''}
          </div>
          <div class="empresa-tags">
            <span class="tag-nicho">${esc(e.nicho)}</span>
            ${e.zona ? `<span class="tag-zona">${esc(e.zona)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          ${e.tiene_rse ? '<span class="badge-rse">✅ Tiene RSE</span>' : ''}
          <button class="btn-sm btn-danger" onclick="eliminarGuardadaTab(${e.id})">🗑️</button>
        </div>
      </div>
      <div class="empresa-body" id="body-t-${e.id}">
        ${e.asunto
          ? renderEmailArea('t', e.id, e)
          : renderEmailPlaceholder('t', e.id, e.nota_email)}
      </div>
    `;
    grid.appendChild(card);
  });
}

async function eliminarGuardadaTab(id) {
  if (!confirm('¿Quitar esta empresa de las guardadas?')) return;
  await fetch(`/api/empresas-guardadas/${id}`, { method: 'DELETE' });
  _todasGuardadas = _todasGuardadas.filter(e => e.id !== id);
  document.getElementById(`tab-card-${id}`)?.remove();
  renderGuardadasTab(_todasGuardadas);
}

/* ─── Historial ─────────────────────────────────────────────── */
let historialData = [];

async function loadHistorial() {
  historialData = await fetch('/api/historial').then(r => r.json());
  renderHistorial(historialData);
  renderStats(historialData);
}

function renderStats(data) {
  const statsEl = document.getElementById('historial-stats');
  const total  = data.length;
  const nichos = [...new Set(data.map(r => r.nicho).filter(Boolean))].length;
  statsEl.innerHTML = `
    <span class="stat-chip">📊 ${total} contacto${total !== 1 ? 's' : ''}</span>
    <span class="stat-chip">🏷️ ${nichos} rubro${nichos !== 1 ? 's' : ''}</span>
  `;
}

function renderHistorial(data) {
  const tbody = document.getElementById('historial-body');
  const vacio = document.getElementById('historial-vacio');

  if (!data.length) {
    tbody.innerHTML = '';
    vacio.classList.remove('hidden');
    return;
  }
  vacio.classList.add('hidden');

  tbody.innerHTML = data.map(r => `
    <tr>
      <td><strong>${esc(r.empresa)}</strong></td>
      <td>${esc(r.nicho || '—')}</td>
      <td>${r.email_empresa ? `<a href="mailto:${esc(r.email_empresa)}">${esc(r.email_empresa)}</a>` : '—'}</td>
      <td>${formatFecha(r.fecha)}</td>
      <td>
        <select class="badge-estado badge-${r.estado || 'enviado'}" onchange="cambiarEstado(${r.id}, this.value, this)">
          <option value="enviado"   ${r.estado === 'enviado'   ? 'selected' : ''}>Enviado</option>
          <option value="pendiente" ${r.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="sin-resp"  ${r.estado === 'sin-resp'  ? 'selected' : ''}>Sin respuesta</option>
        </select>
      </td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-sm btn-view"   onclick="verDetalle(${r.id})">👁️ Ver</button>
        <button class="btn-sm btn-danger" onclick="eliminarHistorial(${r.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('historial-filtro').addEventListener('input', function () {
  const q = this.value.toLowerCase();
  renderHistorial(historialData.filter(r =>
    (r.empresa || '').toLowerCase().includes(q) ||
    (r.nicho   || '').toLowerCase().includes(q)
  ));
});

async function cambiarEstado(id, estado, select) {
  select.className = `badge-estado badge-${estado}`;
  await fetch(`/api/historial/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado }),
  });
}

async function eliminarHistorial(id) {
  if (!confirm('¿Eliminar este contacto del historial?')) return;
  await fetch(`/api/historial/${id}`, { method: 'DELETE' });
  loadHistorial();
}

function verDetalle(id) {
  const r = historialData.find(x => x.id === id);
  if (!r) return;
  document.getElementById('modal-empresa').textContent = r.empresa;
  document.getElementById('modal-asunto').textContent  = r.asunto || '—';
  document.getElementById('modal-cuerpo').textContent  = r.cuerpo || '—';
  document.getElementById('modal').classList.remove('hidden');
}

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('modal').classList.add('hidden');
});
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === document.getElementById('modal'))
    document.getElementById('modal').classList.add('hidden');
});

function formatFecha(f) {
  if (!f) return '—';
  const d = new Date(f.replace(' ', 'T'));
  return isNaN(d) ? f : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ─── Emails de referencia ──────────────────────────────────── */
async function loadRefs() {
  const refs = await fetch('/api/emails-referencia').then(r => r.json());
  const lista = document.getElementById('lista-refs');
  lista.innerHTML = '';

  if (!refs.length) {
    lista.innerHTML = '<p class="empty-msg">Todavía no guardaste emails de referencia.</p>';
    return;
  }

  refs.forEach(r => {
    const card = document.createElement('div');
    card.className = 'ref-card';
    card.innerHTML = `
      <div class="ref-card-header">
        <span class="ref-titulo">${esc(r.titulo || 'Sin título')}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="ref-fecha">${formatFecha(r.fecha)}</span>
          <button class="btn-sm btn-danger" onclick="eliminarRef(${r.id})">🗑️</button>
        </div>
      </div>
      <pre class="ref-preview">${esc(r.contenido)}</pre>
    `;
    lista.appendChild(card);
  });
}

document.getElementById('btn-guardar-ref').addEventListener('click', async () => {
  const titulo    = document.getElementById('ref-titulo').value.trim();
  const contenido = document.getElementById('ref-contenido').value.trim();
  if (!contenido) return alert('El contenido del email es obligatorio.');

  await fetch('/api/emails-referencia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titulo, contenido }),
  });

  document.getElementById('ref-titulo').value    = '';
  document.getElementById('ref-contenido').value = '';
  loadRefs();
});

async function eliminarRef(id) {
  if (!confirm('¿Eliminar este email de referencia?')) return;
  await fetch(`/api/emails-referencia/${id}`, { method: 'DELETE' });
  loadRefs();
}

/* ─── Utils ─────────────────────────────────────────────────── */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
