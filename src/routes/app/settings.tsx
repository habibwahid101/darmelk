import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface } from "@/components/states";
import { ReferralShareCard } from "@/components/referral-share";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordField } from "@/components/ui/password-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { authClient, signOut } from "@/lib/auth/client";
import { formatWhen } from "@/lib/platform";
import { api, ApiError, type Member, type PayoutMethod } from "@/lib/api-client";
import type { AppUser } from "@/lib/auth/use-current-user";
import { useAsync } from "@/lib/use-async";

const NAME_MAX = 80;
const INVALID_PHONE = "Enter a valid Bangladesh mobile number, like 01712345678 or +8801712345678.";

type SessionRefetch = (queryParams?: { query?: { disableCookieCache?: boolean } }) => Promise<void>;

function normalizeBdMobile(raw: string): string | null {
  const compact = raw.replace(/[\s-]/g, "");
  if (/^01[3-9]\d{8}$/.test(compact)) return `+880${compact.slice(1)}`;
  if (/^\+8801[3-9]\d{8}$/.test(compact)) return compact;
  return null;
}

function passwordFailureCopy(err: unknown): string {
  const record = err && typeof err === "object" ? (err as Record<string, unknown>) : {};
  const nested = record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : {};
  const code = String(record.code ?? nested.code ?? "");
  const message = String(record.message ?? nested.message ?? "");
  if (code === "INVALID_PASSWORD" || message === "Invalid password") return "Current password is incorrect.";
  if (code === "PASSWORD_TOO_SHORT" || message === "Password too short") return "Use at least 8 characters.";
  return "Could not update password. Please try again.";
}

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { user, member, reload } = useMemberSession();
  const { refetch } = authClient.useSession();
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

      <PersonalInformation user={user} member={member} reload={reload} refetchSession={refetch} />
      <ChangePassword refetchSession={refetch} />

      <PayoutCredentials methods={payoutData?.methods ?? []} onSaved={reloadPayouts} />

      <ReferralShareCard code={member.referral_code} />

      <Surface>
        <h2 className="font-display text-xl font-semibold">Membership</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Referral code" value={member.referral_code} />
          <Row label="Sponsor" value={member.sponsor_user_id ? "Assigned" : "None"} />
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">Growth Program</dt>
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

function PersonalInformation({
  user,
  member,
  reload,
  refetchSession,
}: {
  user: AppUser | null;
  member: Member;
  reload: () => void;
  refetchSession: SessionRefetch;
}) {
  const [name, setName] = useState(user?.displayName ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [pending, setPending] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setPhoneError(null);
    setError(null);
    setMessage(null);

    const nextName = name.trim();
    if (!nextName) {
      setNameError("Full name is required.");
      return;
    }
    if (nextName.length > NAME_MAX) {
      setNameError("Full name is too long.");
      return;
    }

    const stored = (member.phone ?? "").trim();
    const rawPhone = phone.trim();
    let nextPhone: string | null = null;
    if (rawPhone !== stored) {
      const normalized = normalizeBdMobile(rawPhone);
      if (!normalized) {
        setPhoneError(INVALID_PHONE);
        return;
      }
      if (normalized !== stored) nextPhone = rawPhone;
      else setPhone(normalized);
    }

    const nameChanged = nextName !== (user?.displayName ?? "");
    setName(nextName);
    if (!nameChanged && nextPhone === null) {
      setMessage("Profile updated successfully.");
      return;
    }

    setPending(true);
    try {
      if (nameChanged) {
        const { error: err } = await authClient.updateUser({ name: nextName });
        if (err) throw new Error("name");
        try {
          await refetchSession({ query: { disableCookieCache: true } });
        } catch {
          // Name is already saved. The next session read shows it.
        }
      }
      if (nextPhone !== null) {
        const result = await api.updateProfile({ phone: nextPhone });
        setPhone(result.member.phone);
        reload();
      }
      setMessage("Profile updated successfully.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_phone") setPhoneError(INVALID_PHONE);
      else setError("Could not update your profile. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface>
      <h2 className="font-display text-xl font-semibold">Personal Information</h2>
      <form onSubmit={(e) => void save(e)} className="mt-4 space-y-4">
        <Field label="Full Name" error={nameError ?? undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={NAME_MAX} />
        </Field>
        <Field label="Phone Number" error={phoneError ?? undefined}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" />
        </Field>
        <Field label="Email" hint="Managed by sign-in. Email cannot be changed here.">
          <Input value={user?.primaryEmail ?? ""} disabled readOnly autoComplete="email" />
        </Field>
        {error ? (
          <p className="text-sm text-clay" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-sm text-pine" role="status">
            {message}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Surface>
  );
}

function ChangePassword({ refetchSession }: { refetchSession: SessionRefetch }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    setCurrentError(null);
    setNewError(null);
    setConfirmError(null);
    setError(null);
    setMessage(null);

    if (!currentPassword) {
      setCurrentError("Current password is required.");
      return;
    }
    if (newPassword.length < 8) {
      setNewError("Use at least 8 characters.");
      return;
    }
    if (!confirmPassword || newPassword !== confirmPassword) {
      setConfirmError("New passwords do not match.");
      return;
    }

    setPending(true);
    try {
      const { error: err } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (err) {
        const copy = passwordFailureCopy(err);
        if (copy === "Current password is incorrect.") setCurrentError(copy);
        else if (copy === "Use at least 8 characters.") setNewError(copy);
        else setError(copy);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated successfully.");
      try {
        await refetchSession({ query: { disableCookieCache: true } });
      } catch {
        // Better Auth already replaced this session cookie.
      }
    } catch {
      setError("Could not update password. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface>
      <h2 className="font-display text-xl font-semibold">Security</h2>
      <h3 className="mt-4 font-display text-lg font-semibold">Change password</h3>
      <p className="mt-2 text-sm text-muted">Update the password you use to sign in to your Darmelk account.</p>
      <form onSubmit={(e) => void updatePassword(e)} className="mt-4 space-y-4">
        <PasswordField
          id="current-password"
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          error={currentError ?? undefined}
        />
        <PasswordField
          id="new-password"
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          error={newError ?? undefined}
        />
        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          error={confirmError ?? undefined}
        />
        {error ? (
          <p className="text-sm text-clay" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-sm text-pine" role="status">
            {message}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted">
        <Link to="/forgot-password" className="text-pine hover:underline">
          Forgot your current password?
        </Link>
      </p>
    </Surface>
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
  return <Surface><p className="text-xs font-medium uppercase tracking-wide text-subtle">Account / Profile</p><h2 className="mt-2 font-display text-xl font-semibold">Financial Accounts</h2><p className="mt-2 text-sm text-muted">Saved once and available for future withdrawals. Each request keeps its own immutable payout-detail snapshot.</p>
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
