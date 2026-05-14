'use client';

import * as React from 'react';
import { AnswerEditor, Button } from '@researchcrafters/ui/components';

type StageStatus = 'completed' | 'current' | 'available' | 'locked';
type QuestionId = 'surprising' | 'overfitting' | 'degradation';

interface StageChallenge {
  id: string;
  ref: string;
  title: string;
  kind: string;
  minutes: number;
  status: StageStatus;
}

interface QuestionBlock {
  id: QuestionId;
  index: number;
  title: string;
  prompt: string;
  starter: string;
  target: string;
  rubricCue: string;
}

const STAGES: ReadonlyArray<StageChallenge> = [
  {
    id: 'S001',
    ref: 'S001',
    title: 'Why is going deeper not enough?',
    kind: 'Framing',
    minutes: 10,
    status: 'current',
  },
  {
    id: 'S001M',
    ref: 'S001M',
    title: 'The math behind identity mapping.',
    kind: 'Math',
    minutes: 12,
    status: 'available',
  },
  {
    id: 'S002',
    ref: 'S002',
    title: 'Which fix do you attack first?',
    kind: 'Decision',
    minutes: 8,
    status: 'available',
  },
  {
    id: 'S003',
    ref: 'S003',
    title: 'Implement a residual block.',
    kind: 'Code',
    minutes: 35,
    status: 'locked',
  },
  {
    id: 'S004',
    ref: 'S004',
    title: 'Replay a CIFAR-10 mini training run.',
    kind: 'Experiment',
    minutes: 25,
    status: 'locked',
  },
];

const QUESTIONS: ReadonlyArray<QuestionBlock> = [
  {
    id: 'surprising',
    index: 1,
    title: 'Naive intuition',
    prompt:
      'Why is this result surprising? Name the intuition that says a deeper model should not train worse.',
    starter: 'This is surprising because a deeper network should be able to',
    target: '1-2 sentences',
    rubricCue: 'Contradicts the simple capacity story.',
  },
  {
    id: 'overfitting',
    index: 2,
    title: 'Not overfitting',
    prompt: 'Why is "the deeper network is overfitting" not a sufficient explanation here?',
    starter: 'Overfitting is not enough here because the measured error is',
    target: '1-2 sentences',
    rubricCue: 'Uses training error to separate optimization from generalization.',
  },
  {
    id: 'degradation',
    index: 3,
    title: 'Degradation statement',
    prompt: 'State the failure mode in one sentence using the term "degradation".',
    starter: 'The degradation problem is that',
    target: '1 sentence',
    rubricCue: 'Names degradation without turning it into a capacity claim.',
  },
];

const INITIAL_ANSWERS: Record<QuestionId, string> = {
  surprising: '',
  overfitting:
    'Overfitting is not enough here because the deeper model has worse training error, not just worse test error.',
  degradation: '',
};

const STATUS_STYLE: Record<StageStatus, string> = {
  completed: 'bg-(--color-rc-icon-accent)',
  current: 'bg-(--color-rc-accent)',
  available: 'bg-(--color-rc-info)',
  locked: 'bg-(--color-rc-locked)',
};

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

function labelForStatus(status: StageStatus): string {
  if (status === 'completed') return 'done';
  if (status === 'current') return 'current';
  if (status === 'available') return 'open';
  return 'locked';
}

