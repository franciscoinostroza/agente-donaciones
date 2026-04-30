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
    const guardadasPrevias = await db.getEmpresasGuardadas(nichoNorm, zonaNorm);
    const nombresYaBuscados = guardadasPrevias.map(e => e.nombre);

    const empresas = await buscarEmpresas(nichoNorm, zonaNorm, nombresYaBuscados);

    if (empresas && empresas.error === 'sin_web_search') {
      return res.json({ error: 'sin_web_search', sugerencias: empresas.sugerencias || [], guardadasPrevias, zona: zonaNorm });
    }

    if (!Array.isArray(empresas) || !empresas.length) return res.status(404).json({ error: 'No se encontraron empresas. Intentá con otro nicho.' });

    const resultados = [];
    for (const e of empresas) {
      const guardadaId = await db.addEmpresaGuardada({
        nicho: nichoNorm, zona: zonaNorm,
        nombre: e.nombre,
        sitio_web:       e.sitio_web       || null,
        email:           e.email           || null,
        tiene_rse:       e.tiene_rse ? 1 : 0,
        nota_email:      null,
        idea_referencia: '', asunto: '', cuerpo: '',
        direccion:       e.direccion       || null,
        telefono:        e.telefono        || null,
        contacto_nombre: e.contacto_nombre || null,
        fuente:          e.fuente          || null,
      });
      resultados.push({
        nombre:          e.nombre,
        sitio_web:       e.sitio_web       || null,
        email:           e.email           || null,
        tiene_rse:       e.tiene_rse       ?? null,
        direccion:       e.direccion       || null,
        telefono:        e.telefono        || null,
        contacto_nombre: e.contacto_nombre || null,
        fuente:          e.fuente          || null,
        guardadaId,
      });
    }

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
      await db.updateEmpresaGuardadaEmail(guardadaId, {
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

app.get('/api/empresas-guardadas', async (req, res) => {
  try {
    res.json(await db.getEmpresasGuardadas(req.query.nicho || null));
  } catch (err) {
    console.error('[GET /api/empresas-guardadas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/empresas-guardadas/:id', async (req, res) => {
  try {
    await db.deleteEmpresaGuardada(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/empresas-guardadas/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
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

app.get('/api/historial', async (_req, res) => {
  try {
    res.json(await db.getHistorial());
  } catch (err) {
    console.error('[GET /api/historial]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/historial', async (req, res) => {
  try {
    const id = await db.addHistorial({ estado: 'enviado', ...req.body });
    res.json({ id });
  } catch (err) {
    console.error('[POST /api/historial]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/historial/:id', async (req, res) => {
  try {
    await db.updateHistorial(req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/historial/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/historial/:id', async (req, res) => {
  try {
    await db.deleteHistorial(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/historial/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── EMAILS DE REFERENCIA ─────────────────────────────────────────────────────

app.get('/api/emails-referencia', async (_req, res) => {
  try {
    res.json(await db.getEmailsReferencia());
  } catch (err) {
    console.error('[GET /api/emails-referencia]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/emails-referencia', async (req, res) => {
  try {
    const id = await db.addEmailReferencia(req.body);
    res.json({ id });
  } catch (err) {
    console.error('[POST /api/emails-referencia]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/emails-referencia/:id', async (req, res) => {
  try {
    await db.deleteEmailReferencia(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/emails-referencia/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── FUNCIONES DE IA ──────────────────────────────────────────────────────────

async function buscarEmpresas(nicho, zona, nombresYaBuscados = []) {
  const exclusionText = nombresYaBuscados.length
    ? `\n\nIMPORTANTE: Las siguientes empresas ya fueron buscadas antes. NO las incluyas, encontrá empresas DISTINTAS:\n${nombresYaBuscados.slice(0, 20).join(', ')}`
    : '';

  const systemPrompt = `Eres un asistente que busca empresas reales en Argentina para solicitudes de donación.`;

  const userMessage = `Buscá en internet entre 6 y 8 empresas REALES del rubro "${nicho}" en "${zona}", Argentina.${exclusionText}

REGLAS ESTRICTAS:
- Solo incluí empresas que encontraste en una fuente web real (Google Maps, sitio oficial, redes sociales, directorios como Páginas Amarillas, Guía Oleo, etc.)
- Si no encontrás email real, poné null. NUNCA inventes un email.
- Si no encontrás nombre de contacto, poné null. NUNCA lo inventes.
- Cada empresa debe tener al menos nombre + dirección verificada.

Para cada empresa devolvé este JSON exacto:
{
  nombre: string,
  direccion: string,
  telefono: string | null,
  email: string | null,
  sitio_web: string | null,
  contacto_nombre: string | null,
  fuente: string,
  tiene_rse: boolean | null
}

Devolvé SOLO un array JSON válido, sin texto adicional, sin markdown, sin explicaciones.`;

  try {
    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      tools: [{ type: 'web_search_preview' }],
      instructions: systemPrompt,
      input: userMessage,
    });
    const text = response.output_text;
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('La IA no devolvió un array JSON válido.');
    return JSON.parse(match[0]);
  } catch (searchErr) {
    console.warn('Web search no disponible:', searchErr.message);

    const fallbackSystem = `Eres un asistente honesto. En este momento NO tenés acceso a internet para buscar empresas reales de "${nicho}" en "${zona}", Argentina.

NO inventes empresas, direcciones, teléfonos ni emails.`;

    const fallbackUser = `Devolvé SOLO este JSON válido, con comillas dobles en todas las claves y valores:
{"error":"sin_web_search","mensaje":"No pude buscar empresas en tiempo real.","sugerencias":["Buscá ${nicho} ${zona} en Google Maps","Revisá Páginas Amarillas Argentina: paginasamarillas.com.ar","Buscá en el directorio de tu municipio local","Consultá grupos de Facebook de comercios de ${zona}"]}`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: fallbackSystem },
          { role: 'user', content: fallbackUser },
        ],
        temperature: 0,
      });
      const fallbackText = completion.choices[0].message.content;
      const match = fallbackText.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch (_) {}

    return {
      error: 'sin_web_search',
      mensaje: 'No pude buscar empresas en tiempo real.',
      sugerencias: [
        `Buscá "${nicho} ${zona}" en Google Maps`,
        'Revisá Páginas Amarillas Argentina: paginasamarillas.com.ar',
        'Buscá en el directorio de tu municipio local',
        `Consultá grupos de Facebook de comercios de ${zona}`,
      ],
    };
  }
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
db.init.then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor IEA corriendo en http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Error al inicializar la base de datos:', err);
  process.exit(1);
});
