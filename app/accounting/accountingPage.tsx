"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SearchIcon,
  LoaderCircleIcon,
  BookOpenIcon,
  RefreshCwIcon,
  CalendarIcon,
  DownloadIcon,
  ArrowUpDownIcon,
  PlusIcon,
  PencilIcon,
  EyeIcon,
  Trash2Icon,
  ArchiveRestoreIcon,
  FileTextIcon,
  BarChartIcon,
  TagsIcon,
  FilterIcon,
  PaperclipIcon,
  UploadIcon,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import StatsGrid from "@/components/ui/StatsGrid";
import StatCard from "@/components/ui/StatCard";
import FilterBar from "@/components/ui/FilterBar";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { SideBarContext } from "@/components/sidebar";
import { NotificationContext } from "@/components/notifications";

import FlagGate from "@/components/ui/FlagGate";
import AdminActionGuard from "@/components/admin/AdminActionGuard";
import {
  LedgerEntry,
  LedgerEntryType,
  LedgerExportType,
  LedgerDetailBreakdown,
} from "@/utils/types/ledger";
import {
  ACCOUNTING_PAYMENT_METHOD_COLORS,
  ACCOUNTING_PAYMENT_METHODS,
  getAccountingPaymentMethodLabel,
  AccountingPaymentMethod,
} from "@/utils/types/payment";
import {
  getLedgerEntries,
  getLedgerSummary,
  getAccountingCategories,
  voidLedgerEntry,
  exportLedger,
  getLedgerDetailBreakdown,
  getTrialBalance,
  getRevenueExpenseTrend,
  getExpenseBreakdown,
  getCashFlowSummary,
  TrialBalanceRow,
  LedgerSummary,
  AccountingCategory,
  TrendDataPoint,
  ExpenseBreakdownItem,
  CashFlowSummaryData,
  restoreLedgerEntry,
  hardDeleteLedgerEntry,
} from "@/server/actions/accounting";
import AccountingTrendChart from "@/components/accounting/AccountingTrendChart";
import AccountingBreakdownChart from "@/components/accounting/AccountingBreakdownChart";
import CashFlowSummary from "@/components/accounting/CashFlowSummary";
import PeriodProjection from "@/components/accounting/PeriodProjection";
import {
  computeLinearProjection,
  ProjectionDataPoint,
} from "@/utils/projection";

import PaymentMethodDrilldown from "@/components/accounting/PaymentMethodDrilldown";
import TrialBalance from "@/components/accounting/TrialBalance";
import { getSetting } from "@/server/actions/settings";
import { logError } from "@/server/actions/logs";
import { CurrencyTaxValue } from "@/utils/types/settings";
import {
  DateRangePreset,
  safeFormatDate,
  safeToISOString,
} from "@/utils/date-utils";
import EntryModal from "@/components/accounting/EntryModal";
import { CSVColumn } from "@/utils/csv-import";
import {
  importAccountingEntries,
  AccountingImportRow,
} from "@/server/actions/accounting-import";
import CSVImportModal from "@/components/ui/csv-import-modal";
import ExportGroupingModal from "@/components/accounting/ExportGroupingModal";
import { ExportConfig } from "@/components/accounting/ExportGroupingModal";

const currentBranch: any = null;
const branches: any[] = [];
const useBranchContext: any = () => ({ currentBranch: null });


const ENTRY_TYPES: LedgerEntryType[] = [
  "EXPENSE",
  "REVENUE",
  "ASSET",
  "LIABILITY",
  "EQUITY",
];

const _EXPORT_TYPES: { key: LedgerExportType; label: string }[] = [
  { key: "GENERAL_LEDGER", label: "General Ledger" },
  { key: "CASH_RECEIPTS", label: "Cash Receipts" },
  { key: "CASH_DISBURSEMENTS", label: "Cash Disbursements" },
  { key: "SALES", label: "Sales" },
  { key: "PURCHASES", label: "Purchases" },
  { key: "BY_PAYMENT_METHOD", label: "By Payment Method" },
];

const ENTRY_TYPE_COLORS: Record<LedgerEntryType, string> = {
  EXPENSE: "bg-red-400/20 text-red-300 border-red-400/30",
  REVENUE: "bg-green-400/20 text-green-300 border-green-400/30",
  ASSET: "bg-blue-400/20 text-blue-300 border-blue-400/30",
  LIABILITY: "bg-orange-400/20 text-orange-300 border-orange-400/30",
  EQUITY: "bg-purple-400/20 text-purple-300 border-purple-400/30",
};

const NATURAL_BALANCE: Record<string, "debit" | "credit"> = {
  EXPENSE: "debit",
  REVENUE: "credit",
  ASSET: "debit",
  LIABILITY: "credit",
  EQUITY: "credit",
};

const accountingCSVColumns: CSVColumn[] = [
  { key: "entry_date", label: "Date", required: true, type: "date" },
  {
    key: "entry_type",
    label: "Type",
    required: true,
    type: "enum",
    enumValues: ["EXPENSE", "REVENUE", "ASSET", "LIABILITY", "EQUITY"],
  },
  {
    key: "payment_method",
    label: "Payment Method",
    required: false,
    type: "enum",
    enumValues: ["CASH", "CARD", "BANK_TRANSFER", "GCASH", "CRYPTO"],
  },
  { key: "category", label: "Category", required: false, type: "string" },
  {
    key: "description",
    label: "Description",
    required: true,
    type: "string",
  },
  { key: "reference", label: "Reference", required: false, type: "string" },
  { key: "debit", label: "Debit", required: false, type: "number" },
  { key: "credit", label: "Credit", required: false, type: "number" },
  { key: "branch", label: "Branch", required: false, type: "string" },
];

const PAGE_SIZE = 50;

