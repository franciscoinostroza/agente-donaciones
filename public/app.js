/* ─── Tabs ──────────────────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'historial') loadHistorial();
    if (btn.dataset.tab === 'mis-emails') loadRefs();
  });
});

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
  showStatus('loading', `<span class="spinner"></span>Buscando empresas de <strong>${nicho}</strong>… esto puede tardar 20–40 segundos.`);

  try {
    const refs = await fetch('/api/emails-referencia').then(r => r.json());
    const res = await fetch('/api/buscar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nicho, emailsReferencia: refs }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error desconocido');

    hideStatus();
    renderResultados(data.resultados, nicho);
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

/* ─── Renderizar resultados ─────────────────────────────────── */
function renderResultados(empresas, nicho) {
  resultados.innerHTML = '';
  empresas.forEach((e, i) => {
    const card = document.createElement('div');
    card.className = 'empresa-card';
    card.innerHTML = `
      <div class="empresa-header">
        <div>
          <div class="empresa-nombre">${esc(e.nombre)}</div>
          <div class="empresa-meta">
            ${e.sitio_web ? `<a href="${esc(e.sitio_web)}" target="_blank" rel="noopener">🌐 ${esc(e.sitio_web)}</a>` : ''}
            ${e.email ? ` &nbsp;|&nbsp; 📧 ${esc(e.email)}` : ''}
          </div>
        </div>
        ${e.tiene_rse ? '<span class="badge-rse">✅ Tiene RSE</span>' : ''}
      </div>

      <div class="empresa-body">
        <div class="idea-box">
          <strong>💡 Idea de referencia</strong>
          <p>${esc(e.idea_referencia)}</p>
        </div>

        <div class="email-section">
          <label>Asunto</label>
          <div class="asunto-box">${esc(e.asunto)}</div>

          <label>Cuerpo del email</label>
          <textarea class="cuerpo-textarea" id="cuerpo-${i}">${esc(e.cuerpo)}</textarea>

          ${e.nota_email ? `<div class="nota-email">ℹ️ ${esc(e.nota_email)}</div>` : ''}
        </div>

        <div class="card-actions">
          <button class="btn-sm btn-copy" onclick="copiarEmail(${i})">📋 Copiar email</button>
          <button class="btn-sm btn-audio" id="btn-audio-${i}" onclick="escuchar(${i}, '${esc(e.asunto)}')">🔊 Escuchar</button>
          <button class="btn-sm btn-send" onclick="marcarEnviado(${i}, ${JSON.stringify(e).replace(/"/g, '&quot;')}, '${esc(nicho)}')">✅ Marcar como enviado</button>
        </div>
      </div>
    `;
    resultados.appendChild(card);
  });
}

/* ─── Copiar email ──────────────────────────────────────────── */
function copiarEmail(i) {
  const textarea = document.getElementById(`cuerpo-${i}`);
  navigator.clipboard.writeText(textarea.value).then(() => {
    const btn = document.querySelector(`[onclick="copiarEmail(${i})"]`);
    const orig = btn.textContent;
    btn.textContent = '✅ Copiado';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}

/* ─── TTS ───────────────────────────────────────────────────── */
let currentAudio = null;

async function escuchar(i, asunto) {
  const textarea = document.getElementById(`cuerpo-${i}`);
  const btn = document.getElementById(`btn-audio-${i}`);
  const texto = `Asunto: ${asunto}\n\n${textarea.value}`;

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
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.play();
    btn.textContent = '🔊 Reproduciendo…';
    currentAudio.onended = () => {
      btn.textContent = '🔊 Escuchar';
      btn.disabled = false;
    };
  } catch (err) {
    alert(err.message);
    btn.textContent = '🔊 Escuchar';
    btn.disabled = false;
  }
}

/* ─── Marcar como enviado ───────────────────────────────────── */
async function marcarEnviado(i, empresa, nicho) {
  const textarea = document.getElementById(`cuerpo-${i}`);
  const payload = {
    empresa: empresa.nombre,
    nicho,
    sitio_web: empresa.sitio_web || '',
    email_empresa: empresa.email || '',
    asunto: empresa.asunto,
    cuerpo: textarea.value,
    idea_referencia: empresa.idea_referencia || '',
    estado: 'enviado',
  };

  try {
    await fetch('/api/historial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const btn = document.querySelector(`[onclick*="marcarEnviado(${i},"]`);
    btn.textContent = '✅ Guardado en historial';
    btn.disabled = true;
  } catch (err) {
    alert('No se pudo guardar: ' + err.message);
  }
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
  const total = data.length;
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
          <option value="enviado"   ${r.estado === 'enviado'    ? 'selected' : ''}>Enviado</option>
          <option value="pendiente" ${r.estado === 'pendiente'  ? 'selected' : ''}>Pendiente</option>
          <option value="sin-resp"  ${r.estado === 'sin-resp'   ? 'selected' : ''}>Sin respuesta</option>
        </select>
      </td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-sm btn-view" onclick="verDetalle(${r.id})">👁️ Ver</button>
        <button class="btn-sm btn-danger" onclick="eliminarHistorial(${r.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('historial-filtro').addEventListener('input', function () {
  const q = this.value.toLowerCase();
  const filtrado = historialData.filter(r =>
    (r.empresa || '').toLowerCase().includes(q) ||
    (r.nicho || '').toLowerCase().includes(q)
  );
  renderHistorial(filtrado);
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
  document.getElementById('modal-asunto').textContent = r.asunto || '—';
  document.getElementById('modal-cuerpo').textContent = r.cuerpo || '—';
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
  const titulo = document.getElementById('ref-titulo').value.trim();
  const contenido = document.getElementById('ref-contenido').value.trim();
  if (!contenido) return alert('El contenido del email es obligatorio.');

  await fetch('/api/emails-referencia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titulo, contenido }),
  });

  document.getElementById('ref-titulo').value = '';
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
