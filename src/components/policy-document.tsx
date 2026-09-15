import { Link } from "@tanstack/react-router";
import { api, type PolicyDocument } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export function PolicyDocumentPage({ slug }: { slug: string }) {
  const { data, error } = useAsync(() => api.termsDocument(slug), [slug]);
  const document = data?.document;
  if (error) {
    return (
      <main className="container-pg py-28 md:py-32">
        <article className="mx-auto max-w-3xl">
          <h1 className="font-display text-4xl font-semibold">Document not found</h1>
          <p className="mt-4 text-sm text-muted">That terms document is not published.</p>
        </article>
      </main>
    );
  }
  if (!document) {
    return (
      <main className="container-pg py-28 md:py-32">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }
  return <PolicyArticle document={document} />;
}

export function PolicyArticle({ document }: { document: PolicyDocument }) {
  return (
    <main className="container-pg py-28 md:py-32">
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[.18em] text-pine">Terms</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-pretty">{document.title}</h1>
        <p className="mt-3 text-sm text-muted">
          Version {document.version} · Effective {document.effectiveDate}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted text-pretty">{document.summary}</p>
        <div className="mt-8 space-y-5 text-sm leading-relaxed text-muted">
          {document.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted">
          Related:{" "}
          <Link to="/program-rules" className="font-medium text-pine hover:underline">
            Program Rules
          </Link>
        </p>
      </article>
    </main>
  );
}
