# Math Pathway Dataset Requirements

> **STATUS: PROPOSAL.** Dataset contract drafted for the unbuilt Math Pathway
> Diagnostics plugin (`project_spec_wsu_math.md`). References to a "Flask
> prototype" point to work that is not in this repository. The synthetic example
> in `examples/` follows a subset of this contract.

This document describes the analytics-ready dataset needed to support the WSU math pathway work across:

- Sankey flow views
- Network pathway maps
- Single-student course history / lattice views
- Course progression grids
- Transition matrices
- Broader chair/faculty diagnostic views from the Flask prototype

The intended grain is one row per student, term, and in-scope math course attempt.

For OAC, the safest structure is to build one attempt-level dataset first, then derive visual-specific datasets or workbook calculations from it.

## Grain

One row should represent:

`student_id + course + term + attempt_number`

Recommended naming pattern:

- use `target_*` to mean the current row's course attempt
- use `next_*` to mean the immediately next observed in-scope math course attempt
- use `previous_*` to mean the immediately previous observed in-scope math course attempt
- use `prereq_*` for prerequisite evidence available before the current course attempt

## Already Have / Simple From SDW

These fields either exist directly in SDW or can be made with a simple row-level calculated value.

1. `Student ID`
   - Identifies the student.
   - Example: `123456789`
   - Likely source: `EMPLID`

2. `Term Code`
   - Sortable term value used to order course attempts.
   - Example: `2247`
   - Likely source: `STRM`

3. `Term Description`
   - Human-readable term label.
   - Example: `Fall 2024`
   - Likely source: `TERM_DESCR` or `TERM_DESCRSHORT`

4. `Subject`
   - Course subject.
   - Example: `MATH`
   - Likely source: `SUBJECT`

5. `Catalog Number`
   - Course number.
   - Example: `171`
   - Likely source: `CATALOG_NBR`

6. `Course Display`
   - Combined course label used in visuals.
   - Example: `MATH 171`
   - Likely source: `SUBJECT_CATALOG_NUMBER`
   - Or calculated from `SUBJECT` + `CATALOG_NBR`

7. `Official Grade`
   - Final course grade.
   - Examples: `A`, `B`, `C`, `C-`, `D`, `F`, `W`, `I`
   - Likely source: `CRSE_GRADE_OFF`

8. `Grade Points`
   - Numeric grade value when available.
   - Examples: `4.0`, `3.0`, `2.0`, `1.7`
   - Likely source: `GRADE_POINTS`

9. `Outcome Code`
   - Normalized course outcome.
   - Example values: `pass`, `fail`, `withdraw`, `incomplete`, `other`
   - Calculated from official grade and, if needed, enrollment status fields.

10. `Pass / Progress Eligible Flag`
   - Indicates whether the student earned a grade that should allow progression.
   - Example rule: `1` if grade is `C` or better; `0` if grade is `C-` or below.
   - Calculated from `Official Grade` or `Grade Points`.

11. `Administrative Repeat Description`
   - Administrative repeat coding from PeopleSoft/SDW.
   - Example: `Repeat of Previous Course`
   - Likely source: `REPEAT_CODE_DESCR`

12. `Administrative Repeat Flag`
   - Simple calculated value from the administrative repeat description.
   - Example rule: `1` when `REPEAT_CODE_DESCR = 'Repeat of Previous Course'`.
   - Useful for audit and filtering, but not the same as the pathway repeat flag.

13. `Class Number`
   - Section-level class identifier within term.
   - Likely source: `CLASS_NBR`
   - Needed only when the broader faculty/section analysis is in scope.

14. `Section Label`
   - Human-readable section identifier.
   - Example: `Fall 2024 S02`
   - Can be built from term + class/section fields if available.
   - Needed only when section analysis is in scope.

15. `Instructor ID`
   - Instructor attached to the class/section.
   - Likely available through class/instructor assignment data.
   - Needed only when instructor or section variance analysis is in scope.

16. `Section Days`
   - Meeting pattern days.
   - Example: `MWF`, `TuTh`
   - Needed only when schedule analysis is in scope.

17. `Section Time`
   - Meeting time.
   - Example: `10:10-11:00`
   - Needed only when schedule analysis is in scope.

## Need To Build: Core Pathway Fields

These fields require row-to-row logic across a student's ordered math history. They are not simple single-row SDW values.

1. `Attempt Number`
   - Orders a student's attempts in the same course.
   - Example:

| Student | Term | Course | Attempt Number |
|---|---|---|---:|
| A | Fall 2024 | MATH 171 | 1 |
| A | Spring 2025 | MATH 171 | 2 |

