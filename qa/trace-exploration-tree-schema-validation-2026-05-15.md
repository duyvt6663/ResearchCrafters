# QA: Trace exploration_tree schema/link validation

**Backlog item:** `backlog/04-validation-evaluator.md:33` — Verify
`trace/exploration_tree.yaml` nodes reference valid logic, code, evidence
ids, branch ids, parent ids, and edge endpoints; flag dangling or duplicate
node ids.

## Change summary

`packages/content-sdk/src/validator/ara-cross-link.ts`

- Extended `TraceNode` interface to cover `kind`, `parents`, `branch_id`;
  introduced `TraceEdge`.
- Split trace validation into a two-pass walk:
  - **Pass 1** collects ids, flags `trace.node.id_invalid` and
    `trace.node.duplicate_id` (existing behavior, preserved).
  - **Pass 2** runs new `validateTraceNode` per node:
    - `trace.node.refs_invalid` — `refs` present but not an array.
    - `trace.parent.invalid` / `trace.node.parents_invalid` — bad shape.
    - `trace.parent.missing` — parent id not in the node-id set.
    - `trace.parent.self_reference` — node lists itself as parent.
    - `trace.child.missing` — string child id not in the node-id set.
    - `trace.child.self_reference` — node lists itself as child.
    - `trace.branch_id.missing` — `kind: branch` without a branch_id.
    - `trace.branch_id.unresolved` — branch_id not in curriculum branches
      (error on branch nodes, warning on non-branch nodes).
- Added top-level edges validation via `validateTraceEdges`:
  - `trace.edges_invalid` — `edges` present but not an array.
  - `trace.edge.invalid` — edge entry not an object.
  - `trace.edge.endpoint_invalid` — `from`/`to` missing or not a string.
  - `trace.edge.endpoint_missing` — endpoint references unknown node id.
  - `trace.edge.self_loop` — warning when `from === to`.
- Removed the `void branchById` no-op; the map is now consumed.

## Verification

Run from the repo root unless noted.

1. **Type check** — `pnpm --filter @researchcrafters/content-sdk typecheck` →
   clean.
2. **Build** — `pnpm --filter @researchcrafters/content-sdk build` → clean.
3. **Lint** — `pnpm --filter @researchcrafters/content-sdk lint` → clean.
4. **Unit tests** — `pnpm --filter @researchcrafters/content-sdk test` →
   **24/24 passing**, including the new
   `flags trace exploration_tree dangling parents, edges, and branch_id`
   case that constructs a temp clone of `sample-package` with a malformed
   `exploration_tree.yaml` and asserts the new codes fire:
   `trace.parent.missing`, `trace.child.missing`,
   `trace.edge.endpoint_missing`, `trace.branch_id.unresolved`,
   `trace.edge.self_loop`.
5. **Real-world fixture** — direct call to `validateAraCrossLink` on
   `content/packages/resnet` (the resnet trace uses `parents`, explicit
   `edges`, and three `kind: branch` nodes with `branch_id` mapped to the
   curriculum branches): **0 errors, 0 warnings** — no false positives.
6. **Sample fixture** — `sample-package`'s nested-children trace still
   passes `validateAraCrossLink` cleanly (existing test).

## Notes / scope boundaries

- The "Verify trace nodes that map to curriculum branches use the same id
  convention" item (backlog line 39) is intentionally **not** done here.
  The new check matches `branch_id` against the curriculum-branch id set
  but does not enforce a shared naming pattern between trace node ids and
  branch ids. That convention check is a separate item.
- "Schema completeness" was kept lenient: unknown top-level keys are
  allowed; only `nodes`/`edges` structural shape and per-node fields are
  enforced. Tighter schema enforcement, if wanted, should live in
  `validateStructural` driven by the package YAML schema.