export default function AccountingPageClient() {
  const { userInfo } = useContext(SideBarContext);
  const { addNotification } = useContext(NotificationContext);
  
  const isAdmin = userInfo?.role === "admin";
  const hasAnalyticsAccess =
    isAdmin ||
    (userInfo?.access_flags?.includes("accounting_analytics_view") ?? false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab =
    (searchParams.get("tab") as "ledger" | "reports" | "trash") || "ledger";

  const setActiveTab = (tab: "ledger" | "reports" | "trash") => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "ledger") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    router.replace(`/accounting?${params.toString()}`, { scroll: false });
  };

  // Redirect to ledger if user tries to access reports tab without analytics access
  useEffect(() => {
    if (activeTab === "reports" && !hasAnalyticsAccess) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("tab");
      router.replace(`/accounting?${params.toString()}`, { scroll: false });
    }
  }, [activeTab, hasAnalyticsAccess, searchParams, router]);

  // Data State
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [currencySymbol, setCurrencySymbol] = useState("₱");

  const branchNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of branches) {
      map[b.id] = b.name;
    }
    return map;
  }, [branches]);

  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchQueryDebounced, setSearchQueryDebounced] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [typeFilter, setTypeFilter] = useState<LedgerEntryType | "">("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<
    AccountingPaymentMethod | ""
  >("");
  const [sortBy, setSortBy] = useState<"entry_date" | "created_at">(
    "entry_date",
  );

  const BASE_COLUMNS = { base: 12, admin: 13 };
  const extraCols = sortBy === "created_at" ? 1 : 0;
  const PAGE_COLUMNS = {
    base: BASE_COLUMNS.base + extraCols,
    admin: BASE_COLUMNS.admin + extraCols,
  };

  const [datePreset, setDatePreset] = useState<DateRangePreset>("this_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [viewingEntry, setViewingEntry] = useState<LedgerEntry | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<LedgerEntry | null>(
    null,
  );
  const [showHardDeleteModal, setShowHardDeleteModal] =
    useState<LedgerEntry | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Drilldown State
  const [detailBreakdown, setDetailBreakdown] =
    useState<LedgerDetailBreakdown | null>(null);
  const [trialBalanceData, setTrialBalanceData] = useState<TrialBalanceRow[]>(
    [],
  );

  // Report State
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [expenseBreakdown, setExpenseBreakdown] = useState<
    ExpenseBreakdownItem[]
  >([]);
  const [cashFlowData, setCashFlowData] = useState<CashFlowSummaryData | null>(
    null,
  );
  const [reportsLoading, setReportsLoading] = useState(false);

  // Export State
  const [showExportModal, setShowExportModal] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Trash State
  const [trashEntries, setTrashEntries] = useState<LedgerEntry[]>([]);
  const [trashTotal, setTrashTotal] = useState(0);
  const [trashPage, setTrashPage] = useState(1);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashSearch, setTrashSearch] = useState("");
  const [trashDatePreset, setTrashDatePreset] =
    useState<DateRangePreset>("all");
  const [trashCustomStartDate, setTrashCustomStartDate] = useState("");
  const [trashCustomEndDate, setTrashCustomEndDate] = useState("");
  const trashRequestIdRef = useRef(0);

  // Refs
  const requestIdRef = useRef(0);
  const reportRequestIdRef = useRef(0);

  // --- Data Fetching ---
  const fetchData = useCallback(async () => {
    const thisRequestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const summaryPromise = hasAnalyticsAccess
        ? getLedgerSummary(
            datePreset,
            customStartDate,
            customEndDate,
            currentBranch?.id,
            {
              entry_type: typeFilter || undefined,
              category: categoryFilter || undefined,
              payment_method: paymentMethodFilter || undefined,
            },
          )
        : Promise.resolve(null);

      const [
        entriesResult,
        categoriesResult,
        taxData,
        breakdownResult,
        trialResult,
        summaryResult,
      ] = await Promise.all([
        getLedgerEntries({
          filters: {
            entry_type: typeFilter || undefined,
            category: categoryFilter || undefined,
            search: searchQueryDebounced || undefined,
            payment_method: paymentMethodFilter || undefined,
          },
          branchId: currentBranch?.id,
          datePreset,
          startDate: datePreset === "custom" ? customStartDate : undefined,
          endDate: datePreset === "custom" ? customEndDate : undefined,
          page,
          pageSize: PAGE_SIZE,
          sortBy,
        }),
        getAccountingCategories(false),
        getSetting("currency_tax"),
        getLedgerDetailBreakdown(
          datePreset,
          customStartDate,
          customEndDate,
          currentBranch?.id,
          {
            entry_type: typeFilter || undefined,
            category: categoryFilter || undefined,
            payment_method: paymentMethodFilter || undefined,
          },
        ),
        getTrialBalance(
          datePreset,
          customStartDate,
          customEndDate,
          currentBranch?.id,
        ),
        summaryPromise,
      ]);

      if (requestIdRef.current !== thisRequestId) return;

      if (entriesResult.success) {
        setEntries(entriesResult.data.data);
        setTotal(entriesResult.data.total);
      } else {
        addNotification(
          entriesResult.error || "Failed to load entries",
          "ERROR",
        );
      }

      if (summaryResult !== null) {
        if (summaryResult.success && summaryResult.data) {
          setSummary(summaryResult.data);
        }
      } else {
        setSummary(null);
      }

      if (breakdownResult.success && breakdownResult.data) {
        setDetailBreakdown(breakdownResult.data);
      }

      if (trialResult.success && trialResult.data) {
        setTrialBalanceData(trialResult.data);
      }

      if (categoriesResult.success) {
        setCategories(categoriesResult.data);
      } else {
        addNotification(
          categoriesResult.error || "Failed to load categories",
          "ERROR",
        );
      }

      if (taxData && taxData.success && taxData.data) {
        const settings = taxData.data as CurrencyTaxValue;
        setCurrencySymbol(settings.currency_symbol);
      }
    } catch (error) {
      if (requestIdRef.current !== thisRequestId) return;

      await logError({
        type: "ACCOUNTING",
        message: `Error fetching accounting data: ${error instanceof Error ? error.message : String(error)}`,
      });
      addNotification("Failed to load accounting data", "ERROR");
    } finally {
      if (requestIdRef.current === thisRequestId) {
        setLoading(false);
      }
    }
  }, [
    addNotification,
    typeFilter,
    categoryFilter,
    searchQueryDebounced,
    currentBranch?.id,
    datePreset,
    customStartDate,
    customEndDate,
    hasAnalyticsAccess,
    page,
    paymentMethodFilter,
    sortBy,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchQueryDebounced(searchQuery);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [
    typeFilter,
    categoryFilter,
    searchQueryDebounced,
    paymentMethodFilter,
    datePreset,
    sortBy,
  ]);

  // --- Report Data Fetching ---
  const fetchReportData = useCallback(async () => {
    if (!hasAnalyticsAccess) return;
    const thisRequestId = ++reportRequestIdRef.current;
    setReportsLoading(true);
    try {
      const [trendResult, breakdownResult, cashFlowResult] = await Promise.all([
        getRevenueExpenseTrend({
          datePreset,
          startDate: datePreset === "custom" ? customStartDate : undefined,
          endDate: datePreset === "custom" ? customEndDate : undefined,
          branchId: currentBranch?.id ?? undefined,
        }),
        getExpenseBreakdown({
          datePreset,
          startDate: datePreset === "custom" ? customStartDate : undefined,
          endDate: datePreset === "custom" ? customEndDate : undefined,
          branchId: currentBranch?.id ?? undefined,
        }),
        getCashFlowSummary({
          datePreset,
          startDate: datePreset === "custom" ? customStartDate : undefined,
          endDate: datePreset === "custom" ? customEndDate : undefined,
          branchId: currentBranch?.id ?? undefined,
        }),
      ]);
      if (reportRequestIdRef.current !== thisRequestId) return;

      if (trendResult.success && trendResult.data)
        setTrendData(trendResult.data);
      if (breakdownResult.success && breakdownResult.data)
        setExpenseBreakdown(breakdownResult.data);
      if (cashFlowResult.success && cashFlowResult.data)
        setCashFlowData(cashFlowResult.data);
    } catch (error) {
      if (reportRequestIdRef.current !== thisRequestId) return;
      await logError({
        type: "ACCOUNTING",
        message: `Error fetching report data: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      if (reportRequestIdRef.current === thisRequestId)
        setReportsLoading(false);
    }
  }, [
    hasAnalyticsAccess,
    datePreset,
    customStartDate,
    customEndDate,
    currentBranch?.id,
  ]);

  useEffect(() => {
    if (activeTab === "reports") {
      fetchReportData();
    }
  }, [activeTab, fetchReportData]);

  const projectionResult = useMemo(() => {
    if (trendData.length < 3) return null;
    const points: ProjectionDataPoint[] = trendData.map((d) => ({
      period: d.period,
      revenue: d.revenue,
      expenses: d.expenses,
    }));
    const periodsToProject = Math.min(Math.ceil(trendData.length / 2), 6);
    return computeLinearProjection(points, periodsToProject);
  }, [trendData]);

  // --- Trash Data Fetching ---
  const fetchTrashData = useCallback(async () => {
    const thisRequestId = ++trashRequestIdRef.current;
    setTrashLoading(true);
    try {
      const result = await getLedgerEntries({
        filters: {
          voided_only: true,
          search: trashSearch || undefined,
        },
        datePreset: trashDatePreset,
        startDate:
          trashDatePreset === "custom" ? trashCustomStartDate : undefined,
        endDate: trashDatePreset === "custom" ? trashCustomEndDate : undefined,
        branchId: currentBranch?.id,
        page: trashPage,
        pageSize: PAGE_SIZE,
      });

      if (trashRequestIdRef.current !== thisRequestId) return;

      if (result.success) {
        setTrashEntries(result.data.data);
        setTrashTotal(result.data.total);
      } else {
        addNotification(
          result.error || "Failed to load trashed entries",
          "ERROR",
        );
      }
    } catch (error) {
      if (trashRequestIdRef.current !== thisRequestId) return;
      await logError({
        type: "ACCOUNTING",
        message: `Error fetching trashed entries: ${error instanceof Error ? error.message : String(error)}`,
      });
      addNotification("Failed to load trashed entries", "ERROR");
    } finally {
      if (trashRequestIdRef.current === thisRequestId) {
        setTrashLoading(false);
      }
    }
  }, [
    trashSearch,
    trashDatePreset,
    trashCustomStartDate,
    trashCustomEndDate,
    currentBranch?.id,
    trashPage,
    addNotification,
  ]);

  useEffect(() => {
    if (activeTab === "trash" && isAdmin) {
      fetchTrashData();
    }
  }, [activeTab, isAdmin, fetchTrashData]);

  // --- Export Handler ---
  const handleExport = async (config: ExportConfig) => {
    try {
      const result = await exportLedger({
        exportType: config.scope,
        format: config.format === "xlsx" ? "excel" : config.format,
        datePreset:
          config.datePreset === "custom" ? undefined : config.datePreset,
        startDate: config.startDate
          ? safeToISOString(config.startDate)
          : undefined,
        endDate: config.endDate ? safeToISOString(config.endDate) : undefined,
        filters: {
          entry_type: typeFilter || undefined,
          category: categoryFilter || undefined,
        },
      });

      if (!result.success) {
        addNotification(result.error || "Export failed", "ERROR");
        return;
      }

      const binaryString = atob(result.data.content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: result.data.mimeType });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = result.data.filename || `ledger.${config.format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      addNotification(
        `Exported ${config.scope.replace("_", " ")} as ${config.format.toUpperCase()}`,
        "SUCCESS",
      );
    } catch (error) {
      await logError({
        type: "ACCOUNTING",
        message: `Export error: ${error instanceof Error ? error.message : String(error)}`,
      });
      addNotification("An unexpected error occurred during export", "ERROR");
    }
  };

  // --- Import Handler ---
  const handleImport = useCallback(
    async (data: AccountingImportRow[], defaultBranchId: string | null) => {
      try {
        const result = await importAccountingEntries(
          data,
          userInfo?.id || "",
          defaultBranchId,
        );

        if (result.success) {
          addNotification(
            `Successfully imported ${result.created} entries`,
            "SUCCESS",
          );
          fetchData();
          return { success: true };
        } else {
          return {
            success: false,
            error: result.errors.join("\n"),
          };
        }
      } catch (error) {
        await logError({
          type: "ACCOUNTING",
          message: `Import error: ${error instanceof Error ? error.message : String(error)}`,
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : "Import failed",
        };
      }
    },
    [addNotification, fetchData, userInfo?.id],
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <PageHeader
        title="Accounting"
        description="General Ledger & Financial Records"
        icon={<BookOpenIcon className="w-6 h-6" />}
        actions={
          <>
            {isAdmin && (
              <Link
                href="/accounting/categories"
                className="flex items-center gap-1.5 px-2 md:px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-md transition-colors border-2 border-purple-500/30 cursor-pointer"
              >
                <TagsIcon className="w-4 h-4" />
                <span className="text-xs sm:text-sm font-medium">
                  Categories
                </span>
              </Link>
            )}
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-2 md:px-3 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded-md transition-colors border-2 border-orange-500/30 cursor-pointer"
            >
              <UploadIcon className="w-4 h-4" />
              <span className="text-xs sm:text-sm font-medium">Import CSV</span>
            </button>
            <FlagGate requiredFlag="accounting_access">
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-2 md:px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-md transition-colors border-2 border-green-500/30 cursor-pointer"
              >
                <PlusIcon className="w-4 h-4" />
                <span className="text-xs sm:text-sm font-medium">
                  Add Entry
                </span>
              </button>
            </FlagGate>
            <button
              onClick={() => setShowExportModal(true)}
              disabled={loading || entries.length === 0}
              className="flex items-center gap-1.5 px-2 md:px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2 border-blue-500/30 cursor-pointer"
            >
              <DownloadIcon className="w-4 h-4" />
              <span className="text-xs sm:text-sm font-medium">Export</span>
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 bg-card hover:bg-muted rounded-md transition-colors disabled:opacity-50 border-2 border-border cursor-pointer"
              title="Refresh"
            >
              <RefreshCwIcon
                className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </>
        }
      />

      {/* Tab Bar */}
      <div className="flex flex-row items-center gap-2 border-b-2 border-border pb-2 mb-4">
        <button
          onClick={() => setActiveTab("ledger")}
          className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
            activeTab === "ledger"
              ? "bg-card text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <BookOpenIcon className="w-4 h-4" />
          Ledger
        </button>
        {hasAnalyticsAccess && (
          <button
            onClick={() => setActiveTab("reports")}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
              activeTab === "reports"
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <FileTextIcon className="w-4 h-4" />
            Reports
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => setActiveTab("trash")}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
              activeTab === "trash"
                ? "bg-red-500/20 text-red-300 border border-red-500/30"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Trash2Icon className="w-4 h-4" />
            Trash
          </button>
        )}
      </div>

      {activeTab === "ledger" && (
        <>
          <div className="space-y-4">
            {/* Filters */}
            <FilterBar>
              <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-xs">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full pl-9 pr-4 py-2 bg-card rounded-md border-2 border-border focus:border-border outline-none transition-all text-foreground placeholder:text-muted-foreground/70 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <FilterIcon className="w-4 h-4 text-muted-foreground" />
                <select
                  value={typeFilter}
                  onChange={(e) =>
                    setTypeFilter(e.target.value as LedgerEntryType | "")
                  }
                  className="bg-card hover:bg-muted transition-colors px-3 py-2 rounded-md text-sm cursor-pointer border-2 border-border"
                >
                  <option value="">All Types</option>
                  {ENTRY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-card hover:bg-muted transition-colors px-3 py-2 rounded-md text-sm cursor-pointer border-2 border-border"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <select
                value={paymentMethodFilter}
                onChange={(e) =>
                  setPaymentMethodFilter(
                    e.target.value as AccountingPaymentMethod | "",
                  )
                }
                className="bg-card hover:bg-muted transition-colors px-3 py-2 rounded-md text-sm cursor-pointer border-2 border-border"
              >
                <option value="">All Payment Methods</option>
                {ACCOUNTING_PAYMENT_METHODS.map((method) => (
                  <option key={method.key} value={method.key}>
                    {method.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                <select
                  value={datePreset}
                  onChange={(e) =>
                    setDatePreset(e.target.value as DateRangePreset)
                  }
                  className="bg-card hover:bg-muted transition-colors px-3 py-2 rounded-md text-sm cursor-pointer border-2 border-border"
                >
                  {[
                    { key: "all", label: "All Time" },
                    { key: "today", label: "Today" },
                    { key: "this_week", label: "This Week" },
                    { key: "this_month", label: "This Month" },
                    { key: "this_year", label: "This Year" },
                    { key: "custom", label: "Custom Range" },
                  ].map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
              {datePreset === "custom" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-2 py-1 bg-card border-2 border-border rounded-md text-sm focus:border-border outline-none"
                  />
                  <span className="text-muted-foreground/70">to</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-2 py-1 bg-card border-2 border-border rounded-md text-sm focus:border-border outline-none"
                  />
                  <button
                    onClick={fetchData}
                    disabled={!customStartDate || !customEndDate}
                    className="px-3 py-1 bg-blue-300/30 hover:bg-blue-300/50 text-foreground text-sm font-bold rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-2 border-border cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <ArrowUpDownIcon className="w-4 h-4 text-muted-foreground" />
                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(e.target.value as "entry_date" | "created_at")
                  }
                  className="bg-card hover:bg-muted transition-colors px-3 py-2 rounded-md text-sm cursor-pointer border-2 border-border"
                >
                  <option value="entry_date">Date (entry)</option>
                  <option value="created_at">Date Added</option>
                </select>
              </div>
            </FilterBar>

            {/* Summary Cards */}
            <FlagGate requiredFlag="accounting_analytics_view">
              {summary && (
                <StatsGrid columns={{ mobile: 2, tablet: 3, desktop: 6 }}>
                  <StatCard
                    label="Total Revenue"
                    value={`${currencySymbol}${summary.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    color="success"
                  />
                  <StatCard
                    label="Total Expenses"
                    value={`${currencySymbol}${summary.expenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    color="danger"
                  />
                  <StatCard
                    label={summary.net_income >= 0 ? "Net Income" : "Net Loss"}
                    value={`${summary.net_income >= 0 ? "+" : "-"}${currencySymbol}${Math.abs(summary.net_income).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    color={summary.net_income >= 0 ? "success" : "danger"}
                  />
                  <StatCard label="Total Entries" value={total} />
                  <StatCard
                    label="Total Credits"
                    value={`${currencySymbol}${summary.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    color="success"
                  />
                  <StatCard
                    label="Total Debits"
                    value={`${currencySymbol}${summary.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    color="danger"
                  />
                </StatsGrid>
              )}
            </FlagGate>

            {/* Account Type Breakdown */}
            {summary && summary.by_type && summary.by_type.length > 0 && (
              <div className="bg-muted border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Breakdown by Account Type
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {summary.by_type.map((bt) => {
                    const naturalSide = NATURAL_BALANCE[bt.type] || "debit";
                    const net =
                      naturalSide === "credit"
                        ? bt.credit - bt.debit
                        : bt.debit - bt.credit;
                    const isPositive = net >= 0;
                    return (
                      <div key={bt.type} className="bg-muted rounded-md p-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${ENTRY_TYPE_COLORS[bt.type]}`}
                        >
                          {bt.type}
                        </span>
                        <p
                          className={`text-lg font-bold mt-2 ${isPositive ? "text-green-300" : "text-red-300"}`}
                        >
                          {currencySymbol}
                          {Math.abs(net).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          DR {currencySymbol}
                          {bt.debit.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}{" "}
                          | CR {currencySymbol}
                          {bt.credit.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Payment Method Breakdown — gated behind accounting_analytics_view */}
            {hasAnalyticsAccess && detailBreakdown &&
              detailBreakdown.by_payment_method.length > 0 && (
                <PaymentMethodDrilldown
                  breakdown={detailBreakdown.by_payment_method}
                  currencySymbol={currencySymbol}
                  onCategoryClick={(method, category, entryType) => {
                    setPaymentMethodFilter(
                      method === "UNSPECIFIED"
                        ? ""
                        : (method as AccountingPaymentMethod | ""),
                    );
                    setCategoryFilter(
                      category === "Uncategorized" ? "" : category,
                    );
                    setTypeFilter(entryType);
                    setPage(1);
                  }}
                />
              )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1} -{" "}
                {Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 bg-card hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 bg-card hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Ledger Table */}
          <div className="bg-muted rounded-lg border border-border relative shrink-0 overflow-x-scroll mb-4">
            <table className="min-w-max w-full table-auto border-collapse">
              <thead className="sticky top-0 bg-black/80 z-10">
                <tr className="text-nowrap select-none">
                  <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Date{sortBy === "entry_date" && " ▼"}
                  </th>
                  {sortBy === "created_at" && (
                    <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                      Date Added ▼
                    </th>
                  )}
                  <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Type
                  </th>
                  <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Payment Type
                  </th>
                  <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Category
                  </th>
                  <th className="text-right px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Debit
                  </th>
                  <th className="text-right px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Credit
                  </th>
                  <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Description
                  </th>
                  <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Reference
                  </th>
                  <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Branch
                  </th>
                  <th className="text-center px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Proof
                  </th>
                  <th className="text-right px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Staff Cut
                  </th>
                  <th className="text-right px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Shop Cut
                  </th>
                  {isAdmin && (
                    <th className="text-center px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={
                        isAdmin
                          ? PAGE_COLUMNS.admin
                          : PAGE_COLUMNS.base
                      }
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <LoaderCircleIcon className="w-8 h-8 animate-spin" />
                        <p>Loading entries...</p>
                      </div>
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={
                        isAdmin
                          ? PAGE_COLUMNS.admin
                          : PAGE_COLUMNS.base
                      }
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <BookOpenIcon className="w-8 h-8 opacity-20" />
                        <p>No entries found</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className={`border-b border-border hover:bg-muted ${entry.is_voided ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-2 text-sm text-foreground">
                        <button
                          onClick={() => setViewingEntry(entry)}
                          className="inline-flex items-center gap-1.5 hover:text-blue-400 transition-colors"
                          title="View entry"
                        >
                          <EyeIcon className="w-3.5 h-3.5" />
                          {safeFormatDate(entry.entry_date)}
                        </button>
                      </td>
                      {sortBy === "created_at" && (
                        <td className="px-4 py-2 text-sm text-muted-foreground">
                          {safeFormatDate(entry.created_at)}
                        </td>
                      )}
                      <td className="px-4 py-2 text-sm">
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${ENTRY_TYPE_COLORS[entry.entry_type]}`}
                        >
                          {entry.entry_type}
                          {entry.is_voided && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-400/20 text-red-300 text-xs font-semibold border border-red-400/30">
                              VOIDED
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {entry.payment_method ? (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded border ${ACCOUNTING_PAYMENT_METHOD_COLORS[entry.payment_method]}`}
                          >
                            {getAccountingPaymentMethodLabel(
                              entry.payment_method,
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/70">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-foreground">
                        {entry.category || (
                          <span className="text-muted-foreground/70">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-red-300">
                        {Number(entry.debit) > 0
                          ? `${currencySymbol}${Number(entry.debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : "-"}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-green-300">
                        {Number(entry.credit) > 0
                          ? `${currencySymbol}${Number(entry.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : "-"}
                      </td>
                      <td
                        className={`px-4 py-2 text-sm text-foreground max-w-xs truncate ${entry.is_voided ? "line-through" : ""}`}
                      >
                        {entry.description}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {entry.reference || (
                          <span className="text-muted-foreground/70">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {entry.branch_id
                          ? branchNameMap[entry.branch_id] || "Unknown"
                          : "Shared"}
                      </td>
                      <td className="px-4 py-2 text-sm text-center">
                        {entry.proof_url ? (
                          <a
                            href={entry.proof_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <PaperclipIcon className="w-4 h-4 inline" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground/70">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-green-300">
                        {(() => {
                          const val = Number(entry.staff_cut);
                          return !isNaN(val) &&
                            entry.staff_cut !== undefined &&
                            entry.staff_cut !== null ? (
                            `${currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          ) : (
                            <span className="text-muted-foreground/70">—</span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-red-300">
                        {(() => {
                          const val = Number(entry.shop_cut);
                          return !isNaN(val) &&
                            entry.shop_cut !== undefined &&
                            entry.shop_cut !== null ? (
                            `${currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          ) : (
                            <span className="text-muted-foreground/70">—</span>
                          );
                        })()}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2 text-sm text-center">
                          <div className="flex items-center justify-center gap-2">
                            <AdminActionGuard
                              onAction={() => setEditingEntry(entry)}
                            >
                              <button
                                className="text-blue-400 hover:text-blue-300"
                                title="Edit entry"
                              >
                                <PencilIcon className="w-4 h-4" />
                              </button>
                            </AdminActionGuard>
                            <AdminActionGuard
                              onAction={() => setShowDeleteModal(entry)}
                            >
                              <button
                                className="text-red-400 hover:text-red-300 flex items-center gap-1"
                                title="Void entry"
                              >
                                <Trash2Icon className="w-4 h-4" />
                                <span className="text-xs">Void</span>
                              </button>
                            </AdminActionGuard>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "reports" && (
        <div className="flex-1 min-h-0 overflow-auto space-y-4 mb-4 mt-4">
          {/* Trial Balance — visible to all accounting_access users */}
          {trialBalanceData.length > 0 ? (
            <TrialBalance
              data={trialBalanceData}
              currencySymbol={currencySymbol}
            />
          ) : (
            <div className="bg-muted border border-border rounded-lg p-4 text-center">
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
                <BarChartIcon className="w-6 h-6 opacity-20" />
                <p className="text-sm">
                  No trial balance data for selected period
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Try a different date range
                </p>
              </div>
            </div>
          )}

          {/* Enhanced Report Charts — gated behind accounting_analytics_view */}
          <FlagGate requiredFlag="accounting_analytics_view">
            {reportsLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoaderCircleIcon className="w-8 h-8 animate-spin text-muted-foreground/70" />
              </div>
            ) : (
              <>
                {/* Section 1: Revenue vs Expense Trend */}
                <AccountingTrendChart
                  data={trendData as unknown as Record<string, unknown>[]}
                  lines={[
                    { dataKey: "revenue", color: "#4ade80", name: "Revenue" },
                    { dataKey: "expenses", color: "#ef4444", name: "Expenses" },
                  ]}
                  xAxisKey="period"
                  currencySymbol={currencySymbol}
                  title="Revenue vs Expense Trend"
                />

                {/* Section 2: Net Income/Loss Trend */}
                <AccountingTrendChart
                  data={trendData as unknown as Record<string, unknown>[]}
                  lines={[
                    {
                      dataKey: "net_income",
                      color: "#3b82f6",
                      name: "Net Income",
                    },
                  ]}
                  xAxisKey="period"
                  currencySymbol={currencySymbol}
                  title="Net Income/Loss Trend"
                />

                {/* Section 3 + 5: Side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <AccountingBreakdownChart
                    data={
                      expenseBreakdown as unknown as Record<string, unknown>[]
                    }
                    type="bar"
                    valueKey="amount"
                    labelKey="category"
                    currencySymbol={currencySymbol}
                    title="Expense Breakdown by Category"
                  />
                  <AccountingBreakdownChart
                    data={(() => {
                      const accountTypes: {
                        category: string;
                        amount: number;
                      }[] = [
                        { category: "ASSET", amount: 0 },
                        { category: "LIABILITY", amount: 0 },
                        { category: "EQUITY", amount: 0 },
                        { category: "REVENUE", amount: 0 },
                        { category: "EXPENSE", amount: 0 },
                      ];
                      if (summary?.by_type) {
                        const map = new Map(
                          accountTypes.map((t) => [t.category, t]),
                        );
                        for (const bt of summary.by_type) {
                          const naturalSide =
                            NATURAL_BALANCE[bt.type] || "debit";
                          const net =
                            naturalSide === "credit"
                              ? bt.credit - bt.debit
                              : bt.debit - bt.credit;
                          const existing = map.get(bt.type);
                          if (existing) existing.amount = Math.abs(net);
                        }
                      }
                      return accountTypes.filter((t) => t.amount > 0);
                    })()}
                    type="pie"
                    valueKey="amount"
                    labelKey="category"
                    currencySymbol={currencySymbol}
                    title="Account Type Distribution"
                    colorMap={{
                      ASSET: "#3b82f6",
                      LIABILITY: "#f97316",
                      EQUITY: "#8b5cf6",
                      REVENUE: "#22c55e",
                      EXPENSE: "#ef4444",
                    }}
                  />
                </div>

                {/* Section 4: Revenue vs Expense Comparison (grouped bar) */}
                <AccountingTrendChart
                  data={trendData as unknown as Record<string, unknown>[]}
                  lines={[
                    { dataKey: "revenue", color: "#4ade80", name: "Revenue" },
                    { dataKey: "expenses", color: "#ef4444", name: "Expenses" },
                  ]}
                  xAxisKey="period"
                  currencySymbol={currencySymbol}
                  title="Revenue vs Expense Comparison"
                  height={280}
                />

                {/* Section 6: Cash Flow Summary */}
                {cashFlowData && (
                  <CashFlowSummary
                    inflow={cashFlowData.inflow}
                    outflow={cashFlowData.outflow}
                    net={cashFlowData.net}
                    currencySymbol={currencySymbol}
                  />
                )}

                {/* Section 7: Period Projection */}
                {projectionResult ? (
                  <PeriodProjection
                    historicalData={projectionResult.historical}
                    projectedData={projectionResult.projected}
                    currencySymbol={currencySymbol}
                  />
                ) : (
                  <PeriodProjection
                    historicalData={
                      trendData.length > 0
                        ? trendData.map((d) => ({
                            period: d.period,
                            revenue: d.revenue,
                            expenses: d.expenses,
                          }))
                        : []
                    }
                    projectedData={[]}
                    currencySymbol={currencySymbol}
                  />
                )}
              </>
            )}
          </FlagGate>
        </div>
      )}

      {activeTab === "trash" && isAdmin && (
        <div className="flex-1 min-h-0 overflow-auto space-y-4 mb-4 mt-4">
          {/* Trash Filters */}
          <FilterBar>
            <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-xs">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 w-4 h-4" />
              <input
                type="text"
                placeholder="Search trashed entries..."
                className="w-full pl-9 pr-4 py-2 bg-card rounded-md border-2 border-border focus:border-border outline-none transition-all text-foreground placeholder:text-muted-foreground/70 text-sm"
                value={trashSearch}
                onChange={(e) => setTrashSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-muted-foreground" />
              <select
                value={trashDatePreset}
                onChange={(e) =>
                  setTrashDatePreset(e.target.value as DateRangePreset)
                }
                className="bg-card hover:bg-muted transition-colors px-3 py-2 rounded-md text-sm cursor-pointer border-2 border-border"
              >
                {[
                  { key: "all", label: "All Time" },
                  { key: "today", label: "Today" },
                  { key: "this_week", label: "This Week" },
                  { key: "this_month", label: "This Month" },
                  { key: "this_year", label: "This Year" },
                  { key: "custom", label: "Custom Range" },
                ].map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            {trashDatePreset === "custom" && (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={trashCustomStartDate}
                  onChange={(e) => setTrashCustomStartDate(e.target.value)}
                  className="px-2 py-1 bg-card border-2 border-border rounded-md text-sm focus:border-border outline-none"
                />
                <span className="text-muted-foreground/70">to</span>
                <input
                  type="date"
                  value={trashCustomEndDate}
                  onChange={(e) => setTrashCustomEndDate(e.target.value)}
                  className="px-2 py-1 bg-card border-2 border-border rounded-md text-sm focus:border-border outline-none"
                />
              </div>
            )}
          </FilterBar>

          {/* Trash Info */}
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-300">
            {trashTotal} voided {trashTotal === 1 ? "entry" : "entries"}.
            Restoring an entry makes it active again in the ledger.
          </div>

          {/* Trash Table */}
          <div className="overflow-x-auto">
            <table className="min-w-max w-full table-auto border-collapse relative">
              <thead className="sticky top-0 bg-black/80 z-10">
                <tr className="text-nowrap select-none">
                  <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Date
                  </th>
                  <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Type
                  </th>
                  <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Category
                  </th>
                  <th className="text-right px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Debit
                  </th>
                  <th className="text-right px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Credit
                  </th>
                  <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Description
                  </th>
                  <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Voided At
                  </th>
                  <th className="text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Void Reason
                  </th>
                  <th className="text-center px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {trashLoading ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      <LoaderCircleIcon className="w-8 h-8 animate-spin mx-auto" />
                      <p className="mt-2">Loading trashed entries...</p>
                    </td>
                  </tr>
                ) : trashEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      <Trash2Icon className="w-8 h-8 opacity-20 mx-auto" />
                      <p className="mt-2">No voided entries</p>
                    </td>
                  </tr>
                ) : (
                  trashEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-border opacity-60 hover:opacity-80 transition-opacity"
                    >
                      <td className="px-4 py-2 text-sm text-foreground">
                        {safeFormatDate(entry.entry_date)}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${ENTRY_TYPE_COLORS[entry.entry_type]}`}
                        >
                          {entry.entry_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-foreground">
                        {entry.category || (
                          <span className="text-muted-foreground/70">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-red-300">
                        {Number(entry.debit) > 0
                          ? `${currencySymbol}${Number(entry.debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : "-"}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-green-300">
                        {Number(entry.credit) > 0
                          ? `${currencySymbol}${Number(entry.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : "-"}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground line-through max-w-xs truncate">
                        {entry.description}
                      </td>
                      <td className="px-4 py-2 text-sm text-red-300">
                        {entry.voided_at
                          ? safeFormatDate(entry.voided_at)
                          : "-"}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground max-w-xs truncate">
                        {entry.void_reason || "-"}
                      </td>
                      <td className="px-4 py-2 text-sm text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={async () => {
                              const result = await restoreLedgerEntry(entry.id);
                              if (result.success) {
                                addNotification(
                                  "Entry restored successfully",
                                  "SUCCESS",
                                );
                                fetchTrashData();
                                fetchData();
                              } else {
                                addNotification(
                                  result.error || "Failed to restore entry",
                                  "ERROR",
                                );
                              }
                            }}
                            className="text-yellow-400 hover:text-yellow-300 transition-colors"
                            title="Restore entry"
                          >
                            <ArchiveRestoreIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setShowHardDeleteModal(entry)}
                            className="text-red-500 hover:text-red-400 transition-colors"
                            title="Delete permanently"
                          >
                            <Trash2Icon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Trash Pagination */}
          {Math.ceil(trashTotal / PAGE_SIZE) > 1 && (
            <div className="flex items-center justify-between py-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Showing {(trashPage - 1) * PAGE_SIZE + 1} -{" "}
                {Math.min(trashPage * PAGE_SIZE, trashTotal)} of {trashTotal}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTrashPage((p) => Math.max(1, p - 1))}
                  disabled={trashPage === 1}
                  className="px-3 py-1 bg-card hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-muted-foreground">
                  Page {trashPage} of {Math.ceil(trashTotal / PAGE_SIZE)}
                </span>
                <button
                  onClick={() =>
                    setTrashPage((p) =>
                      Math.min(Math.ceil(trashTotal / PAGE_SIZE), p + 1),
                    )
                  }
                  disabled={trashPage === Math.ceil(trashTotal / PAGE_SIZE)}
                  className="px-3 py-1 bg-card hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Entry Modal */}
      <AnimatePresence>
        {(showAddModal || editingEntry) && (
          <EntryModal
            entry={editingEntry}
            currencySymbol={currencySymbol}
            categories={categories}
            viewOnly={false}
            onClose={() => {
              setShowAddModal(false);
              setEditingEntry(null);
            }}
            onSuccess={(details) => {
              setShowAddModal(false);
              setEditingEntry(null);
              fetchData();
              addNotification(
                `${details.isUpdate ? "Entry updated" : "Entry created"} — ${details.description} on ${safeFormatDate(details.date)}`,
                "SUCCESS",
              );
            }}
            isAdmin={isAdmin}
          />
        )}

        {/* View Entry Modal */}
        {viewingEntry && (
          <EntryModal
            entry={viewingEntry}
            currencySymbol={currencySymbol}
            categories={categories}
            viewOnly={true}
            onClose={() => {
              setViewingEntry(null);
            }}
            onSuccess={() => {
              setViewingEntry(null);
            }}
            isAdmin={isAdmin}
          />
        )}
      </AnimatePresence>

      {/* Import CSV Modal */}
      <CSVImportModal<AccountingImportRow>
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
        columns={accountingCSVColumns}
        title="Import Accounting Entries"
        description="Upload a CSV file with accounting entries. Required columns: Date, Type, Description."
        defaultBranchId={currentBranch?.id}
      />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <DeleteModal
            entry={showDeleteModal}
            onClose={() => setShowDeleteModal(null)}
            onConfirm={async (reason) => {
              const result = await voidLedgerEntry(showDeleteModal.id, reason);
              if (result.success) {
                addNotification("Entry voided successfully", "SUCCESS");
                fetchData();
              } else {
                addNotification(
                  result.error || "Failed to void entry",
                  "ERROR",
                );
              }
              setShowDeleteModal(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Hard Delete Confirmation Modal */}
      <AnimatePresence>
        {showHardDeleteModal && (
          <HardDeleteModal
            entry={showHardDeleteModal}
            onClose={() => setShowHardDeleteModal(null)}
            onConfirm={async () => {
              const result = await hardDeleteLedgerEntry(
                showHardDeleteModal.id,
              );
              if (result.success) {
                addNotification("Entry permanently deleted", "SUCCESS");
                fetchTrashData();
              } else {
                addNotification(
                  result.error || "Failed to permanently delete entry",
                  "ERROR",
                );
              }
              setShowHardDeleteModal(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Export Grouped Report Modal */}
      <ExportGroupingModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
      />
    </div>
  );
}

// ============================================
// Delete Modal Component
// ============================================

function DeleteModal({
  entry,
  onClose,
  onConfirm,
}: {
  entry: LedgerEntry;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    await onConfirm(reason);
    setLoading(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-500/20 rounded-full">
              <Trash2Icon className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Void Entry</h3>
              <p className="text-muted-foreground text-sm">
                This action cannot be undone
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-muted rounded-lg p-3 text-sm">
            <p>
              <span className="text-muted-foreground">Description:</span>{" "}
              <span className="text-foreground">{entry.description}</span>
            </p>
            <p className="mt-1">
              <span className="text-muted-foreground">Amount:</span>{" "}
              <span
                className={entry.debit > 0 ? "text-red-300" : "text-green-300"}
              >
                {entry.debit > 0
                  ? `Debit ${entry.debit.toFixed(2)}`
                  : `Credit ${entry.credit.toFixed(2)}`}
              </span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Reason for voiding *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason..."
              rows={2}
              className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none resize-none"
              required
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || !reason.trim()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2"
            >
              {loading && <LoaderCircleIcon className="w-4 h-4 animate-spin" />}
              Void Entry
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================
// Hard Delete Modal Component
// ============================================

function HardDeleteModal({
  entry,
  onClose,
  onConfirm,
}: {
  entry: LedgerEntry;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-red-500/30"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-500/30 rounded-full">
              <Trash2Icon className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-red-300">
                Delete Permanently
              </h3>
              <p className="text-red-400/80 text-sm">
                This action is irreversible. The entry will be removed from the
                database.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-red-500/10 rounded-lg p-3 text-sm border border-red-500/20">
            <p>
              <span className="text-muted-foreground">Description:</span>{" "}
              <span className="text-foreground line-through">
                {entry.description}
              </span>
            </p>
            <p className="mt-1">
              <span className="text-muted-foreground">Date:</span>{" "}
              <span className="text-foreground">
                {safeFormatDate(entry.entry_date)}
              </span>
            </p>
            <p className="mt-1">
              <span className="text-muted-foreground">Amount:</span>{" "}
              <span
                className={entry.debit > 0 ? "text-red-300" : "text-green-300"}
              >
                {entry.debit > 0
                  ? `Debit ${entry.debit.toFixed(2)}`
                  : `Credit ${entry.credit.toFixed(2)}`}
              </span>
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2"
            >
              {loading && <LoaderCircleIcon className="w-4 h-4 animate-spin" />}
              Delete Permanently
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
