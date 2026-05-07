import type { ReactElement, ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  AnswerEditor,
  CommandBlock,
  DecisionChoiceList,
  EvidencePanel,
  MentorPanel,
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

export default async function StagePage({
  params,
}: {
  params: Promise<Params>;
}): Promise<ReactElement> {
  const { id, stageRef } = await params;
  const enrollment = getEnrollment(id);
  const stage = getStage(stageRef);
  if (!enrollment || !stage) notFound();

  const session = await getSession();
  const access = permissions.canAccess({
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
  // based on the stage mode.
  const workspace: ReactNode = (() => {
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
      return (
        <AnswerEditor
          stageRef={stage.ref}
          rubric={stage.rubric ?? []}
          submitHref={`/api/stage-attempts`}
        />
      );
    }
    if (mode === "analysis") {
      return (
        <div className="rc-stage-analysis">
          {stage.artifact && (
            <figure>
              <div className="rc-artifact-preview" data-kind={stage.artifact.kind} />
              <figcaption>{stage.artifact.caption}</figcaption>
            </figure>
          )}
          <AnswerEditor
            stageRef={stage.ref}
            rubric={stage.rubric ?? []}
            submitHref={`/api/stage-attempts`}
          />
        </div>
      );
    }
    if (isCliStage) {
      return (
        <div className="rc-stage-cli">
          <p className="rc-narrow-viewport-hint">
            {copy.stagePlayer.openOnDesktop}
          </p>
          <CommandBlock
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

  const contextPanel: ReactNode = (
    <>
      <EvidencePanel stageRef={stage.ref} />
      <RubricPanel rubric={stage.rubric ?? []} />
      <MentorPanel
        stageRef={stage.ref}
        postHref={`/api/mentor/messages`}
        policyCopy={copy.mentor.policyAllowedContext}
      />
    </>
  );

  // Stage map column. The full graph view ships in a follow-up; for now we
  // surface the stage title and prompt so the StagePlayer slot is filled.
  const stageMap: ReactNode = (
    <div className="rc-stage-map">
      <h2 className="rc-stage-map__title">{stage.title}</h2>
      <p className="rc-stage-map__prompt">{stage.inputs.prompt}</p>
      <p className="rc-stage-map__progress">
        {enrollment.completedStageRefs.length} /{" "}
        {enrollment.unlockedStageRefs.length +
          enrollment.completedStageRefs.length}
      </p>
    </div>
  );

  return (
    <main className="rc-page rc-page--stage-player">
      <StagePlayer
        stageMap={stageMap}
        workspace={workspace}
        contextPanel={contextPanel}
        header={<h1 className="rc-stage-header">{stage.title}</h1>}
      />
    </main>
  );
}
