import crypto from 'node:crypto';
import { readJson, writeJson } from './env.js';

const MAX = 200;
const load = () => readJson('todos.json', { items: [] }).items;
const save = (items) => writeJson('todos.json', { items });
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);

export const listTodos = () => load();

export function addTodos(texts) {
  const items = load();
  for (const t of texts.map(clean).filter(Boolean)) {
    items.push({ id: crypto.randomBytes(3).toString('hex'), text: t, done: false, createdAt: Date.now() });
  }
  save(items.slice(-MAX));
  return listTodos();
}

// Replace the whole open list (done items are kept so recent wins stay visible).
export function setTodos(texts) {
  const done = load().filter((i) => i.done);
  const open = texts.map(clean).filter(Boolean).map((t) => ({ id: crypto.randomBytes(3).toString('hex'), text: t, done: false, createdAt: Date.now() }));
  save([...done, ...open].slice(-MAX));
  return listTodos();
}

// Match by id, or by case-insensitive text substring when it identifies exactly one item.
function find(items, ref) {
  const r = clean(ref).toLowerCase();
  const byId = items.find((i) => i.id === r);
  if (byId) return byId;
  const hits = items.filter((i) => i.text.toLowerCase().includes(r));
  if (hits.length === 1) return hits[0];
  throw new Error(hits.length ? `"${ref}" matches ${hits.length} items; use the id` : `No to-do matching "${ref}"`);
}

export function setDone(ref, done = true) {
  const items = load();
  const it = find(items, ref);
  it.done = done; it.doneAt = done ? Date.now() : undefined;
  save(items);
  return it;
}

export function removeTodo(ref) {
  const items = load();
  const it = find(items, ref);
  save(items.filter((i) => i !== it));
  return it;
}

export function clearDone() {
  save(load().filter((i) => !i.done));
  return listTodos();
}
