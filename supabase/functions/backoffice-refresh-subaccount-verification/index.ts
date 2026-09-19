// Retired endpoint. Kept as a tombstone so deployment disables old instances.
Deno.serve(() => new Response(JSON.stringify({ error: "This payout setup endpoint has been retired. Payouts use transfer recipients." }), {
  status: 410, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
}));
