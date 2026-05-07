export const QUEUE_NAMES = [
  'branch_stats_rollup',
  'share_card_render',
  'event_dual_write',
  'submission_run',
  'mentor_request',
  'package_build',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export const BRANCH_STATS_ROLLUP_QUEUE: QueueName = 'branch_stats_rollup';
export const SHARE_CARD_RENDER_QUEUE: QueueName = 'share_card_render';
export const EVENT_DUAL_WRITE_QUEUE: QueueName = 'event_dual_write';
export const SUBMISSION_RUN_QUEUE: QueueName = 'submission_run';
export const MENTOR_REQUEST_QUEUE: QueueName = 'mentor_request';
export const PACKAGE_BUILD_QUEUE: QueueName = 'package_build';
