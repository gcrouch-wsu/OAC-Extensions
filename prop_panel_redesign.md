# Glossary Pivot: parameter labels, totals, and property-panel redesign

Date: 2026-10-15

Status: diagnosis and proposed scope for review with Corinna. This document does not implement changes. The reviewed source and packaged renderer are Glossary Pivot 0.19.0.

## Purpose

Combine the small tables in the original OBIEE report into one Glossary Pivot controlled by a workbook parameter. First correct totals and support independent parameter-driven column labels. Then simplify the property panel without changing those results or requiring authors to recreate saved settings.

## Report behavior

College, Term, and Headcount remain on the pivot. The View By selection changes the selected count and percentage:

| View By | Columns displayed |
|---|---|
| Minority | College, Term, Headcount, Minority, % Minority |
| First Gen | College, Term, Headcount, First Gen, % First Gen |
| WA State | College, Term, Headcount, WA State (Geog Origin), % WA State (Geog Origin) |

The final display name for WA State (Geog Origin) remains a business decision. A later rename should be a configuration change.

The workbook owns the parameter control and the calculations selecting the measures. The selector chooses a metric; it should preserve the Headcount denominator population under the report's other filters. Filtering the whole population to minority students, for example, would change the denominator.

## Corinna's clarification: every column is independent

Corinna proposed:

```text
measure_selected:@parameter("View By Selector");pct_measure_selected:% @parameter("View By Selector");
```

Here:

- `measure_selected` is one calculated measure in the workbook.
- `pct_measure_selected` is a separate calculated measure in the workbook.
- `View By Selector` is the workbook parameter's name.
- Each entry defines the display header for the field to the left of its colon.
- The semicolon separates entries. The trailing semicolon is acceptable in the existing parser.
- `% ` is literal header text. It does not calculate a percentage or change number formatting.

Expected results:

| Parameter value | Header for `measure_selected` | Header for `pct_measure_selected` |
|---|---|---|
| Minority | Minority | % Minority |
| First Gen | First Gen | % First Gen |
| WA State | WA State | % WA State |

The parameter value supplies the text; a longer final WA State caption can be chosen in the workbook's labeling design.

**Assessment: this is the correct scope.** The extension must support a label template for each configured field. It must not assume that there are exactly two dynamic fields, infer a percentage companion, or hardcode Minority, First Gen, or WA State. One field may use a parameter, another may use a different parameter, and another may have a fixed label.

For example, this should also be a valid configuration:

```text
measure_selected:@parameter("View By Selector");pct_measure_selected:Share of Headcount;
```

Changing the label does not rename the calculated field, alter its formula, or replace its underlying identity. Formatting, total rules, glossary associations, and marking must continue to address the original field.

## Current implementation and diagnosis

### Independent mappings already exist; parameter resolution does not

`headerLabels` already uses `NAME: Display text; ...`. The current parser splits entries by semicolon and each entry at its first colon. The renderer looks up each field independently using its original identifier, identifier tail, or display name.

I tested Corinna's exact example against a synthetic layout with opaque calculated-field IDs (`c34`, `c35`) and display names `measure_selected`, `pct_measure_selected`. Both mappings matched the correct field independently. The renderer printed the parameter expressions literally instead of resolving their values.

The required functional change is to resolve each matching label template against the current workbook parameter values. Adding a special two-column naming feature would miss Corinna's requirement.

Relevant source:

- [Header parser and matching](oac-sdk-dev/src/customviz/com-wsu-glossary-pivot/glossaryPivotViz.js): `parseHeaderLabels`, `resolveHeaderLabel`.
- Same file: `_buildTable` applies the label override to measure headers and grand-total column names.
- Same file: `headerLabelsGadget` is the existing text control in the property panel.

### The earlier totals fix did not implement distinct-count totals

Version 0.17.0, commit `b7247e5` (2026-09-29), added sum, average, min, max, none, weighted-average, and ratio rules. It corrected rate/average totals with authored rules. It did not add distinct-count totals; sum remains the default.

Synthetic reproduction:

| Group | Entity IDs | Distinct count |
|---|---|---:|
| A | S1, S2 | 2 |
| B | S2, S3 | 2 |
| Total | S1, S2, S3 | 3 |

The current plugin displays 4. An attempted `Headcount = countDistinct` rule is rejected and falls back to the default sum. No distinct-count rule exists in the reviewed implementation.

The total cannot be reconstructed from the two numeric counts alone: the renderer does not know which entities overlap. Counting distinct numeric cell values would also be incorrect.

