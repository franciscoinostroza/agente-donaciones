require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');
const path = require('path');
const db = require('./database');

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── BUSCAR ──────────────────────────────────────────────────────────────────

app.post('/api/buscar', async (req, res) => {
  try {
    const { nicho, emailsReferencia = [] } = req.body;
    if (!nicho?.trim()) return res.status(400).json({ error: 'El nicho es requerido.' });

    const empresas = await buscarEmpresas(nicho.trim());
    if (!empresas.length) return res.status(404).json({ error: 'No se encontraron empresas. Intentá con otro nicho.' });

    const resultados = await Promise.all(
      empresas.map(e => generarEmail(e, nicho, emailsReferencia))
    );

    res.json({ resultados });
  } catch (err) {
    console.error('[/api/buscar]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── AUDIO TTS ────────────────────────────────────────────────────────────────

app.post('/api/audio', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ error: 'Texto requerido.' });

    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: texto.slice(0, 4096),
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    res.send(buffer);
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

async function buscarEmpresas(nicho) {
  const prompt = `Buscá en internet entre 6 y 8 empresas REALES del rubro "${nicho}" en el GBA/Conurbano Bonaerense, Argentina (o con presencia nacional en Argentina).

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
      model: 'gpt-4o',
      tools: [{ type: 'web_search_preview' }],
      input: prompt,
    });
    text = response.output_text;
  } catch (searchErr) {
    console.warn('Web search no disponible, usando GPT-4o sin búsqueda:', searchErr.message);
    // Fallback a chat completions sin búsqueda
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
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
    model: 'gpt-4o',
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
