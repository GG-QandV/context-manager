import { homedir, platform } from 'os';
import { join } from 'path';

const CONFIG_DIR_NAME = 'iflow';
const CONFIG_FILE_NAME = 'context-manager-config.json';

export function getConfigDir(): string {
  const envPath = process.env.CONFIG_DIR;
  if (envPath) return envPath;

  switch (platform()) {
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', CONFIG_DIR_NAME);
    case 'win32':
      return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), CONFIG_DIR_NAME);
    default:
      return join(homedir(), '.config', CONFIG_DIR_NAME);
  }
}

export function getConfigFilePath(): string {
  return join(getConfigDir(), CONFIG_FILE_NAME);
}

export function getLegacyConfigPath(): string {
  return join(homedir(), '.iflow', CONFIG_FILE_NAME);
}

export function getMcpDir(): string {
  return join(getConfigDir(), 'mcp');
}

export function getLegacyMcpDir(): string {
  return join(homedir(), '.iflow', 'mcp-servers', 'context-manager');
}

export function getNodeCommand(): string {
  return process.env.NODE_PATH ?? (platform() === 'win32' ? 'node.exe' : 'node');
}
