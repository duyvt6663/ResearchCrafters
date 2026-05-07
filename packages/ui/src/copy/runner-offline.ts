/**
 * Runner-offline copy. Authored, short, recoverable in tone.
 */

export interface RunnerOfflineCopy {
  title: string;
  body: string;
  retryCta: string;
}

export function runnerOffline(): RunnerOfflineCopy {
  return {
    title: "The runner is unavailable right now.",
    body: "We could not reach the sandbox to execute your submission. Your work is saved locally and nothing is lost.",
    retryCta: "Try again",
  };
}
