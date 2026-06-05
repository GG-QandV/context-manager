import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

const BOT_TOKEN = process.env.TG_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('TG_BOT_TOKEN is required');
  process.exit(1);
}

const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

let lastUpdateId = 0;

const server = new Server(
  { name: 'tg-bot', version: '2.2.1' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'tg_send',
      description: 'Send a message to a Telegram chat',
      inputSchema: {
        type: 'object',
        properties: {
          chat_id: { type: 'string', description: 'Chat ID, defaults to TG_CHAT_ID env' },
          text: { type: 'string', description: 'Message text' },
          parse_mode: { type: 'string', enum: ['HTML', 'Markdown', 'MarkdownV2'], default: 'HTML' }
        },
        required: ['text']
      }
    },
    {
      name: 'tg_poll',
      description: 'Fetch new messages from Telegram since last poll',
      inputSchema: {
        type: 'object',
        properties: {
          timeout: { type: 'number', default: 10, description: 'Long polling timeout in seconds' },
          limit: { type: 'number', default: 100, description: 'Max messages to fetch' }
        }
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    if (name === 'tg_send') {
      const chatId = args.chat_id || process.env.TG_CHAT_ID;
      if (!chatId) {
        return { content: [{ type: 'text', text: 'Error: chat_id is required. Set TG_CHAT_ID env or pass it.' }], isError: true };
      }

      const payload = { chat_id: chatId, text: args.text };
      if (args.parse_mode) payload.parse_mode = args.parse_mode;

      const res = await axios.post(`${API_BASE}/sendMessage`, payload);
      const msg = res.data.result;
      return {
        content: [{
          type: 'text',
          text: `Sent to chat ${chatId}\nMessage ID: ${msg.message_id}\nDate: ${new Date(msg.date * 1000).toISOString()}`
        }]
      };
    }

    if (name === 'tg_poll') {
      const params = {
        timeout: args.timeout || 10,
        limit: args.limit || 100,
        allowed_updates: ['message']
      };
      if (lastUpdateId > 0) params.offset = lastUpdateId + 1;

      const res = await axios.post(`${API_BASE}/getUpdates`, params);
      const updates = res.data.result || [];

      if (updates.length === 0) {
        return { content: [{ type: 'text', text: 'No new messages.' }] };
      }

      lastUpdateId = updates[updates.length - 1].update_id;

      const messages = updates
        .filter(u => u.message && u.message.text)
        .map(u => ({
          update_id: u.update_id,
          message_id: u.message.message_id,
          chat_id: u.message.chat.id,
          chat_type: u.message.chat.type,
          from: `${u.message.from?.first_name || ''} ${u.message.from?.last_name || ''}`.trim() || u.message.from?.username || 'unknown',
          username: u.message.from?.username || null,
          text: u.message.text,
          date: new Date(u.message.date * 1000).toISOString()
        }));

      if (messages.length === 0) {
        return { content: [{ type: 'text', text: 'No text messages found.' }] };
      }

      const text = messages.map(m =>
        `[${m.date}] @${m.username || m.from} (chat:${m.chat_id}): ${m.text}`
      ).join('\n');

      return { content: [{ type: 'text', text }] };
    }

    return { content: [{ type: 'text', text: 'Unknown command' }], isError: true };
  } catch (e) {
    const detail = e.response?.data?.description || e.message;
    return { content: [{ type: 'text', text: `Error: ${detail}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
