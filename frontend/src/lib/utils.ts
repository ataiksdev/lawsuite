import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formats an integer kobo amount as a display currency string, e.g. 500000 -> "₦5,000.00". */
export function formatNaira(kobo: number, currency: string = 'NGN'): string {
  const amount = (kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'NGN' ? `₦${amount}` : `${currency} ${amount}`;
}
