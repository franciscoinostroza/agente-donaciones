const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./data/iea.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const init = client.batch([
  {
    sql: `CREATE TABLE IF NOT EXISTS historial (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa     TEXT NOT NULL,
      nicho       TEXT,
      sitio_web   TEXT,
      email_empresa TEXT,
      asunto      TEXT,
      cuerpo      TEXT,
      idea_referencia TEXT,
      fecha       TEXT DEFAULT (datetime('now', 'localtime')),
      estado      TEXT DEFAULT 'enviado',
      notas       TEXT
    )`,
    args: [],
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS emails_referencia (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo      TEXT,
      contenido   TEXT NOT NULL,
      fecha       TEXT DEFAULT (datetime('now', 'localtime'))
    )`,
    args: [],
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS empresas_guardadas (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      nicho           TEXT NOT NULL,
      zona            TEXT NOT NULL DEFAULT '',
      nombre          TEXT NOT NULL,
      sitio_web       TEXT,
      email           TEXT,
      tiene_rse       INTEGER DEFAULT 0,
      nota_email      TEXT,
      idea_referencia TEXT,
      asunto          TEXT,
      cuerpo          TEXT,
      fecha           TEXT DEFAULT (datetime('now', 'localtime')),
      direccion       TEXT,
      telefono        TEXT,
      contacto_nombre TEXT,
      fuente          TEXT
    )`,
    args: [],
  },
], 'write').then(async () => {
  // Migraciones para DBs previas (columnas pueden ya existir)
  const migrations = [
    `ALTER TABLE empresas_guardadas ADD COLUMN zona TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE empresas_guardadas ADD COLUMN direccion TEXT`,
    `ALTER TABLE empresas_guardadas ADD COLUMN telefono TEXT`,
    `ALTER TABLE empresas_guardadas ADD COLUMN contacto_nombre TEXT`,
    `ALTER TABLE empresas_guardadas ADD COLUMN fuente TEXT`,
  ];
  for (const sql of migrations) {
    try { await client.execute(sql); } catch (_) {}
  }
});

module.exports = {
  init,

  getHistorial: async () => {
    const result = await client.execute('SELECT * FROM historial ORDER BY fecha DESC');
    return result.rows.map(r => ({ ...r }));
  },

  addHistorial: async (data) => {
    const result = await client.execute({
      sql: `INSERT INTO historial
              (empresa, nicho, sitio_web, email_empresa, asunto, cuerpo, idea_referencia, estado)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [data.empresa, data.nicho, data.sitio_web, data.email_empresa,
             data.asunto, data.cuerpo, data.idea_referencia, data.estado],
    });
    return Number(result.lastInsertRowid);
  },

  updateHistorial: async (id, data) => {
    const allowed = ['estado', 'notas'];
    const keys = Object.keys(data).filter(k => allowed.includes(k));
    if (!keys.length) return;
    const fields = keys.map(k => `${k} = ?`).join(', ');
    const args   = [...keys.map(k => data[k]), id];
    await client.execute({ sql: `UPDATE historial SET ${fields} WHERE id = ?`, args });
  },

  deleteHistorial: async (id) => {
    await client.execute({ sql: 'DELETE FROM historial WHERE id = ?', args: [id] });
  },

  getEmailsReferencia: async () => {
    const result = await client.execute('SELECT * FROM emails_referencia ORDER BY fecha DESC');
    return result.rows.map(r => ({ ...r }));
  },

  addEmailReferencia: async (data) => {
    const result = await client.execute({
      sql: 'INSERT INTO emails_referencia (titulo, contenido) VALUES (?, ?)',
      args: [data.titulo, data.contenido],
    });
    return Number(result.lastInsertRowid);
  },

  deleteEmailReferencia: async (id) => {
    await client.execute({ sql: 'DELETE FROM emails_referencia WHERE id = ?', args: [id] });
  },

  getEmpresasGuardadas: async (nicho, zona) => {
    let result;
    if (nicho && zona) {
      result = await client.execute({
        sql: 'SELECT * FROM empresas_guardadas WHERE lower(nicho) = lower(?) AND lower(zona) = lower(?) ORDER BY fecha DESC',
        args: [nicho, zona],
      });
    } else if (nicho) {
      result = await client.execute({
        sql: 'SELECT * FROM empresas_guardadas WHERE lower(nicho) = lower(?) ORDER BY fecha DESC',
        args: [nicho],
      });
    } else {
      result = await client.execute('SELECT * FROM empresas_guardadas ORDER BY fecha DESC');
    }
    return result.rows.map(r => ({ ...r }));
  },

  getNombresGuardados: async (nicho, zona) => {
    const result = await client.execute({
      sql: 'SELECT nombre FROM empresas_guardadas WHERE lower(nicho) = lower(?) AND lower(zona) = lower(?)',
      args: [nicho, zona],
    });
    return result.rows.map(r => r.nombre);
  },

  addEmpresaGuardada: async (data) => {
    const existing = await client.execute({
      sql: 'SELECT id FROM empresas_guardadas WHERE lower(nicho) = lower(?) AND lower(zona) = lower(?) AND lower(nombre) = lower(?)',
      args: [data.nicho, data.zona, data.nombre],
    });
    if (existing.rows.length) return Number(existing.rows[0].id);
    const result = await client.execute({
      sql: `INSERT INTO empresas_guardadas
              (nicho, zona, nombre, sitio_web, email, tiene_rse, nota_email, idea_referencia, asunto, cuerpo,
               direccion, telefono, contacto_nombre, fuente)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.nicho, data.zona, data.nombre, data.sitio_web, data.email,
        data.tiene_rse, data.nota_email, data.idea_referencia, data.asunto, data.cuerpo,
        data.direccion, data.telefono, data.contacto_nombre, data.fuente,
      ],
    });
    return Number(result.lastInsertRowid);
  },

  updateEmpresaGuardadaEmail: async (id, data) => {
    await client.execute({
      sql: 'UPDATE empresas_guardadas SET idea_referencia = ?, asunto = ?, cuerpo = ? WHERE id = ?',
      args: [data.idea_referencia, data.asunto, data.cuerpo, id],
    });
  },

  deleteEmpresaGuardada: async (id) => {
    await client.execute({ sql: 'DELETE FROM empresas_guardadas WHERE id = ?', args: [id] });
  },
};
