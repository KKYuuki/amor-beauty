"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

export interface TrendLineConfig {
  dataKey: string
  color: string
  name: string
}

interface AccountingTrendChartProps {
  data: Record<string, unknown>[]
  lines: TrendLineConfig[]
  xAxisKey?: string
  currencySymbol?: string
  title?: string
  height?: number
}

export default function AccountingTrendChart({
  data,
  lines,
  xAxisKey = "period",
  currencySymbol = "₱",
  title,
  height = 280,
}: AccountingTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className='bg-white/5 border border-white/10 rounded-lg p-4'>
        {title && (
          <h3 className='text-sm font-semibold text-white/60 uppercase tracking-wider mb-3'>
            {title}
          </h3>
        )}
        <div className='flex flex-col items-center justify-center py-12 text-white/40'>
          <p className='text-sm'>No data for selected period</p>
        </div>
      </div>
    )
  }

  return (
    <div className='bg-white/5 border border-white/10 rounded-lg p-4'>
      {title && (
        <h3 className='text-sm font-semibold text-white/60 uppercase tracking-wider mb-3'>
          {title}
        </h3>
      )}
      <ResponsiveContainer width='100%' height={height}>
        <LineChart data={data}>
          <CartesianGrid
            strokeDasharray='3 3'
            stroke='#ffffff20'
            vertical={false}
          />
          <XAxis
            dataKey={xAxisKey}
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
            formatter={(value: number, name: string) => [
              `${currencySymbol}${value.toLocaleString()}`,
              name,
            ]}
          />
          {lines.map((line) => (
            <Line
              key={line.dataKey}
              type='monotone'
              dataKey={line.dataKey}
              stroke={line.color}
              strokeWidth={2}
              name={line.name}
              dot={{
                fill: line.color,
                strokeWidth: 0,
                r: 3,
              }}
              activeDot={{ r: 5, fill: line.color }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
