import { describe, expect, it } from 'vitest';
import {
  cleanImages,
  extForContentType,
  formatPack,
  imageBaseName,
  isValidPackId,
  matchFlagCode,
  packFileFromUrl,
  parseAnswers,
} from './pack-utils.mjs';

describe('parseAnswers', () => {
  it('reads one answer per line, skipping blanks, comments and duplicates', () => {
    const text = '# fruits\nתפוח\n\n  בננה  \r\nתפוח\n';
    expect(parseAnswers(text)).toEqual([
      { answer: 'תפוח', query: 'תפוח' },
      { answer: 'בננה', query: 'בננה' },
    ]);
  });

  it('supports "answer | query" overrides', () => {
    expect(parseAnswers('ישראל | il\nצרפת |')).toEqual([
      { answer: 'ישראל', query: 'il' },
      { answer: 'צרפת', query: 'צרפת' },
    ]);
  });
});

describe('matchFlagCode', () => {
  const codes = { il: 'Israel', fr: 'France', 'gb-eng': 'England', gb: 'United Kingdom', us: 'United States', 'us-ny': 'New York' };
  it('accepts codes, names and partial names', () => {
    expect(matchFlagCode('IL', codes)).toBe('il');
    expect(matchFlagCode('gb eng', codes)).toBe('gb-eng');
    expect(matchFlagCode('france', codes)).toBe('fr');
    expect(matchFlagCode('United Kingdom', codes)).toBe('gb');
    expect(matchFlagCode('united', codes)).toBe('gb');
    expect(matchFlagCode('Narnia', codes)).toBeNull();
  });
});

describe('formatPack', () => {
  it('puts one image per line and round-trips', () => {
    const pack = { id: 'x', name: 'X', lang: 'he', images: [{ url: '/packs/x/a.png', answer: 'א "ב"' }] };
    const s = formatPack(pack);
    expect(s).toContain('    { "url": "/packs/x/a.png", "answer": "א \\"ב\\"" }');
    expect(JSON.parse(s)).toEqual(pack);
    expect(formatPack({ id: 'x', images: [] })).toContain('"images": []');
  });
});

describe('helpers', () => {
  it('validates pack ids', () => {
    expect(isValidPackId('he-fruits')).toBe(true);
    expect(isValidPackId('../etc')).toBe(false);
    expect(isValidPackId('Fruits')).toBe(false);
  });

  it('maps content types to extensions', () => {
    expect(extForContentType('image/jpeg; charset=x')).toBe('jpg');
    expect(extForContentType('image/svg+xml')).toBe('svg');
    expect(extForContentType('text/html')).toBeNull();
  });

  it('names images stably', () => {
    expect(imageBaseName('תפוח')).toBe(imageBaseName('תפוח'));
    expect(imageBaseName('תפוח')).not.toBe(imageBaseName('תפוח', 'v2'));
  });

  it('only resolves local files of the same pack', () => {
    expect(packFileFromUrl('he-fruits', '/packs/he-fruits/ab12.jpg')).toBe('ab12.jpg');
    expect(packFileFromUrl('he-fruits', '/packs/he-fruits/../index.json')).toBeNull();
    expect(packFileFromUrl('he-fruits', '/packs/other/ab12.jpg')).toBeNull();
    expect(packFileFromUrl('he-fruits', 'https://x/ab12.jpg')).toBeNull();
  });

  it('drops blank template entries', () => {
    expect(cleanImages([{ url: '', answer: '' }, { url: 'u', answer: '' }])).toEqual([{ url: 'u', answer: '' }]);
  });
});
