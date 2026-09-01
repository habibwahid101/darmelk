import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CreditCard } from "lucide-react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";

export const Route = createFileRoute("/admin/payments")({ component: AdminPayments });
const API_URL = import.meta.env.VITE_API_URL ?? "";

function AdminPayments(){const {data,reload}=useAsync(()=>api.admin.payments(),[]);const [busy,setBusy]=useState<string|null>(null);const payments=data?.payments??[];
 async function run(id:string,fn:()=>Promise<unknown>){setBusy(id);try{await fn();reload()}finally{setBusy(null)}}
 return <div className="space-y-8"><PageHeader kicker="Finance" title="Payment review" description="Review submitted evidence before activating an ID or property booking. Nothing is approved automatically."/>
 {payments.length===0?<EmptyState icon={CreditCard} title="No payment submissions" description="Activation and booking payments appear here after members submit proof."/>:<Surface className="p-0 sm:p-0"><ul className="divide-y divide-line">{payments.map((p)=><li key={p.id} className="space-y-3 px-5 py-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-medium">{p.user_name??p.user_id} · <span className="capitalize">{p.target_type}</span></p><p className="text-sm text-muted">{formatBdt(p.amount)} · {p.payment_method.toUpperCase()} · ref {p.reference_id}</p><p className="text-xs text-subtle">{formatWhen(p.submitted_at)}{p.notes?` · ${p.notes}`:""}</p></div><StatusBadge status={p.status}/></div>
 <div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="secondary"><a href={`${API_URL}/api/payments/${p.id}/proof`} target="_blank" rel="noreferrer">View proof</a></Button>{p.status==="submitted"?<Button size="sm" disabled={busy===p.id} onClick={()=>void run(p.id,()=>api.admin.reviewPayment(p.id))}>Start review</Button>:null}{p.status==="under_review"?<><Button size="sm" disabled={busy===p.id} onClick={()=>void run(p.id,()=>api.admin.decidePayment(p.id,"approve"))}>Approve</Button><Button size="sm" variant="secondary" disabled={busy===p.id} onClick={()=>{const reason=window.prompt("Rejection reason");if(reason)void run(p.id,()=>api.admin.decidePayment(p.id,"reject",reason))}}>Reject</Button></>:null}</div>{p.rejection_reason?<p className="text-sm text-clay">{p.rejection_reason}</p>:null}</li>)}</ul></Surface>}</div>}
