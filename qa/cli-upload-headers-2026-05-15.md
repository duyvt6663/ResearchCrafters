# QA — CLI honors API-returned `uploadHeaders`

Date: 2026-05-15
Branch: skynet/pr/share-card-public-urls-2026-05-15
Backlog item: `backlog/03-cli-runner.md:64` —
"Honor all API-returned `uploadHeaders` when uploading to the signed URL."
Cross-ref: `backlog/10-integration-quality-gaps.md:353` flagged the same gap.

## Problem

`api.uploadToSignedUrl(signedUrl, body)` previously hard-coded
`content-type: application/octet-stream` and ignored the `uploadHeaders`
map returned from `/api/submissions`. On signed-URL backends that require
specific headers as part of the signature (S3/GCS `x-amz-*` /
`x-goog-*` / SSE / `x-rc-submission-id`), this would cause
`SignatureDoesNotMatch` 403s as soon as the server-side signing logic
started supplying them.

## Change

- `packages/cli/src/lib/api.ts:270` — `uploadToSignedUrl` now accepts an
  optional `uploadHeaders: Record<string, string>` and merges every entry
  onto the PUT request. The default `content-type` is dropped (case-
  insensitively) when the API supplies its own.
- `packages/cli/src/commands/submit.ts:109` — wires
  `init.uploadHeaders` through from `initSubmission`.

The `SubmitInitResponse.uploadHeaders` shape (already in the contract
since `apps/web/lib/api-contract.ts:164` and the route at
`apps/web/app/api/submissions/route.ts:187`) is now actually consumed.

## Verification

- `pnpm vitest run test/upload-headers.test.ts test/submit-bundle.test.ts test/contract.test.ts`
  → 30/30 passing in 1.82s (new `upload-headers.test.ts` adds 5 tests).
- `pnpm typecheck` (`packages/cli`) → clean.

### Regression coverage added

`packages/cli/test/upload-headers.test.ts` spins up a local HTTP server and
asserts:

1. Every API-returned header is forwarded on the PUT body
   (`x-rc-submission-id`, `x-amz-server-side-encryption`,
   `x-amz-meta-foo`).
2. Default `content-type: application/octet-stream` is preserved when the
   API does not supply one.
3. An API-supplied `Content-Type` (note: title case) overrides the
   default — case-insensitive merge.
4. Old call signature `uploadToSignedUrl(url, body)` (no headers arg)
   still works.
5. A 4xx storage response surfaces as `ApiError("upload_failed")`.

## Out of scope

The four `related_items` returned by the queue (resource caps, network
disable, retry budget, container isolation) are runner-execution
concerns, not upload-path concerns — left untouched and not claimed in
this iteration.
