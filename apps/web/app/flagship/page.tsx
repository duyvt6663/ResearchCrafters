import * as React from "react";
import type { ReactElement, ReactNode } from "react";
import type { Metadata } from "next";
import {
  Card,
  CardBody,
  CodeBlock,
  CommandBlock,
} from "@researchcrafters/ui/components";

// The flagship landing page is a top-of-funnel marketing surface dedicated
// to ResNet — the one fully-tested package we use to validate willingness
// to pay during alpha (see backlog/07-alpha-launch.md § Pre-Launch Assets).
//
// Kept fully static (no Prisma, no `force-dynamic`) so it builds and serves
// without `DATABASE_URL` and can be cached at the edge.

const FLAGSHIP_SLUG = "resnet";
const FLAGSHIP_START_HREF = `/packages/${FLAGSHIP_SLUG}`;
const CATALOG_HREF = "/";

const RESIDUAL_BLOCK_PY = `# What you actually write in stage 3 — paper-faithful skeleton.
import torch
import torch.nn as nn

class ResidualBlock(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1   = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2   = nn.BatchNorm2d(channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        identity = x
        y = torch.relu(self.bn1(self.conv1(x)))
        y = self.bn2(self.conv2(y))
        # The whole point of the package: defend (or attack) this line.
        return torch.relu(y + identity)
`;

export const metadata: Metadata = {
  title: "ResNet, rebuilt by you — ResearchCrafters",
  description:
    "Sit at the decision Kaiming He had to make in 2015: why did deeper networks get worse on CIFAR-10? Pick a branch, implement it, and watch your training curve argue back.",
  openGraph: {
    title: "ResNet, rebuilt by you",
    description:
      "Rebuild the research behind ResNet — decisions, code, experiments, and the writing that defended the result.",
    type: "article",
  },
};

