import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import {
  Card,
  CardBody,
  CardHeader,
  CodeBlock,
  CommandBlock,
  DecisionChoiceList,
  DecisionGraphMobile,
  EvidenceCard,
  Prose,
  StatusBadge,
} from "@researchcrafters/ui/components";
import { copy } from "@researchcrafters/ui/copy";
import { cliCommands } from "@researchcrafters/ui/cli-commands";
import { getPackageBySlug } from "@/lib/data/packages";
import { getSession } from "@/lib/auth";
import { signIn } from "@/auth";
import { track } from "@/lib/telemetry";
import { StartPackageCta } from "@/components/StartPackageCta";
import { PricingCta } from "@/components/PricingCta";

type Params = { slug: string };

async function signInWithGithubForStart(redirectTo: string): Promise<void> {
  "use server";
  await signIn("github", { redirectTo });
}

async function joinWaitlistAction(slug: string): Promise<void> {
  "use server";
  // fire-and-forget: track() is best-effort and must not block TTFB.
  void track("waitlist_intent", { surface: "overview", slug });
}

/**
 * Opt out of static prerender: this page resolves the package by slug through
 * `getPackageBySlug`, which is backed by Prisma. Building statically would try
 * to run the query without a `DATABASE_URL`; force-dynamic defers it to
 * request time.
 */
export const dynamic = "force-dynamic";

const SAMPLE_SOLUTION_PY = `# Canonical residual block — paper-faithful skeleton.
import torch
import torch.nn as nn

class ResidualBlock(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        identity = x
        y = torch.relu(self.bn1(self.conv1(x)))
        y = self.bn2(self.conv2(y))
        # The residual connection is the whole point: F(x) + x.
        return torch.relu(y + identity)
`;

// Faux training-curve data — derived from the seed's training_log shape so
// the EvidenceCard reads as a real comparison without leaking the package's
// canonical answer.
const TRAINING_TRAJECTORIES = [
  {
    name: "plain-34",
    tone: "plain" as const,
    points: [
      [0, 0.05],
      [10, 0.18],
      [20, 0.27],
      [40, 0.34],
      [60, 0.36],
      [90, 0.35],
    ] as ReadonlyArray<readonly [number, number]>,
  },
  {
    name: "resnet-34",
    tone: "residual" as const,
    points: [
      [0, 0.05],
      [10, 0.22],
      [20, 0.39],
      [40, 0.58],
      [60, 0.69],
      [90, 0.74],
    ] as ReadonlyArray<readonly [number, number]>,
  },
];