2. `Repeat Flag`
   - Marks whether the current row is a repeat attempt in the observed math path.
   - Usually calculated as `Attempt Number > 1`.
   - This should drive pathway repeat visuals because it is based on observed student/course history.
   - Example:

| Student | Term | Course | Attempt Number | Repeat Flag |
|---|---|---|---:|---:|
| A | Fall 2024 | MATH 171 | 1 | 0 |
| A | Spring 2025 | MATH 171 | 2 | 1 |

3. `Math Path Sequence Number`
   - Orders all in-scope math course attempts for the student across time.
   - This is different from `Attempt Number`, because it covers the full math path rather than one repeated course.
   - Example:

| Student | Term | Course | Math Path Sequence Number |
|---|---|---|---:|
| A | Fall 2024 | MATH 103 | 1 |
| A | Spring 2025 | MATH 106 | 2 |
| A | Fall 2025 | MATH 171 | 3 |
| A | Spring 2026 | MATH 171 | 4 |

4. `Previous Math Course`
   - The immediately prior observed in-scope math course in the student's path.
   - This does not necessarily mean the course in the immediately prior term.
   - Example:

| Student | Term | Course | Previous Math Course |
|---|---|---|---|
| A | Fall 2024 | MATH 103 | null |
| A | Spring 2025 | MATH 106 | MATH 103 |
| A | Fall 2025 | MATH 171 | MATH 106 |

5. `Previous Math Term`
   - The term associated with `Previous Math Course`.

6. `Next Math Course`
   - The immediately next observed in-scope math course in the student's path.
   - Example:

| Student | Term | Course | Next Math Course |
|---|---|---|---|
| A | Fall 2024 | MATH 103 | MATH 106 |
| A | Spring 2025 | MATH 106 | MATH 171 |
| A | Fall 2025 | MATH 171 | null |

7. `Next Math Term`
   - The term associated with `Next Math Course`.

8. `Next Outcome Code`
   - The normalized outcome in the next observed math course.
   - Example: current `MATH 106`, next `MATH 171`, next outcome `fail`
   - Needed for transition-quality measures.

9. `Next Pass Flag`
   - Indicates whether the student passed the next observed math course.
   - Needed for transition success rates.

10. `Progression Type`
   - Classifies the movement from the current course to the next observed math course.
   - This should use both the course relationship and the student's grade outcome.
   - Example values:
     - `Advanced As Expected`
     - `Advanced Despite Low Grade`
     - `Repeated Same Course`
     - `Moved To Alternate Math Course`
     - `No Later Math Course Observed`
   - Example:

| Current Course | Grade | Next Math Course | Progression Type |
|---|---|---|---|
| MATH 103 | B | MATH 106 | Advanced As Expected |
| MATH 103 | D | MATH 106 | Advanced Despite Low Grade |
| MATH 171 | C- | MATH 171 | Repeated Same Course |
| MATH 106 | B | MATH 108 | Moved To Alternate Math Course |
| MATH 220 | A | null | No Later Math Course Observed |

11. `Course Relationship To Next`
   - Describes the structural relationship between the current course and the next observed math course.
   - This is independent of grade.
   - It likely requires a small reference table that defines expected or valid course relationships.
   - Example values:
     - `Same Course`
     - `Expected Next Course`
     - `Higher Math Course`
     - `Lower Math Course`
     - `Alternate / Parallel Course`
     - `No Later Math Course`
   - Example:

| Current Course | Next Math Course | Course Relationship To Next |
|---|---|---|
| MATH 171 | MATH 171 | Same Course |
| MATH 103 | MATH 106 | Expected Next Course |
| MATH 106 | MATH 171 | Higher Math Course |
| MATH 171 | MATH 106 | Lower Math Course |
| MATH 106 | MATH 108 | Alternate / Parallel Course |
| MATH 220 | null | No Later Math Course |

12. `Terms To Next Math Course`
   - Number of academic terms between the current attempt and the next observed in-scope math attempt.
   - Needed for delay, stall, and median terms-to-next measures.

13. `Stopout / No Later Math Course Flag`
   - Indicates that no later in-scope math course is observed after the agreed waiting window.
   - Should not be treated as true for recent records that are still inside the observation window.

14. `Censor Flag`
   - Indicates that the row is too close to the extract end to know whether the student truly stopped.
   - Prevents recent terms from inflating stopout/no-later-course metrics.

## Need To Build: Course Ordering And Grouping

These fields make grids, matrices, and student-history visuals readable and stable.

1. `Course Sort Order`
   - Canonical order for math courses in Y-axis, matrix, and pathway displays.
   - Example: `MATH 103 = 10`, `MATH 106 = 20`, `MATH 171 = 30`
   - Do not rely only on alphabetical sort or catalog number.

