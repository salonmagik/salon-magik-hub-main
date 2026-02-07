-- Add RLS policy for customers to read their own payment intents
CREATE POLICY "Customers can read own payment intents" 
ON public.payment_intents 
FOR SELECT 
USING (customer_email = (SELECT email FROM auth.users WHERE id = auth.uid()));