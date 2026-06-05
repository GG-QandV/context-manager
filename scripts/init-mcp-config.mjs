#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir, platform } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

function getConfigDir() {
  const envPath = process.env.CONFIG_DIR;
  if (envPath) return envPath;
  switch (platform()) {
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', 'iflow');
    case 'win32':
      return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'iflow');
    default:
      return join(homedir(), '.config', 'iflow');
  }
}

function getNodePath() {
  const envNode = process.env.NODE_PATH;
  if (envNode) return envNode;
  const { execSync } = require ? require('child_process') : {};
  try {
    const which = platform() === 'win32' ? 'where node' : 'which node';
    const result = execSync?.(which, { encoding: 'utf8' }).trim();
    if (result) return result;
  } catch { /* fallback */ }
  return 'node';
}

async function main() {
  const configDir = getConfigDir();
  const mcpDir = join(configDir, 'mcp');
  const mcpServerPath = join(mcpDir, 'server.js');

  // Source MCP server — check common locations
  const possibleSources = [
    join(process.cwd(), 'mcp', 'server.js'),
    join(process.cwd(), 'dist', 'mcp', 'server.js'),
  ];

  let sourceFound = false;
  for (const src of possibleSources) {
    if (existsSync(src)) {
      await mkdir(mcpDir, { recursive: true });
      const { copyFile } = await import('fs/promises');
      await copyFile(src, mcpServerPath);
      sourceFound = true;
      console.log(`MCP server.js copied to ${mcpServerPath}`);
      break;
    }
  }

  if (!sourceFound) {
    console.warn('Warning: MCP server.js not found at common locations.');
    console.warn(`Expected at: ${possibleSources.join(' or ')}`);
  }

  // Generate mcp.json
  const templatePath = join(process.cwd(), 'mcp.json.template');
  const outputPath = join(process.cwd(), 'mcp.json');

  try {
    let template = await readFile(templatePath, 'utf8');
    template = template
      .replaceAll('{{NODE_PATH}}', getNodePath())
      .replaceAll('{{MCP_SERVER_PATH}}', mcpDir);

    await writeFile(outputPath, template);
    console.log(`mcp.json generated at ${outputPath}`);
  } catch (err) {
    console.error(`Failed to generate mcp.json: ${err}`);
    process.exit(1);
  }
}

main();
