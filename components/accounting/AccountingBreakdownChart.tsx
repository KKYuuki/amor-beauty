"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts"

const DEFAULT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#f59e0b",
]

interface AccountingBreakdownChartProps {
  data: Record<string, unknown>[]
  type: "bar" | "pie"
  valueKey: string
  labelKey: string
  currencySymbol?: string
  title?: string
  height?: number
  colorMap?: Record<string, string>
}

export default function AccountingBreakdownChart({
  data,
  type,
  valueKey,
  labelKey,
  currencySymbol = "₱",
  title,
  height = 280,
  colorMap,
}: AccountingBreakdownChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className='bg-muted border border-border rounded-lg p-4'>
        {title && (
          <h3 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3'>
            {title}
          </h3>
        )}
        <div className='flex flex-col items-center justify-center py-12 text-muted-foreground/70'>
          <p className='text-sm'>No data for selected period</p>
        </div>
      </div>
    )
  }

  const getColor = (label: string, index: number) => {
    if (colorMap && colorMap[label]) return colorMap[label]
    return DEFAULT_COLORS[index % DEFAULT_COLORS.length]
  }

  return (
    <div className='bg-muted border border-border rounded-lg p-4'>
      {title && (
        <h3 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3'>
          {title}
        </h3>
      )}
      <ResponsiveContainer width='100%' height={height}>
        {type === "pie" ? (
          <PieChart>
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey={labelKey}
              cx='50%'
              cy='50%'
              outerRadius={80}
              label={({ name, percent }: { name?: string; percent?: number }) =>
                `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={false}
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getColor(String(data[index][labelKey] ?? ""), index)}
                />
              ))}
            </Pie>
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
          </PieChart>
        ) : (
          <BarChart
            data={data}
            layout='vertical'
          >
            <CartesianGrid
              strokeDasharray='3 3'
              stroke='#ffffff20'
              horizontal={false}
            />
            <XAxis
              type='number'
              stroke='#ffffff60'
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `${currencySymbol}${value}`}
            />
            <YAxis
              type='category'
              dataKey={labelKey}
              stroke='#ffffff60'
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={120}
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
            <Bar
              dataKey={valueKey}
              radius={[0, 4, 4, 0]}
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getColor(String(data[index][labelKey] ?? ""), index)}
                />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