export function Mock(): React.ReactElement {
  const [activeStageId, setActiveStageId] = React.useState('S001');
  const [answers, setAnswers] = React.useState<Record<QuestionId, string>>(INITIAL_ANSWERS);

  const activeStage = STAGES.find((stage) => stage.id === activeStageId) ?? STAGES[0]!;
  const isQuestionStage = activeStage.id === 'S001';
  const answeredCount = QUESTIONS.filter(
    (question) => answers[question.id].trim().length > 0,
  ).length;
  const assembledAnswer = QUESTIONS.map((question) => answers[question.id].trim())
    .filter(Boolean)
    .join('\n\n');
  const totalWords = countWords(assembledAnswer);
  const budgetTone =
    totalWords < 60
      ? 'text-(--color-rc-warning)'
      : totalWords > 220
        ? 'text-(--color-rc-danger)'
        : 'text-(--color-rc-icon-accent)';
  const budgetWidth = Math.min(100, Math.round((totalWords / 220) * 100));

  const updateAnswer = (id: QuestionId, next: string) => {
    setAnswers((current) => ({ ...current, [id]: next }));
  };

  const useStarter = (question: QuestionBlock) => {
    setAnswers((current) => {
      const currentValue = current[question.id].trim();
      if (currentValue.includes(question.starter)) return current;
      const next = currentValue ? `${currentValue}\n${question.starter}` : question.starter;
      return { ...current, [question.id]: next };
    });
  };

  return (
    <div className="grid min-h-[720px] overflow-hidden rounded-(--radius-rc-lg) border border-(--color-rc-border) bg-(--color-rc-bg) text-(--color-rc-text) lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_260px]">
      <aside className="border-b border-(--color-rc-border) bg-(--color-rc-surface) lg:border-b-0 lg:border-r">
        <div className="border-b border-(--color-rc-border) px-4 py-3">
          <p className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase text-(--color-rc-text-subtle)">
            Stage challenges
          </p>
          <h2 className="mt-1 text-(--text-rc-md) font-semibold leading-snug">ResNet path</h2>
        </div>
        <ol className="flex flex-col">
          {STAGES.map((stage) => {
            const selected = stage.id === activeStage.id;
            const locked = stage.status === 'locked';
            return (
              <li key={stage.id}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => setActiveStageId(stage.id)}
                  className={cx(
                    'flex w-full gap-3 border-l-2 px-4 py-3 text-left transition-colors',
                    selected
                      ? 'border-(--color-rc-accent) bg-(--color-rc-accent-subtle)'
                      : 'border-transparent hover:bg-(--color-rc-surface-muted)',
                    locked && 'cursor-not-allowed opacity-60 hover:bg-transparent',
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'mt-1 size-2.5 shrink-0 rounded-full',
                      STATUS_STYLE[stage.status],
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-(--font-rc-mono) text-(--text-rc-xs) text-(--color-rc-text-subtle)">
                        {stage.ref}
                      </span>
                      <span className="text-(--text-rc-xs) text-(--color-rc-text-subtle)">
                        {labelForStatus(stage.status)}
                      </span>
                    </span>
                    <span className="mt-1 block text-(--text-rc-sm) font-medium leading-snug">
                      {stage.title}
                    </span>
                    <span className="mt-1 block text-(--text-rc-xs) text-(--color-rc-text-muted)">
                      {stage.kind} · {stage.minutes} min
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      <main className="min-w-0 bg-(--color-rc-bg)">
        <div className="border-b border-(--color-rc-border) px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase text-(--color-rc-text-subtle)">
                {activeStage.kind} · {activeStage.minutes} min
              </p>
              <h1 className="mt-1 text-(--text-rc-xl) font-semibold leading-tight">
                {activeStage.title}
              </h1>
            </div>
            <div className="rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-surface) px-3 py-2 text-(--text-rc-sm)">
              {isQuestionStage ? (
                <>
                  <span className="font-medium">{answeredCount}</span> / {QUESTIONS.length} sections
                </>
              ) : (
                <span className="font-medium">{labelForStatus(activeStage.status)}</span>
              )}
            </div>
          </div>
        </div>

        {isQuestionStage ? (
          <div className="flex flex-col">
            <section className="border-b border-(--color-rc-border) px-5 py-4">
              <p className="max-w-3xl text-(--text-rc-sm) leading-[1.6] text-(--color-rc-text-muted)">
                A 20-layer and a 56-layer plain CNN use the same optimizer, data augmentation, and
                BatchNorm. The deeper model has higher training error after both runs stop
                improving.
              </p>
            </section>

            <div className="flex flex-col divide-y divide-(--color-rc-border)">
              {QUESTIONS.map((question) => {
                const hasAnswer = answers[question.id].trim().length > 0;
                return (
                  <section key={question.id} className="px-5 py-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase text-(--color-rc-text-subtle)">
                          Question {question.index} · {question.target}
                        </p>
                        <h3 className="mt-1 text-(--text-rc-lg) font-semibold">{question.title}</h3>
                        <p className="mt-1 max-w-2xl text-(--text-rc-sm) leading-[1.55] text-(--color-rc-text-muted)">
                          {question.prompt}
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => useStarter(question)}>
                        Use starter
                      </Button>
                    </div>
                    <AnswerEditor
                      value={answers[question.id]}
                      onChange={(next) => updateAnswer(question.id, next)}
                      rows={3}
                      ariaLabel={`${question.title} answer`}
                      placeholder={question.starter}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-(--text-rc-xs)">
                      <span
                        className={cx(
                          'rounded-(--radius-rc-sm) px-2 py-1',
                          hasAnswer
                            ? 'bg-(--color-rc-icon-accent-soft) text-(--color-rc-icon-accent)'
                            : 'bg-(--color-rc-surface-muted) text-(--color-rc-text-muted)',
                        )}
                      >
                        {hasAnswer ? 'started' : 'empty'}
                      </span>
                      <span className="text-(--color-rc-text-muted)">{question.rubricCue}</span>
                    </div>
                  </section>
                );
              })}
            </div>

            <section className="border-t border-(--color-rc-border) bg-(--color-rc-surface) px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase text-(--color-rc-text-subtle)">
                    Assembled answer
                  </p>
                  <p className={cx('mt-1 text-(--text-rc-sm)', budgetTone)}>
                    {totalWords} words · target 60-220
                  </p>
                </div>
                <Button disabled={answeredCount < QUESTIONS.length}>Submit answer</Button>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-(--radius-rc-sm) bg-(--color-rc-surface-muted)">
                <div
                  aria-hidden
                  className="h-full bg-(--color-rc-accent)"
                  style={{ width: `${budgetWidth}%` }}
                />
              </div>
              <div className="mt-3 min-h-24 whitespace-pre-wrap rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-3 text-(--text-rc-sm) leading-[1.6] text-(--color-rc-text-muted)">
                {assembledAnswer || 'Your sections will combine here.'}
              </div>
            </section>
          </div>
        ) : (
          <div className="flex min-h-[520px] flex-col justify-between px-5 py-5">
            <div className="max-w-2xl">
              <p className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase text-(--color-rc-text-subtle)">
                {activeStage.ref}
              </p>
              <h2 className="mt-2 text-(--text-rc-xl) font-semibold">{activeStage.title}</h2>
              <p className="mt-3 text-(--text-rc-sm) leading-[1.6] text-(--color-rc-text-muted)">
                Identity shortcuts should preserve the shallow model as a reachable solution while
                adding depth for later refinement.
              </p>
            </div>
            <Button className="self-start">Open challenge</Button>
          </div>
        )}
      </main>

      <aside className="border-t border-(--color-rc-border) bg-(--color-rc-surface) lg:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0">
        <div className="border-b border-(--color-rc-border) px-4 py-3">
          <p className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase text-(--color-rc-text-subtle)">
            {isQuestionStage ? 'Draft checks' : 'Challenge'}
          </p>
        </div>
        {isQuestionStage ? (
          <div className="flex flex-col divide-y divide-(--color-rc-border)">
            {QUESTIONS.map((question) => {
              const done = answers[question.id].trim().length > 0;
              return (
                <div key={question.id} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className={cx(
                        'mt-1 size-2.5 rounded-full',
                        done ? 'bg-(--color-rc-icon-accent)' : 'bg-(--color-rc-border-strong)',
                      )}
                    />
                    <div>
                      <p className="text-(--text-rc-sm) font-medium">{question.title}</p>
                      <p className="mt-1 text-(--text-rc-xs) leading-snug text-(--color-rc-text-muted)">
                        {question.rubricCue}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="px-4 py-3">
              <p className="text-(--text-rc-sm) font-medium">Sentence shape</p>
              <p className="mt-1 text-(--text-rc-xs) leading-snug text-(--color-rc-text-muted)">
                Aim for 4-8 sentences after the three sections are assembled.
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-(--text-rc-sm) font-medium">Mentor</p>
              <p className="mt-1 text-(--text-rc-xs) leading-snug text-(--color-rc-text-muted)">
                Available after the learner has started at least one section.
              </p>
              <Button
                className="mt-3 w-full"
                size="sm"
                variant="secondary"
                disabled={answeredCount === 0}
              >
                Review draft
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-(--color-rc-border)">
            <div className="px-4 py-3">
              <p className="text-(--text-rc-sm) font-medium">{activeStage.kind}</p>
              <p className="mt-1 text-(--text-rc-xs) leading-snug text-(--color-rc-text-muted)">
                Estimated time: {activeStage.minutes} min
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-(--text-rc-sm) font-medium">Path status</p>
              <p className="mt-1 text-(--text-rc-xs) leading-snug text-(--color-rc-text-muted)">
                {labelForStatus(activeStage.status)}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-(--text-rc-sm) font-medium">Next action</p>
              <Button className="mt-3 w-full" size="sm" variant="secondary">
                Open challenge
              </Button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
