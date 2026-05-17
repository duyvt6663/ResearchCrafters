export {
  prisma,
  withQueryTimeout,
  runWithTimeout,
  QueryTimeoutError,
  DEFAULT_QUERY_TIMEOUT_MS,
} from "./client.js";
export type { PrismaClient, ExtendedPrismaClient } from "./client.js";

// Application-level at-rest encryption. The `prisma` singleton above already
// has the extension applied; these named exports are for tests, scripts, and
// any consumer that needs to introspect the policy or call the leaf crypto
// helpers directly (e.g. backfill scripts that encrypt rows in place).
export {
  encrypt,
  decrypt,
  isEncrypted,
  DecryptError,
  MissingKeyError,
} from "./crypto.js";
export type { EncryptedEnvelope } from "./crypto.js";
export {
  ENCRYPTED_FIELDS,
  withEncryption,
  isEncryptionDisabled,
} from "./encrypted-fields.js";
export type { EncryptedFieldPolicy } from "./encrypted-fields.js";

// Re-export generated Prisma types so consumers don't need a direct
// dependency on @prisma/client. Add named re-exports here as the schema
// grows; using `export *` would conflict with verbatimModuleSyntax.
export {
  Prisma,
} from "@prisma/client";
export type {
  User,
  Membership,
  Entitlement,
  Package,
  PackageVersion,
  PackageVersionPatch,
  Stage,
  DecisionNode,
  Branch,
  Enrollment,
  NodeTraversal,
  StageAttempt,
  Submission,
  Run,
  Grade,
  MentorThread,
  MentorMessage,
  BranchStat,
  ShareCard,
  Review,
  Event,
  Account,
  Session,
  VerificationToken,
  DeviceCodeFlow,
} from "@prisma/client";

// Active `PackageVersionPatch.patchSeq` resolver. Returns the highest
// patch_seq currently shipped against a package version (or 0 when none
// exist) so callers — currently the stage-attempt write path — can freeze
// the active patch generation on the row at creation time.
// (backlog/06 §Version and Patch Policy line 69.)
export { resolveActivePatchSeq } from "./active-patch-seq.js";
export type {
  ActivePatchSeqPrisma,
  ResolveActivePatchSeqOptions,
} from "./active-patch-seq.js";
