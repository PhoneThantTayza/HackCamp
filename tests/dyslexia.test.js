import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = vm.createContext({});
vm.runInContext(readFileSync('client/public/dyslexia.js', 'utf8'), context);
const { suggest, createController } = context.clearspaceDyslexia;

test('presets have different primary effects and combine without weakening other choices', () => {
  const words = suggest({ experiences: { distinguishWords: true } });
  assert.equal(words.wordHighlight, true); assert.equal(words.lineLength, null);
  const fatigue = suggest({ experiences: { readingFatigue: true } });
  assert.equal(fatigue.focusParagraph, true); assert.equal(fatigue.font, null);
  const paragraphs = suggest({ experiences: { overwhelmingParagraphs: true } });
  assert.equal(paragraphs.paragraphSpacing, 0.9); assert.equal(paragraphs.lineLength, 60);
  const tracking = suggest({ experiences: { losePlace: true } });
  assert.equal(tracking.guide, true); assert.equal(tracking.focusParagraph, false);
  const combined = suggest({ experiences: { distinguishWords: true, readingFatigue: true, overwhelmingParagraphs: true, losePlace: true } });
  assert.equal(combined.wordHighlight, true); assert.equal(combined.focusParagraph, true);
  assert.equal(combined.guide, true); assert.equal(combined.lineLength, 60);
});

test('customization is explicit, bounded, and cannot inject CSS', () => {
  const settings = suggest({ experiences: { distinguishWords: true }, customization: {
    wordHighlight: false, font: 'serif', letterSpacing: 999, lineHeight: 2,
  } });
  assert.equal(settings.font, 'serif'); assert.equal(settings.wordHighlight, false);
  assert.equal(settings.letterSpacing, 0.2); assert.equal(settings.lineHeight, 2);
  const invalid = suggest({ experiences: { distinguishWords: 'yes' }, customization: {
    font: 'Arial; } body { display:none', background: '#fff; }', textColor: 'red', lineHeight: '2;display:none', letterSpacing: Infinity,
  } });
  assert.equal(invalid.font, null); assert.equal(invalid.background, null); assert.equal(invalid.lineHeight, null);
  for (const value of [null, [], 'html', 0]) assert.equal(suggest(value).font, null);
  assert.equal(suggest({ customization: { font: { toString: null } } }).font, null);
  assert.throws(() => createController('<html>'), /live Document/);
});

test('vision line spacing combines predictably', () => {
  const settings = suggest({ experiences: { visualStress: true }, customization: { lineHeight: 1.2 } }, {
    highContrast: true, extraLineSpacing: true,
  });
  assert.equal(settings.background, null); assert.equal(settings.textColor, null);
  assert.equal(settings.lineHeight, 1.8);
});

test('retired reading colors are ignored even in previously saved preferences', () => {
  const settings = suggest({ customization: { background: '#ffffff', textColor: '#ffffff' } });
  assert.equal(settings.textColor, null); assert.equal(settings.background, null);
  const dark = suggest({ customization: { background: '#111111', textColor: '#121212' } });
  assert.equal(dark.textColor, null); assert.equal(dark.background, null);
  const retired = suggest({ experiences: { visualStress: true, losePlace: true }, customization: { guideColor: '#abcdef' } });
  assert.equal(retired.background, null); assert.equal(retired.textColor, null);
  assert.equal(retired.guide, true); assert.equal(retired.guideColor, '#abcdef');
  assert.equal(suggest().background, null);
});

test('unsupported requests report missing engines without silently rewriting text', () => {
  assert.deepEqual(Array.from(suggest({ experiences: {
    unfamiliarWords: true, writingDifficulty: true, preferListening: true,
  } }).needsSeparateEngine), ['wordExplanations', 'spellingAndGrammar', 'speech']);
});
