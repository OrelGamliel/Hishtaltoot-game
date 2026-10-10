import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizePack } from './packs';

const dir = join(__dirname, '..', '..', 'public', 'packs');

describe('normalizePack', () => {
  it('accepts a valid pack and drops broken questions', () => {
    const p = normalizePack({
      id: 'x',
      name: ' Test ',
      lang: 'en',
      questions: [
        { prompt: 'Q1', answer: 'A1' },
        { prompt: '', image: 'data:image/png;base64,AA', answer: 'A2' },
        { prompt: 'no answer' },
        { prompt: 'num', answer: 42 },
        null,
      ],
    });
    expect(p).toEqual({
      id: 'x',
      name: 'Test',
      lang: 'en',
      questions: [
        { prompt: 'Q1', answer: 'A1' },
        { prompt: '', image: 'data:image/png;base64,AA', answer: 'A2' },
        { prompt: 'num', answer: '42' },
      ],
    });
  });

  it('rejects junk and generates an id when missing', () => {
    expect(normalizePack(null)).toBeNull();
    expect(normalizePack({ name: 'x' })).toBeNull();
    expect(normalizePack({ name: 'x', questions: [] })!.id).toMatch(/^custom-/);
  });

  it('builds picture questions from an images array and ignores _questions', () => {
    const p = normalizePack({
      id: 'pics',
      name: 'Pics',
      lang: 'en',
      images: [
        { url: ' https://a/1.jpg ', answer: ' One ' },
        { url: 'https://a/2.jpg', answer: 2 },
        { url: '', answer: '' }, // template entry
        { url: 'https://a/3.jpg' }, // no answer
        { answer: 'no url' },
        'https://a/4.jpg', // plain strings are not accepted
        null,
      ],
      _questions: [{ prompt: 'old', answer: 'old' }],
    });
    expect(p!.questions).toEqual([
      { prompt: '', image: 'https://a/1.jpg', answer: 'One' },
      { prompt: '', image: 'https://a/2.jpg', answer: '2' },
    ]);
  });
});

describe('shipped packs', () => {
  const files: string[] = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));

  it('lists only existing pack files, with unique ids', () => {
    expect(files.length).toBeGreaterThan(0);
    const packs = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
    expect(new Set(packs.map((p) => p.id)).size).toBe(packs.length);
    expect(new Set(files).size).toBe(files.length);
  });

  it.each(files)('%s is a valid picture pack with unique image URLs', (f) => {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const p = normalizePack(raw)!;
    expect(p).not.toBeNull();
    expect(p.id).toBe(raw.id);
    expect(Array.isArray(raw.images)).toBe(true);
    for (const item of raw.images) {
      expect(typeof item.url).toBe('string');
      expect(typeof item.answer).toBe('string');
    }
    const filled = raw.images.filter((i: { url: string; answer: string }) => i.url.trim() && i.answer.trim());
    expect(p.questions.length).toBe(filled.length);
    expect(new Set(p.questions.map((q) => q.image)).size).toBe(p.questions.length);
  });

  const withText = files.filter((f) => '_questions' in JSON.parse(readFileSync(join(dir, f), 'utf8')));

  it.each(withText)('%s keeps its disabled text questions (40+, unique)', (f) => {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const text = normalizePack({ name: raw.name, questions: raw._questions })!;
    expect(text.questions.length).toBe(raw._questions.length);
    expect(text.questions.length).toBeGreaterThanOrEqual(40);
    expect(new Set(text.questions.map((q) => q.prompt)).size).toBe(text.questions.length);
  });
});
