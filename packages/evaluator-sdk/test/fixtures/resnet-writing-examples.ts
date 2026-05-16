export const RESNET_ALLOWED_EVIDENCE = [
  'artifact/evidence/tables/training-curves.md#plain-vs-residual',
] as const;

export const RESNET_FORBIDDEN_CLAIMS = [
  'always',
  'solves vanishing gradients',
  'state of the art',
] as const;

export const RESNET_WRITING_EXAMPLES = {
  strong: {
    id: 'strong',
    text:
      'Residual learning makes the identity mapping easy to recover by adding a shortcut path, and the CIFAR-10 curves show the residual 56-layer model reduces training error where the plain 56-layer model degrades [artifact/evidence/tables/training-curves.md#plain-vs-residual]. The evidence supports this scoped optimization claim, not a universal claim about every depth or dataset.',
  },
  weak: {
    id: 'weak',
    text:
      'Residual learning helps deeper models train better [artifact/evidence/tables/training-curves.md#plain-vs-residual].',
  },
  overclaiming: {
    id: 'overclaiming',
    text:
      'Residual learning solves vanishing gradients and always makes deeper networks state of the art [artifact/evidence/tables/training-curves.md#plain-vs-residual].',
  },
  citationMissing: {
    id: 'citation-missing',
    text:
      'Residual learning makes identity mappings easier to optimize, so the residual 56-layer model avoids the degradation seen in plain stacks.',
  },
} as const;
