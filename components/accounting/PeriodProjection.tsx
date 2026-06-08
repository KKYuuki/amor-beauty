"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import type { ProjectionDataPoint } from "@/utils/projection"

interface PeriodProjectionProps {
  historicalData: ProjectionDataPoint[]
  projectedData: ProjectionDataPoint[]
  currencySymbol?: string
  height?: number
}

export default function PeriodProjection({
  historicalData,
  projectedData,
  currencySymbol = "₱",
  height = 300,
}: PeriodProjectionProps) {
  if (!historicalData || historicalData.length < 3) {
    return (
      <div className='bg-muted border border-border rounded-lg p-4'>
        <h3 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3'>
          Period Projection
        </h3>
        <div className='flex flex-col items-center justify-center py-12 text-muted-foreground/70'>
          <p className='text-sm'>Insufficient data for projection</p>
          <p className='text-xs mt-1'>Requires at least 3 periods of historical data</p>
        </div>
      </div>
    )
  }

  const allData = [
    ...historicalData,
    ...(projectedData.length > 0 ? projectedData : []),
  ]

  const solidHistory = historicalData.map((d) => ({
    ...d,
    type: "historical" as const,
  }))

  const dashedProjection = projectedData.map((d) => ({
    ...d,
    type: "projected" as const,
  }))

  return (
    <div className='bg-muted border border-border rounded-lg p-4'>
      <h3 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3'>
        Period Projection
      </h3>
      <ResponsiveContainer width='100%' height={height}>
        <LineChart data={allData}>
          <CartesianGrid
            strokeDasharray='3 3'
            stroke='#ffffff20'
            vertical={false}
          />
          <XAxis
            dataKey='period'
            stroke='#ffffff60'
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke='#ffffff60'
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${currencySymbol}${value}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0a0a0a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
            }}
            itemStyle={{ color: "#fff" }}
            formatter={(value: number) => [
              `${currencySymbol}${value.toLocaleString()}`,
            ]}
          />
          <Legend />
          {/* Revenue lines */}
          <Line
            type='monotone'
            dataKey='revenue'
            stroke='#4ade80'
            strokeWidth={2}
            name='Revenue (Actual)'
            dot={false}
            data={solidHistory}
            activeDot={{ r: 5, fill: "#4ade80" }}
          />
          {projectedData.length > 0 && (
            <Line
              type='monotone'
              dataKey='revenue'
              stroke='#4ade80'
              strokeWidth={2}
              strokeDasharray='6 3'
              name='Revenue (Projected)'
              dot={false}
              data={dashedProjection}
            />
          )}
          {/* Expense lines */}
          <Line
            type='monotone'
            dataKey='expenses'
            stroke='#ef4444'
            strokeWidth={2}
            name='Expenses (Actual)'
            dot={false}
            data={solidHistory}
            activeDot={{ r: 5, fill: "#ef4444" }}
          />
          {projectedData.length > 0 && (
            <Line
              type='monotone'
              dataKey='expenses'
              stroke='#ef4444'
              strokeWidth={2}
              strokeDasharray='6 3'
              name='Expenses (Projected)'
              dot={false}
              data={dashedProjection}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
