import { describe, it, before } from 'node:test';
import assert from 'node:assert';

describe('timeParserService.parse', () => {
  let timeParserService: any;

  before(() => {
    timeParserService = require('../src/services/timeParser.service').timeParserService;
  });

  it('parses "вчера" as yesterday full UTC day', () => {
    const result = timeParserService.parse('вчера');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const start = new Date(Date.UTC(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999));

    assert.strictEqual(result.date_from.getTime(), start.getTime());
    assert.strictEqual(result.date_to.getTime(), end.getTime());
  });

  it('parses "позавчера" as day-before-yesterday UTC day', () => {
    const result = timeParserService.parse('позавчера');
    const dayBefore = new Date();
    dayBefore.setDate(dayBefore.getDate() - 2);
    const start = new Date(Date.UTC(dayBefore.getFullYear(), dayBefore.getMonth(), dayBefore.getDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(dayBefore.getFullYear(), dayBefore.getMonth(), dayBefore.getDate(), 23, 59, 59, 999));

    assert.strictEqual(result.date_from.getTime(), start.getTime());
    assert.strictEqual(result.date_to.getTime(), end.getTime());
  });

  it('parses "последние 3 дня" as last 3 days from now', () => {
    const result = timeParserService.parse('последние 3 дня');
    const from = new Date();
    from.setDate(from.getDate() - 3);
    const start = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0));

    assert.strictEqual(result.date_from.getTime(), start.getTime());
    assert(result.date_to instanceof Date);
  });

  it('parses "последних 5 дней" as last 5 days from now', () => {
    const result = timeParserService.parse('последних 5 дней');
    const from = new Date();
    from.setDate(from.getDate() - 5);
    const start = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0));

    assert.strictEqual(result.date_from.getTime(), start.getTime());
  });

  it('defaults to last 7 days when no keywords match', () => {
    const result = timeParserService.parse('show me everything');
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const start = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0));

    assert.strictEqual(result.date_from.getTime(), start.getTime());
    assert(result.date_to instanceof Date);
  });

  it('combines "вчера" with time filter "после 14:00"', () => {
    const result = timeParserService.parse('вчера после 14:00');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    assert.strictEqual(result.date_from.getUTCHours(), 14);
    assert.strictEqual(result.date_from.getUTCMinutes(), 0);
    assert.strictEqual(result.date_from.getUTCDate(), yesterday.getDate());
  });

  it('combines date range with "до HH:MM"', () => {
    const result = timeParserService.parse('вчера до 18:30');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    assert.strictEqual(result.date_to.getUTCHours(), 18);
    assert.strictEqual(result.date_to.getUTCMinutes(), 30);
    assert.strictEqual(result.date_to.getUTCDate(), yesterday.getDate());
  });

  it('stores original query', () => {
    const result = timeParserService.parse('вчера');
    assert.strictEqual(result.original_query, 'вчера');
  });

  it('is case insensitive', () => {
    const r1 = timeParserService.parse('Вчера');
    const r2 = timeParserService.parse('ВЧЕРА');
    const r3 = timeParserService.parse('вчера');

    assert.strictEqual(r1.date_from.getTime(), r2.date_from.getTime());
    assert.strictEqual(r2.date_from.getTime(), r3.date_from.getTime());
  });
});
