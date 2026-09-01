import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { signOut } from "@/lib/auth/client";
import { formatWhen } from "@/lib/platform";
import { api, ApiError, type PayoutMethod } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { user, member } = useMemberSession();
  const navigate = useNavigate();
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { data: payoutData, reload: reloadPayouts } = useAsync(() => api.payoutMethods(), [member?.user_id], { enabled: Boolean(member) });

  if (!member) return null;

  async function out() {
    setSigningOut(true);
    try {
      await signOut();
      await navigate({ to: "/" });
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        kicker="Account"
        title="Profile & settings"
        description="Keep this record accurate. Sponsor assignment is not edited here."
      />

      <Surface>
        <div className="space-y-4">
          <Field label="Full name">
            <Input value={user?.displayName ?? ""} disabled readOnly />
          </Field>
          <Field label="Email" hint="Managed by sign-in. Not editable here.">
            <Input value={user?.primaryEmail ?? ""} disabled readOnly />
          </Field>
          <Field label="Phone" hint="Set during onboarding.">
            <Input value={member.phone} disabled readOnly />
          </Field>
        </div>
      </Surface>

      <PayoutCredentials methods={payoutData?.methods ?? []} onSaved={reloadPayouts} />

      <Surface>
        <h2 className="font-display text-xl font-semibold">Membership</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Referral code" value={member.referral_code} />
          <Row label="Sponsor" value={member.sponsor_user_id ? "Assigned" : "None"} />
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">Activation</dt>
            <dd>
              <StatusBadge status={member.activation_status} />
            </dd>
          </div>
          <Row label="Member since" value={formatWhen(member.created_at)} />
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">Role</dt>
            <dd>
              <StatusBadge status={member.role} />
            </dd>
          </div>
        </dl>
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Sign out</h2>
        <p className="mt-2 text-sm text-muted">Ends this session on this device.</p>
        {confirmOut ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void out()} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Confirm sign out"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmOut(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="secondary" className="mt-4" onClick={() => setConfirmOut(true)}>
            Sign out
          </Button>
        )}
      </Surface>
    </div>
  );
}

function PayoutCredentials({ methods, onSaved }: { methods: PayoutMethod[]; onSaved: () => void }) {
  const [type, setType] = useState<PayoutMethod["method_type"]>("bkash");
  const saved = methods.find((m)=>m.method_type===type);
  const [details, setDetails] = useState<Record<string,string>>({});
  const [pending,setPending]=useState(false); const [message,setMessage]=useState<string|null>(null);
  const value=(key:string)=>details[key] ?? saved?.details[key] ?? "";
  const set=(key:string,v:string)=>setDetails((d)=>({...d,[key]:v}));
  async function submit(e:React.FormEvent){e.preventDefault();setPending(true);setMessage(null);try{await api.savePayoutMethod(type,{ accountName:value("accountName"),accountNumber:value("accountNumber"),...(type==="bank"?{bankName:value("bankName"),branch:value("branch"),routingNumber:value("routingNumber")}:{})});setDetails({});setMessage("Saved.");onSaved();}catch(err){setMessage(err instanceof ApiError?err.message:"Could not save payout method.");}finally{setPending(false)}}
  return <Surface><h2 className="font-display text-xl font-semibold">Saved payout methods</h2><p className="mt-2 text-sm text-muted">Used only for withdrawal payouts. Each request keeps its own immutable snapshot.</p>
    <div className="mt-4 grid grid-cols-3 gap-2">{(["bkash","nagad","bank"] as const).map((m)=><button type="button" key={m} onClick={()=>{setType(m);setDetails({});setMessage(null)}} className={type===m?"rounded-xl bg-pine px-3 py-2 text-sm font-medium text-pine-fg":"rounded-xl bg-mist px-3 py-2 text-sm font-medium capitalize"}>{m==="bank"?"Bank":m}</button>)}</div>
    <form onSubmit={submit} className="mt-4 space-y-3"><Field label="Account name"><Input value={value("accountName")} onChange={(e)=>set("accountName",e.target.value)} required/></Field>{type==="bank"?<><Field label="Bank name"><Input value={value("bankName")} onChange={(e)=>set("bankName",e.target.value)} required/></Field><Field label="Branch"><Input value={value("branch")} onChange={(e)=>set("branch",e.target.value)} required/></Field></>:null}<Field label={type==="bank"?"Account number":"Mobile number"}><Input value={value("accountNumber")} onChange={(e)=>set("accountNumber",e.target.value)} required/></Field>{type==="bank"?<Field label="Routing number" hint="Optional"><Input value={value("routingNumber")} onChange={(e)=>set("routingNumber",e.target.value)}/></Field>:null}{message?<p className="text-sm text-muted">{message}</p>:null}<Button type="submit" disabled={pending}>{pending?"Saving…":saved?"Update method":"Save method"}</Button></form>
  </Surface>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
