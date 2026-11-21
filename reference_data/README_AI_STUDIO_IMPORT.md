# Google AI Studio — Excel-readable exports

These files are **readable representations** of the three original XLSX workbooks. Upload the **JSON** files first; optionally upload CSV files for tabular data.

- `Official_RCSA_Template__*.json`: actual Excel cell addresses, contents, formula strings, style indices and merged ranges. **This is NOT a replacement for the original styled Excel workbook.**
- `Risk_Taxonomy__*.json`: original L1/L2/L3 reference values from each sheet.
- `ESG_Catalogue__*.json`: ESG reference catalogue.
- `WORKBOOK_INVENTORY.json`: parsed worksheet manifest.

**Critical**: to preserve exact fill colors, formulas, borders, RTL, merged cells, validations, images and export layout, the implementation must later receive and retain the **original XLSX bytes** as server-side assets. JSON/CSV extracts are only for reading and planning. The exported file must be produced by filling the original template, not by recreating it from CSV/JSON. If the AI Studio environment does not accept XLSX, keep it in a local `assets/templates` folder when assembling the project in VS Code.

Ask AI Studio to verify workbook names, sheet counts, every taxonomy path and ESG entry using these extracted files. Never fabricate missing cells or assume a fixed AD/AE mapping.
