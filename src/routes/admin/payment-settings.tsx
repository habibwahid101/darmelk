import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CreditCard, Plus, Landmark, Smartphone } from "lucide-react";
import { EmptyState, LoadingState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, ApiError, type PaymentMethodSetting, type ReceivingAccount } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/payment-settings")({
  component: AdminPaymentSettings,
});

const CONTEXTS = [
  { id: "growth_activation" as const, title: "Growth Activation" },
  { id: "growth_booking" as const, title: "Growth Booking" },
];
const RAILS = [
  { id: "bank" as const, title: "Bank" },
  { id: "mfs" as const, title: "MFS" },
  { id: "merchant" as const, title: "Merchant" },
];
const MFS_PROVIDERS = ["bkash", "nagad"];
const MFS_TYPES = ["Personal", "Merchant", "Agent", "Other"];

type AccountDraft = {
  method: "bank" | "mfs";
  provider: string;
  label: string;
  accountNumber: string;
  accountHolderName: string;
  accountType: string;
  bankName: string;
  branch: string;
  routingNumber: string;
  instructions: string;
  enabled: boolean;
  displayOrder: string;
  contexts: Array<"growth_activation" | "growth_booking">;
};

const emptyDraft = (method: "bank" | "mfs"): AccountDraft => ({
  method,
  provider: method === "bank" ? "bank" : "bkash",
  label: "",
  accountNumber: "",
  accountHolderName: "",
  accountType: method === "mfs" ? "Merchant" : "",
  bankName: "",
  branch: "",
  routingNumber: "",
  instructions: "",
  enabled: true,
  displayOrder: "10",
  contexts: ["growth_activation", "growth_booking"],
});

function fromAccount(account: ReceivingAccount): AccountDraft {
  return {
    method: account.method,
    provider: account.provider,
    label: account.label,
    accountNumber: account.account_number,
    accountHolderName: account.account_holder_name,
    accountType: account.account_type,
    bankName: account.bank_name,
    branch: account.branch,
    routingNumber: account.routing_number,
    instructions: account.instructions,
    enabled: account.enabled,
    displayOrder: String(account.display_order),
    contexts: account.contexts,
  };
}

