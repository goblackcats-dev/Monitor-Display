// Minimal MCP server (Streamable HTTP, JSON responses only) exposing the to-do list,
// so a Claude chat with this connector can add, complete and list tasks.
import { listTodos, addTodos, setTodos, setDone, removeTodo, clearDone } from './todos.js';

const fmt = (items) => items.length
  ? items.map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text} (id ${i.id})`).join('\n')
  : 'The to-do list is empty.';

const strArray = { type: 'array', items: { type: 'string' } };
const TOOLS = [
  { name: 'list_todos', description: 'Show the current to-do list on the display.', inputSchema: { type: 'object', properties: {} },
    run: () => fmt(listTodos()) },
  { name: 'add_todos', description: 'Add one or more tasks to the to-do list shown on the user\'s second monitor. Keep each task short (a few words to one line).',
    inputSchema: { type: 'object', properties: { items: strArray }, required: ['items'] },
    run: ({ items }) => fmt(addTodos(items)) },
  { name: 'set_todos', description: 'Replace all open tasks with this list (completed tasks are kept). Use to sync the display with a plan or list from the conversation.',
    inputSchema: { type: 'object', properties: { items: strArray }, required: ['items'] },
    run: ({ items }) => fmt(setTodos(items)) },
  { name: 'complete_todo', description: 'Mark a task done. "task" is its id or a unique part of its text.',
    inputSchema: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] },
    run: ({ task }) => `Done: ${setDone(task, true).text}` },
  { name: 'reopen_todo', description: 'Mark a completed task as not done.',
    inputSchema: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] },
    run: ({ task }) => `Reopened: ${setDone(task, false).text}` },
  { name: 'remove_todo', description: 'Delete a task. "task" is its id or a unique part of its text.',
    inputSchema: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] },
    run: ({ task }) => `Removed: ${removeTodo(task).text}` },
  { name: 'clear_done', description: 'Delete all completed tasks.', inputSchema: { type: 'object', properties: {} },
    run: () => fmt(clearDone()) },
];

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

function handle(msg) {
  const { id, method, params = {} } = msg;
  if (id === undefined) return null; // notification
  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: params.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'monitor-display', version: '0.2.0' },
        instructions: 'Manages the to-do list shown on the user\'s always-on second monitor.',
      });
    case 'ping': return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return err(id, -32602, `Unknown tool ${params.name}`);
      try {
        return ok(id, { content: [{ type: 'text', text: tool.run(params.arguments || {}) }] });
      } catch (e) {
        return ok(id, { content: [{ type: 'text', text: String(e.message) }], isError: true });
      }
    }
    default: return err(id, -32601, `Method not found: ${method}`);
  }
}

// Returns { status, body } for a parsed JSON-RPC payload (single or batch).
export function mcpRespond(payload) {
  if (Array.isArray(payload)) {
    const out = payload.map(handle).filter(Boolean);
    return out.length ? { status: 200, body: out } : { status: 202, body: null };
  }
  const r = handle(payload || {});
  return r ? { status: 200, body: r } : { status: 202, body: null };
}
