import { z } from 'zod'

// ============================================================================
// Payroll Validation Schemas
// ============================================================================

export const ServiceTypeSchema = z.enum(['TATTOO', 'PIERCING', 'SHOE', 'MANUAL'])
export const ClientTypeSchema = z.enum(['WALKIN', 'PERSONAL'])
export const PayoutPeriodSchema = z.enum(['DAILY', 'WEEKLY', 'BIMONTHLY', 'MONTHLY'])
export const PaymentStatusSchema = z.enum(['PENDING', 'REQUESTED', 'CONFIRMED', 'PAID', 'CANCELLED'])
export const PayrollRequestStatusSchema = z.enum(['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'])
export const PaymentMethodSchema = z.enum(['CASH', 'GCASH', 'MAYA', 'BANK', 'BANK_TRANSFER', 'CARD', 'CRYPTO'])

export const RateLevelIdSchema = z.string().uuid('Invalid rate level ID')
export const DownpaymentTypeSchema = z.enum(['FLAT_FEE', 'PERCENTAGE', 'CUSTOM'])
export const PayrollSplitModeSchema = z.enum(['PER_PAYMENT', 'ON_COMPLETION'])

// Process Payroll Schema
export const ProcessPayrollSchema = z.object({
    staff_id: z.string().min(1, 'Staff ID is required'),
    period_type: PayoutPeriodSchema,
    period_start: z.date().or(z.string().transform((val) => new Date(val))),
    period_end: z.date().or(z.string().transform((val) => new Date(val))),
    entry_ids: z.array(z.string().uuid()).min(1, 'At least one entry is required'),
    notes: z.string().optional(),
})

// Payroll Filter Schema
export const PayrollFilterSchema = z.object({
    staffId: z.string().optional(),
    status: PaymentStatusSchema.optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    branchId: z.string().optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(500).default(50),
})

// Payroll Approval Schema
export const PayrollApprovalSchema = z.object({
    request_id: z.string().uuid(),
    notes: z.string().optional(),
})

// Payroll Rejection Schema
export const PayrollRejectionSchema = z.object({
    request_id: z.string().uuid(),
    reason: z.string().min(1, 'Reason is required'),
})

// Complete Payroll Schema
export const CompletePayrollSchema = z.object({
    request_id: z.string().uuid(),
    payment_method: PaymentMethodSchema,
    notes: z.string().optional(),
    referenceNumber: z.string().max(255).optional(),
    skip_accounting_entry: z.boolean().optional(),
})

// Disbursement Schemas
export const CreateDisbursementSchema = z.object({
    request_id: z.string().uuid(),
    amount: z.number().positive(),
    payment_method: PaymentMethodSchema,
    reference_number: z.string().max(255).optional(),
    notes: z.string().max(500).optional(),
})

export const StaggeredPaymentSchema = z.object({
    request_id: z.string().uuid(),
    disbursements: z.array(CreateDisbursementSchema).min(1),
})

// Manual Entry Schema
export const ManualPayrollEntrySchema = z.object({
    staff_id: z.string().min(1, 'Staff ID is required'),
    amount: z.number().positive('Amount must be positive'),
    description: z.string().min(1, 'Description is required'),
    service_date: z.date().or(z.string().transform((val) => new Date(val))),
    notes: z.string().optional(),
    service_type: ServiceTypeSchema.optional(),
    rate_id: z.string().uuid().optional(),
})

// Calculate Payroll Schema
export const CalculatePayrollSchema = z.object({
    gross_amount: z.number().positive('Gross amount must be positive'),
    service_type: ServiceTypeSchema,
    client_type: ClientTypeSchema,
    rate_level_id: RateLevelIdSchema.optional(),
})

// Staff Rate Schemas
export const CreateStaffRateSchema = z.object({
    rate_name: z.string().min(1, 'Rate name is required'),
    service_type: ServiceTypeSchema,
    client_type: ClientTypeSchema,
    rate_level_id: RateLevelIdSchema.optional(),
    shop_percentage: z.number().min(0).max(100),
    staff_percentage: z.number().min(0).max(100),
    payment_mode: z.enum(['PERCENTAGE', 'FIXED']),
    fixed_amount: z.number().optional(),
})

// Downpayment Schemas
export const CreateDownpaymentSchema = z.object({
    transaction_id: z.string().uuid(),
    amount: z.number().positive(),
    downpayment_type: DownpaymentTypeSchema,
    percentage_rate: z.number().min(0).max(100).optional(),
    estimated_total: z.number().positive().optional(),
    staff_id: z.string().uuid().optional(),
    payroll_split_mode: PayrollSplitModeSchema,
    notes: z.string().optional(),
})

export const AssignStaffToDownpaymentSchema = z.object({
    downpayment_id: z.string().uuid(),
    staff_id: z.string().uuid(),
    payroll_split_mode: PayrollSplitModeSchema,
})


export const CreateAdvanceSchema = z.object({
    user_id: z.string().min(1, 'User ID is required'),
    type: z.enum(['ADVANCE']),
    amount: z.number().positive('Amount must be positive'),
    reason: z.string().min(1, 'Reason is required'),
    disbursement_type: z.enum(['FULL', 'STAGGERED']).default('FULL'),
    scheduled_amount: z.number().positive().optional(),
    recurrence_rule: z.object({
        frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']),
        interval: z.number().int().min(1).default(1),
        startDate: z.string(),
        endDate: z.string().optional(),
    }).optional(),
})

export const CreateDeductionSchema = z.object({
    user_id: z.string().min(1, 'User ID is required'),
    type: z.enum(['DEDUCTION', 'ADJUSTMENT']),
    amount: z.number().positive('Amount must be positive'),
    reason: z.string().min(1, 'Reason is required'),
})

export const CreateScheduledPaymentSchema = StaggeredPaymentSchema

export type ProcessPayrollInput = z.infer<typeof ProcessPayrollSchema>
export type PayrollFilterInput = z.infer<typeof PayrollFilterSchema>
export type PayrollApprovalInput = z.infer<typeof PayrollApprovalSchema>
export type PayrollRejectionInput = z.infer<typeof PayrollRejectionSchema>
export type CompletePayrollInput = z.infer<typeof CompletePayrollSchema>
export type ManualPayrollEntryInput = z.infer<typeof ManualPayrollEntrySchema>
export type CalculatePayrollInput = z.infer<typeof CalculatePayrollSchema>
export type CreateStaffRateInput = z.infer<typeof CreateStaffRateSchema>
export type CreateDownpaymentInput = z.infer<typeof CreateDownpaymentSchema>
export type AssignStaffToDownpaymentInput = z.infer<typeof AssignStaffToDownpaymentSchema>
export type CreateAdvanceInput = z.infer<typeof CreateAdvanceSchema>
export type CreateDeductionInput = z.infer<typeof CreateDeductionSchema>
export type CreateScheduledPaymentInput = z.infer<typeof CreateScheduledPaymentSchema>
