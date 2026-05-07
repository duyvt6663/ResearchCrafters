export {
  prisma,
  withQueryTimeout,
  runWithTimeout,
  QueryTimeoutError,
  DEFAULT_QUERY_TIMEOUT_MS,
} from "./client.js";
export type { PrismaClient } from "./client.js";

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
