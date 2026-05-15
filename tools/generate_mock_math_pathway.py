import csv
import random
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "mock_math_pathway_200_students.csv"
random.seed(220)


TERMS = [
    (2227, "2022 Fall Semester", "2022 Fall"),
    (2233, "2023 Spring Semester", "2023 Spr"),
    (2235, "2023 Summer Semester", "2023 Sum"),
    (2237, "2023 Fall Semester", "2023 Fall"),
    (2243, "2024 Spring Semester", "2024 Spr"),
    (2245, "2024 Summer Semester", "2024 Sum"),
    (2247, "2024 Fall Semester", "2024 Fall"),
    (2253, "2025 Spring Semester", "2025 Spr"),
    (2257, "2025 Fall Semester", "2025 Fall"),
]

COURSE_META = {
    "MATH 100": (10, "developmental", "algebra"),
    "MATH 103": (20, "gateway", "algebra"),
    "MATH 105": (25, "gateway", "algebra"),
    "MATH 106": (30, "gateway", "algebra"),
    "MATH 108": (40, "gateway", "business_quant"),
    "MATH 140": (45, "gateway", "statistics"),
    "MATH 171": (50, "gateway", "calculus"),
    "MATH 172": (60, "advanced", "calculus"),
    "MATH 182": (65, "advanced", "calculus"),
    "MATH 201": (70, "advanced", "quantitative_reasoning"),
    "MATH 202": (80, "advanced", "quantitative_reasoning"),
    "MATH 216": (90, "advanced", "calculus"),
    "MATH 220": (100, "advanced", "linear_algebra"),
}

PATH_TEMPLATES = [
    ["MATH 100", "MATH 103", "MATH 106", "MATH 171"],
    ["MATH 103", "MATH 106", "MATH 108", "MATH 220"],
    ["MATH 103", "MATH 106", "MATH 171", "MATH 172"],
    ["MATH 106", "MATH 171", "MATH 172", "MATH 220"],
    ["MATH 171", "MATH 172", "MATH 216", "MATH 220"],
    ["MATH 140", "MATH 201", "MATH 202"],
    ["MATH 201", "MATH 202", "MATH 220"],
    ["MATH 220"],
]

PASS_GRADES = ["A", "A-", "B+", "B", "B-", "C+", "C"]
LOW_GRADES = ["C-", "D+", "D", "F", "W"]
GRADE_POINTS = {
    "A": 4.0,
    "A-": 3.7,
    "B+": 3.3,
    "B": 3.0,
    "B-": 2.7,
    "C+": 2.3,
    "C": 2.0,
    "C-": 1.7,
    "D+": 1.3,
    "D": 1.0,
    "F": 0.0,
    "W": None,
    "I": None,
}

CAMPUSES = ["PULLM", "VANCO", "TRIC", "SPOKA", "GLOBAL"]


def grade_for_attempt(is_repeat=False):
    pass_rate = 0.72 if is_repeat else 0.64
    if random.random() < pass_rate:
        return random.choices(PASS_GRADES, weights=[12, 8, 9, 16, 13, 12, 18])[0]
    return random.choices(LOW_GRADES, weights=[7, 6, 9, 18, 11])[0]


def outcome_for_grade(grade):
    if grade == "W":
        return "withdraw"
    if grade == "I":
        return "incomplete"
    points = GRADE_POINTS.get(grade)
    if points is None:
        return "other"
    return "pass" if points >= 2.0 else "fail"


def term_gap(term_pos):
    return min(term_pos + random.choices([1, 1, 1, 2], weights=[45, 25, 15, 15])[0], len(TERMS) - 1)


def build_student_path(student_idx):
    person_id = f"9{student_idx:08d}"
    campus = random.choices(CAMPUSES, weights=[55, 14, 10, 9, 12])[0]
    template = list(random.choice(PATH_TEMPLATES))
    start_pos = random.randint(0, 2)
    term_pos = start_pos
    rows = []

    for course in template:
        attempts = 1
        if random.random() < 0.24:
            attempts += 1
        if course == "MATH 220" and random.random() < 0.18:
            attempts += 1

        for attempt_idx in range(1, attempts + 1):
            is_repeat = attempt_idx > 1
            grade = grade_for_attempt(is_repeat)
            if attempt_idx < attempts and outcome_for_grade(grade) == "pass":
                grade = random.choice(["C-", "D", "F", "W"])

            term_code, term_desc, term_short = TERMS[term_pos]
            subject, catalog = course.split()
            rows.append(
                {
                    "PERSON ID": person_id,
                    "Campus Code": campus,
                    "Subject": subject,
                    "Catalog Number": catalog,
                    "Subject Catalog Number": course,
                    "TERM CODE": term_code,
                    "Term Desc": term_desc,
                    "Term": term_short,
                    "Course Grade Official": grade,
                    "Class GPA": GRADE_POINTS.get(grade),
                }
            )
            term_pos = term_gap(term_pos)

        if term_pos >= len(TERMS) - 1 and random.random() < 0.65:
            break

    return rows


