# Roles and permissions — verification matrix

The application displays the primary account role in the header in Arabic. Sidebar visibility is role-sensitive and **the backend remains the real permission boundary**.

| Account role | Dashboard / permitted BUs | Guided creation | RCSA review | Approval | Audit trail | Manage users / create BU |
|---|---|---|---|---|---|---|
| Maker (مُعد) | Assigned BUs | Yes, assigned BU | Edit drafts, recalculate, submit | No | Risk-level audit in workbench | No |
| Checker (مراجع) | Assigned BUs | No | View eligible review queue, inspect details | Yes, only other Maker's submission | Risk-level audit in workbench | No |
| Auditor (مدقق) | Read-only across authorized audit scope | No | Read-only | No | Central audit page | No |
| Risk Admin (مدير النظام) | All available BUs | Yes | Manage and supervise drafts | Allowed under Maker–Checker separation; cannot approve own work | Central audit page | Yes |

**Important:** A person may have different roles in different BUs. Global roles must not be confused with assigned unit roles. `AUDITOR` does not inherit `MAKER` or `CHECKER` permission. `RISK_ADMIN` still cannot self-approve.

## Browser acceptance walk-through (NOT EXECUTED IN THIS WORKSPACE)

1. Log in with one bank-provisioned Maker account; verify header role and editable draft only in assigned BU, and that guided assessment is accessible.
2. Log in with another authorized Checker; verify draft inputs read-only, review and approve/return controls visible, and edit/creation controls unavailable.
3. Try Maker's own approval and unauthorized direct API requests; require HTTP 403 even when bypassing UI.
4. Log in with Auditor; verify read-only RCSA and audit page, and no create/edit/approve/admin actions.
5. Log in with Risk Admin; verify all BUs, admin user assignments and new BU creation; attempt self-approval and require rejection.
6. Verify last editor and timestamps in the BU version list, and that approved versions are immutable.
7. Open an RCSA draft, save Phase 2C, edit its financial input, and verify Phase 2C changes to `PENDING_INPUT` until revalidated.
8. Upload a new actual PDF/DOCX/XLSX/CSV and inspect the extracted chunks; a scanned PDF must explicitly request manual review.
9. Complete all required inputs and use Maker–Checker approval; export only the 8-risk Syndicated Loans assessment with the authentic XLSX.

For all scenarios capture browser screenshots, relevant API status codes and database audit evidence. This page documents **expected** behavior and cannot substitute for live UI evidence.
