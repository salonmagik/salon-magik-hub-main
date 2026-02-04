/**
 * In-App Notification Templates
 * 
 * These templates define the structure for notifications displayed in the
 * notification bell and modals within the Salon Magik platform.
 */

export type NotificationCategory = "appointment" | "payment" | "refund" | "account" | "system";

export interface NotificationTemplateVars {
  salon_name?: string;
  customer_name?: string;
  service_name?: string;
  date?: string;
  time?: string;
  amount?: string;
  buffer_duration?: string;
  staff_name?: string;
  old_service?: string;
  new_service?: string;
  feature_name?: string;
  maintenance_date?: string;
}

export interface NotificationTemplate {
  type: NotificationCategory;
  title: string;
  description: (vars: NotificationTemplateVars) => string;
  urgent: boolean;
  requiresAction?: boolean;
}

export const notificationTemplates: Record<string, NotificationTemplate> = {
  // Appointment Notifications
  appointment_created: {
    type: "appointment",
    title: "New Appointment",
    description: (vars) =>
      `New appointment scheduled for ${vars.service_name || "a service"} on ${vars.date || "TBD"} at ${vars.time || "TBD"}.`,
    urgent: false,
  },

  service_started: {
    type: "appointment",
    title: "Service Started",
    description: (vars) =>
      `Your service at ${vars.salon_name || "the salon"} has started.`,
    urgent: false,
  },

  buffer_requested: {
    type: "appointment",
    title: "Buffer Requested",
    description: (vars) =>
      `${vars.salon_name || "The salon"} has requested a ${vars.buffer_duration || "few"} minute buffer. Please respond.`,
    urgent: true,
    requiresAction: true,
  },

  service_change_requested: {
    type: "appointment",
    title: "Service Change Requested",
    description: (vars) =>
      `${vars.salon_name || "The salon"} wants to change your service from ${vars.old_service || "original"} to ${vars.new_service || "new service"}. Approval needed.`,
    urgent: true,
    requiresAction: true,
  },

  appointment_reminder: {
    type: "appointment",
    title: "Appointment Reminder",
    description: (vars) =>
      `Reminder: Your appointment at ${vars.salon_name || "the salon"} is scheduled for ${vars.date || "today"} at ${vars.time || "soon"}.`,
    urgent: false,
  },

  appointment_cancelled: {
    type: "appointment",
    title: "Appointment Cancelled",
    description: (vars) =>
      `Your appointment at ${vars.salon_name || "the salon"} on ${vars.date || "TBD"} has been cancelled.`,
    urgent: false,
  },

  appointment_rescheduled: {
    type: "appointment",
    title: "Appointment Rescheduled",
    description: (vars) =>
      `Your appointment has been rescheduled to ${vars.date || "a new date"} at ${vars.time || "a new time"}.`,
    urgent: false,
  },

  // Payment Notifications
  payment_received: {
    type: "payment",
    title: "Payment Received",
    description: (vars) =>
      `Payment of ${vars.amount || "an amount"} received from ${vars.customer_name || "a customer"}.`,
    urgent: false,
  },

  outstanding_fees_alert: {
    type: "payment",
    title: "Outstanding Fees",
    description: (vars) =>
      `${vars.customer_name || "This customer"} has outstanding fees from a previous appointment.`,
    urgent: true,
  },

  deposit_received: {
    type: "payment",
    title: "Deposit Received",
    description: (vars) =>
      `Deposit of ${vars.amount || "an amount"} received for upcoming appointment.`,
    urgent: false,
  },

  payment_failed: {
    type: "payment",
    title: "Payment Failed",
    description: (vars) =>
      `Payment processing failed. Please update your payment method.`,
    urgent: true,
    requiresAction: true,
  },

  // Refund Notifications
  refund_requires_approval: {
    type: "refund",
    title: "Refund Pending Approval",
    description: (vars) =>
      `${vars.salon_name || "The salon"} has requested approval to process a refund of ${vars.amount || "an amount"}. Please review.`,
    urgent: true,
    requiresAction: true,
  },

  refund_processed: {
    type: "refund",
    title: "Refund Processed",
    description: (vars) =>
      `Your refund of ${vars.amount || "an amount"} has been processed.`,
    urgent: false,
  },

  store_credit_added: {
    type: "refund",
    title: "Store Credit Added",
    description: (vars) =>
      `${vars.amount || "An amount"} has been added to your store credit at ${vars.salon_name || "the salon"}.`,
    urgent: false,
  },

  // Account Notifications
  staff_invitation_received: {
    type: "account",
    title: "Staff Invitation",
    description: (vars) =>
      `You've been invited to join ${vars.salon_name || "a salon"}.`,
    urgent: false,
    requiresAction: true,
  },

  trial_ending_soon: {
    type: "account",
    title: "Trial Ending Soon",
    description: () =>
      `Your free trial is ending soon. Add a payment method to continue.`,
    urgent: true,
    requiresAction: true,
  },

  subscription_renewed: {
    type: "account",
    title: "Subscription Renewed",
    description: (vars) =>
      `Your subscription has been renewed. Amount: ${vars.amount || "charged"}.`,
    urgent: false,
  },

  // System Notifications
  new_feature_announcement: {
    type: "system",
    title: "New Feature Available",
    description: (vars) =>
      `New feature available: ${vars.feature_name || "Check it out"}!`,
    urgent: false,
  },

  maintenance_notice: {
    type: "system",
    title: "Scheduled Maintenance",
    description: (vars) =>
      `Scheduled maintenance on ${vars.maintenance_date || "soon"}. Some features may be unavailable.`,
    urgent: false,
  },

  system_update: {
    type: "system",
    title: "System Update",
    description: () =>
      `System has been updated with new improvements.`,
    urgent: false,
  },
};

/**
 * Create a notification object from a template
 */
export function createNotificationFromTemplate(
  templateKey: keyof typeof notificationTemplates,
  variables: NotificationTemplateVars
): {
  type: NotificationCategory;
  title: string;
  description: string;
  urgent: boolean;
} {
  const template = notificationTemplates[templateKey];
  if (!template) {
    throw new Error(`Unknown notification template: ${templateKey}`);
  }

  return {
    type: template.type,
    title: template.title,
    description: template.description(variables),
    urgent: template.urgent,
  };
}

/**
 * Get all notification templates for a specific category
 */
export function getTemplatesByCategory(category: NotificationCategory): string[] {
  return Object.entries(notificationTemplates)
    .filter(([_, template]) => template.type === category)
    .map(([key]) => key);
}

/**
 * Check if a notification template requires user action
 */
export function requiresUserAction(templateKey: keyof typeof notificationTemplates): boolean {
  return notificationTemplates[templateKey]?.requiresAction ?? false;
}
