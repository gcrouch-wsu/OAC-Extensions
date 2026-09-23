# WSU Report Print — Plugin Reference

A short bar for the top of a canvas. **Print PDF** opens the browser print
dialog on a document that contains only the table bound to this
visualization. Choose **Save as PDF** in that dialog. The bar is not in the
document, so it does not appear on the pages.

Root id `com-wsu-report-print`. Version `ReportPrintViz.VERSION = "1.0.0"`.
Source: `oac-sdk-dev/src/customviz/com-wsu-report-print/`.
Zip: `oac-sdk-dev/build/distributions/customviz_com-wsu-report-print.zip`.

## What it can see

It reads only the fields dropped on its own Rows, Columns, and Values.
To reuse a pivot that is already built, copy that visualization and change
the copy's type to WSU Report Print. Both use Rows, Columns, and Values, so
those fields stay on the copy. Shrink the copy to a short bar. The original
pivot stays as it was.

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

## Properties

| Gadget | Default |
|---|---|
| Print: Report Title | Report |
| Print: Page Orientation | Landscape or Portrait |
| Print: Grand Total Row | on |
