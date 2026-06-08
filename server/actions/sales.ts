'use server'

import { db } from '@/server/db'
import { transactions, transactionItems } from '@/server/db/schema/transactions'

import { services } from '@/server/db/schema/services'
import { inventory } from '@/server/db/schema/inventory'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { createLogs, logError } from './logs'
import { createAutoLedgerEntry } from './accounting'
import { getCurrentUser, canAccessSales, getUserById } from '@/utils/auth/permissions'
import { withTransaction } from '@/server/db/transactions'
import { generateTransactionNumberWithTx } from './transactions'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import { mapAppointmentTypeToServiceType, ClientType, ServiceType } from '@/utils/types/payroll'
import { mapTransactionToAccountingPaymentMethod } from '@/utils/types/payment'
import { deriveSalesCategoryAndDescription } from "./accounting-ledger-utils"
import { calculateAndCreatePayrollEntry } from './payroll'
import { PayrollError } from '@/utils/types/transactions'


