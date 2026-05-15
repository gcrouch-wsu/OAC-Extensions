# WSU Lattice Scatter — Plugin Reference

Canonical reference for the **WSU Lattice Scatter** custom visualization
(`com-wsu-lattice-scatter`). Read this plus `oac_design.md` to continue
development without re-deriving decisions from the prototype.

---

## 1. Overview

### Identity
- **Display name**: WSU Lattice Scatter
- **Short name**: WSU Lattice Scatter
- **Category**: WSU
- **Root id**: `com-wsu-lattice-scatter`
- **Version constant**: `WsuLatticeScatterViz.VERSION = "1.0.0"`
- **Source**: `oac-sdk-dev/src/customviz/com-wsu-lattice-scatter/`
- **Build output**: `oac-sdk-dev/build/distributions/customviz_com-wsu-lattice-scatter.zip`

### What WSU Lattice Scatter is
A lattice-style scatter for student attempt history where:
- X axis is discrete **term** (ordered category),
- Y axis is discrete **course** (ordered category),
- each marker is one **attempt row** at the selected data grain.

Primary use case is single-student or small-cohort pathway review from faculty
roster drill workflows.

### Capabilities at a glance (v1)
- Discrete term/course lattice with independent X and Y sort direction.
- Grade marker modes:
  - `grade-letter` (A, A-, B+, ... W, I),
  - `grade-points` (numeric points with W/I passthrough),
  - standard symbol modes (circle/square/triangle/etc.).
- Independent grade text controls: size, bold, italic, underline.
- Independent grade background controls: none/circle/square + fill/outline.
- Color source controls: OAC theme or custom color.
- Progress threshold control (default C- / 1.7) to classify
  `Progress Eligible` vs `Progress Blocked`.
- Tooltip content is authored explicitly through the `Tooltip Detail` bucket.

---

## 2. Data Grain and Semantics (Authoritative)

### Required grain
v1 assumes one row per:
- `student_id`
- `course`
- `term`
- `attempt_number` (or equivalent attempt discriminator)

Attempt and repeat metrics should come from the dataset when they are needed for
analysis or tooltip display. The plugin does not expose inferred attempt/repeat
rows in its tooltip contract.

### Sort precedence (authoritative)
For term and course ordering, precedence is:
1. dataset custom sort keys (grammar-pane calculations),
2. lexical fallback.

Do not treat numeric scraping from display labels as authoritative sort keys.

Term sort keys are optional. When missing, ordering falls back deterministically
without raising a warning banner.

### Progress status semantics
`Progress Eligible` / `Progress Blocked` derives from:
- configured threshold points (default `1.7`), and
- grade code rules:
  - W/I/IP always `Progress Blocked`,
  - numeric points >= threshold => `Progress Eligible`,
  - otherwise `Progress Blocked`.

---

## 3. Dataset Contract (v1 recommended fields)

### Core fields
- `student_id`
- `target_course_id` (or equivalent course id)
- `target_term_label`
- `target_term_index` (numeric chronology)
- `target_attempt_number` (or equivalent)
- `target_grade_code` (A, A-, ... W, I)
- `target_grade_points` (numeric GPA-style points)

### Strongly recommended context fields (tooltip/detail)
- `section_id`
- `instructor_id`
- `campus`
- `semester`
- any advising flags (at-risk, prereq status, etc.)

### OAC bucket guidance
Use custom viz buckets to avoid stock scatter limitations:
- Course and term are categorical buckets (not forced measures).
- Grade points are optional measure bucket.
- Grade letter is a categorical bucket.
- Student ID is the dedicated identity/color bucket when student-specific grouping
  is needed.
- Context fields belong in `Tooltip Detail`.
- OAC/OAD may reject dropping the exact same field into two grammar buckets in
  one visualization. If `Student ID` is already used in its dedicated bucket and
  also needs to appear in the tooltip, supply a separate aliased/copied dataset
  field for tooltip use.

---

## 4. Bucket Layout (current v1)

