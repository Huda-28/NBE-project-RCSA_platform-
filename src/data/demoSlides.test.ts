import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_SLIDES, ROLE_MATRIX_SUMMARY } from './demoSlides.js';

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
