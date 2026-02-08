import { useMemo } from "react";
import type { CartItem } from "./useBookingCart";

interface DepositRule {
  depositRequired: boolean;
  depositType: "percentage" | "fixed";
  depositValue: number;
}

interface DepositCalculationResult {
  subtotal: number;
  depositRequired: number;
  depositAmount: number;
  amountDueNow: number;
  balanceDueAtSalon: number;
  itemBreakdown: Array<{
    itemId: string;
    name: string;
    price: number;
    depositAmount: number;
  }>;
}

// Default deposit rules - in production these would come from service/tenant settings
const DEFAULT_DEPOSIT_PERCENTAGE = 0; // No deposit by default

export function useDepositCalculation(
  items: CartItem[],
  depositPercentage: number = DEFAULT_DEPOSIT_PERCENTAGE,
  serviceDepositRules?: Record<string, DepositRule>
): DepositCalculationResult {
  return useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    
    const itemBreakdown = items.map((item) => {
      const itemTotal = item.price * item.quantity;
      
      // Check for item-specific deposit rules (from services table)
      const itemRule = serviceDepositRules?.[item.itemId];
      
      let depositAmount = 0;
      if (itemRule?.depositRequired) {
        if (itemRule.depositType === "percentage") {
          depositAmount = (itemTotal * itemRule.depositValue) / 100;
        } else {
          depositAmount = Math.min(itemRule.depositValue, itemTotal);
        }
      } else if (depositPercentage > 0) {
        // Apply default tenant deposit percentage
        depositAmount = (itemTotal * depositPercentage) / 100;
      }
      
      return {
        itemId: item.id,
        name: item.name,
        price: itemTotal,
        depositAmount: Math.round(depositAmount * 100) / 100, // Round to 2 decimals
      };
    });
    
    const totalDeposit = itemBreakdown.reduce((sum, item) => sum + item.depositAmount, 0);
    const depositRequired = totalDeposit > 0;
    
    return {
      subtotal,
      depositRequired: depositRequired ? 1 : 0, // 1 = true, 0 = false for compatibility
      depositAmount: Math.round(totalDeposit * 100) / 100,
      amountDueNow: Math.round(totalDeposit * 100) / 100,
      balanceDueAtSalon: Math.round((subtotal - totalDeposit) * 100) / 100,
      itemBreakdown,
    };
  }, [items, depositPercentage, serviceDepositRules]);
}

// Calculate cancellation fee based on time until appointment
export function calculateCancellationFee(
  appointmentStart: Date,
  totalAmount: number,
  gracePeriodHours: number = 24,
  feePercentage: number = 50
): { canCancelFree: boolean; cancellationFee: number; hoursUntil: number } {
  const now = new Date();
  const hoursUntil = (appointmentStart.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  if (hoursUntil > gracePeriodHours) {
    return {
      canCancelFree: true,
      cancellationFee: 0,
      hoursUntil: Math.round(hoursUntil),
    };
  }
  
  const cancellationFee = Math.round((totalAmount * feePercentage) / 100 * 100) / 100;
  
  return {
    canCancelFree: false,
    cancellationFee,
    hoursUntil: Math.round(hoursUntil),
  };
}
