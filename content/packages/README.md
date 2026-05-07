# content/packages/

Each subdirectory here is one Executable Research Package. The flagship MVP
package lands here first — see `TODOS/02-erp-content-package.md` for the
anatomy and `docs/PRD_v2.md` for the full spec.

Layout per package:

```text
{paper-slug}/
  package.yaml
  README.md
  artifact/    # ARA-compatible: PAPER.md, logic/, src/, trace/, evidence/
  curriculum/  # graph.yaml, stages/, rubrics/, hints/
  workspace/   # starter/, tests/, fixtures/, runner.yaml
  solutions/   # canonical/, branches/
  media/       # diagrams/, share-card/
```