export default async function PackageOverviewPage({
  params,
}: {
  params: Promise<Params>;
}): Promise<ReactElement> {
  const { slug } = await params;
  const pkg = await getPackageBySlug(slug);
  if (!pkg) notFound();

  // fire-and-forget: track() is best-effort and must not block TTFB.
  void track("package_viewed", { surface: "overview", slug });

  const session = await getSession();
  const isAuthenticated = Boolean(session.userId);
  const startRoute = `/packages/${pkg.slug}/start`;

  return (
    <main className="rc-page rc-page--package-overview">
      {/* Hero band — display headline + paper eyebrow + summary CTA on a
          dot-grid surface. The hero is the marketing surface. */}
      <header className="relative overflow-hidden border-b border-(--color-rc-border) bg-(--color-rc-surface)">
        <div className="rc-hero-grid absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto w-full max-w-[1280px] px-6 py-14 lg:px-8 lg:py-20">
          <div className="flex flex-col gap-5">
            <span className="rc-eyebrow">{pkg.paperTitle}</span>
            <div className="flex items-start justify-between gap-4">
              <h1 className="rc-display max-w-3xl text-(--color-rc-text)">
                {pkg.title}
              </h1>
              {pkg.releaseStatus ? (
                <span
                  className="flex-none rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg) px-2 py-0.5 font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-muted)"
                >
                  {pkg.releaseStatus}
                </span>
              ) : null}
            </div>
            <p className="max-w-2xl text-(--text-rc-lg) leading-[1.6] text-(--color-rc-text-muted)">
              {pkg.oneLinePromise}
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1280px] px-6 py-12 lg:px-8">
        <div className="grid gap-8 md:grid-cols-12">
          {/* Left column — paper, skills, sample decision, failed-branch
              lesson, stage list. Spans 7 of 12. */}
          <div className="flex min-w-0 flex-col gap-10 md:col-span-7">
            <section>
              <span className="rc-eyebrow mb-3 block">Here's a taste</span>
              <h2 className="mb-4 text-(--text-rc-xl) font-bold text-(--color-rc-text)">
                What you will practice
              </h2>
              {/* Server-rendered Shiki snippet — this is the "you'll write
                  code that looks like this" pitch. CodeBlock is an async
                  server component; React Server Components await it
                  inline. */}
              <div className="mb-5">
                <CodeBlock
                  code={SAMPLE_SOLUTION_PY}
                  lang="python"
                  filename="residual_block.py"
                />
              </div>
              {pkg.whatYouWillPractice.length > 0 ? (
                <ul className="prose-rc flex flex-col gap-2 text-(--text-rc-sm) text-(--color-rc-text)">
                  {pkg.whatYouWillPractice.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span
                        aria-hidden
                        className="mt-2 h-1 w-1 flex-none rounded-full bg-(--color-rc-accent)"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            {pkg.skills.length > 0 ? (
              <section>
                <h2 className="mb-3 text-(--text-rc-md) font-semibold text-(--color-rc-text)">
                  Skills trained
                </h2>
                <ul className="flex flex-wrap gap-1.5">
                  {pkg.skills.map((s) => (
                    <li
                      key={s}
                      className="inline-flex items-center rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-surface) px-2 py-0.5 text-(--text-rc-xs) text-(--color-rc-text-muted)"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {pkg.prerequisites.length > 0 ? (
              <section>
                <h2 className="mb-3 text-(--text-rc-md) font-semibold text-(--color-rc-text)">
                  Prerequisites
                </h2>
                <ul className="flex flex-wrap gap-1.5">
                  {pkg.prerequisites.map((p) => (
                    <li
                      key={p}
                      className="inline-flex items-center rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-surface) px-2 py-0.5 text-(--text-rc-xs) text-(--color-rc-text-muted)"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <header className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-(--text-rc-md) font-semibold text-(--color-rc-text)">
                  {copy.packageOverview.sampleDecisionTitle}
                </h2>
                <span className="text-(--text-rc-xs) text-(--color-rc-text-subtle)">
                  Read-only preview
                </span>
              </header>
              <Card>
                <CardBody className="flex flex-col gap-4 p-5">
                  <Prose size="md">{pkg.sampleDecision.prompt}</Prose>
                  <DecisionChoiceList
                    choices={pkg.sampleDecision.branches.map((b, idx) => ({
                      id: `sample-${idx}`,
                      label: b.label,
                      summary: b.summary,
                      revealed: b.revealed && b.type !== "failed",
                      type: b.type,
                    }))}
                    readOnly
                  />
                </CardBody>
              </Card>
            </section>

            <section
              className={
                "flex flex-col gap-2 rounded-(--radius-rc-md) " +
                "border border-(--color-rc-warning)/30 bg-(--color-rc-warning-subtle) " +
                "px-5 py-5"
              }
            >
              <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-wide text-(--color-rc-warning)">
                Failed-branch lesson
              </span>
              <h2 className="text-(--text-rc-md) font-semibold text-(--color-rc-text)">
                {pkg.failedBranchLesson.title}
              </h2>
              <Prose size="sm" className="prose-rc text-(--color-rc-text-muted)">
                {pkg.failedBranchLesson.redactedSummary}
              </Prose>
            </section>

            <section>
              <h2 className="mb-3 text-(--text-rc-md) font-semibold text-(--color-rc-text)">
                Stages
              </h2>
              <ol className="flex flex-col">
                {pkg.stages.map((stage, idx) => (
                  <li
                    key={stage.ref}
                    className={
                      "flex items-center justify-between gap-3 py-3 text-(--text-rc-sm)" +
                      (idx > 0 ? " border-t border-(--color-rc-border)" : "")
                    }
                  >
                    <div className="flex min-w-0 flex-1 items-baseline gap-3">
                      <span className="w-7 flex-none font-(--font-rc-mono) text-(--text-rc-xs) text-(--color-rc-text-subtle)">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-(--color-rc-text)">
                          {stage.title}
                        </div>
                        <div className="text-(--text-rc-xs) text-(--color-rc-text-muted)">
                          {stage.type} · {stage.estimatedMinutes} min
                        </div>
                      </div>
                    </div>
                    <StatusBadge
                      status={stage.isFreePreview ? "in_progress" : "locked"}
                      size="sm"
                      label={stage.isFreePreview ? "Free preview" : "Paid"}
                    />
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {/* Right rail — sticky summary, decision graph preview, evidence
              card. Spans 5 of 12. */}
          <aside className="md:col-span-5">
            <div className="md:sticky md:top-20 flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <h2 className="text-(--text-rc-md) font-semibold text-(--color-rc-text)">
                    Summary
                  </h2>
                </CardHeader>
                <CardBody className="flex flex-col gap-4 p-5">
                  <dl className="grid grid-cols-3 gap-3 text-(--text-rc-sm)">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-(--text-rc-xs) uppercase tracking-wide text-(--color-rc-text-subtle)">
                        Difficulty
                      </dt>
                      <dd className="font-medium text-(--color-rc-text)">
                        {pkg.difficulty}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-(--text-rc-xs) uppercase tracking-wide text-(--color-rc-text-subtle)">
                        Time
                      </dt>
                      <dd className="font-medium text-(--color-rc-text)">
                        {pkg.estimatedMinutes} min
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-(--text-rc-xs) uppercase tracking-wide text-(--color-rc-text-subtle)">
                        Free
                      </dt>
                      <dd className="font-medium text-(--color-rc-text)">
                        {pkg.freeStageCount} stages
                      </dd>
                    </div>
                  </dl>
                  <StartPackageCta
                    slug={pkg.slug}
                    packageTitle={pkg.title}
                    isAuthenticated={isAuthenticated}
                    label={copy.packageOverview.startCta}
                    onGithubSignIn={signInWithGithubForStart.bind(
                      null,
                      startRoute,
                    )}
                  />
                  <p className="text-(--text-rc-xs) leading-relaxed text-(--color-rc-text-subtle)">
                    Get started in your editor:
                  </p>
                  <CommandBlock
                    title={`~/research/${pkg.slug}`}
                    commands={[
                      cliCommands.start(pkg.slug),
                      cliCommands.test,
                      cliCommands.submit,
                    ]}
                  />
                </CardBody>
              </Card>

              <section>
                <header className="mb-3">
                  <h2 className="text-(--text-rc-md) font-semibold text-(--color-rc-text)">
                    {copy.packageOverview.graphPreviewTitle}
                  </h2>
                  <p className="text-(--text-rc-xs) text-(--color-rc-text-muted)">
                    {copy.packageOverview.graphPreviewBody}
                  </p>
                </header>
                <Card>
                  <CardBody className="p-5">
                    <DecisionGraphMobile
                      nodes={[
                        {
                          ref: "preview",
                          title: pkg.sampleDecision.prompt,
                          type: "decision",
                          status: "current",
                          branches: pkg.sampleDecision.branches.map(
                            (b, idx) => ({
                              id: `preview-${idx}-${b.type}`,
                              label: b.label,
                              summary: b.revealed ? b.summary : "",
                              type: b.type,
                              revealed: b.revealed,
                            }),
                          ),
                        },
                      ]}
                    />
                  </CardBody>
                </Card>
              </section>

              <section>
                <header className="mb-3">
                  <h2 className="text-(--text-rc-md) font-semibold text-(--color-rc-text)">
                    {copy.packageOverview.evidenceTitle}
                  </h2>
                </header>
                <EvidenceCard
                  kind="training-curve"
                  caption={
                    pkg.sampleArtifact.caption ||
                    "Validation accuracy across 90 epochs. Residual run pulls ahead after step 20."
                  }
                  data={{ trajectories: TRAINING_TRAJECTORIES }}
                />
              </section>

              <Card>
                <CardHeader>
                  <h2 className="text-(--text-rc-md) font-semibold text-(--color-rc-text)">
                    Pricing
                  </h2>
                </CardHeader>
                <CardBody className="p-5">
                  <PricingCta
                    slug={pkg.slug}
                    cta={pkg.pricing.cta}
                    {...(typeof pkg.pricing.monthlyUsd === "number"
                      ? { monthlyUsd: pkg.pricing.monthlyUsd }
                      : {})}
                    buyLabel={copy.packageOverview.priceCta(
                      pkg.pricing.monthlyUsd ?? 0,
                    )}
                    waitlistLabel={copy.packageOverview.waitlistCta}
                    onJoinWaitlist={joinWaitlistAction.bind(null, pkg.slug)}
                  />
                </CardBody>
              </Card>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
