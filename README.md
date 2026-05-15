# OAC Extensions

Custom Oracle Analytics Cloud / Oracle Analytics Desktop visualization
extensions developed for WSU-style pathway and institutional analytics.

This repository contains extension source, design specs, and synthetic examples
for public collaboration. It intentionally excludes real institutional data.

## Included Extensions

Source lives under `oac-sdk-dev/src/customviz/`.

| Extension | Folder | Purpose |
|---|---|---|
| WSU Network | `com-wsu-network` | Directed course-pathway network with repeat-loop and terminal-node emphasis. |
| WSU Sankey | `com-wsu-sankey` | Governed explicit-stage Sankey for academic and course pathway flows. |
| WSU Line | `com-wsu-line` | Custom line visualization patterns. |
| WSU Dumbbell | `com-wsu-dumbbell` | Comparative dumbbell visualization. |
| WSU Lattice Scatter | `com-wsu-lattice-scatter` | Lattice/scatter visualization for grouped comparison. |

## Repository Layout

```text
oac-sdk-dev/
  build.gradle
  build-sdk.ps1
  run-sdk.ps1
  gradle/
  gradlew
  gradlew.bat
  src/customviz/
docs/
  project_spec_wsu_network.md
  project_spec_wsu_sankey.md
  project_spec_wsu_math.md
  instructions_math.md
examples/
  mock_math_pathway_200_students.csv
tools/
  generate_mock_math_pathway.py
```

## Working With The Network Plugin

Primary source:

```text
oac-sdk-dev/src/customviz/com-wsu-network
```

Primary design spec:

```text
docs/project_spec_wsu_network.md
```

Reviewer guide and test dataset:

```text
docs/instructions_math.md
examples/mock_math_pathway_200_students.csv
```

The mock dataset is synthetic. It is intended for OAC grammar testing and
review of network behaviors such as self-loops, expanded repeat stages, and
`No Further Course` terminal routing.

## Build Notes

This repository includes the Gradle wrapper and OAC SDK development project
scaffold. The local Oracle Analytics Desktop SDK path is machine-specific, so
`oac-sdk-dev/gradle.properties` is intentionally ignored.

Create it locally from:

```text
oac-sdk-dev/gradle.properties.example
```

Then edit the paths for your workstation.

On Windows, the expected build command is:

```powershell
cd oac-sdk-dev
.\build-sdk.ps1
```

Build output is generated under:

```text
oac-sdk-dev/build/distributions/
```

Build artifacts are ignored by Git.

## Public Data Policy

Only synthetic/demo data should be committed to this repository.

Do not commit:

- real student-level data,
- institutional data dictionaries that are not approved for publication,
- exports from production OAC/SDW systems,
- local credentials, tokens, or machine-specific configuration.

## License

Repository code and documentation are released under the MIT License unless a
file states otherwise.

The bundled `vis-network` library in `com-wsu-network/lib/` is third-party
software and retains its own license terms. See `THIRD_PARTY_NOTICES.md`.
