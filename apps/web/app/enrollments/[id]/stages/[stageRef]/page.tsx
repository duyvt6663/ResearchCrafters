import type { ReactElement, ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  AnswerEditor,
  CommandBlock,
  DecisionChoiceList,
  EvidencePanel,
  MentorPanel,
  RichAnswerEditor,
  RubricPanel,
  RunStatusPanel,
  StagePlayer,
} from "@researchcrafters/ui/components";
import { cliCommands } from "@researchcrafters/ui/cli-commands";
import { copy } from "@researchcrafters/ui/copy";
import { getEnrollment, getStage } from "@/lib/data/enrollment";
import { getSession } from "@/lib/auth";
import { permissions } from "@/lib/permissions";
import { renderErrorPage } from "@/lib/error-pages";
import { track } from "@/lib/telemetry";

type Params = { id: string; stageRef: string };

/**
 * Opt out of static prerender: this page reads enrollment, stage, and session
 * state from Prisma + NextAuth. Static prerender would try to query the DB at
 * build time without a `DATABASE_URL`; force-dynamic defers it to request
 * time.
 */
export const dynamic = "force-dynamic";

export default async function StagePage({
  params,
}: {
  params: Promise<Params>;
}): Promise<ReactElement> {
  const { id, stageRef } = await params;
  const enrollment = await getEnrollment(id);
  const stage = await getStage(id, stageRef);
  if (!enrollment || !stage) notFound();

  const session = await getSession();
  const access = await permissions.canAccess({
    user: session,
    packageVersionId: enrollment.packageVersionId,
    stage: { ref: stage.ref, isFreePreview: stage.isFreePreview, isLocked: stage.isLocked },
    action: "view_stage",
  });

  if (!access.allowed) {
    // Stage opened under entitlement must not be paywall-interrupted mid-stage
    // (see TODOS/09 mid-stage paywall guard). The paywall surface is the
    // stage-load boundary itself, rendered via the typed error renderer.
    if (access.reason === "stage_locked" || access.reason === "no_entitlement") {
      return renderErrorPage("stage-locked", { retryHref: `/packages/${enrollment.packageSlug}` });
    }
    return renderErrorPage("stage-locked");
  }

  await track("stage_loaded", {
    enrollmentId: enrollment.id,
    stageRef: stage.ref,
    mode: stage.inputs.mode,
  });

  const mode = stage.inputs.mode;
  const isCliStage = mode === "code" || mode === "experiment";

  // Build the workspace content. The StagePlayer layout slots accept React
  // nodes directly — the page is responsible for choosing what to render
  // based on the stage mode. Each branch wraps its surface in a max-width
  // prose container so writing tasks are readable on wide monitors.
  const workspaceInner: ReactNode = (() => {
    if (mode === "decision" && stage.decision) {
      return (
        <DecisionChoiceList
          choices={stage.decision.branches.map((b) => ({
            id: b.id,
            label: b.label,
            summary: b.summary,
            revealed: b.revealed,
            type: b.type,
          }))}
          submitHref={`/api/node-traversals`}
          stageRef={stage.ref}
        />
      );
    }
    if (mode === "writing") {
      // Writing stages get the rich-text editor — markdown toolbar +
      // live preview. Autosave / sanitize / undo-redo continue to live
      // inside the wrapped `AnswerEditor`.
      return (
        <RichAnswerEditor
          stageRef={stage.ref}
          rubric={stage.rubric ?? []}
          submitHref={`/api/stage-attempts`}
        />
      );
    }
    if (mode === "analysis") {
      return (
        <div className="flex flex-col gap-4">
          {stage.artifact && (
            <figure className="flex flex-col gap-2">
              <div
                className="rc-artifact-preview aspect-[16/9] w-full rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-surface-muted)"
                data-kind={stage.artifact.kind}
              />
              <figcaption className="text-(--text-rc-xs) text-(--color-rc-text-muted)">
                {stage.artifact.caption}
              </figcaption>
            </figure>
          )}
          <RichAnswerEditor
            stageRef={stage.ref}
            rubric={stage.rubric ?? []}
            submitHref={`/api/stage-attempts`}
          />
        </div>
      );
    }
    if (isCliStage) {
      return (
        <div className="flex flex-col gap-3">
          <p className="text-(--text-rc-sm) leading-relaxed text-(--color-rc-text-muted)">
            {copy.stagePlayer.openOnDesktop}
          </p>
          <CommandBlock
            title={`~/research/${enrollment.packageSlug}`}
            commands={[
              cliCommands.start(stage.ref),
              cliCommands.test,
              cliCommands.submit,
            ]}
          />
          <RunStatusPanel stageRef={stage.ref} />
        </div>
      );
    }
    if (mode === "reflection" || mode === "review") {
      return (
        <AnswerEditor
          stageRef={stage.ref}
          rubric={stage.rubric ?? []}
          submitHref={`/api/stage-attempts`}
          placeholder={copy.stagePlayer.reflectionPlaceholder}
        />
      );
    }
    return null;
  })();

  // Comfortable padding + bounded prose. The stage player is a workbench
  // surface, but the writing/reading lines deserve real prose typography:
  // line-height 1.6 (`prose-rc`) so longer prompts and rubric notes don't
  // feel cramped. Width caps at `max-w-prose` (~65ch) which keeps the line
  // length comfortable on ultrawide monitors.
  const workspace: ReactNode = (
    <div className="mx-auto w-full max-w-prose prose-rc">{workspaceInner}</div>
  );

  const contextPanel: ReactNode = (
    <div className="flex flex-col divide-y divide-(--color-rc-border)">
      <div className="px-4 py-3">
        <h3 className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          Evidence
        </h3>
        <div className="mt-2">
          <EvidencePanel stageRef={stage.ref} />
        </div>
      </div>
      <div className="px-4 py-3">
        <h3 className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          Rubric
        </h3>
        <div className="mt-2">
          <RubricPanel rubric={stage.rubric ?? []} />
        </div>
      </div>
      <div className="px-4 py-3">
        <h3 className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          Mentor
        </h3>
        <div className="mt-2">
          <MentorPanel
            stageRef={stage.ref}
            postHref={`/api/mentor/messages`}
            policyCopy={copy.mentor.policyAllowedContext}
          />
        </div>
      </div>
    </div>
  );

  // Stage map column. The full graph view ships in a follow-up; for now we
  // surface the stage title, prompt, and progress so the StagePlayer slot
  // is filled with workbench-precise structure.
  const completed = enrollment.completedStageRefs.length;
  const total =
    enrollment.unlockedStageRefs.length + enrollment.completedStageRefs.length;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const stageMap: ReactNode = (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <p className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          Stage
        </p>
        <h2 className="mt-1 text-(--text-rc-md) font-semibold leading-snug text-(--color-rc-text)">
          {stage.title}
        </h2>
      </div>
      <p className="text-(--text-rc-sm) leading-relaxed text-(--color-rc-text-muted)">
        {stage.inputs.prompt}
      </p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-(--text-rc-xs) text-(--color-rc-text-muted)">
          <span>Progress</span>
          <span className="font-medium text-(--color-rc-text)">
            {completed} / {total}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-(--radius-rc-sm) bg-(--color-rc-surface-muted)">
          <div
            aria-hidden
            className="h-full bg-(--color-rc-accent)"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );

  // Header strip — sticky title + progress. The StagePlayer wraps this in a
  // bottom-bordered band; we paint the band on `--color-rc-surface` for a
  // calm operational tone.
  const header: ReactNode = (
    <div className="flex items-center justify-between gap-3 bg-(--color-rc-surface)">
      <div className="flex min-w-0 flex-col">
        <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          Stage {completed + 1}
          {total > 0 ? ` of ${total}` : ""}
        </span>
        <h1 className="truncate text-(--text-rc-md) font-semibold text-(--color-rc-text)">
          {stage.title}
        </h1>
      </div>
      <div className="flex items-center gap-2 text-(--text-rc-xs) text-(--color-rc-text-muted)">
        <span>{progressPct}%</span>
        <div className="h-1.5 w-32 overflow-hidden rounded-(--radius-rc-sm) bg-(--color-rc-surface-muted)">
          <div
            aria-hidden
            className="h-full bg-(--color-rc-accent)"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );

  return (
    <main className="rc-page rc-page--stage-player">
      <StagePlayer
        stageMap={stageMap}
        workspace={workspace}
        contextPanel={contextPanel}
        header={header}
      />
    </main>
  );
}