export default function FlagshipLandingPage(): ReactElement {
  return (
    <main className="rc-page rc-page--flagship">
      {/* Hero — the one-line bet: "this is the paper, this is the moment,
          you're in the driver's seat." */}
      <header
        data-testid="flagship-hero"
        className="relative overflow-hidden border-b border-(--color-rc-border) bg-(--color-rc-surface)"
      >
        <div className="rc-hero-grid absolute inset-0 opacity-60" aria-hidden />
        <div className="relative mx-auto w-full max-w-[1280px] px-6 py-20 lg:px-8 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[7fr_5fr] lg:items-center">
            <div className="flex flex-col gap-6 rc-anim-fade-up">
              <span className="rc-eyebrow">
                Flagship package · He et al., 2015 · arXiv:1512.03385
              </span>
              <h1 className="rc-display-xl text-(--color-rc-text)">
                Rebuild ResNet from the decision that made it work.
              </h1>
              <p className="max-w-xl text-(--text-rc-lg) leading-[1.6] text-(--color-rc-text-muted)">
                It's 2015. Deeper networks should learn more — but a plain
                34-layer net trains worse than a 20-layer one on CIFAR-10.
                Not overfitting. Just worse. Your job is to figure out why,
                pick a fix, implement it, and let the training curve judge
                you.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <a
                  href={FLAGSHIP_START_HREF}
                  data-testid="flagship-cta-primary"
                  className={
                    "inline-flex items-center gap-1.5 rounded-(--radius-rc-md) " +
                    "bg-(--color-rc-accent) px-4 py-2.5 text-(--text-rc-md) font-semibold " +
                    "text-(--color-rc-accent-foreground) transition-colors duration-(--duration-rc-fast) " +
                    "hover:bg-(--color-rc-accent-hover)"
                  }
                >
                  <span>Start the first stage free</span>
                  <span aria-hidden>→</span>
                </a>
                <a
                  href={CATALOG_HREF}
                  data-testid="flagship-cta-secondary"
                  className={
                    "inline-flex items-center gap-1.5 rounded-(--radius-rc-md) " +
                    "border border-(--color-rc-border) bg-(--color-rc-bg) px-4 py-2.5 " +
                    "text-(--text-rc-md) font-medium text-(--color-rc-text) " +
                    "transition-colors duration-(--duration-rc-fast) " +
                    "hover:border-(--color-rc-border-strong)"
                  }
                >
                  Browse the catalog
                </a>
              </div>
              <p className="text-(--text-rc-xs) text-(--color-rc-text-subtle)">
                ~3 hours · intermediate · CIFAR-10 runs locally, no GPU
                required.
              </p>
            </div>

            <div className="rc-anim-fade-up rc-anim-fade-up--delay-1">
              <CommandBlock
                title={`~/research/${FLAGSHIP_SLUG}`}
                typing
                commands={[
                  `researchcrafters start ${FLAGSHIP_SLUG}`,
                  "researchcrafters test",
                  "researchcrafters submit",
                ]}
                output={[
                  { line: "→ scaffolded 9 stages", tone: "muted" },
                  { line: "PASS  test_residual_block.py", tone: "success" },
                  { line: "PASS  test_grad_flow.py", tone: "success" },
                  { line: "submitted attempt #1 (graded)", tone: "muted" },
                ]}
              />
            </div>
          </div>
        </div>
      </header>

      {/* The puzzle — kept abstract so the canonical answer is not leaked.
          This is the marketing surface, but it still obeys the safety rules
          in content/packages/resnet/package.yaml (no "F(x) + x", no
          "identity shortcut", no "He et al." attribution of the fix). */}
      <section
        aria-labelledby="flagship-puzzle-heading"
        className="border-b border-(--color-rc-border) bg-(--color-rc-bg)"
      >
        <div className="mx-auto w-full max-w-[1280px] px-6 py-14 lg:px-8">
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-7">
              <span className="rc-eyebrow mb-3 block">The puzzle</span>
              <h2
                id="flagship-puzzle-heading"
                className="mb-4 text-(--text-rc-3xl) font-bold leading-tight tracking-[-0.01em] text-(--color-rc-text)"
              >
                Deeper should be better. It wasn't.
              </h2>
              <div className="prose-rc flex flex-col gap-4 text-(--text-rc-md) leading-[1.65] text-(--color-rc-text)">
                <p>
                  A 20-layer plain CNN trained on CIFAR-10 reaches a certain
                  validation accuracy. Stack on more conv layers — same
                  optimizer, same init, same data — and accuracy drops.
                  Train longer; it still drops. The training loss drops too.
                  So it isn't overfitting.
                </p>
                <p>
                  In stages 1–2 you frame the problem precisely, rule out
                  the easy explanations (vanishing gradients, bad init,
                  dataset noise), and stand at the same fork the authors
                  stood at. Then you commit to a branch.
                </p>
                <p className="text-(--color-rc-text-muted)">
                  The package ships three branches. One is the canonical
                  fix. One is a reasonable-looking dead end. One almost
                  works, but for the wrong reason. You don't get to see
                  which is which until you've defended your pick.
                </p>
              </div>
            </div>
            <aside className="md:col-span-5">
              <Card>
                <CardBody className="flex flex-col gap-3 p-5">
                  <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-wide text-(--color-rc-text-subtle)">
                    Stage 3 · you write this
                  </span>
                  <CodeBlock
                    code={RESIDUAL_BLOCK_PY}
                    lang="python"
                    filename="residual_block.py"
                  />
                  <p className="text-(--text-rc-xs) leading-relaxed text-(--color-rc-text-muted)">
                    The autograder checks shape, parameter count, and
                    gradient flow. Stage 4 actually trains it on CIFAR-10
                    against the plain baseline and you compare curves.
                  </p>
                </CardBody>
              </Card>
            </aside>
          </div>
        </div>
      </section>

      {/* What you walk away with — concrete, falsifiable promises. Each one
          corresponds to a stage or rubric in the package. */}
      <section
        aria-labelledby="flagship-outcomes-heading"
        className="border-b border-(--color-rc-border) bg-(--color-rc-surface)"
      >
        <div className="mx-auto w-full max-w-[1280px] px-6 py-14 lg:px-8">
          <span className="rc-eyebrow mb-3 block">What you walk away with</span>
          <h2
            id="flagship-outcomes-heading"
            className="mb-8 max-w-2xl text-(--text-rc-3xl) font-bold leading-tight tracking-[-0.01em] text-(--color-rc-text)"
          >
            Five reps you can't get from skimming the paper.
          </h2>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Outcome
              title="Frame the degradation problem"
              body="State precisely why depth was failing, in a way that survives a reviewer asking 'are you sure it isn't X?'"
            />
            <Outcome
              title="Pick — and defend — a branch"
              body="Three plausible fixes are on the table. You commit before you see the expert feedback, then read why the others miss."
            />
            <Outcome
              title="Implement the block"
              body="Write the conv/BN/skip layout from scratch. The autograder enforces shape, parameter count, and gradient flow."
            />
            <Outcome
              title="Train and read the curves"
              body="Run a small CIFAR-10 study, compare against the plain baseline, and label what each crossover actually tells you."
            />
            <Outcome
              title="Write a claim that holds up"
              body="One paragraph, grounded in your own logs. The writing rubric is the one we'd want at a real review."
            />
            <Outcome
              title="Reflect on what almost fooled you"
              body="A short post-mortem stage on the failed branch — what it predicted, why it lost, and what it would have taken to save it."
            />
          </ul>
        </div>
      </section>

      {/* Stage roadmap — kept high level. The in-app /packages/resnet page
          owns the detailed stage list; this is just enough to set scope. */}
      <section
        aria-labelledby="flagship-roadmap-heading"
        className="border-b border-(--color-rc-border) bg-(--color-rc-bg)"
      >
        <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-6 py-14 md:grid-cols-12 lg:px-8">
          <div className="md:col-span-5">
            <span className="rc-eyebrow mb-3 block">The arc</span>
            <h2
              id="flagship-roadmap-heading"
              className="mb-4 text-(--text-rc-3xl) font-bold leading-tight tracking-[-0.01em] text-(--color-rc-text)"
            >
              Nine stages, roughly three hours.
            </h2>
            <p className="text-(--text-rc-md) leading-[1.6] text-(--color-rc-text-muted)">
              The first two stages are free. They cover framing and the math
              that motivates the fix — enough to know whether the package is
              for you before you unlock the rest.
            </p>
          </div>
          <ol
            className="md:col-span-7 flex flex-col"
            data-testid="flagship-stage-list"
          >
            {FLAGSHIP_STAGES.map((stage, idx) => (
              <li
                key={stage.title}
                className={
                  "flex items-baseline gap-4 py-3 text-(--text-rc-sm)" +
                  (idx > 0 ? " border-t border-(--color-rc-border)" : "")
                }
              >
                <span className="w-7 flex-none font-(--font-rc-mono) text-(--text-rc-xs) text-(--color-rc-text-subtle)">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-(--color-rc-text)">
                    {stage.title}
                  </div>
                  <div className="text-(--text-rc-xs) text-(--color-rc-text-muted)">
                    {stage.kind} · {stage.minutes} min
                    {stage.free ? " · free preview" : ""}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Final CTA — give the visitor one more chance to commit before the
          page ends. */}
      <section className="bg-(--color-rc-surface)">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-start gap-5 px-6 py-16 lg:px-8">
          <h2 className="max-w-2xl text-(--text-rc-3xl) font-bold leading-tight tracking-[-0.01em] text-(--color-rc-text)">
            Stop reading about ResNet. Rebuild it.
          </h2>
          <p className="max-w-2xl text-(--text-rc-md) leading-[1.6] text-(--color-rc-text-muted)">
            Stage 1 takes about 20 minutes and runs entirely in your editor.
            If it doesn't change how you read the paper, you owe us nothing.
          </p>
          <a
            href={FLAGSHIP_START_HREF}
            data-testid="flagship-cta-footer"
            className={
              "inline-flex items-center gap-1.5 rounded-(--radius-rc-md) " +
              "bg-(--color-rc-accent) px-4 py-2.5 text-(--text-rc-md) font-semibold " +
              "text-(--color-rc-accent-foreground) transition-colors duration-(--duration-rc-fast) " +
              "hover:bg-(--color-rc-accent-hover)"
            }
          >
            <span>Start the first stage free</span>
            <span aria-hidden>→</span>
          </a>
        </div>
      </section>
    </main>
  );
}

type Stage = {
  title: string;
  kind: "framing" | "math" | "decision" | "code" | "experiment" | "analysis" | "writing" | "review" | "reflection";
  minutes: number;
  free: boolean;
};

// Mirrors content/packages/resnet/curriculum/stages — kept inline (not
// loaded from the manifest) so the marketing page is static and survives
// content reshuffles without breaking. If the curriculum drifts, the QA
// report at qa/flagship-package-landing-page-2026-05-17.md flags it.
const FLAGSHIP_STAGES: ReadonlyArray<Stage> = [
  { title: "Why is going deeper not enough?", kind: "framing", minutes: 15, free: true },
  { title: "The math behind identity mapping", kind: "math", minutes: 20, free: true },
  { title: "Which fix do you attack first?", kind: "decision", minutes: 20, free: false },
  { title: "Implement the residual block", kind: "code", minutes: 30, free: false },
  { title: "Train on CIFAR-10, compare curves", kind: "experiment", minutes: 35, free: false },
  { title: "Read your own training curves", kind: "analysis", minutes: 20, free: false },
  { title: "Write the claim, grounded in your run", kind: "writing", minutes: 25, free: false },
  { title: "Peer review of a flawed write-up", kind: "review", minutes: 20, free: false },
  { title: "Reflect on what almost fooled you", kind: "reflection", minutes: 15, free: false },
];

function Outcome({ title, body }: { title: string; body: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-5">
      <h3 className="text-(--text-rc-md) font-semibold text-(--color-rc-text)">
        {title}
      </h3>
      <p className="text-(--text-rc-sm) leading-[1.6] text-(--color-rc-text-muted)">
        {body}
      </p>
    </li>
  );
}
