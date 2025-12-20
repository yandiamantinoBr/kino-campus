/*
  Placeholder service:
  - Por enquanto usa JSON local (frontend/assets/data/database.json) como base
  - Na próxima etapa, trocar por DB (PostgreSQL + Prisma, por exemplo)
*/

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'frontend', 'assets', 'data', 'database.json');

function loadDB() {
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const db = JSON.parse(raw);
  return Array.isArray(db.anuncios) ? db.anuncios : [];
}

exports.list = async ({ module, q, category, page = 1, limit = 20 }) => {
  const all = loadDB();

  let items = all;
  if (module) items = items.filter(p => String(p.modulo || '') === String(module));
  if (category) items = items.filter(p => String(p.categoria || '') === String(category));
  if (q) {
    const query = String(q).toLowerCase();
    items = items.filter(p => {
      const t = String(p.titulo || '').toLowerCase();
      const d = String(p.descricao || '').toLowerCase();
      return t.includes(query) || d.includes(query);
    });
  }

  const start = Math.max(0, (page - 1) * limit);
  const paged = items.slice(start, start + limit);

  return {
    total: items.length,
    page,
    limit,
    items: paged,
  };
};

exports.getById = async (id) => {
  const all = loadDB();
  return all.find(p => String(p.id) === String(id)) || null;
};

exports.create = async (data) => {
  // placeholder: não persiste no JSON (evita efeito colateral)
  return { ...data, id: String(Date.now()) };
};
