# Security Policy

This repository is intended to contain only plugin source, documentation, and
synthetic examples.

Please do not open issues or pull requests containing:

- student-level data,
- production SDW/OAC exports,
- credentials,
- access tokens,
- internal server names,
- non-public institutional data dictionaries.

WSU Glossary Pivot previously carried one reviewed exception, no longer
current: through v0.15.x, `FALLBACK_DESCRIPTIONS` in `glossaryPivotViz.js`
was a short list of Student Data Warehouse column definitions (the field
name and its business description) — not student rows, a query result, or
a credential, so it was an accepted case of institutional data in the
repo. Removed in v0.16.0 at the data team's request (a hand-maintained
copy of glossary text with no way to stay in sync with the real
dictionary it was captured from — see `CHANGELOG.md`'s v0.16.0 entry and
`docs/plugins/project_spec_wsu_glossary_pivot.md` section 3). No such data
remains in this plugin: a column's tooltip now comes only from OAC's own
live column-info map or a workbook-level override, never from anything
checked into this repository.

If you discover sensitive content in the repository, contact the maintainer
privately or open a minimal issue that does not repeat the sensitive content.
