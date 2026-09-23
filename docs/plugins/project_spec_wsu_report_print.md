# WSU Report Print — Plugin Reference

A short bar for the top of a canvas. **Print PDF** opens the browser print
dialog on a document that contains only the table bound to this
visualization. **Print Canvas** opens the same dialog on one document that
combines every print-capable visualization currently on the canvas — this
one and any WSU Glossary Pivot instances — one table per visualization, in
canvas position order. Choose **Save as PDF** in either dialog. The bar is
not in the document, so it does not appear on the pages.

Root id `com-wsu-report-print`. Version `ReportPrintViz.VERSION = "1.1.0"`.
Source: `oac-sdk-dev/src/customviz/com-wsu-report-print/`.
Zip: `oac-sdk-dev/build/distributions/customviz_com-wsu-report-print.zip`.

## What it can see

It reads only the fields dropped on its own Rows, Columns, and Values —
`docs/oac_design.md` §2: a plugin only sees data bound to its own grammar
buckets, so there is no OAC API for reading another visualization's data.
To reuse a pivot that is already built, copy that visualization and change
the copy's type to WSU Report Print. Both use Rows, Columns, and Values, so
those fields stay on the copy. Shrink the copy to a short bar. The original
pivot stays as it was.

**Print Canvas** does not read another visualization's data either — it
does not need to. Every print-capable instance already builds its own table
fragment client-side; Print Canvas is a plain, same-page JS registry
(`window.__wsuPrintCanvas`, not an OAC mechanism) that each instance adds
itself to on init, so a click on any one instance's Print Canvas button can
collect every other instance's already-built fragment and assemble them
into one document. See `docs/plugins/project_spec_wsu_glossary_pivot.md`
§3a for the full mechanism — the registry contract is identical in both
plugins, just implemented independently in each (no cross-plugin file
dependency is possible under `tests/lint.js`'s allowlist rules).

## Pages

Column headers are in the table header, so the browser repeats them on each
page. The report title is in that header, so it repeats too. Row labels are
printed on every body row, so a page does not open on a blank cell where a
rowspan ran out. A grand total row is a sum of the numeric values and is on
by default. When the report has row fields, that row is labeled Total in
the row header. When it has none, Total is printed in the first total cell,
above the number, so the label is still on the page if the gray background
is dropped. Page orientation is landscape by default.

Print with no fields, or with no columns, shows the empty-state sentence
on the bar. A print dialog that fails to open shows the print-error text.

Wide tables can still be clipped by the paper. Landscape and a modest column
count are what this is for. A report of a few thousand rows is within the
10,000-row governor. This has not been confirmed inside OAC's own canvas PDF
export. The pages come from the browser print dialog, not from that export.

A Print Canvas section whose own build fails (missing layout, zero columns,
an exception) is skipped, not fatal to the rest of the document — the
sections that did build still print. Orientation and the document title
come from whichever instance's button was clicked; `@page` is document-wide
CSS, so two instances with different Page Orientation settings cannot both
have their own orientation in the same combined document.

**Not verified on the tenant:** whether `iframe.contentWindow.print()`
opens a dialog scoped to the iframe's own document rather than the host
canvas, across the browsers WSU staff use — Safari specifically has a
documented history of printing the parent window instead of an iframe's
content in some versions. This was already open for the single-table Print
PDF; it is more consequential for Print Canvas because a combined document
is larger and more likely to span pages.

## Properties

| Gadget | Default |
|---|---|
| Print: Report Title | Report |
| Print: Page Orientation | Landscape or Portrait |
| Print: Grand Total Row | on |
