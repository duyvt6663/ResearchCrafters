/**
 * Empty-state copy. Authored to feel intentional rather than under-built —
 * the catalog is small at MVP and we want that to read as deliberate.
 */

export interface EmptyStateCopy {
  title: string;
  body: string;
  cta?: string;
}

export function emptyCatalog(): EmptyStateCopy {
  return {
    title: "The catalog is small on purpose.",
    body: "ResearchCrafters releases a few deeply authored packages at a time. New packages appear here as they pass validation.",
    cta: "Subscribe to release notes",
  };
}

export function singlePackageEarlyState(): EmptyStateCopy {
  return {
    title: "One package, fully tested.",
    body: "We chose to ship one flagship package end-to-end before broadening the catalog. Open it to start the first decision stage.",
    cta: "Open the flagship package",
  };
}
