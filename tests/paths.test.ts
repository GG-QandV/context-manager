import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';

function freshPaths() {
  delete require.cache[require.resolve('../src/config/paths')];
  return require('../src/config/paths');
}

describe('getConfigDir', () => {
  afterEach(() => {
    delete process.env.CONFIG_DIR;
    delete process.env.APPDATA;
    mock.restoreAll();
  });

  it('returns Linux path ~/.config/iflow', () => {
    mock.method(os, 'platform', () => 'linux');
    const { getConfigDir } = freshPaths();
    const dir = getConfigDir();
    assert(dir.endsWith(path.join('.config', 'iflow')));
  });

  it('returns macOS path ~/Library/Application Support/iflow', () => {
    mock.method(os, 'platform', () => 'darwin');
    const { getConfigDir } = freshPaths();
    const dir = getConfigDir();
    assert(dir.endsWith(path.join('Library', 'Application Support', 'iflow')));
  });

  it('returns Windows path using APPDATA', () => {
    mock.method(os, 'platform', () => 'win32');
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
    const { getConfigDir } = freshPaths();
    const dir = getConfigDir();
    assert(dir.includes('iflow'));
    assert(dir.includes('AppData'));
  });

  it('falls back to homedir/AppData/Roaming when APPDATA is not set on Windows', () => {
    mock.method(os, 'platform', () => 'win32');
    delete process.env.APPDATA;
    const { getConfigDir } = freshPaths();
    const dir = getConfigDir();
    assert(dir.includes(path.join('AppData', 'Roaming', 'iflow')));
  });

  it('respects CONFIG_DIR env override', () => {
    process.env.CONFIG_DIR = '/custom/path';
    const { getConfigDir } = freshPaths();
    assert.strictEqual(getConfigDir(), '/custom/path');
  });
});

describe('getConfigFilePath', () => {
  afterEach(() => {
    delete process.env.CONFIG_DIR;
    mock.restoreAll();
  });

  it('returns getConfigDir() + context-manager-config.json', () => {
    mock.method(os, 'platform', () => 'linux');
    const { getConfigFilePath, getConfigDir } = freshPaths();
    assert.strictEqual(getConfigFilePath(), path.join(getConfigDir(), 'context-manager-config.json'));
  });
});

describe('getLegacyConfigPath', () => {
  it('returns ~/.iflow/context-manager-config.json', () => {
    const { getLegacyConfigPath } = freshPaths();
    const p = getLegacyConfigPath();
    assert(p.endsWith(path.join('.iflow', 'context-manager-config.json')));
  });
});

describe('getMcpDir', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('returns getConfigDir() + mcp', () => {
    mock.method(os, 'platform', () => 'linux');
    const { getMcpDir, getConfigDir } = freshPaths();
    assert.strictEqual(getMcpDir(), path.join(getConfigDir(), 'mcp'));
  });
});

describe('getNodeCommand', () => {
  afterEach(() => {
    delete process.env.NODE_PATH;
  });

  it('returns "node" by default on non-Windows', () => {
    const { getNodeCommand } = freshPaths();
    assert.strictEqual(getNodeCommand(), 'node');
  });

  it('respects NODE_PATH env override', () => {
    process.env.NODE_PATH = '/custom/node';
    const { getNodeCommand } = freshPaths();
    assert.strictEqual(getNodeCommand(), '/custom/node');
  });
});
