/**
 * Components barrel for @researchcrafters/ui.
 * Each export is documented at its source — see individual component files
 * for behavior contracts and anti-pattern guidance.
 */

export { Button } from "./Button.js";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button.js";

export { StatusBadge } from "./StatusBadge.js";
export type { StatusBadgeProps } from "./StatusBadge.js";

export { CommandBlock } from "./CommandBlock.js";
export type {
  CommandBlockProps,
  CommandBlockOutput,
} from "./CommandBlock.js";

export { CodeBlock } from "./CodeBlock.js";
export type { CodeBlockProps } from "./CodeBlock.js";

export { EvidenceCard } from "./EvidenceCard.js";
export type {
  EvidenceCardKind,
  EvidenceCardProps,
  EvidenceCardData,
  EvidenceTrajectory,
} from "./EvidenceCard.js";

export { Card, CardHeader, CardBody, CardFooter } from "./Card.js";
export type {
  CardProps,
  CardHeaderProps,
  CardBodyProps,
  CardFooterProps,
} from "./Card.js";

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "./Tabs.js";
export type {
  TabsListProps,
  TabsTriggerProps,
  TabsContentProps,
} from "./Tabs.js";

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
} from "./Dialog.js";
export type { DialogContentProps } from "./Dialog.js";

export {
  Tooltip,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from "./Tooltip.js";
export type { TooltipProps, TooltipContentProps } from "./Tooltip.js";

export { PaywallModal } from "./PaywallModal.js";
export type {
  PaywallModalProps,
  PaywallEntryPoint,
} from "./PaywallModal.js";

export { MentorPanel, MentorPanelIcons } from "./MentorPanel.js";
export type { MentorPanelProps, MentorMode } from "./MentorPanel.js";

export { StagePlayer } from "./StagePlayer.js";
export type { StagePlayerProps } from "./StagePlayer.js";

export { StageMap } from "./StageMap.js";
export type {
  StageMapProps,
  StageMapItem,
  StageMapItemStatus,
} from "./StageMap.js";

export { DecisionGraphMobile } from "./DecisionGraphMobile.js";
export type {
  DecisionGraphMobileProps,
  DecisionGraphNode,
  DecisionGraphNodeStatus,
  DecisionGraphBranch,
} from "./DecisionGraphMobile.js";

export { GradePanel } from "./GradePanel.js";
export type {
  GradePanelProps,
  GradeRubricDimension,
  GradeEvidenceRef,
} from "./GradePanel.js";

export { RunStatusPanel } from "./RunStatusPanel.js";
export type {
  RunStatusPanelProps,
  RunLogLine,
  LogSeverity,
  RunExecutionStatus,
} from "./RunStatusPanel.js";

export { EvidencePanel } from "./EvidencePanel.js";
export type {
  EvidencePanelProps,
  EvidenceItem,
  EvidenceKind,
} from "./EvidencePanel.js";

export { RubricPanel } from "./RubricPanel.js";
export type { RubricPanelProps, RubricDimension } from "./RubricPanel.js";

export { AnswerEditor, sanitizePastedText } from "./AnswerEditor.js";
export type { AnswerEditorProps } from "./AnswerEditor.js";

export { DecisionChoiceList } from "./DecisionChoiceList.js";
export type {
  DecisionChoiceListProps,
  DecisionChoice,
} from "./DecisionChoiceList.js";

export { PackageCard } from "./PackageCard.js";
export type { PackageCardProps, PackageCardState } from "./PackageCard.js";

export { ArtifactRef } from "./ArtifactRef.js";
export type { ArtifactRefProps } from "./ArtifactRef.js";

export { MetricTable } from "./MetricTable.js";
export type { MetricTableProps, MetricTableColumn } from "./MetricTable.js";

export { ShareCardPreview } from "./ShareCardPreview.js";
export type {
  ShareCardPreviewProps,
  ShareBranchKind,
} from "./ShareCardPreview.js";

export { AppShell, TopNav, CatalogFilters, EmptyState } from "./Layout.js";
export type {
  AppShellProps,
  TopNavProps,
  TopNavLink,
  CatalogFiltersProps,
  EmptyStateProps,
} from "./Layout.js";

export { PackageOverview } from "./PackageOverview.js";
export type {
  PackageOverviewProps,
  PackageOverviewStage,
} from "./PackageOverview.js";

export { ErrorPanel } from "./ErrorPanel.js";
export type { ErrorPanelProps, ErrorPanelKind } from "./ErrorPanel.js";
