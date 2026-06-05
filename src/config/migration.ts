import { access, copyFile, readFile, writeFile, mkdir, rename } from 'fs/promises';
import { join } from 'path';
import { getConfigDir, getConfigFilePath, getLegacyConfigPath, getMcpDir, getLegacyMcpDir } from './paths';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function migrateLegacyConfig(): Promise<void> {
  const legacyPath = getLegacyConfigPath();
  const newPath = getConfigFilePath();

  const legacyExists = await fileExists(legacyPath);
  const newExists = await fileExists(newPath);

  if (!legacyExists) {
    return;
  }

  if (newExists) {
    console.warn(
      `[migration] Legacy config found at ${legacyPath}, ` +
      `but new config at ${newPath} already exists. Remove legacy manually.`
    );
    return;
  }

  try {
    const newDir = getConfigDir();
    await mkdir(newDir, { recursive: true });
    await rename(legacyPath, newPath);
    console.log(`[migration] Config migrated: ${legacyPath} → ${newPath}`);
  } catch (err) {
    console.error(`[migration] Failed to migrate config: ${err}`);
  }
}

export async function migrateLegacyMcp(): Promise<void> {
  const legacyDir = getLegacyMcpDir();
  const newDir = getMcpDir();

  const legacyExists = await fileExists(join(legacyDir, 'server.js'));
  const newExists = await fileExists(join(newDir, 'server.js'));

  if (!legacyExists) {
    return;
  }

  if (newExists) {
    return;
  }

  try {
    await mkdir(newDir, { recursive: true });
    await copyFile(join(legacyDir, 'server.js'), join(newDir, 'server.js'));
    console.log(`[migration] MCP server copied: ${legacyDir} → ${newDir}`);
  } catch (err) {
    console.error(`[migration] Failed to copy MCP server: ${err}`);
  }
}
