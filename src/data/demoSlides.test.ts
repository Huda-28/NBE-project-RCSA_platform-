import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_SLIDES,
  ROLE_MATRIX_SUMMARY,
  METHODOLOGY_SLIDES,
  FINANCIAL_BANDS_TABLE,
  RRF_MATRIX_ROWS,
  MODEL_EVOLUTION_MILESTONES,
  METHODOLOGY_REFERENCES,
} from './demoSlides.js';

const VALID_TARGET_PAGES = new Set([
  'dashboard',
  'agent',
  'backend-rcsa',
  'business-units',
  'rcsa-table',
  'reviews',
  'audit',
  'admin',
]);

test('DEMO_SLIDES contains 13 sequential slides with complete non-tech Arabic content', () => {
  assert.equal(DEMO_SLIDES.length, 13);

  DEMO_SLIDES.forEach((slide, idx) => {
    assert.equal(slide.number, idx + 1, `Slide ${slide.id} should have number ${idx + 1}`);
    assert.equal(slide.indexLabel, String(idx + 1).padStart(2, '0'));
    assert.ok(slide.title.trim().length > 8, `Slide ${slide.id} needs a clear title`);
    assert.ok(slide.subtitle.trim().length > 15, `Slide ${slide.id} needs a clear subtitle`);
    assert.ok(slide.presenterNotes.trim().length > 25, `Slide ${slide.id} needs presenter notes`);
    assert.ok(slide.section.trim().length > 2, `Slide ${slide.id} needs a section label`);

    if (slide.jumpTarget) {
      assert.ok(
        VALID_TARGET_PAGES.has(slide.jumpTarget.page),
        `Invalid jump target page on slide ${slide.id}: ${slide.jumpTarget.page}`
      );
      assert.ok(slide.jumpTarget.label.trim().length > 3);
    }
  });
});

test('DEMO_SLIDES accurately preserves key NBE methodology facts and demo personas', () => {
  const combinedText = DEMO_SLIDES.map((s) => `${s.title} ${s.subtitle} ${s.presenterNotes}`).join(' ');
  assert.match(combinedText, /29/);
  assert.match(combinedText, /5×5/);
  assert.match(combinedText, /NFI/);
  assert.match(combinedText, /ESG/);
  assert.match(combinedText, /Key Risk/);
  assert.match(combinedText, /أحمد محمود/);
  assert.match(combinedText, /سارة إبراهيم/);
  assert.match(combinedText, /طارق رضوان/);
  assert.match(combinedText, /هدى سامي/);
});

test('ROLE_MATRIX_SUMMARY covers all 4 bank governance roles with demo IDs', () => {
  assert.equal(ROLE_MATRIX_SUMMARY.length, 4);
  const roleCodes = ROLE_MATRIX_SUMMARY.map((r) => r.roleEn);
  assert.deepEqual(roleCodes, ['Maker', 'Checker', 'Auditor', 'Risk Admin']);
  ROLE_MATRIX_SUMMARY.forEach((role) => {
    assert.ok(role.permissions.length >= 3);
    assert.ok(role.restriction.length > 10);
    assert.match(role.employeeId, /EMP-\d{4}/);
  });
});

test('METHODOLOGY_SLIDES contains 13 English deep-dive slides without SOTA branding', () => {
  assert.equal(METHODOLOGY_SLIDES.length, 13);

  METHODOLOGY_SLIDES.forEach((slide, idx) => {
    assert.equal(slide.number, idx + 1, `Deep slide ${slide.id} should have number ${idx + 1}`);
    assert.equal(slide.indexLabel, String(idx + 1).padStart(2, '0'));
    assert.ok(slide.title.trim().length > 10);
    assert.ok(slide.subtitle.trim().length > 20);
    assert.ok(slide.presenterNotes.trim().length > 30);
    if (slide.jumpTarget) {
      assert.ok(VALID_TARGET_PAGES.has(slide.jumpTarget.page));
    }
  });

  const allText = METHODOLOGY_SLIDES.map(
    (s) => `${s.section} ${s.title} ${s.subtitle} ${s.presenterNotes} ${s.keyQuestion || ''} ${s.keyAnswer || ''}`
  ).join(' ');
  assert.doesNotMatch(allText, /\bsota\b/i, 'METHODOLOGY_SLIDES must not use the term SOTA');
  assert.match(allText, /RRF/);
  assert.match(allText, /BM25/);
  assert.match(allText, /gemini-embedding-2/);
  assert.match(allText, /qwen3\.5:4b/);
  assert.match(allText, /stripForbiddenLlmFields/);
  assert.match(allText, /Key Risk/);
  assert.match(allText, /Cormack/);
});

test('Methodology tables, evolution milestones & references match exact parameters and omit SOTA', () => {
  assert.equal(FINANCIAL_BANDS_TABLE.length, 5);
  assert.equal(FINANCIAL_BANDS_TABLE[0].anchorEgp, '50,000');
  assert.equal(FINANCIAL_BANDS_TABLE[4].anchorEgp, '3,001,000');

  assert.equal(RRF_MATRIX_ROWS.length, 3);
  assert.equal(RRF_MATRIX_ROWS[0].preventive, '95%');
  assert.equal(RRF_MATRIX_ROWS[2].corrective, '30%');

  assert.equal(MODEL_EVOLUTION_MILESTONES.length, 5);
  assert.match(MODEL_EVOLUTION_MILESTONES[0].commitRef, /4301a33/);
  assert.match(MODEL_EVOLUTION_MILESTONES[1].commitRef, /8c5c335/);
  assert.match(MODEL_EVOLUTION_MILESTONES[2].commitRef, /13160f5/);
  assert.match(MODEL_EVOLUTION_MILESTONES[3].commitRef, /d8379bd/);
  assert.match(MODEL_EVOLUTION_MILESTONES[4].stage, /V5/i);
  assert.doesNotMatch(JSON.stringify(MODEL_EVOLUTION_MILESTONES), /\bsota\b/i);

  assert.equal(METHODOLOGY_REFERENCES.length, 3);
  const refsText = JSON.stringify(METHODOLOGY_REFERENCES);
  assert.doesNotMatch(refsText, /\bsota\b/i);
  assert.match(refsText, /Cormack/);
  assert.match(refsText, /Robertson/);
  assert.match(refsText, /Nogueira/);
  assert.match(refsText, /Dosovitskiy/);
  assert.match(refsText, /Liu/);
  assert.match(refsText, /Lewis/);
  assert.match(refsText, /Madaan/);
  assert.match(refsText, /OWASP/);
  assert.match(refsText, /NIST/);
  assert.match(refsText, /Basel/);
  assert.match(refsText, /Central Bank of Egypt/);
});
