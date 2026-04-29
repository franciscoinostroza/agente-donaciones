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
`);

module.exports = {
  getHistorial: () =>
    db.prepare('SELECT * FROM historial ORDER BY fecha DESC').all(),

  addHistorial: (data) => {
    const stmt = db.prepare(`
      INSERT INTO historial
        (empresa, nicho, sitio_web, email_empresa, asunto, cuerpo, idea_referencia, estado)
      VALUES
        (@empresa, @nicho, @sitio_web, @email_empresa, @asunto, @cuerpo, @idea_referencia, @estado)
    `);
    return stmt.run(data).lastInsertRowid;
  },

  updateHistorial: (id, data) => {
    const allowed = ['estado', 'notas'];
    const fields = Object.keys(data)
      .filter(k => allowed.includes(k))
      .map(k => `${k} = @${k}`)
      .join(', ');
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
};