function AdminPaymentSettings() {
  const { data, loading, reload } = useAsync(() => api.admin.paymentSettings(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id?: string; method: "bank" | "mfs" } | null>(null);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft("mfs"));

  const settings = data?.settings ?? [];
  const accounts = data?.accounts ?? [];
  const live = accounts.filter((account) => !account.archived_at);
  const archived = accounts.filter((account) => account.archived_at);
  const mfs = live.filter((account) => account.method === "mfs");
  const banks = live.filter((account) => account.method === "bank");

  const settingMap = useMemo(() => {
    const map = new Map<string, PaymentMethodSetting>();
    for (const row of settings) map.set(`${row.context}:${row.method}`, row);
    return map;
  }, [settings]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      reload();
      setEditing(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save payment settings.");
    } finally {
      setBusy(null);
    }
  }

  function eligibleCount(context: "growth_activation" | "growth_booking", method: "bank" | "mfs") {
    return live.filter((account) => account.method === method && account.enabled && account.contexts.includes(context)).length;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Finance"
        title="Payment Settings"
        description="Control how Darmelk receives money for Growth Activation and property booking. Changes apply immediately. Historical payments keep the destination they were given."
      />
      {error ? <p className="text-sm text-clay" role="alert">{error}</p> : null}
      {loading && !data ? (
        <LoadingState label="Loading payment settings…" />
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold">Payment availability</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {CONTEXTS.map((context) => (
                <Surface key={context.id} className="space-y-4">
                  <h3 className="font-medium">{context.title}</h3>
                  <ul className="space-y-3">
                    {RAILS.map((rail) => {
                      const setting = settingMap.get(`${context.id}:${rail.id}`);
                      const enabled = Boolean(setting?.enabled);
                      const missing =
                        enabled && rail.id !== "merchant" && eligibleCount(context.id, rail.id) === 0;
                      const effective = data?.effective[context.id === "growth_activation" ? "activation" : "booking"]
                        ?.methods.find((method) => method.method === rail.id)?.available;
                      return (
                        <li key={rail.id} className="rounded-xl bg-paper px-4 py-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="font-medium">{rail.title}</p>
                              <p className="text-xs text-muted">
                                {effective ? "Available to members" : enabled ? "On, but no eligible account" : "Hidden from members"}
                              </p>
                            </div>
                            <button
                              type="button"
                              aria-pressed={enabled}
                              disabled={busy === `${context.id}:${rail.id}`}
                              onClick={() =>
                                void run(`${context.id}:${rail.id}`, () =>
                                  api.admin.setPaymentMethod(context.id, rail.id, !enabled),
                                )
                              }
                              className={
                                enabled
                                  ? "min-h-11 shrink-0 rounded-xl bg-pine px-4 text-sm font-medium text-pine-fg"
                                  : "min-h-11 shrink-0 rounded-xl bg-mist px-4 text-sm font-medium"
                              }
                            >
                              {enabled ? "ON" : "OFF"}
                            </button>
                          </div>
                          {missing ? (
                            <p className="mt-2 text-xs text-clay">
                              Add at least one enabled {rail.title} receiving account for this context.
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </Surface>
              ))}
            </div>
          </section>

          <AccountGroup
            title="MFS accounts"
            empty="No MFS receiving accounts yet."
            icon={Smartphone}
            accounts={mfs}
            busy={busy}
            onAdd={() => {
              setDraft(emptyDraft("mfs"));
              setEditing({ method: "mfs" });
            }}
            onEdit={(account) => {
              setDraft(fromAccount(account));
              setEditing({ id: account.id, method: "mfs" });
            }}
            onToggle={(account) =>
              void run(account.id, () => api.admin.updateReceivingAccount(account.id, { enabled: !account.enabled, contexts: account.contexts }))
            }
            onArchive={(account) => void run(account.id, () => api.admin.archiveReceivingAccount(account.id))}
            onDelete={(account) => void run(account.id, () => api.admin.deleteReceivingAccount(account.id))}
          />

          <AccountGroup
            title="Bank accounts"
            empty="No bank receiving accounts yet."
            icon={Landmark}
            accounts={banks}
            busy={busy}
            onAdd={() => {
              setDraft(emptyDraft("bank"));
              setEditing({ method: "bank" });
            }}
            onEdit={(account) => {
              setDraft(fromAccount(account));
              setEditing({ id: account.id, method: "bank" });
            }}
            onToggle={(account) =>
              void run(account.id, () => api.admin.updateReceivingAccount(account.id, { enabled: !account.enabled, contexts: account.contexts }))
            }
            onArchive={(account) => void run(account.id, () => api.admin.archiveReceivingAccount(account.id))}
            onDelete={(account) => void run(account.id, () => api.admin.deleteReceivingAccount(account.id))}
          />

          {editing ? (
            <AccountEditor
              draft={draft}
              setDraft={setDraft}
              existingId={editing.id}
              busy={Boolean(busy)}
              onCancel={() => setEditing(null)}
              onSave={() =>
                void run("save", () => {
                  const payload = {
                    method: draft.method,
                    provider: draft.provider,
                    label: draft.label,
                    accountNumber: draft.accountNumber,
                    accountHolderName: draft.accountHolderName,
                    accountType: draft.accountType,
                    bankName: draft.bankName,
                    branch: draft.branch,
                    routingNumber: draft.routingNumber,
                    instructions: draft.instructions,
                    enabled: draft.enabled,
                    displayOrder: Number(draft.displayOrder) || 0,
                    contexts: draft.contexts,
                  };
                  return editing.id
                    ? api.admin.updateReceivingAccount(editing.id, payload)
                    : api.admin.createReceivingAccount(payload);
                })
              }
            />
          ) : null}

          {archived.length ? (
            <Surface>
              <h2 className="font-display text-xl font-semibold">Archived accounts</h2>
              <p className="mt-1 text-sm text-muted">Kept for payment history. They are hidden from new submissions.</p>
              <ul className="mt-4 space-y-2 text-sm">
                {archived.map((account) => (
                  <li key={account.id} className="rounded-xl bg-paper px-4 py-3">
                    <p className="font-medium">{account.label}</p>
                    <p className="break-all text-muted">{account.account_number}</p>
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}
        </>
      )}
    </div>
  );
}

function AccountGroup({
  title,
  empty,
  icon: Icon,
  accounts,
  busy,
  onAdd,
  onEdit,
  onToggle,
  onArchive,
  onDelete,
}: {
  title: string;
  empty: string;
  icon: typeof CreditCard;
  accounts: ReceivingAccount[];
  busy: string | null;
  onAdd: () => void;
  onEdit: (account: ReceivingAccount) => void;
  onToggle: (account: ReceivingAccount) => void;
  onArchive: (account: ReceivingAccount) => void;
  onDelete: (account: ReceivingAccount) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <Button size="sm" onClick={onAdd}>
          <Plus className="size-4" aria-hidden="true" />
          Add {title.includes("Bank") ? "bank" : "MFS"} account
        </Button>
      </div>
      {accounts.length === 0 ? (
        <EmptyState icon={Icon} title={empty} description="Add a receiving account before turning this method on for members." />
      ) : (
        <ul className="grid gap-3">
          {accounts.map((account) => (
            <li key={account.id} className="rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{account.label}</p>
                  <p className="mt-1 text-sm text-muted">
                    {account.method === "mfs" ? account.provider : account.bank_name} · {account.enabled ? "Enabled" : "Disabled"}
                  </p>
                  <p className="mt-1 break-all text-sm font-semibold tabular-nums">{account.account_number}</p>
                  <p className="mt-2 text-xs text-muted">
                    Activation {account.contexts.includes("growth_activation") ? "✓" : "✗"} · Booking{" "}
                    {account.contexts.includes("growth_booking") ? "✓" : "✗"} · Order {account.display_order}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy === account.id} onClick={() => onEdit(account)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busy === account.id} onClick={() => onToggle(account)}>
                    {account.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busy === account.id} onClick={() => onArchive(account)}>
                    Archive
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === account.id} onClick={() => onDelete(account)}>
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountEditor({
  draft,
  setDraft,
  existingId,
  busy,
  onCancel,
  onSave,
}: {
  draft: AccountDraft;
  setDraft: (draft: AccountDraft) => void;
  existingId?: string;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  function toggleContext(context: "growth_activation" | "growth_booking") {
    const has = draft.contexts.includes(context);
    setDraft({
      ...draft,
      contexts: has ? draft.contexts.filter((item) => item !== context) : [...draft.contexts, context],
    });
  }
  return (
    <Surface>
      <h2 className="font-display text-xl font-semibold">
        {existingId ? "Edit receiving account" : `Add ${draft.method === "bank" ? "bank" : "MFS"} account`}
      </h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Label" htmlFor="rcv-label">
          <Input id="rcv-label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} maxLength={80} />
        </Field>
        {draft.method === "mfs" ? (
          <Field label="Provider" htmlFor="rcv-provider">
            <select
              id="rcv-provider"
              className="field-control"
              value={MFS_PROVIDERS.includes(draft.provider) ? draft.provider : "other"}
              onChange={(e) => {
                const value = e.target.value;
                setDraft({ ...draft, provider: value === "other" ? "" : value });
              }}
            >
              <option value="bkash">bKash</option>
              <option value="nagad">Nagad</option>
              <option value="other">Other</option>
            </select>
          </Field>
        ) : (
          <Field label="Bank name" htmlFor="rcv-bank">
            <Input id="rcv-bank" value={draft.bankName} onChange={(e) => setDraft({ ...draft, bankName: e.target.value })} maxLength={80} />
          </Field>
        )}
        {draft.method === "mfs" && !MFS_PROVIDERS.includes(draft.provider) ? (
          <Field label="Custom provider" hint="Lowercase slug, for example rocket" htmlFor="rcv-provider-custom">
            <Input
              id="rcv-provider-custom"
              value={draft.provider}
              onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
              maxLength={32}
            />
          </Field>
        ) : null}
        <Field label="Account number" htmlFor="rcv-number">
          <Input id="rcv-number" value={draft.accountNumber} onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })} maxLength={80} />
        </Field>
        <Field label={draft.method === "bank" ? "Account title" : "Account holder"} htmlFor="rcv-holder">
          <Input id="rcv-holder" value={draft.accountHolderName} onChange={(e) => setDraft({ ...draft, accountHolderName: e.target.value })} maxLength={80} />
        </Field>
        {draft.method === "mfs" ? (
          <Field label="Account type" htmlFor="rcv-type">
            <select
              id="rcv-type"
              className="field-control"
              value={draft.accountType}
              onChange={(e) => setDraft({ ...draft, accountType: e.target.value })}
            >
              {MFS_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Branch" htmlFor="rcv-branch">
            <Input id="rcv-branch" value={draft.branch} onChange={(e) => setDraft({ ...draft, branch: e.target.value })} maxLength={80} />
          </Field>
        )}
        {draft.method === "bank" ? (
          <Field label="Routing number" hint="Optional" htmlFor="rcv-routing">
            <Input id="rcv-routing" value={draft.routingNumber} onChange={(e) => setDraft({ ...draft, routingNumber: e.target.value })} maxLength={40} />
          </Field>
        ) : null}
        <Field label="Display order" htmlFor="rcv-order">
          <Input id="rcv-order" inputMode="numeric" value={draft.displayOrder} onChange={(e) => setDraft({ ...draft, displayOrder: e.target.value })} />
        </Field>
        <Field label="Instructions" hint="Shown to the member at payment time" htmlFor="rcv-instructions" className="sm:col-span-2">
          <textarea
            id="rcv-instructions"
            className="min-h-24 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-pine"
            value={draft.instructions}
            onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
            maxLength={1000}
          />
        </Field>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <label className="flex min-h-11 items-center gap-2 rounded-xl bg-paper px-4 text-sm">
          <input
            type="checkbox"
            checked={draft.contexts.includes("growth_activation")}
            onChange={() => toggleContext("growth_activation")}
          />
          Activation
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-xl bg-paper px-4 text-sm">
          <input
            type="checkbox"
            checked={draft.contexts.includes("growth_booking")}
            onChange={() => toggleContext("growth_booking")}
          />
          Booking
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-xl bg-paper px-4 text-sm">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
          Enabled
        </label>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button disabled={busy} onClick={onSave}>{busy ? "Saving…" : existingId ? "Save account" : "Add account"}</Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </Surface>
  );
}