The preferred investigation is to obtain OAC-computed totals at the required grouping levels with the same filters and selected measure. That integration must be verified in OAC. The current renderer does not consume those totals; this is not a claim that the platform can never provide them. Supplying complete entity identities is another possible design, but changes the data contract, query size, and processing requirements.

At every total scope, the percentage must use the correctly calculated selected-population count divided by the correctly calculated Headcount. Applying a ratio to sums of overlapping distinct counts does not solve the problem.

The 0.19.0 `percentOfTotal` feature calculates a cell's share of its column/group. It does not calculate Minority divided by Headcount and is not the solution to this report's demographic percentages.

## Build 1: correctness and independent parameter labels

Retain the current property-panel layout and its existing per-field label mapping syntax.

Deliver:

1. Correct distinct-count grand totals, subtotals, totals across columns, and collapsed summaries wherever enabled. Each must respect its grouping scope and filters.
2. Correct percentage totals using the appropriate numerator and denominator at the same scope.
3. Parameter substitution in each configured field's label template, including Corinna's exact two-field example and literal text before or after a reference.
4. Independent operation for any supported number of configured measures. A configured field must not cause another field's header to change implicitly.
5. Consistent labels in table headers, grand-total column labels, tooltip headings, Print PDF, and Print Canvas where those surfaces show that field name.
6. Glossary definitions that remain correct for the selected measure. A changed heading must not leave a definition describing a different population. The source of selection-specific descriptions needs an explicit design.

Parameter binding is a proposed capability, not an implemented one. The implementation should first investigate OAC's supported parameter-resolution/binding services. Use one shared resolution path for on-screen and printed labels. Parameter changes must refresh the resolved text without saving a replacement literal over the template.

The repository currently recommends OAC-evaluated label fields for dynamic text ([design guidance, section 6.11](docs/oac_design.md)). WSU Line provides a related data-driven label pattern, with parameter host validation still pending. If label fields are used internally as a fallback, the design must explain how each template gets its values; it must preserve independent per-field authoring and avoid exposing an unrelated second syntax. Any change to that design guidance belongs with the implementation.

Do not interpret label templates as arbitrary JavaScript or evaluate workbook business calculations in the renderer. The workbook owns the metric calculations. Parameter references in labels supply text only.

For missing fields, missing parameters, or malformed references, provide an author-visible diagnostic and a defined fallback to the configured static fallback or original column name. Do not leave an old selection's resolved label on new data. A known distinct-count measure must not silently receive a sum when a correct total is unavailable.

The initial syntax contract covers the shown `field: template; ...` form and ordinary literal text. Escaping delimiter characters in unusual field/parameter names needs an explicit specification before implementation; no additional escape language is approved by this document.

## Build 2: easier property-panel authoring

Build 2 changes the editing experience while preserving the calculation and label behavior accepted in Build 1.

### Option A: Native-style labels

Choose the column, then choose Display Header: Auto or Custom. Custom accepts fixed text or familiar parameter syntax. Show a resolved preview.

Example custom text:

```text
% @parameter("View By Selector")
```

This is the smallest interface change and closest to Corinna's native-pivot screenshot. It removes the need to repeat a field name inside a multi-entry text box, but authors still need correct parameter spelling, quotes, and parentheses.

### Option B: Guided labels — recommended starting point

Use separate controls:

| Control | Example |
|---|---|
| Column | `pct_measure_selected` — selected from bound fields |
| Label source | Column name / Custom text / Workbook parameter |
| Parameter name | `View By Selector` |
| Text before value | `% ` |
| Text after value | blank |
| Header preview | `% Minority` |

Only show controls relevant to the selected label source, where OAC supports updating the panel that way. Use a parameter dropdown if the host exposes parameter names; otherwise accept the plain parameter name in a text field. Parameter discovery is not yet verified.

This avoids field IDs, semicolon-separated entries, and parameter-expression punctuation during routine setup. Each column remains independent. Preserve an Advanced expression editor for templates the simple controls cannot fully represent.

### Option C: Per-column sections

Give each bound measure a section with its label, number format, decimal places, visibility, data bars, and total settings together. This reduces the need to assemble settings for one field from several separate global lists.

This is a broader redesign. Expandable sections and panel refresh behavior must be validated against OAC's supported property controls before promising a native-like layout. Keep the design workable with ordinary host controls if custom grouping is unavailable.

### Extend guided controls to existing settings

After labels, replace common syntax-heavy settings with individual controls:

- Total method: select the method; select a weight, numerator, and denominator only when needed.
- Number format and decimals: choose the field and settings.
- Visibility: choose the field and show/hide.
- Data bars: choose the field, color, and scale.
- Column width: choose the field and width.

