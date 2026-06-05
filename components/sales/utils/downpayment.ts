export function calculateDownpaymentAmount(
    type: 'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM' | null,
    amount: number,
    percentageRate: number,
    estimatedTotal: number
): number {
    if (type === 'PERCENTAGE' && percentageRate > 0 && estimatedTotal > 0) {
        return Math.round((estimatedTotal * percentageRate / 100) * 100) / 100
    }
    if ((type === 'FLAT_FEE' || type === 'CUSTOM') && amount > 0) {
        return amount
    }
    return 0
}
