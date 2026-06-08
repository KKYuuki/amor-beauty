"use client"

interface CashFlowSummaryProps {
  inflow: number
  outflow: number
  net: number
  currencySymbol?: string
}

export default function CashFlowSummary({
  inflow,
  outflow,
  net,
  currencySymbol = "₱",
}: CashFlowSummaryProps) {
  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value)
    const sign = value < 0 ? "-" : ""
    return `${sign}${currencySymbol}${absValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
  }

  return (
    <div className='bg-muted border border-border rounded-lg p-4'>
      <h3 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3'>
        Cash Flow Summary
      </h3>
      <div className='grid grid-cols-3 gap-4'>
        <div className='bg-muted rounded-md p-3'>
          <p className='text-xs text-muted-foreground'>Total Inflow</p>
          <p className='text-lg font-bold mt-1 text-green-400'>
            {formatCurrency(inflow)}
          </p>
        </div>
        <div className='bg-muted rounded-md p-3'>
          <p className='text-xs text-muted-foreground'>Total Outflow</p>
          <p className='text-lg font-bold mt-1 text-red-400'>
            {formatCurrency(outflow)}
          </p>
        </div>
        <div className='bg-muted rounded-md p-3'>
          <p className='text-xs text-muted-foreground'>Net Cash Flow</p>
          <p
            className={`text-lg font-bold mt-1 ${net >= 0 ? "text-green-400" : "text-red-400"}`}
          >
            {formatCurrency(net)}
          </p>
        </div>
      </div>
    </div>
  )
}
