<!--
Project context. Inserted at the end of every prompt under the "Project context" heading
(do not add a top-level heading here). Write in any language. Keep it short: it is paid for on every step.
Placeholders such as {{ROOT_REL}} and {{FLOW_DIR}} are filled in.
-->
- Follow the root `README.md` (and `CLAUDE.md` if you have one). Always read them when checking the specification
- Read project files by their path relative to the root, e.g. `{{ROOT_REL}}src/index.js`
- Documentation that a change may update: `README.md` / `CHANGELOG.md` / the root `docs/`. After implementing, update the relevant ones