A distinct-count total option can be offered only after its data support is implemented and verified. A dropdown alone cannot deduplicate aggregated counts.

Retain current expressions under Advanced where needed, without requiring ordinary authors to use them.

### Existing design comparison

An interactive design comparison was created at `../output/pivot-panel-options.html`, with Native-style, Guided, and Per-column sections variants. It is a concept illustration, not an implementation or a test of OAC parameter access. Its sample parameter name is `View By`; Corinna's clarification uses `View By Selector`. The actual name is always supplied by the workbook author.

## Compatibility between builds

Agree on the underlying saved configuration during Build 1. Build 2 must edit the same meaning through easier controls.

- Preserve the plugin root ID and existing bucket names/bindings.
- Preserve the field identities used for formatting and total rules.
- Keep label templates independent per field.
- Preserve plain-text header overrides and existing saved expressions.
- If saved configuration changes, provide automatic migration. Do not require workbook reconstruction or silently discard templates the guided editor cannot represent.
- Define precedence among column name, static override, parameter template, and fallback. An explicitly configured override should have a predictable result.
- Update the plugin specification, changelog, and version for each behavior-changing build.
- Keep the exact tested ZIP for each build and a tested rollback path; new saved settings may require restoring a workbook copy as well as the previous ZIP.

## Acceptance checks

Build 1 should be verified with synthetic data and in OAC before the original report tables are retired:

1. Switch between Minority, First Gen, and WA State. Confirm the selected count and percentage calculations, both headers, and relevant glossary definitions match the selection.
2. Test Corinna's exact mapping with two separate calculated fields. Change one template to static text and confirm the other continues to follow the parameter.
3. Configure one dynamic field, more than two dynamic fields, and fields using different parameters. No pairing assumptions should appear.
4. Confirm `% ` is header text only. Number format and the percentage calculation remain independently configured.
5. Compare distinct-count totals against trusted source totals using overlapping populations, disjoint populations, filters, subtotals, and totals across columns.
6. Confirm total percentages use counts at the correct total scope. Define the expected handling of zero denominators and missing values.
7. Exercise missing parameters, renamed/removed fields, malformed references, and duplicate field display names. Ambiguous matching must not silently change the wrong field.
8. Verify save/reopen, parameter changes, resize, collapse/expand, Print PDF, and Print Canvas.
9. Check old static labels and workbook settings still work.
10. For Build 2, open a workbook saved in Build 1 and confirm identical results before editing. Verify guided and Advanced edits preserve the same settings and behavior after save/reopen.

The 0.20.4 working-build regression suite passes 115 tests, including parameter templates, independent parameter-change payloads, distinct suppression, and scoped ratios. These synthetic tests do not prove live workbook behavior or a true distinct overlap recount.

## Decisions still to confirm

- Final WA State label and the definitions to show for each selected measure.
- For a grand total spanning multiple terms, whether the business measure is unique students across those terms or student-term headcount. The source calculation must reflect the agreed meaning.
- The supported OAC integration for parameter resolution and source-computed totals, including refresh and filter behavior.
- Property-panel option for Build 2. Recommendation: Guided first, with Advanced expressions retained; consider per-column sections after host validation.

## References

- [Glossary Pivot specification](docs/plugins/project_spec_wsu_glossary_pivot.md)
- [Totals fix history](CHANGELOG.md), 2026-09-29 / 0.17.0
- [Shared OAC design guidance](docs/oac_design.md), especially section 6.11
- [Oracle: parameter-driven dimension and measure selectors](https://docs.oracle.com/en/cloud/paas/analytics-cloud/tutorial-column-selector/index.html)
- [Oracle: parameters in workbooks](https://docs.oracle.com/en/cloud/paas/analytics-cloud/acubi/use-parameters-workbooks.html)
- [Oracle: independently computed totals versus report sums](https://docs.oracle.com/en/cloud/paas/analytics-cloud/acubi/assign-aggregation-rule-report-totals.html)

## Build 1 follow-up — 0.20.4, 2026-10-15

Closed the unidentified-measure fallback that could still add counts despite a configured distinct rule. Explicit total rules now use source values before share display transformations and take precedence over automatic share totals. Independent parameter event updates retain other header parameters. No Build 2 work was started.

A true distinct recount remains dependent on additional source data: entity identifiers or trusted source totals for every displayed scope. The current layout supplies neither. The extension continues to blank unsupported scopes; it does not claim that two aggregated counts of 2 equal 3. The workbook selector and CASE measures remain workbook responsibilities.
