import { quoteWithdrawal } from "./withdrawal-fees.ts";
const equal = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
};
for (const [amount, fee, duty] of [[500,10,0],[5000,10,0],[5000.01,25,0],[9999.99,25,0],[10000,25,50],[50000,25,50],[50000.01,50,50],[10000000,50,50]]) {
  Deno.test(`NGN ${amount}: fee ${fee}, duty ${duty}`, () => {
    const quote = quoteWithdrawal(amount, "NGN", "bank");
    equal([quote.transferFee, quote.stampDuty, quote.totalDebit], [fee, duty, Math.round((amount+fee+duty)*100)/100]);
  });
}
for (const [destination, fee] of [["bank",8],["mobile_money",1]] as const) {
  Deno.test(`GHS ${destination} minimum and fee`, () => {
    const quote = quoteWithdrawal(50,"GHS",destination);
    equal([quote.transferFee,quote.stampDuty,quote.totalDebit],[fee,0,50+fee]);
  });
}
Deno.test("reject unsupported, non-finite, fractional subunit and out-of-range requests", () => {
  for (const [amount, currency, destination] of [[499.99,"NGN","bank"],[49.99,"GHS","bank"],[50000.01,"GHS","bank"],[10000000.01,"NGN","bank"],[NaN,"NGN","bank"],[Infinity,"NGN","bank"],[500.001,"NGN","bank"],[500,"USD","bank"],[500,"NGN","mobile_money"],[50,"GHS","unknown"]] as const) {
    let rejected = false;
    try { quoteWithdrawal(amount,currency,destination); } catch { rejected = true; }
    if (!rejected) throw new Error(`Accepted ${amount} ${currency} ${destination}`);
  }
});