| Bucket | Logical | Type | Min | Max | UI Label |
|--------|---------|------|-----|-----|----------|
| `measures` | `MEASURES` | measures | 0 | 1 | Class Grade Points |
| `row` | `ROW` | categorical | 1 | 1 | Subject Catalog Number |
| `item` | `ITEM` | categorical | 1 | 1 | Term (X Axis) |
| `color` | `COLOR` | categorical | 0 | 1 | Student ID |
| `glyph` | `GLYPH` | categorical | 0 | 1 | Course Grade Official |
| `detail` | `CATEGORY` | both | 0 | 20 | Tooltip Detail |
| `size` | `SIZE` | both | 0 | 1 | Term Code |

Notes:
- `glyph` should include `target_grade_code` in v1 datasets.
- If `measures` is absent, grade-point mode falls back to letter mapping where possible.

---

## 5. Config Schema (v1)

### View and sorting
- `xSortDirection`: `asc|desc` (default `asc`)
- `ySortDirection`: `asc|desc` (default `asc`)
- `markerShape`: `circle|square|triangle|diamond|cross|star|grade-letter|grade-points`
- `markerSize`: numeric slider (default `11`)

### Grade marker text
- `gradeFontSize`: numeric slider (default `13`)
- `gradeFontBold`: `on|off` (default `off`)
- `gradeFontItalic`: `on|off` (default `off`)
- `gradeFontUnderline`: `on|off` (default `off`)

### Grade background
- `gradeBackground`: `none|circle-outline|circle-fill|square-outline|square-fill`
- `outlineShade`: `20..100` percent (default `85`)

### Color
- `colorSource`: `oac|custom` (default `oac`)
- `customGradeColor`: hex (default `#1e88e5`)

### Progress policy
- `progressThreshold`: decimal points (default `1.7`)

---

## 6. Tooltip Contract (v1)

Tooltip rows include only fields placed in `Tooltip Detail`.

If `Tooltip Detail` is empty, the plugin does not render a tooltip table.
Attempt, repeat, progress, and other analytical context should be supplied by
the dataset and added to `Tooltip Detail` intentionally when authors want them.
When a field already drives another grammar role, test with an unused field
before diagnosing Tooltip Detail as broken; host field-reuse rules can block the
drop even when the bucket itself is valid.

No `pass/fail` wording in tooltip for this plugin family.

---

## 7. Property Panel Layout (current)

### General
- Marker Shape
- Marker Size
- Progress Threshold
- X Axis Sort
- Y Axis Sort

### Grade Style
- Grade Font Size
- Grade Font Bold
- Grade Font Italic
- Grade Font Underline
- Grade Background
- Outline Shade

### Color
- Color Source (OAC / Custom)
- Custom Grade Color

### Axis & Tooltip
- X Title override
- Y Title override
- Tooltip detail cap (future)

---

## 8. Implementation Sequence (Golden Path)

1. Scaffold plugin identity + manifests + datamodel handler.
2. Render minimal lattice points from row/item buckets.
3. Wire grade marker modes and text/background style controls.
4. Wire progress threshold behavior.
5. Implement authored-only tooltip rendering from `Tooltip Detail`.
6. Add marking and polish (axis labels, responsive spacing, empty state).

---

## 9. Validation Checklist

- [ ] Plugin registers and appears in gallery after OAD restart.
- [ ] Course/term discrete axes render without numeric spacing artifacts.
- [ ] X and Y sorts both work.
- [ ] Grade marker modes work (`letter`, `points`, symbol modes).
- [ ] Typography/background controls apply as configured.
- [ ] OAC theme color mode works; custom color override works.
- [ ] Tooltips render only authored `Tooltip Detail` fields.
- [ ] Empty `Tooltip Detail` does not produce a fallback tooltip table.
- [ ] Progress status changes correctly with threshold.

---

## 10. Deferred Items (post-v1)

- Advanced legend interactions.
- Threshold presets by policy pack (C-, C, D+).
- Multi-student cohort density and collision controls.
- Rich tooltip templates with conditional sections.
- In-chart filter widgets (course band, campus, semester).

