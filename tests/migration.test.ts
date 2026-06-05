import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const TMPDIR = path.join(os.tmpdir(), 'cm-migration-test-' + Date.now());

function freshPaths() {
  delete require.cache[require.resolve('../src/config/paths')];
  delete require.cache[require.resolve('../src/config/migration')];
  return {
    paths: require('../src/config/paths'),
    migration: require('../src/config/migration'),
  };
}

describe('migrateLegacyConfig', () => {
  beforeEach(async () => {
    await fs.rm(TMPDIR, { recursive: true, force: true });
    await fs.mkdir(TMPDIR, { recursive: true });
    mock.method(os, 'platform', () => 'linux');
    mock.method(os, 'homedir', () => TMPDIR);
  });

  afterEach(async () => {
    await fs.rm(TMPDIR, { recursive: true, force: true });
    mock.restoreAll();
    delete process.env.CONFIG_DIR;
  });

  it('migrates config from legacy ~/.iflow to new path', async () => {
    const legacyDir = path.join(TMPDIR, '.iflow');
    const newDir = path.join(TMPDIR, '.config', 'iflow');
    process.env.CONFIG_DIR = newDir;

    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, 'context-manager-config.json'),
      JSON.stringify({ key: 'value' }),
      'utf8'
    );

    const { migration, paths: p } = freshPaths();
    await migration.migrateLegacyConfig();

    const newFile = p.getConfigFilePath();
    const content = await fs.readFile(newFile, 'utf8');
    assert.strictEqual(JSON.parse(content).key, 'value');
    const legacyExists = await fs.access(path.join(legacyDir, 'context-manager-config.json'))
      .then(() => true).catch(() => false);
    assert.strictEqual(legacyExists, false);
  });

  it('skips when no legacy config exists', async () => {
    const newDir = path.join(TMPDIR, '.config', 'iflow');
    process.env.CONFIG_DIR = newDir;

    const { migration } = freshPaths();
    await migration.migrateLegacyConfig();

    const exists = await fs.access(path.join(newDir, 'context-manager-config.json'))
      .then(() => true).catch(() => false);
    assert.strictEqual(exists, false);
  });

  it('does not overwrite existing new config', async () => {
    const newDir = path.join(TMPDIR, '.config', 'iflow');
    process.env.CONFIG_DIR = newDir;
    await fs.mkdir(newDir, { recursive: true });
    await fs.writeFile(
      path.join(newDir, 'context-manager-config.json'),
      JSON.stringify({ existing: 'data' }),
      'utf8'
    );

    const legacyDir = path.join(TMPDIR, '.iflow');
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, 'context-manager-config.json'),
      JSON.stringify({ legacy: 'data' }),
      'utf8'
    );

    const { migration } = freshPaths();
    await migration.migrateLegacyConfig();

    const newFile = path.join(newDir, 'context-manager-config.json');
    const content = await fs.readFile(newFile, 'utf8');
    assert.strictEqual(JSON.parse(content).existing, 'data');
  });

  it('warns when both old and new exist (no crash)', async () => {
    const newDir = path.join(TMPDIR, '.config', 'iflow');
    process.env.CONFIG_DIR = newDir;

    await fs.mkdir(newDir, { recursive: true });
    await fs.writeFile(path.join(newDir, 'context-manager-config.json'), '{}', 'utf8');

    const legacyDir = path.join(TMPDIR, '.iflow');
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(path.join(legacyDir, 'context-manager-config.json'), '{}', 'utf8');

    const { migration } = freshPaths();
    await migration.migrateLegacyConfig();
  });
});

describe('migrateLegacyMcp', () => {
  beforeEach(async () => {
    await fs.rm(TMPDIR, { recursive: true, force: true });
    await fs.mkdir(TMPDIR, { recursive: true });
    mock.method(os, 'platform', () => 'linux');
    mock.method(os, 'homedir', () => TMPDIR);
  });

  afterEach(async () => {
    await fs.rm(TMPDIR, { recursive: true, force: true });
    mock.restoreAll();
    delete process.env.CONFIG_DIR;
  });

  it('copies server.js from legacy MCP dir to new MCP dir', async () => {
    const newDir = path.join(TMPDIR, '.config', 'iflow');
    process.env.CONFIG_DIR = newDir;

    const legacyMcp = path.join(TMPDIR, '.iflow', 'mcp-servers', 'context-manager');
    await fs.mkdir(legacyMcp, { recursive: true });
    await fs.writeFile(path.join(legacyMcp, 'server.js'), '// test server', 'utf8');

    const { migration } = freshPaths();
    await migration.migrateLegacyMcp();

    const newMcp = path.join(newDir, 'mcp', 'server.js');
    const content = await fs.readFile(newMcp, 'utf8');
    assert.strictEqual(content, '// test server');
  });

  it('skips when no legacy MCP dir exists', async () => {
    const newDir = path.join(TMPDIR, '.config', 'iflow');
    process.env.CONFIG_DIR = newDir;

    const { migration } = freshPaths();
    await migration.migrateLegacyMcp();

    const exists = await fs.access(path.join(newDir, 'mcp', 'server.js'))
      .then(() => true).catch(() => false);
    assert.strictEqual(exists, false);
  });
});
