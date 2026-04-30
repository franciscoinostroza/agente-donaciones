const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'iea.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS historial (
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
  );

  CREATE TABLE IF NOT EXISTS emails_referencia (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo      TEXT,
    contenido   TEXT NOT NULL,
    fecha       TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS empresas_guardadas (
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
  );
`);

// Migraciones para DBs previas
const migrations = [
  `ALTER TABLE empresas_guardadas ADD COLUMN zona TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE empresas_guardadas ADD COLUMN direccion TEXT`,
  `ALTER TABLE empresas_guardadas ADD COLUMN telefono TEXT`,
  `ALTER TABLE empresas_guardadas ADD COLUMN contacto_nombre TEXT`,
  `ALTER TABLE empresas_guardadas ADD COLUMN fuente TEXT`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) {}
}

module.exports = {
  getHistorial: () =>
    db.prepare('SELECT * FROM historial ORDER BY fecha DESC').all(),

  addHistorial: (data) =>
    db.prepare(`
      INSERT INTO historial (empresa, nicho, sitio_web, email_empresa, asunto, cuerpo, idea_referencia, estado)
      VALUES (@empresa, @nicho, @sitio_web, @email_empresa, @asunto, @cuerpo, @idea_referencia, @estado)
    `).run(data).lastInsertRowid,

  updateHistorial: (id, data) => {
    const allowed = ['estado', 'notas'];
    const fields = Object.keys(data).filter(k => allowed.includes(k)).map(k => `${k} = @${k}`).join(', ');
    if (!fields) return;
    db.prepare(`UPDATE historial SET ${fields} WHERE id = @id`).run({ ...data, id });
  },

  deleteHistorial: (id) =>
    db.prepare('DELETE FROM historial WHERE id = ?').run(id),

  getEmailsReferencia: () =>
    db.prepare('SELECT * FROM emails_referencia ORDER BY fecha DESC').all(),

  addEmailReferencia: (data) =>
    db.prepare('INSERT INTO emails_referencia (titulo, contenido) VALUES (@titulo, @contenido)')
      .run(data).lastInsertRowid,

  deleteEmailReferencia: (id) =>
    db.prepare('DELETE FROM emails_referencia WHERE id = ?').run(id),

  getEmpresasGuardadas: (nicho, zona) => {
    if (nicho && zona) return db.prepare('SELECT * FROM empresas_guardadas WHERE lower(nicho) = lower(?) AND lower(zona) = lower(?) ORDER BY fecha DESC').all(nicho, zona);
    if (nicho)         return db.prepare('SELECT * FROM empresas_guardadas WHERE lower(nicho) = lower(?) ORDER BY fecha DESC').all(nicho);
    return db.prepare('SELECT * FROM empresas_guardadas ORDER BY fecha DESC').all();
  },

  addEmpresaGuardada: (data) => {
    const exists = db.prepare(
      'SELECT id FROM empresas_guardadas WHERE lower(nicho) = lower(?) AND lower(zona) = lower(?) AND lower(nombre) = lower(?)'
    ).get(data.nicho, data.zona, data.nombre);
    if (exists) return exists.id;
    return db.prepare(`
      INSERT INTO empresas_guardadas
        (nicho, zona, nombre, sitio_web, email, tiene_rse, nota_email, idea_referencia, asunto, cuerpo,
         direccion, telefono, contacto_nombre, fuente)
      VALUES
        (@nicho, @zona, @nombre, @sitio_web, @email, @tiene_rse, @nota_email, @idea_referencia, @asunto, @cuerpo,
         @direccion, @telefono, @contacto_nombre, @fuente)
    `).run(data).lastInsertRowid;
  },

  updateEmpresaGuardadaEmail: (id, data) =>
    db.prepare('UPDATE empresas_guardadas SET idea_referencia = @idea_referencia, asunto = @asunto, cuerpo = @cuerpo WHERE id = @id')
      .run({ ...data, id }),

  deleteEmpresaGuardada: (id) =>
    db.prepare('DELETE FROM empresas_guardadas WHERE id = ?').run(id),
};
