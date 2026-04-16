import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

const API_BASE = 'http://localhost:3847/api/context';

const server = new Server({ name: 'cm', version: '2.0.1' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'cm_save_br',
      description: 'Save context (brief: auto-summary 200-300 chars)',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          session_id: { type: 'string' },
          agent: { type: 'string' }
        },
        required: ['content']
      }
    },
    {
      name: 'cm_save_im',
      description: 'Save context (important: by topics, up to 3K chars)',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          topics: { type: 'string' },
          session_id: { type: 'string' },
          agent: { type: 'string' }
        },
        required: ['content', 'topics']
      }
    },
    {
      name: 'cm_save_fl',
      description: 'Save context (full: complete log)',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          session_id: { type: 'string' },
          agent: { type: 'string' }
        },
        required: ['content']
      }
    },
    {
      name: 'cm_search',
      description: 'Semantic search in own context',
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          mode: { type: 'string', enum: ['br', 'im', 'fl'], default: 'im' },
          n: { type: 'number', default: 5 },
          agent: { type: 'string' }
        },
        required: ['q']
      }
    },
    {
      name: 'cm_query',
      description: 'SQL-based search with filters',
      inputSchema: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          agent: { type: 'string' },
          session: { type: 'string' },
          mode: { type: 'string', enum: ['br', 'im', 'fl'], default: 'im' }
        }
      }
    },
    {
      name: 'cm_cross',
      description: 'Search in another agent context',
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          from: { type: 'string' },
          mode: { type: 'string', enum: ['br', 'im', 'fl'], default: 'im' },
          n: { type: 'number', default: 5 }
        },
        required: ['q', 'from']
      }
    },
    {
      name: 'cm_agents',
      description: 'List agents with record counts',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'cm_stats',
      description: 'Context statistics',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string' },
          session: { type: 'string' }
        }
      }
    },
    {
      name: 'cm_export',
      description: 'Export session to JSON',
      inputSchema: {
        type: 'object',
        properties: {
          session: { type: 'string' },
          agent: { type: 'string' }
        },
        required: ['session']
      }
    },
    {
      name: 'cm_help',
      description: 'Show commands help',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const detectedAgent = process.env.MCP_CLIENT_NAME || args.agent || 'antigravity';
  
  try {
    if (name === 'cm_save_br') {
      await axios.post(`${API_BASE}/save`, {
        sessionId: args.session_id || 'default',
        contextType: 'note',
        content: args.content,
        logicalSection: 'shared',
        agent: detectedAgent,
        metadata: { agent: detectedAgent, mode: 'brief' }
      });
      return { content: [{ type: 'text', text: 'Saved (brief)' }] };
    }

    if (name === 'cm_save_im') {
      await axios.post(`${API_BASE}/save`, {
        sessionId: args.session_id || 'default',
        contextType: 'note',
        content: args.content,
        logicalSection: 'shared',
        agent: detectedAgent,
        metadata: { agent: detectedAgent, mode: 'important', topics: args.topics }
      });
      return { content: [{ type: 'text', text: 'Saved (important)' }] };
    }

    if (name === 'cm_save_fl') {
      await axios.post(`${API_BASE}/save`, {
        sessionId: args.session_id || 'default',
        contextType: 'note',
        content: args.content,
        logicalSection: 'shared',
        agent: detectedAgent,
        metadata: { agent: detectedAgent, mode: 'full' }
      });
      return { content: [{ type: 'text', text: 'Saved (full)' }] };
    }

    if (name === 'cm_search') {
      const res = await axios.post(`${API_BASE}/semantic-search`, {
        query: args.q,
        limit: args.n || 5,
        filters: { agent: args.agent || detectedAgent },
        mode: args.mode
      });
      
      const results = res.data.results || res.data.items || [];
      if (!results.length) {
        return { content: [{ type: 'text', text: 'No results' }] };
      }
      
      const mode = args.mode || 'im';
      const compact = results.map((r, i) => {
        const content = mode === 'br' ? (r.summary || r.content.substring(0,200)) : 
                        mode === 'fl' ? r.content : 
                        r.content.substring(0, 500);
        const score = r.score || r.certainty || 0;
        return `${i+1}. [${(score*100).toFixed(0)}%] ${content}`;
      }).join('\n\n');
      
      return { content: [{ type: 'text', text: compact }] };
    }

    if (name === 'cm_query') {
      const res = await axios.post(`${API_BASE}/query`, {
        filters: {
          agent: args.agent || detectedAgent,
          sessionId: args.session,
          date: args.date
        },
        mode: args.mode || 'im'
      });
      
      const records = res.data.records || res.data.items || [];
      if (!records.length) {
        return { content: [{ type: 'text', text: 'No records' }] };
      }
      
      const compact = records.map((r, i) => 
        `${i+1}. ${r.created_at || r.createdAt} - ${r.summary || r.content.substring(0, 100)}`
      ).join('\n');
      
      return { content: [{ type: 'text', text: compact }] };
    }

    if (name === 'cm_cross') {
      const res = await axios.post(`${API_BASE}/semantic-search`, {
        query: args.q,
        limit: args.n || 5,
        filters: { agent: args.from },
        mode: args.mode
      });
      
      const results = res.data.results || res.data.items || [];
      if (!results.length) {
        return { content: [{ type: 'text', text: `No results in ${args.from} context` }] };
      }
      
      const mode = args.mode || 'im';
      const compact = results.map((r, i) => {
        const content = mode === 'br' ? (r.summary || r.content.substring(0,200)) : 
                        mode === 'fl' ? r.content : 
                        r.content.substring(0, 500);
        return `${i+1}. [${args.from}] ${content}`;
      }).join('\n\n');
      
      return { content: [{ type: 'text', text: compact }] };
    }

    if (name === 'cm_agents') {
      const res = await axios.get(`${API_BASE}/agents`);
      const agents = res.data.agents || res.data.items || [];
      const list = agents.map(a => `${a.agent}: ${a.records} records, last: ${a.last_active}`).join('\n');
      return { content: [{ type: 'text', text: list || 'No agents' }] };
    }

    if (name === 'cm_stats') {
      const res = await axios.get(`${API_BASE}/stats`, {
        params: { agent: args.agent || detectedAgent, session: args.session }
      });

      const s = res.data.stats || {};
      const stats = `Total: ${s.total}\nSessions: ${s.sessions}\nAgents: ${s.agents}\nLast: ${s.last_record}`;
      return { content: [{ type: 'text', text: stats }] };
    }

    if (name === 'cm_export') {
      const res = await axios.get(`${API_BASE}/export`, {
        params: { session: args.session, agent: args.agent || detectedAgent }
      });
      return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
    }
    if (name === 'cm_help') {
      const help = `
Commands:
- cm_save_br: brief auto-summary
- cm_save_im: important by topics
- cm_save_fl: full log
- cm_search: semantic search (q, mode, n, agent)
- cm_query: SQL filters (date, agent, session, mode)
- cm_cross: cross-agent search (q, from, mode, n)
- cm_agents: list agents
- cm_stats: statistics (agent, session)
- cm_export: export session JSON
- cm_help: this message
      `.trim();
      return { content: [{ type: 'text', text: help }] };
    }

    return { content: [{ type: 'text', text: 'Unknown command' }], isError: true };
  } catch (e) {
    return { content: [{ type: 'text', text: `Err: ${e.message}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
