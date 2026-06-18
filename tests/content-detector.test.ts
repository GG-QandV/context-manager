import { describe, it, before } from 'node:test';
import assert from 'node:assert';

describe('contentDetector.detectTypes', () => {
  let contentDetector: any;

  before(() => {
    contentDetector = require('../src/services/contentDetector.service').contentDetector;
  });

  it('detects code blocks', () => {
    const result = contentDetector.detectTypes('```\nconst x = 1;\n```');
    assert(result.includes('code'));
  });

  it('detects commands with $ prefix', () => {
    const result = contentDetector.detectTypes('$ npm install');
    assert(result.includes('command'));
  });

  it('detects commands with known tools', () => {
    const result = contentDetector.detectTypes('docker ps');
    assert(result.includes('command'));
  });

  it('detects lists with dashes', () => {
    const result = contentDetector.detectTypes('- item one\n- item two');
    assert(result.includes('list'));
  });

  it('detects lists with numbers', () => {
    const result = contentDetector.detectTypes('1. first\n2. second');
    assert(result.includes('list'));
  });

  it('detects tables', () => {
    const result = contentDetector.detectTypes('| col1 | col2 |');
    assert(result.includes('table'));
  });

  it('detects errors', () => {
    const result = contentDetector.detectTypes('Error: something failed');
    assert(result.includes('error'));
  });

  it('detects exception', () => {
    const result = contentDetector.detectTypes('Exception in thread main');
    assert(result.includes('error'));
  });

  it('detects traceback', () => {
    const result = contentDetector.detectTypes('Traceback (most recent call last)');
    assert(result.includes('error'));
  });

  it('falls back to text when nothing matches', () => {
    const result = contentDetector.detectTypes('just some regular words');
    assert.deepStrictEqual(result, ['text']);
  });

  it('returns multiple types for mixed content', () => {
    const result = contentDetector.detectTypes('Error: failed\n```\ncode\n```\n- list item');
    assert(result.includes('error'));
    assert(result.includes('code'));
    assert(result.includes('list'));
  });

  it('detects errno', () => {
    const result = contentDetector.detectTypes('errno 111: connection refused');
    assert(result.includes('error'));
  });
});
