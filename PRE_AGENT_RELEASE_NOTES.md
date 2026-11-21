# Pre-Agent RCSA Platform — updated integration and verification

## Starting point and preserved scope
Changes were applied to the previously delivered `RCSA_Platform_pre_agent_updated.zip`. The original NBE silver/Arabic RTL interface, Dashboard, historical version registry, Business Units, guided assessment, Maker–Checker, Python financial/control/RRF engines, SQLite data and reference workbook were preserved. The **AI Agent itself has not been implemented**.

## Corrections in this update

- Verified the supplied `ESG_CBE_OpRisk_Categories(3).xlsx` has **34 entries: 20 Environmental, 7 Social and 7 Governance**. Added `reference_data/ESG_CBE_OpRisk_Categories_34.json` converted directly from its rows 4–37.
- Introduced `rcsa_engine/esg_taxonomy.py`: explicit crosswalk of CBE L1 names to the project's eight operational-risk L1 IDs; recognizes official workbook legacy `_2_`, `_5_`, `_8_` risk labels. Requires reviewer-selected source catalogue IDs matching the chosen pillars, and documented explanation when catalogue L1 differs from selected risk L1. **No automatic classification or AI inference is claimed**. Catalogue L2 reference is shown to reviewer but no underlying per-risk L2 selection was present in the existing review model, so individual risk-to-L2 concordance is not yet a completed check.
- Phase 2C API retrieves the persisted risk's L1 and financial rating on the server instead of trusting values supplied by the browser, and revalidates both at XLSX export. Phase 2C assessment inputs/results persist with evidence and Audit Trail.
- After a risk/control recalculation, or an accepted L1 taxonomy suggestion, its saved NFI/ESG/acceptance results are marked stale until revalidated. Readiness and bank-column preview do not present stale values as approved current results. Approval enforcement for Phase 2C is enabled in normal development and production execution; old regression test compatibility mode (`NODE_ENV=test`) retains the pre-Phase-2C approval path.
- Cleaned out obsolete `NOT_IMPLEMENTED` placeholders in RCSA review/official column preview, and refreshes parent readiness after saving Phase 2C inputs.
- Fixed core risk L1 synchronization that formerly guessed L1 based on any `2`, `5`, or `7` digit in text. Missing taxonomy now stores a visible `L1-PENDING` sentinel, not a fabricated class.
- Restored full binary file uploads: previous frontend silently truncated at 250 KB. New 6 MB limit rejects partial/oversize uploads; stored-file text extraction now supports selectable-text PDF (optional `pypdf`), DOCX and XLSX (Python standard library) plus CSV and plain text. Scanned/unreadable PDFs explicitly show manual review, and **extraction never means an AI has identified risks**.
- Verified the new official Syndicated Loans template supplied in this conversation is byte-for-byte identical to the original embedded workbook; ESG header already exists at `Risk Profile!AE6`. The exporter writes E/S/G in AE and operational L1 in AD, preserving 34 original merged ranges and all unrelated XLSX components. An approved assessment with actual reviewed NFI, ESG, acceptance, and 8 correct Risk IDs is required.
- Documented the future custom self-hosted/open-weight LLM agent's RAG, all-version historical comparison, new RCSA creation, existing RCSA update, grounded explanations, resuming interrupted work, and Maker–Checker handoff in `docs/AI_AGENT_INTEGRATION_CONTRACT.md`.

## Honest test evidence

- Python unit suite `python -m unittest discover -s tests -p 'test_*.py' -q`: **76 tests passed**, including new ESG source alignment and document extraction tests.
- Global TypeScript syntactic transpilation of **25 frontend/server TS/TSX files**: **0 syntax diagnostics**. This is not type-checking or runtime proof.
- The original bank XLSX reference was compared with the latest user-uploaded official XLSX by SHA-256 and the digests matched. Existing export structural checks preserve the 19 XLSX package members and all 34 template merged-cell ranges.
- **Not executed here:** npm dependency installation, `npm test`, `npm run lint`, `npm run build`, real browser tests, SQLite HTTP login/roles workflow. `node_modules` is absent and global `tsc --noEmit` fails on missing `vite/client` type definitions. Earlier Google Studio Node test counts are not independent evidence for this updated ZIP.

## Limitations to resolve during actual web acceptance

1. Validate all four role-specific user sessions in a live browser and real SQLite/API workflows. See `docs/ROLE_ACCEPTANCE_MATRIX.md`.
2. Install Node dependencies, execute the full Node tests, type-check, build and verify app startup and actual XLSX download.
3. Test PDF/DOCX/XLSX/CSV ingestion on actual bank-authorized files, including scanned-PDF/manual-review cases; install `requirements-document-extraction.txt` to enable PDF text extraction.
4. For BUs other than Syndicated Loans, exact branded bank Excel templates are not supplied; do not advertise unsupported official exports.
5. A language-model-generated ESG classification or new RCSA from a fresh SOP **does not exist yet**. These functions belong to the future Agent phase; reference-mapped/manual Phase 2C is now available.
6. Any CBE L2 mapping shown by the catalogue is **reference information**; the underlying risk draft currently stores L1 only. Later add governed L2/L3 selection if the bank requires formal L2 alignment.
7. Demo data and credentials must not be treated as actual bank production data; rotate secrets, confirm server permissions and data-policy clearance before deployment.

**No claim of bank production certification. The updated project is a tested pre-Agent implementation candidate, subject to web integration acceptance.**

## Export naming and user-facing page summary
- Official XLSX downloads now use the recorded **Business Unit name** and **actual approval date** in their filenames (UTF-8 Arabic filename with an ASCII fallback), rather than internal assessment IDs. Missing approved timestamps are never invented.
- RCSA review's C..AE **table preview** is available before export, but is not a pixel-exact rendering of the styled XLSX workbook. The exported XLSX preserves the official bank workbook structure and styling.
- See `docs/PAGE_FUNCTIONS_AND_EXPORT_AR.md` for concise Arabic page responsibilities and the exact export availability limitation.
