require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');
const path = require('path');
const db = require('./database');

const app = express();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── BUSCAR ──────────────────────────────────────────────────────────────────

app.post('/api/buscar', async (req, res) => {
  try {
    const { nicho, zona = 'GBA / Conurbano Bonaerense', emailsReferencia = [] } = req.body;
    if (!nicho?.trim()) return res.status(400).json({ error: 'El nicho es requerido.' });

    const nichoNorm = nicho.trim();
    const zonaNorm  = zona.trim() || 'GBA / Conurbano Bonaerense';
    const guardadasPrevias = db.getEmpresasGuardadas(nichoNorm, zonaNorm);
    const nombresYaBuscados = guardadasPrevias.map(e => e.nombre);

    const empresas = await buscarEmpresas(nichoNorm, zonaNorm, nombresYaBuscados);
    if (!empresas.length) return res.status(404).json({ error: 'No se encontraron empresas. Intentá con otro nicho.' });

    const resultados = empresas.map(e => ({
      nombre:    e.nombre,
      sitio_web: e.sitio_web || '',
      email:     e.email     || '',
      tiene_rse: e.tiene_rse || false,
      nota_email: e.nota_email || '',
      guardadaId: db.addEmpresaGuardada({
        nicho: nichoNorm, zona: zonaNorm,
        nombre: e.nombre, sitio_web: e.sitio_web || '',
        email: e.email || '', tiene_rse: e.tiene_rse ? 1 : 0,
        nota_email: e.nota_email || '',
        idea_referencia: '', asunto: '', cuerpo: '',
      }),
    }));

    res.json({ resultados, guardadasPrevias, zona: zonaNorm });
  } catch (err) {
    console.error('[/api/buscar]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GENERAR EMAIL ────────────────────────────────────────────────────────────

app.post('/api/generar-email', async (req, res) => {
  try {
    const { empresa, nicho, guardadaId, emailsReferencia = [] } = req.body;
    if (!empresa || !nicho) return res.status(400).json({ error: 'Datos insuficientes.' });

    const emailData = await generarEmail(empresa, nicho.trim(), emailsReferencia);

    if (guardadaId) {
      db.updateEmpresaGuardadaEmail(guardadaId, {
        idea_referencia: emailData.idea_referencia,
        asunto: emailData.asunto,
        cuerpo: emailData.cuerpo,
      });
    }

    res.json(emailData);
  } catch (err) {
    console.error('[/api/generar-email]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── EMPRESAS GUARDADAS ───────────────────────────────────────────────────────

app.get('/api/empresas-guardadas', (req, res) => {
  res.json(db.getEmpresasGuardadas(req.query.nicho || null));
});

app.delete('/api/empresas-guardadas/:id', (req, res) => {
  db.deleteEmpresaGuardada(req.params.id);
  res.json({ ok: true });
});

// ─── AUDIO TTS ────────────────────────────────────────────────────────────────

app.post('/api/audio', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ error: 'Texto requerido.' });

    return res.status(501).json({ error: 'TTS no configurado.' });
  } catch (err) {
    console.error('[/api/audio]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── HISTORIAL ────────────────────────────────────────────────────────────────

app.get('/api/historial', (_req, res) => {
  res.json(db.getHistorial());
});

app.post('/api/historial', (req, res) => {
  const id = db.addHistorial({ estado: 'enviado', ...req.body });
  res.json({ id });
});

app.patch('/api/historial/:id', (req, res) => {
  db.updateHistorial(req.params.id, req.body);
  res.json({ ok: true });
});

app.delete('/api/historial/:id', (req, res) => {
  db.deleteHistorial(req.params.id);
  res.json({ ok: true });
});

// ─── EMAILS DE REFERENCIA ─────────────────────────────────────────────────────

app.get('/api/emails-referencia', (_req, res) => {
  res.json(db.getEmailsReferencia());
});

app.post('/api/emails-referencia', (req, res) => {
  const id = db.addEmailReferencia(req.body);
  res.json({ id });
});

app.delete('/api/emails-referencia/:id', (req, res) => {
  db.deleteEmailReferencia(req.params.id);
  res.json({ ok: true });
});

// ─── FUNCIONES DE IA ──────────────────────────────────────────────────────────

async function buscarEmpresas(nicho, zona, nombresYaBuscados = []) {
  const exclusionText = nombresYaBuscados.length
    ? `\n\nIMPORTANTE: Las siguientes empresas ya fueron buscadas antes para este rubro y zona. NO las incluyas, encontrá empresas DISTINTAS:\n${nombresYaBuscados.slice(0, 20).join(', ')}`
    : '';

  const prompt = `Buscá en internet entre 6 y 8 empresas REALES del rubro "${nicho}" en ${zona}, Argentina.${exclusionText}

Para cada empresa intentá encontrar:
- Nombre real de la empresa
- Sitio web oficial
- Email de contacto (de RRHH, RSE, donaciones, o contacto general)
- Si tienen programa de RSE activo

Devolvé ÚNICAMENTE un JSON válido con este formato exacto, sin texto adicional ni bloques de código:
{
  "empresas": [
    {
      "nombre": "Nombre Empresa SA",
      "sitio_web": "https://www.empresa.com.ar",
      "email": "contacto@empresa.com.ar",
      "tiene_rse": true,
      "nota_email": "Aclaración si no hay email directo disponible"
    }
  ]
}`;

  let text;

  try {
    // Usar Responses API con búsqueda web integrada
    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      tools: [{ type: 'web_search_preview' }],
      input: prompt,
    });
    text = response.output_text;
  } catch (searchErr) {
    console.warn('Web search no disponible, usando GPT-4o sin búsqueda:', searchErr.message);
    // Fallback a chat completions sin búsqueda
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });
    text = completion.choices[0].message.content;
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('La IA no devolvió un JSON válido al buscar empresas.');

  const data = JSON.parse(match[0]);
  return Array.isArray(data.empresas) ? data.empresas : [];
}

async function generarEmail(empresa, nicho, emailsReferencia) {
  const refContext = emailsReferencia.length
    ? `\n\nEmails enviados anteriormente (usá este tono y estilo como referencia):\n${emailsReferencia.map(e => `--- ${e.titulo || 'Sin título'} ---\n${e.contenido}`).join('\n\n')}`
    : '';

  const prompt = `Sos asistente de la Asociación Civil Integrar Educar Amar (IEA), una ONG del GBA Bonaerense, Argentina, que brinda apoyo escolar y merienda diaria a 50 niños en situación de vulnerabilidad. Gracias a donaciones anteriores pudieron construir los baños del lugar.

Empresa a contactar:
- Nombre: ${empresa.nombre}
- Rubro: ${nicho}
- Sitio web: ${empresa.sitio_web || 'No disponible'}
- Tiene RSE: ${empresa.tiene_rse ? 'Sí' : 'No confirmado'}${refContext}

Generá:
1. Una "idea de referencia" (2-3 oraciones): el ángulo estratégico, por qué esta empresa en particular podría querer donar y qué tipo de donación sería ideal dada su actividad.
2. Un email completo de solicitud de donación que:
   - Conecte específicamente el rubro "${nicho}" con lo que necesita la ONG (ej: si es papelería → útiles escolares; si es supermercado → alimentos para la merienda)
   - Use español rioplatense (vos, ustedes)
   - Sea emotivo pero profesional
   - Mencione logros concretos (los baños construidos)
   - Cierre con un llamado a la acción claro
   - Firme: Asociación Civil Integrar Educar Amar | abigailntevez@gmail.com

Devolvé ÚNICAMENTE un JSON válido, sin texto adicional ni bloques de código:
{
  "idea_referencia": "...",
  "asunto": "...",
  "cuerpo": "..."
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.75,
  });

  const text = completion.choices[0].message.content;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No se pudo generar el email para ${empresa.nombre}`);

  const emailData = JSON.parse(match[0]);

  return {
    nombre: empresa.nombre,
    sitio_web: empresa.sitio_web || '',
    email: empresa.email || '',
    tiene_rse: empresa.tiene_rse || false,
    nota_email: empresa.nota_email || '',
    idea_referencia: emailData.idea_referencia,
    asunto: emailData.asunto,
    cuerpo: emailData.cuerpo,
  };
}

// ─── SERVIDOR ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor IEA corriendo en http://localhost:${PORT}`);
});
