import { OutcomeDialog, type OutcomeDialogProps } from "@ui/outcome-dialog";

export type PaymentSuccessModalProps = Omit<OutcomeDialogProps, "status">;

export function PaymentSuccessModal(props: PaymentSuccessModalProps) {
  return <OutcomeDialog {...props} status="success" />;
}