def transition_type(current, nxt):
    if not nxt:
        return "terminal"
    if current == nxt:
        return "repeat"
    cur_order = COURSE_META[current][0]
    next_order = COURSE_META[nxt][0]
    if next_order > cur_order:
        return "forward"
    if next_order < cur_order:
        return "backward"
    return "unknown"


def terms_between(current_code, next_code):
    if next_code is None:
        return ""
    current_pos = next(i for i, term in enumerate(TERMS) if term[0] == current_code)
    next_pos = next(i for i, term in enumerate(TERMS) if term[0] == next_code)
    return max(0, next_pos - current_pos)


def sankey_stage_fields(courses):
    seen = defaultdict(int)
    nodes = []
    for course in courses:
        seen[course] += 1
        if seen[course] == 1:
            nodes.append(course)
        else:
            nodes.append(f"{course} (Repeat {seen[course] - 1})")
    if len(nodes) == 1:
        nodes.append("No Further Course")
    if len(nodes) > 7:
        nodes = nodes[:6] + [nodes[-1]]
    start = nodes[0]
    end = nodes[-1]
    intermediates = (nodes[1:-1] + [""] * 5)[:5]
    return start, intermediates, end


def main():
    all_rows = []
    for idx in range(1, 201):
        all_rows.extend(build_student_path(idx))

    grouped = defaultdict(list)
    for row in all_rows:
        grouped[row["PERSON ID"]].append(row)

    output_rows = []
    observation_end = TERMS[-1][0]
    for person_id, rows in grouped.items():
        rows.sort(key=lambda r: (int(r["TERM CODE"]), COURSE_META[r["Subject Catalog Number"]][0]))
        course_attempts = defaultdict(int)
        prior_fail = 0
        prior_withdraw = 0
        start_term = int(rows[0]["TERM CODE"])
        unique_courses = [r["Subject Catalog Number"] for r in rows]
        sankey_start, sankey_intermediates, sankey_end = sankey_stage_fields(unique_courses)
        final_outcome = outcome_for_grade(rows[-1]["Course Grade Official"])
        path_group = "Completed/Persisted" if final_outcome == "pass" else "Repeat/Stopout Risk"

        for seq, row in enumerate(rows):
            course = row["Subject Catalog Number"]
            course_attempts[course] += 1
            attempt_number = course_attempts[course]
            grade = row["Course Grade Official"]
            points = GRADE_POINTS.get(grade)
            outcome = outcome_for_grade(grade)
            pass_flag = 1 if outcome == "pass" else 0
            prev_row = rows[seq - 1] if seq > 0 else None
            next_row = rows[seq + 1] if seq < len(rows) - 1 else None
            next_course = next_row["Subject Catalog Number"] if next_row else ""
            next_outcome = outcome_for_grade(next_row["Course Grade Official"]) if next_row else ""
            next_pass = 1 if next_outcome == "pass" else (0 if next_outcome else "")
            trans_type = transition_type(course, next_course)
            term_gap_value = terms_between(int(row["TERM CODE"]), int(next_row["TERM CODE"])) if next_row else ""
            recent_censor = 1 if not next_row and int(row["TERM CODE"]) >= 2253 else 0
            stopout = 1 if not next_row and not recent_censor and outcome in {"pass", "fail", "withdraw"} else 0
            sort_order, level, band = COURSE_META[course]
            relative_term_index = next(i for i, term in enumerate(TERMS) if term[0] == int(row["TERM CODE"])) - next(
                i for i, term in enumerate(TERMS) if term[0] == start_term
            )

            network_destination = next_course if next_course else ("No Further Course" if not recent_censor else "")
            network_group = "target" if course == "MATH 220" else "course"
            if trans_type == "repeat":
                network_group = "repeat"
            network_label = {
                "repeat": "Repeated Same Course",
                "forward": "Advanced / Changed Course",
                "backward": "Moved To Lower Course",
                "terminal": "No Further Course" if network_destination else "Censored Recent Term",
            }.get(trans_type, "Other Transition")

            out = {
                **row,
                "student_id": person_id,
                "target_course_id": course,
                "target_term_label": row["Term"],
                "target_term_index": row["TERM CODE"],
                "target_attempt_number": attempt_number,
                "target_grade_code": grade,
                "target_grade_points": "" if points is None else points,
                "target_outcome_code": outcome,
                "target_pass_flag": pass_flag,
                "course_sort_order": sort_order,
                "course_level": level,
                "pathway_band": band,
                "student_start_term_index": start_term,
                "relative_term_index": relative_term_index,
                "math_path_sequence_number": seq + 1,
                "prior_attempt_count_course_family": seq,
                "prior_fail_count_course_family": prior_fail,
                "prior_withdraw_count_course_family": prior_withdraw,
                "repeat_flag": 1 if attempt_number > 1 else 0,
                "previous_course_id": prev_row["Subject Catalog Number"] if prev_row else "",
                "previous_term_index": prev_row["TERM CODE"] if prev_row else "",
                "next_course_id": next_course,
                "next_term_index": next_row["TERM CODE"] if next_row else "",
                "next_outcome_code": next_outcome,
                "next_pass_flag": next_pass,
                "transition_type": trans_type,
                "terms_to_next_course_family": term_gap_value,
                "stopout_flag": stopout,
                "stopout_censor_flag": recent_censor,
                "observation_end_term_index": observation_end,
                "pass_threshold_points_used": 2.0,
                "stopout_term_threshold_used": 2,
                "repeat_semantics_used": "all_attempts",
                "next_scope_used": "immediate_next_course_family",
                "same_term_order_rule_used": "course_sort_order",
                "term_index_scheme_used": "SDW STRM YYYT",
                "network_row_flag": 1 if course and network_destination else 0,
                "network_source": course,
                "network_destination": network_destination,
                "network_edge_weight": 1,
                "network_node_group": network_group,
                "network_link_label": network_label,
                "network_tooltip_detail": f"{course} {row['Term']} grade {grade}; next={network_destination or 'censored'}; outcome={outcome}",
                "network_repeat_stage": attempt_number,
                "sankey_row_flag": 1 if seq == 0 else 0,
                "sankey_path_key": f"{person_id}-path-1" if seq == 0 else "",
                "sankey_anchor_course_id": sankey_end if seq == 0 else "",
                "sankey_trace_direction": "forward_from_first_math" if seq == 0 else "",
                "sankey_start_node": sankey_start if seq == 0 else "",
                "sankey_intermediate_1": sankey_intermediates[0] if seq == 0 else "",
                "sankey_intermediate_2": sankey_intermediates[1] if seq == 0 else "",
                "sankey_intermediate_3": sankey_intermediates[2] if seq == 0 else "",
                "sankey_intermediate_4": sankey_intermediates[3] if seq == 0 else "",
                "sankey_intermediate_5": sankey_intermediates[4] if seq == 0 else "",
                "sankey_end_node": sankey_end if seq == 0 else "",
                "sankey_flow_weight": 1 if seq == 0 else "",
                "sankey_path_group": path_group if seq == 0 else "",
                "sankey_sort_key": row["TERM CODE"] if seq == 0 else "",
                "sankey_tooltip_detail": f"{person_id}: {' -> '.join([sankey_start] + [s for s in sankey_intermediates if s] + [sankey_end])}" if seq == 0 else "",
            }
            output_rows.append(out)

            if outcome == "fail":
                prior_fail += 1
            if outcome == "withdraw":
                prior_withdraw += 1

    columns = [
        "TERM CODE",
        "Term Desc",
        "Term",
        "PERSON ID",
        "Subject",
        "Catalog Number",
        "Subject Catalog Number",
        "Campus Code",
        "Course Grade Official",
        "Class GPA",
        "student_id",
        "target_course_id",
        "target_term_label",
        "target_term_index",
        "target_attempt_number",
        "target_grade_code",
        "target_grade_points",
        "target_outcome_code",
        "target_pass_flag",
        "course_sort_order",
        "course_level",
        "pathway_band",
        "student_start_term_index",
        "relative_term_index",
        "math_path_sequence_number",
        "prior_attempt_count_course_family",
        "prior_fail_count_course_family",
        "prior_withdraw_count_course_family",
        "repeat_flag",
        "previous_course_id",
        "previous_term_index",
        "next_course_id",
        "next_term_index",
        "next_outcome_code",
        "next_pass_flag",
        "transition_type",
        "terms_to_next_course_family",
        "stopout_flag",
        "stopout_censor_flag",
        "observation_end_term_index",
        "pass_threshold_points_used",
        "stopout_term_threshold_used",
        "repeat_semantics_used",
        "next_scope_used",
        "same_term_order_rule_used",
        "term_index_scheme_used",
        "network_row_flag",
        "network_source",
        "network_destination",
        "network_edge_weight",
        "network_node_group",
        "network_link_label",
        "network_tooltip_detail",
        "network_repeat_stage",
        "sankey_row_flag",
        "sankey_path_key",
        "sankey_anchor_course_id",
        "sankey_trace_direction",
        "sankey_start_node",
        "sankey_intermediate_1",
        "sankey_intermediate_2",
        "sankey_intermediate_3",
        "sankey_intermediate_4",
        "sankey_intermediate_5",
        "sankey_end_node",
        "sankey_flow_weight",
        "sankey_path_group",
        "sankey_sort_key",
        "sankey_tooltip_detail",
    ]

    with OUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(output_rows)

    print(f"Wrote {OUT}")
    print(f"students={len(grouped)} rows={len(output_rows)} sankey_rows={sum(1 for r in output_rows if r['sankey_row_flag'] == 1)}")


if __name__ == "__main__":
    main()
