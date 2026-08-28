import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/states";

export const Route = createFileRoute("/app/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Documents"
        title="Property & account documents"
        description="Only issued records appear here. We do not invent contracts, receipts, or legal files."
      />
      <EmptyState
        icon={FileText}
        title="No documents"
        description="Booking confirmations and receipts will appear here when they are issued for a confirmed booking."
      />
    </div>
  );
}
