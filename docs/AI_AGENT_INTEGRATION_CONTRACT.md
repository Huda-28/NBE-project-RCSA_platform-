# Custom RCSA Agent — implementation handoff (NOT IMPLEMENTED)

## Purpose and fixed scope
The next phase adds a **custom, server-side agent** using a **self-hosted/open-weight language model** with provider-agnostic inference, RAG, document understanding, persistent sessions and bounded tool calls. It must **not depend on Gemini or any paid API**. Server/LLM sizing and inference quality require later deployment testing; do not promise uninterrupted local inference before that check.

The agent must support three top-level user intents in professional Arabic:

1. **Create RCSA** for an authorized BU from newly uploaded SOPs, incident reports, audit findings, CSV and the official bank methodology, producing a **draft**.
2. **Update RCSA** after a new/revised SOP or incident; compare the document to **every available historical RCSA assessment and document version for that BU**, not merely its latest version, and propose a reasoned, source-cited before/after change set.
3. **Explain/answer** questions about *actual* risk ratings, frequency/impact, MAX eligible control RRF, residual amount, NFI, ESG, acceptance rationale, source changes, employees' review history and missing inputs; retrieve and show calculations rather than inventing answers.

## Existing integration points (do not duplicate)

- Business-unit authorization and roles: `src/server/auth.ts` and the existing API; **all agent APIs must repeat server-side BU authorization**.
- Uploads and extracted evidence: `documents`, `document_chunks`, source registry and `rcsa_engine/document_extract.py`. Extraction is **not** an AI risk inference.
- Assessment/version history: `rcsa_assessments`, `hitl_assessment_meta`, `hitl_risk_packages`, immutable snapshots and field audit history.
- Historical comparison: `getUnitAssessmentsHistory`, `compareUnitAssessmentVersions` in `src/server/hitl-service.ts`. Add retrieval over **all** saved versions/approved snapshots, respecting incomplete legacy history; do not hallucinate missing change events.
- Financial, heat maps, controls/RRF and residual: `rcsa_engine/cli_bridge.py` and associated authoritative Python modules.
- NFI, ESG, final acceptance: `rcsa_engine/phase2c.py`, `rcsa_engine/esg_taxonomy.py`, `reference_data/ESG_CBE_OpRisk_Categories_34.json`; the agent can **suggest** statuses and catalogue references, but never mark reviewer decisions as approved.
- Interactive risk review and approval: existing `RCSATablePage`, Maker–Checker workflow, audit logs and approved-version immutability. Agent outputs enter a **new editable draft**; never modify an approved assessment.
- Official Excel: current exporter accepts completed approved Syndicated Loans assessment only. For other BUs, request their actual bank templates; never invent formatting or mark them export-ready.

## Proposed pipeline

`Uploaded source -> secure extraction -> document version & hash -> chunk indexing -> hybrid keyword/semantic retrieval -> historical diff candidate discovery -> LLM structured comparison -> schema validation -> evidence grounding and taxonomy checks -> draft change proposals -> human review -> Python recalculation -> Maker–Checker -> approved version -> Excel`.

- First enumerate **all** risks and controls in the authorized BU across available versions, **then** use retrieval to select detailed passages; do not let nearest-neighbor matches hide older or removed risks.
- Compare SOP sections by stable document IDs, section references and effective dates. Distinguish entirely new risks vs altered controls vs changed review inputs. Track source page/paragraph IDs and before/after values.
- Store individual proposed changes, including `risk_id`, `control_id`, `assessment_id`, old/new text, rationale, citation IDs, uncertainty, and recommended action `ADD/UPDATE/NO_CHANGE/NEEDS_INPUT`.
- Require human evidence for implementation status, impact/frequency, control effectiveness, NFI dimensions and E/S/G classification. No missing-to-zero, no made-up dates, and no risk acceptance decision by AI.
- **Never** use the LLM to compute expected annual loss, financial band, RRF, residual or bank-specific matrices. Call existing Python engines and return their exact outputs.
- The LLM has no database write privileges; its proposed edits are validated and saved via existing authorized APIs with detailed field-audit events.

## Provider-agnostic model adapter

An agent-only `LLMProvider` interface should accept messages, retrieved context and a strict JSON Schema, and return parsed outputs and usage metadata. Implement a configurable **self-hosted OpenAI-compatible endpoint or Ollama** adapter (without hardcoding one model name). Use model capability testing for Arabic procedure comparison, JSON validity, citation fidelity and response latency. Agent must preserve queued work and progress across server restarts and expose honest `UNAVAILABLE / RETRYABLE / MANUAL_REVIEW` states if inference fails; no fake fallback answers.

## Acceptance trials before showing bank testers

1. Load a completely **new** SOP, including PDF/DOCX/XLSX/CSV source text as applicable; show extracted sections and source references.
2. Generate a new RCSA draft with risk/control candidates and explicit missing input prompts; open the same draft in the Phase 2D reviewer.
3. Upload a modified SOP and compare every historical assessment for the BU; explain which risk and control changed and *why*, with a real paragraph citation.
4. Confirm unchanged/irrelevant SOP changes do not alter ratings or controls.
5. Explain a `MAX RRF` and residual amount by quoting real eligible controls and the Python result; confirm the calculation is not fabricated.
6. Preserve the old approved assessment and create a new draft with audit history.
7. Simulate LLM unavailability halfway through extraction/proposals, restart server, and resume saved progress without losing completed risk items.
8. Verify Maker, Checker, Auditor and Admin permissions, including forbidden self-approval.
9. Show unsupported/no-evidence status for missing historical sources; never invent documents, users or old versions.
10. Export through the official bank template only after human approval and data completeness.

## IMPORTANT
No model training, AI output generation, provider API calls, or generated AI drafts are implemented in this pre-Agent release. The existing `AIAgentPage.tsx` is a clearly marked preview only.
