import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { reconcilePaystackRefund } from "./paystack-refund-events.ts";

export async function submitPaystackRefund(db: SupabaseClient, input: {
 transactionId: string; amount: number; reason: string; actorId: string; key: string;
 requestId: string | null; currency: string; reference: string; secret: string;
}, fetchImpl: typeof fetch = fetch) {
 const { data: prepared, error } = await db.rpc("prepare_paystack_refund", {
  p_transaction_id: input.transactionId,p_amount: input.amount,p_reason: input.reason,p_actor_id: input.actorId,p_key: input.key,p_request_id: input.requestId,
 });
 if (error) throw error;
 if (!prepared?.ok) return { success:false, error:"The salon has insufficient recoverable funds for this refund",code:"INSUFFICIENT_RECOVERABLE_FUNDS" };
 if (prepared.duplicate) return {success:prepared.status !== "failed",pending:prepared.status !== "processed",refundId:prepared.refund_transaction_id,status:prepared.status,error:prepared.status === "failed" ? "Paystack could not complete this refund." : undefined};
 let response: Response;
 let result;
 try {
  response = await fetchImpl("https://api.paystack.co/refund", {method:"POST",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${input.secret}`,"Content-Type":"application/json"},
    body:JSON.stringify({transaction:input.reference,amount:Math.round(input.amount*100),merchant_note:`salonmagik:${prepared.id} ${input.reason}`})});
  result = await response.json();
 } catch {
  return {success:true,pending:true,status:"unknown",message:"Refund outcome is being confirmed. Do not submit another refund."};
 }
 if (!response.ok || !result.status) {
  if (response.status >= 500) return {success:true,pending:true,status:"unknown"};
  const {error: failure} = await db.rpc("reconcile_paystack_refund",{p_provider_id:`rejected:${prepared.id}`,p_reference:input.reference,p_currency:input.currency,p_amount:input.amount,p_status:"failed",p_local_id:prepared.id});
  if (failure) throw failure;
  return {success:false,error:result.message || "Paystack declined the refund",code:"PAYSTACK_DECLINED"};
 }
 if (!result.data?.id) return {success:true,pending:true,status:"unknown"};
 const {error: linkError} = await db.from("paystack_refunds").update({provider_id:String(result.data.id)}).eq("id",prepared.id);
 if (linkError) throw linkError;
 // Verify rather than trusting optimistic API submission status.
 let status;
 try { status = await reconcilePaystackRefund(db,result.data.id,input.currency,fetchImpl); }
 catch { return {success:true,pending:true,status:"unknown"}; }
 return {success:status.status !== "failed",pending:status.status !== "processed",status:status.status,refundId:status.refundId,error:status.status === "failed" ? "Paystack could not complete this refund." : undefined};
}
