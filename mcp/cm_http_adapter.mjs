/**
 * CM MCP HTTP Adapter — stateful Streamable HTTP MCP server for context-manager.
 * Port: 8770. Entry via mnemostroma tunnel → routes.json /mcp/cm → :8770
 *
 * Start: node cm_http_adapter.mjs
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import axios from 'axios';

const API_BASE = process.env.CM_API_BASE || 'http://localhost:3847/api/context';
const PORT = parseInt(process.env.CM_MCP_PORT || '8770', 10);

const TOOLS = [
  { name: 'cm_save_br', description: 'Save context (brief: auto-summary 200-300 chars)',
    inputSchema: { type: 'object', properties: { content: { type: 'string' }, session_id: { type: 'string' }, agent: { type: 'string' } }, required: ['content', 'agent'] } },
  { name: 'cm_save_im', description: 'Save context (important: by topics, up to 3K chars)',
    inputSchema: { type: 'object', properties: { content: { type: 'string' }, topics: { type: 'string' }, session_id: { type: 'string' }, agent: { type: 'string' } }, required: ['content', 'topics', 'agent'] } },
  { name: 'cm_save_fl', description: 'Save context (full: complete log)',
    inputSchema: { type: 'object', properties: { content: { type: 'string' }, session_id: { type: 'string' }, agent: { type: 'string' } }, required: ['content', 'agent'] } },
  { name: 'cm_search', description: 'Semantic search in own context',
    inputSchema: { type: 'object', properties: { q: { type: 'string' }, mode: { type: 'string', enum: ['br','im','fl'], default: 'im' }, n: { type: 'number', default: 5 }, agent: { type: 'string' } }, required: ['q'] } },
  { name: 'cm_query', description: 'SQL-based search with filters',
    inputSchema: { type: 'object', properties: { date: { type: 'string' }, agent: { type: 'string' }, session: { type: 'string' }, mode: { type: 'string', enum: ['br','im','fl'], default: 'im' } } } },
  { name: 'cm_cross', description: 'Search in another agent context',
    inputSchema: { type: 'object', properties: { q: { type: 'string' }, from: { type: 'string' }, mode: { type: 'string', enum: ['br','im','fl'], default: 'im' }, n: { type: 'number', default: 5 } }, required: ['q', 'from'] } },
  { name: 'cm_agents', description: 'List agents with record counts',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'cm_stats', description: 'Context statistics',
    inputSchema: { type: 'object', properties: { agent: { type: 'string' }, session: { type: 'string' } } } },
  { name: 'cm_export', description: 'Export session to JSON',
    inputSchema: { type: 'object', properties: { session: { type: 'string' }, agent: { type: 'string' } }, required: ['session'] } },
  { name: 'cm_help', description: 'Show commands help',
    inputSchema: { type: 'object', properties: {} } },
];

function makeServer() {
  const server = new Server({ name: 'cm', version: '2.0.1' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const agent = args.agent || 'perplexity';
    try {
      if (name === 'cm_save_br' || name === 'cm_save_im' || name === 'cm_save_fl') {
        const mode = { cm_save_br: 'brief', cm_save_im: 'important', cm_save_fl: 'full' }[name];
        await axios.post(`${API_BASE}/save`, {
          sessionId: args.session_id || 'default', contextType: 'note',
          content: args.content, logicalSection: 'shared', agent,
          metadata: { agent, mode, topics: args.topics || '' },
        });
        return { content: [{ type: 'text', text: `Saved (${mode})` }] };
      }
      if (name === 'cm_search') {
        const r = await axios.post(`${API_BASE}/semantic-search`, {
          query: args.q, limit: args.n || 5,
          filters: { agent }, mode: args.mode || 'im',
        });
        const results = r.data.results || r.data.items || [];
        if (!results.length) return { content: [{ type: 'text', text: 'No results' }] };
        const mode = args.mode || 'im';
        const text = results.map((x, i) => {
          const score = ((x.score || x.certainty || 0) * 100).toFixed(0);
          const content = mode === 'br' ? (x.summary || x.content.slice(0,200))
                        : mode === 'fl' ? x.content : x.content.slice(0,500);
          return `${i+1}. [${score}%] ${content}`;
        }).join('\n\n');
        return { content: [{ type: 'text', text }] };
      }
      if (name === 'cm_query') {
        const r = await axios.post(`${API_BASE}/query`, {
          filters: { agent, sessionId: args.session, date: args.date },
          mode: args.mode || 'im',
        });
        const records = r.data.records || r.data.items || [];
        if (!records.length) return { content: [{ type: 'text', text: 'No records' }] };
        const text = records.map((x, i) =>
          `${i+1}. ${x.created_at || x.createdAt} - ${x.summary || x.content.slice(0,100)}`
        ).join('\n');
        return { content: [{ type: 'text', text }] };
      }
      if (name === 'cm_cross') {
        const r = await axios.post(`${API_BASE}/semantic-search`, {
          query: args.q, limit: args.n || 5,
          filters: { agent: args.from }, mode: args.mode || 'im',
        });
        const results = r.data.results || r.data.items || [];
        if (!results.length) return { content: [{ type: 'text', text: `No results in ${args.from}` }] };
        const text = results.map((x, i) => `${i+1}. [${args.from}] ${x.content.slice(0,500)}`).join('\n\n');
        return { content: [{ type: 'text', text }] };
      }
      if (name === 'cm_agents') {
        const r = await axios.get(`${API_BASE}/agents`);
        const agents = r.data.agents || r.data.items || [];
        const text = agents.map(a => `${a.agent}: ${a.records} records, last: ${a.last_active}`).join('\n') || 'No agents';
        return { content: [{ type: 'text', text }] };
      }
      if (name === 'cm_stats') {
        const r = await axios.get(`${API_BASE}/stats`, { params: { agent, session: args.session } });
        const s = r.data.stats || {};
        return { content: [{ type: 'text', text: `Total: ${s.total}\nSessions: ${s.sessions}\nAgents: ${s.agents}\nLast: ${s.last_record}` }] };
      }
      if (name === 'cm_export') {
        const r = await axios.get(`${API_BASE}/export`, { params: { session: args.session, agent } });
        return { content: [{ type: 'text', text: JSON.stringify(r.data, null, 2) }] };
      }
      if (name === 'cm_help') {
        return { content: [{ type: 'text', text: 'cm_save_br/im/fl\ncm_search (q,mode,n)\ncm_query (date,agent,session)\ncm_cross (q,from)\ncm_agents\ncm_stats\ncm_export' }] };
      }
      return { content: [{ type: 'text', text: 'Unknown command' }], isError: true };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  });

  return server;
}

// Session store: sessionId → transport
const transports = new Map();

const httpServer = createServer(async (req, res) => {
  if (req.url !== '/mcp') {
    res.writeHead(404); res.end('Not Found'); return;
  }

  const sessionId = req.headers['mcp-session-id'];

  if (sessionId && transports.has(sessionId)) {
    // Existing session — route to existing transport
    await transports.get(sessionId).handleRequest(req, res);
    return;
  }

  if (sessionId) {
    // Unknown session ID
    res.writeHead(404); res.end(JSON.stringify({ error: 'Session not found' })); return;
  }

  // New session — create transport + server
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => { transports.set(sid, transport); },
  });

  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };

  const server = makeServer();
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`CM MCP adapter listening on :${PORT}`);
});