2. `Course Level`
   - Broad course level.
   - Example values: `developmental`, `gateway`, `advanced`

3. `Pathway Band`
   - Broad route or family.
   - Example values: `algebra`, `calculus`, `statistics`

4. `Student Start Term`
   - First observed in-scope math term for the student.
   - Needed for normalized progression views.

5. `Relative Term Index`
   - Term distance from the student's first observed in-scope math term.
   - Example: first math term = `0`; next enrolled math term = `1` or more depending on term-gap policy.

## Need To Build: Broader Diagnostic Fields

These are not required for a basic Sankey or Network view, but they are needed if the OAC work is expected to cover the broader Flask prototype diagnostics.

### Prerequisite Evidence

1. `Prereq Course`
   - The prerequisite course being evaluated for the current target course.
   - Example: target `MATH 172`, prereq `MATH 171`

2. `Prereq Satisfied Flag`
   - Indicates whether the prerequisite rule was satisfied before the target course attempt.

3. `Prereq Entry Mode`
   - How the student entered the target course.
   - Example values: `course_prereq`, `placement_only`, `both`, `transfer`, `exception`

4. `Prereq First Grade`
   - First observed grade in the prerequisite course.

5. `Prereq Terminal Grade`
   - Final prerequisite grade before the target course attempt.

6. `Prereq Attempt Count Before Target`
   - Number of prerequisite attempts before the target course attempt.

7. `Prereq Failed Attempts Before Target`
   - Number of non-passing prerequisite attempts before the target course attempt.

8. `Prereq Terms To Satisfy`
   - Number of terms between first prerequisite attempt and satisfying prerequisite attempt.

9. `Prereq Recovery Flag`
   - Indicates that the student failed or withdrew from the prerequisite and later satisfied it.

### Placement / Entry-Test Evidence

1. `Entry Test Type`
   - Example: `ALEKS`, `ACCUPLACER`, `NONE`

2. `Entry Test Score`
   - Numeric placement score.

3. `Entry Test Band`
   - Grouped placement score.
   - Example: `Low`, `Mid`, `High`

4. `Entry Test Met Threshold Flag`
   - Indicates whether the score met the placement threshold for the target course.

5. `Entry Test Term`
   - Term associated with the placement score, if available.

6. `Transfer Credit Flag`
   - Indicates that transfer credit is involved in the student's math placement or prerequisite history.

7. `Transfer Prereq Equivalent Flag`
   - Indicates that transfer work satisfied the prerequisite.

### Section / Faculty Analysis

1. `Section Time Block`
   - Grouped version of section meeting time.
   - Example values: `early`, `midday`, `afternoon`, `arranged`

2. `Section Capacity`
   - Class section capacity, if section analysis is needed.

3. `Section Enrollment`
   - Class section enrollment count, if section analysis is needed.

## Policy / Audit Fields

These can be constant columns in the extract, but they should be present or documented so the results are auditable.

1. `Pass Threshold Used`
   - Example: `2.0`

2. `Stopout Term Threshold Used`
   - Example: `2`

3. `Repeat Semantics Used`
   - Example values: `all_attempts`, `terminal_attempt`

4. `Next Scope Used`
   - Recommended value: `immediate_next_course_family`

5. `Same-Term Order Rule Used`
   - Example values: `timestamp`, `course_number`, `course_sort_order`

6. `Observation End Term`
   - Latest term included in the extract.

7. `Term Index Scheme Used`
   - Short description of how term ordering is encoded.

## Reference Tables Needed

The attempt-level fact table should not hardcode complex course logic in plugin code. Build or maintain these upstream.

1. Course order / course family reference
   - course id
   - course sort order
   - course level
   - pathway band

2. Course relationship reference
   - current course
   - next course
   - relationship type
   - expected / allowed flag

3. Prerequisite rule reference
   - target course
   - prerequisite course or prerequisite group
   - minimum grade points
   - rule type such as `AND` / `OR`

4. Placement rule reference
   - target course
   - test type
   - minimum score
   - effective term range, if rules change over time

## Minimum Recommended Extract

For the first production-ready dataset that can serve both pathway visuals and broader diagnostics, start with:

- all fields in `Already Have / Simple From SDW`
- all fields in `Need To Build: Core Pathway Fields`
- all fields in `Need To Build: Course Ordering And Grouping`
- `Prereq Course`
- `Prereq Satisfied Flag`
- `Prereq Entry Mode`
- `Prereq Terminal Grade`
- `Prereq Attempt Count Before Target`
- `Entry Test Score`
- `Entry Test Band`
- `Transfer Credit Flag`
- policy / audit fields

Section, instructor, and schedule fields should be included when the faculty/section dashboard is in scope.

