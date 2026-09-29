import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LoadingState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, ApiError, type PolicyRevision } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/terms")({
  component: AdminBookingTerms,
});

type DraftForm = {
  id: string | null;
  version: string;
  title: string;
  effectiveDate: string;
  summary: string;
  body: string;
  locked: boolean;
};

const emptyForm = (): DraftForm => ({
  id: null,
  version: "",
  title: "",
  effectiveDate: "",
  summary: "",
  body: "",
  locked: false,
});

function stamp(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace("T", " ").replace(/\.\d+Z$/, " UTC").replace(/Z$/, " UTC");
}

function fromRevision(row: PolicyRevision, locked: boolean): DraftForm {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    effectiveDate: row.effective_date.slice(0, 10),
    summary: row.summary,
    body: row.body,
    locked,
  };
}

function AdminBookingTerms() {
  const { data, loading, error, reload } = useAsync(() => api.admin.bookingTerms(), []);
  const [form, setForm] = useState<DraftForm>(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function set<K extends keyof DraftForm>(key: K, value: DraftForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveDraft() {
    if (form.locked) return;
    setBusy("save");
    setFormError(null);
    setMessage(null);
    const payload = {
      version: form.version,
      title: form.title,
      effectiveDate: form.effectiveDate,
      summary: form.summary,
      body: form.body,
    };
    try {
      const { revision } = form.id
        ? await api.admin.updateBookingTermsDraft(form.id, payload)
        : await api.admin.createBookingTermsDraft(payload);
      setForm(fromRevision(revision, false));
      setMessage("Draft saved. The published terms are unchanged until you publish.");
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save this draft.");
    } finally {
      setBusy(null);
    }
  }

  async function publishDraft() {
    if (!form.id || form.locked) return;
    setBusy("publish");
    setFormError(null);
    setMessage(null);
    try {
      const { revision } = await api.admin.publishBookingTermsDraft(form.id);
      setForm(fromRevision(revision, true));
      setMessage("Published. This version is now the current Property Booking Terms. Older published versions were kept.");
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not publish this draft.");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <LoadingState label="Loading booking terms…" />;
  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="Terms" title="Booking Terms" description="Property Booking Terms could not be loaded." />
        <p className="text-sm text-clay" role="alert">{error?.message ?? "Could not load booking terms."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Terms"
        title="Booking Terms"
        description="Manage Property Booking Terms for /terms?key=booking. Drafts stay private. The current published version stays in place until you publish."
      />

      <Surface>
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">Current published</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">{data.current.title}</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Terms key</dt>
            <dd className="font-medium">{data.key}</dd>
          </div>
          <div>
            <dt className="text-muted">Public key</dt>
            <dd className="font-medium">{data.slug}</dd>
          </div>
          <div>
            <dt className="text-muted">Version</dt>
            <dd className="font-medium">{data.current.version}</dd>
          </div>
          <div>
            <dt className="text-muted">Effective</dt>
            <dd className="font-medium">{data.current.effectiveDate}</dd>
          </div>
          <div>
            <dt className="text-muted">Status</dt>
            <dd className="font-medium">Published</dd>
          </div>
          <div>
            <dt className="text-muted">Source</dt>
            <dd className="font-medium">{data.current.source === "database" ? "Published revision" : "Application code"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted">
          Public page: <a className="font-medium text-pine hover:underline" href={data.publicPath}>{data.publicPath}</a>
        </p>
        {data.current.summary ? <p className="mt-4 text-sm text-muted">{data.current.summary}</p> : null}
        <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted">{data.current.body}</pre>
        <div className="mt-5">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setForm({
                id: null,
                version: "",
                title: data.current.title,
                effectiveDate: data.current.effectiveDate,
                summary: data.current.summary,
                body: data.current.body,
                locked: false,
              });
              setMessage(null);
              setFormError(null);
            }}
          >
            Start a draft from the current text
          </Button>
        </div>
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Version history</h2>
        <p className="mt-2 text-sm text-muted">Published versions are read-only. Nothing here deletes a published version.</p>
        {data.revisions.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No admin revisions yet. The current terms remain the published application copy.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="py-2 pr-3 font-medium">Version</th>
                  <th className="py-2 pr-3 font-medium">Effective</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Created</th>
                  <th className="py-2 pr-3 font-medium">Published</th>
                  <th className="py-2 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {data.revisions.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="py-3 pr-3 font-medium">
                      {row.version}
                      {row.current ? <span className="ml-2 text-xs font-medium text-pine">Current</span> : null}
                    </td>
                    <td className="py-3 pr-3">{row.effective_date}</td>
                    <td className="py-3 pr-3 capitalize">{row.status}</td>
                    <td className="py-3 pr-3">{stamp(row.created_at)}</td>
                    <td className="py-3 pr-3">{stamp(row.published_at)}</td>
                    <td className="py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setForm(fromRevision(row, row.status !== "draft"));
                          setMessage(null);
                          setFormError(null);
                        }}
                      >
                        {row.status === "draft" ? "Edit draft" : "View"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">{form.locked ? "Published version" : form.id ? "Edit draft" : "New draft"}</h2>
        <p className="mt-2 text-sm text-muted">
          Separate paragraphs with a blank line. A paragraph that is only “# Heading” renders as a heading. Saving a draft does not replace the published terms.
        </p>
        <div className="mt-5 grid gap-4">
          <Field label="Terms key">
            <Input value={data.key} readOnly />
          </Field>
          <Field label="Title" htmlFor="booking-terms-title">
            <Input id="booking-terms-title" value={form.title} disabled={form.locked} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Version" hint="Leave this blank until you choose the version to publish. The current version is not changed here." htmlFor="booking-terms-version">
              <Input id="booking-terms-version" value={form.version} disabled={form.locked} onChange={(e) => set("version", e.target.value)} />
            </Field>
            <Field label="Effective date" htmlFor="booking-terms-effective">
              <Input id="booking-terms-effective" type="date" value={form.effectiveDate} disabled={form.locked} onChange={(e) => set("effectiveDate", e.target.value)} />
            </Field>
          </div>
          <Field label="Summary" htmlFor="booking-terms-summary">
            <textarea
              id="booking-terms-summary"
              className="field-control min-h-20 py-2"
              value={form.summary}
              disabled={form.locked}
              onChange={(e) => set("summary", e.target.value)}
            />
          </Field>
          <Field label="Terms content" htmlFor="booking-terms-body">
            <textarea
              id="booking-terms-body"
              className="field-control min-h-64 py-2"
              value={form.body}
              disabled={form.locked}
              onChange={(e) => set("body", e.target.value)}
            />
          </Field>
        </div>
        {form.locked ? <p className="mt-4 text-sm text-muted">Published versions are read-only.</p> : null}
        {formError ? <p className="mt-4 text-sm text-clay" role="alert">{formError}</p> : null}
        {message ? <p className="mt-4 text-sm text-pine" role="status">{message}</p> : null}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {form.locked ? null : (
            <Button type="button" onClick={() => void saveDraft()} disabled={busy !== null}>
              {busy === "save" ? "Saving…" : form.id ? "Save draft" : "Create draft"}
            </Button>
          )}
          {form.id && !form.locked ? (
            <Button type="button" variant="secondary" onClick={() => void publishDraft()} disabled={busy !== null}>
              {busy === "publish" ? "Publishing…" : "Publish"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setForm(emptyForm());
              setMessage(null);
              setFormError(null);
            }}
          >
            New draft
          </Button>
        </div>
      </Surface>
    </div>
  );
}
