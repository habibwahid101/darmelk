import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/states";

export const Route = createFileRoute("/admin/documents")({
  component: AdminDocuments,
});

function AdminDocuments() {
  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Records"
        title="Documents"
        description="Only issued files would appear here. Nothing is generated as placeholder legal paperwork."
      />
      <EmptyState
        icon={FileText}
        title="No documents issued"
        description="When booking or account documents are issued, operators will see them in this list."
      />
    </div>
  );
}
