import type { IngestBundleListItem } from "@opspilot/shared-types";
import { Badge } from "../../../components/ui/badge";
import { cn } from "../../../lib/utils";
import { deriveIngestListPipeline, type ListPipelineChipState } from "../lib/ingest-list-pipeline";

const chipVariant: Record<ListPipelineChipState, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  done: "success",
  active: "warning",
  error: "destructive",
  skipped: "secondary",
  upcoming: "secondary",
};

const chipClass: Record<ListPipelineChipState, string> = {
  done: "",
  active: "",
  error: "",
  skipped: "opacity-60",
  upcoming: "opacity-40",
};

export function IngestPipelineMiniBadges({
  item,
}: {
  item: Pick<
    IngestBundleListItem,
    | "status"
    | "evalRunId"
    | "reviewRunId"
    | "draftProposalCount"
    | "approvedProposalCount"
    | "appliedProposalCount"
  >;
}) {
  const chips = deriveIngestListPipeline(item);

  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {chips.map((chip) => (
        <Badge
          key={chip.id}
          variant={chipVariant[chip.state]}
          className={cn("px-1.5 py-0 font-normal text-[10px]", chipClass[chip.state])}
        >
          {chip.label}
        </Badge>
      ))}
    </div>
  );
}
