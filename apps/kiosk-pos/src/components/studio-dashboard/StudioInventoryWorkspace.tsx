import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowUpRight,
  Download,
  Plus,
  Truck,
} from "lucide-react";
import { Label, Pie, PieChart } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type TransferRow = {
  id: string;
  from?: string;
  to?: string;
  items?: string;
  eta?: string;
  status?: string;
  requested?: boolean;
  origin?: string;
};

type SuggestionRow = {
  kiosk?: string;
  item?: string;
  qty?: string;
  cover?: string;
  reason?: string;
};

type InventoryRow = {
  item: string;
  category?: string;
  location?: string;
  locationKey?: string;
  stock?: number | string;
  unit?: string;
  reorder?: number | string;
  target?: number | string;
  critical?: number | string;
  stockPercent?: number | string;
  days?: number | string | null;
  supplier?: string;
  status?: string;
};

type SelectOption = {
  key: string;
  label: string;
};

type StudioInventoryWorkspaceProps = {
  ar: boolean;
  transfers: TransferRow[];
  suggestions: SuggestionRow[];
  filteredInv: InventoryRow[];
  categoryOptions: string[];
  locationOptions: SelectOption[];
  categoryFilter: string;
  locationFilter: string;
  filteredLowCount: number;
  filteredStockValue: number;
  filteredAvgDays: string;
  busyTransfer: string;
  transferActionBusy: string;
  onCategoryChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onExportInventory: () => void;
  onOpenTransferModal: () => void;
  onCreateSuggestedTransfer: (suggestion: SuggestionRow) => void;
  onOpenTransferForItem: (item: InventoryRow) => void;
  onAdvanceTransferStatus: (transfer: TransferRow, action: TransferAction) => void;
  getNextTransferAction: (status?: string) => TransferAction | null;
  isDispatchedTransfer: (status?: string) => boolean;
};

type TransferAction = {
  label: string;
  action?: string;
  next?: string;
};

function statusClass(status?: string) {
  const normalized = String(status || "").toLowerCase();
  if (["done", "completed", "received"].includes(normalized)) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (["cancelled", "failed", "rejected"].includes(normalized)) {
    return "border-destructive/20 bg-destructive/10 text-destructive";
  }
  if (["approved", "picked", "dispatched", "draft", "created"].includes(normalized)) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-border bg-muted text-muted-foreground";
}

function inventoryTone(status?: string) {
  const normalized = String(status || "").toLowerCase();
  if (["crit", "critical", "empty"].includes(normalized)) return "critical";
  if (["low", "watch"].includes(normalized)) return "low";
  if (["unconfigured", "not_configured", "no_target"].includes(normalized)) return "unconfigured";
  return "healthy";
}

function isActionableInventoryTone(tone: string) {
  return tone === "critical" || tone === "low";
}

function formatIqd(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

const INVENTORY_AR_TERMS: Record<string, string> = {
  "Admin creates, warehouse dispatches, kiosk receives": "الإدارة تنشئ، المستودع يرسل، والكشك يستلم",
  "AI reads verified data": "الذكاء يقرأ بيانات موثقة",
  "All categories": "كل الفئات",
  "All locations": "كل المواقع",
  "Allocate": "تخصيص",
  "approved": "معتمد",
  "Approve": "اعتماد",
  "Baghdad Area Warehouse": "مستودع منطقة بغداد",
  "Baghdad Dairy": "ألبان بغداد",
  "Babel Roasters": "محمصة بابل",
  "Bakery": "المخبوزات",
  "Coffee": "القهوة",
  "Cold brew concentrate": "مركز كولد برو",
  "Chocolate - 70%": "شوكولاتة 70%",
  "Chocolate sauce 1L": "صوص شوكولاتة 1 لتر",
  "Condensed milk": "حليب مكثف",
  "Create transfer": "إنشاء تحويل",
  "Critical": "حرج",
  "Dairy": "الألبان",
  "Demo warehouse": "مستودع تجريبي",
  "Dispatch": "إرسال",
  "Drafting": "جار تجهيز المسودة",
  "Erbil Syrups": "شرابات أربيل",
  "Espresso beans - house": "حبوب إسبريسو البيت",
  "Export": "تصدير",
  "Healthy": "سليم",
  "Inventory health": "صحة المخزون",
  "Inventory ledger": "دفتر المخزون",
  "Item": "البند",
  "Kiosk stock needs": "احتياجات مخزون الأكشاك",
  "Location": "الموقع",
  "Low": "منخفض",
  "Main Warehouse": "المستودع الرئيسي",
  "Mesopotamia Foods": "أغذية الرافدين",
  "Milk": "حليب",
  "Milk (whole) 1L": "حليب كامل الدسم 1 لتر",
  "Milk 12 L": "حليب 12 لتر",
  "Mint - fresh": "نعناع طازج",
  "Mint 4 kg": "نعناع 4 كغم",
  "New transfer": "تحويل جديد",
  "No inventory rows match this filter": "لا توجد صفوف مخزون تطابق هذا الفلتر",
  "No kiosk needs a warehouse transfer right now.": "لا يوجد كشك يحتاج تحويل مستودع الآن.",
  "No warehouse transfers match this stock run.": "لا توجد تحويلات مستودع تطابق تشغيل المخزون هذا.",
  "Oat milk 1L": "حليب شوفان 1 لتر",
  "Oat milk 12 L": "حليب شوفان 12 لتر",
  "Packaging": "التغليف",
  "Pantry": "المخزن الجاف",
  "Pick": "تجهيز",
  "Pistachio paste": "معجون فستق",
  "Pistachio paste 5 kg": "معجون فستق 5 كغم",
  "Produce": "الخضار والفواكه",
  "Receive": "استلام",
  "Stock": "المخزون",
  "Stock value": "قيمة المخزون",
  "Sugar": "سكر",
  "Supplier": "المورد",
  "Syrups": "الشرابات",
  "Vanilla syrup 750ml": "شراب فانيلا 750 مل",
  "Tomorrow 07:00": "غدا 07:00",
  "Use this list to create warehouse-to-kiosk transfers": "استخدم هذه القائمة لإنشاء تحويلات من المستودع إلى الكشك",
  "Warehouse transfers": "تحويلات المستودع",
  "Working": "جار العمل",
  "average days of cover across the current filter": "متوسط أيام التغطية عبر الفلتر الحالي",
  "critical plus open variance": "حرج مع فرق مفتوح",
  "cups 400 pc": "أكواب 400 قطعة",
  "cups 600 pc": "أكواب 600 قطعة",
  "dispatched": "مرسل",
  "draft": "مسودة",
  "healthy": "سليم",
  "items": "بنود",
  "lemonade mix above forecast": "خلطة الليموناضة أعلى من التوقع",
  "lemons 12 kg": "ليمون 12 كغم",
  "low stock before evening rush": "مخزون منخفض قبل ضغط المساء",
  "picked": "مجهز",
  "received": "مستلم",
  "waiting kiosk": "بانتظار الكشك",
  "whole": "كامل الدسم",
};

function tInv(ar: boolean, en: string, arText: string) {
  return ar ? arText : en;
}

function localizeInventoryText(ar: boolean, value: unknown) {
  if (!ar || value == null) return value as React.ReactNode;
  let text = String(value);
  const exact = INVENTORY_AR_TERMS[text];
  if (exact) return exact;
  Object.entries(INVENTORY_AR_TERMS)
    .filter(([source]) => /[A-Za-z]/.test(source))
    .sort((a, b) => b[0].length - a[0].length)
    .forEach(([source, replacement]) => {
      const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = /^[A-Za-z0-9 ]+$/.test(source)
        ? new RegExp(`\\b${escaped}\\b`, "gi")
        : new RegExp(escaped, "g");
      text = text.replace(pattern, replacement);
    });
  return text
    .replace(/\bneed action\b/gi, "تحتاج إجراء")
    .replace(/\bitems\b/gi, "بنود")
    .replace(/\bdays\b/gi, "أيام")
    .replace(/\bday\b/gi, "يوم")
    .replace(/\bpage\b/gi, "صفحة");
}

function pageNumbersFor(currentPage: number, pageCount: number) {
  const safePageCount = Math.max(pageCount, 1);
  const start = Math.max(1, Math.min(currentPage - 1, safePageCount - 2));
  const end = Math.min(safePageCount, start + 2);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

const inventoryHealthChartConfig = {
  amount: {
    label: "Items",
  },
  critical: {
    color: "var(--crit)",
    label: "Critical",
  },
  healthy: {
    color: "var(--pos)",
    label: "Healthy",
  },
  low: {
    color: "var(--warn)",
    label: "Low",
  },
  unconfigured: {
    color: "var(--muted-foreground)",
    label: "No target",
  },
} satisfies ChartConfig;

function StudioTable<TData>({
  table,
  emptyLabel,
  className,
}: {
  table: ReturnType<typeof useReactTable<TData>>;
  emptyLabel: string;
  className?: string;
}) {
  return (
    <div className="h-full min-h-0 overflow-auto">
      <Table className={className}>
        <TableHeader className="sticky top-0 z-10 bg-card **:data-[slot='table-head']:h-10 **:data-[slot='table-head']:font-normal **:data-[slot='table-head']:text-foreground **:data-[slot='table-head']:text-xs">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-border/20 hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="**:data-[slot='table-cell']:py-3 **:data-[slot='table-row']:hover:bg-transparent">
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="border-border/15">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="border-border/15">
              <TableCell className="h-24 text-center text-muted-foreground" colSpan={table.getVisibleLeafColumns().length}>
                {emptyLabel}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function StudioInventoryWorkspace({
  ar,
  transfers,
  suggestions,
  filteredInv,
  categoryOptions,
  locationOptions,
  categoryFilter,
  locationFilter,
  filteredLowCount,
  filteredStockValue,
  filteredAvgDays,
  busyTransfer,
  transferActionBusy,
  onCategoryChange,
  onLocationChange,
  onExportInventory,
  onOpenTransferModal,
  onCreateSuggestedTransfer,
  onOpenTransferForItem,
  onAdvanceTransferStatus,
  getNextTransferAction,
  isDispatchedTransfer,
}: StudioInventoryWorkspaceProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  React.useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [categoryFilter, locationFilter]);

  // Open kiosk-initiated requests still awaiting warehouse action (not yet received).
  const openRequestCount = transfers.filter((transfer) =>
    transfer.requested
    && !["received", "done", "complete", "cancel", "cancelled"].includes(String(transfer.status || "").toLowerCase()),
  ).length;

  const inventorySummary = React.useMemo(() => {
    const healthy = filteredInv.filter((item) => inventoryTone(item.status) === "healthy").length;
    const low = filteredInv.filter((item) => inventoryTone(item.status) === "low").length;
    const critical = filteredInv.filter((item) => inventoryTone(item.status) === "critical").length;
    const total = Math.max(healthy + low + critical, 1);
    return {
      rows: [
        { key: "healthy", name: tInv(ar, "Healthy", "سليم"), amount: healthy, fill: "var(--pos)" },
        { key: "low", name: tInv(ar, "Low", "منخفض"), amount: low, fill: "var(--warn)" },
        { key: "critical", name: tInv(ar, "Critical", "حرج"), amount: critical, fill: "var(--crit)" },
      ],
      healthyPercent: Math.round((healthy / total) * 100),
      totalItems: healthy + low + critical,
    };
  }, [filteredInv]);
  const inventoryHealthRows = inventorySummary.totalItems
    ? inventorySummary.rows
    : [{ key: "healthy", name: tInv(ar, "Healthy", "سليم"), amount: 1, fill: "var(--pos)" }];

  const inventoryColumns = React.useMemo<ColumnDef<InventoryRow>[]>(
    () => [
      {
        accessorKey: "item",
        header: tInv(ar, "Item", "البند"),
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{localizeInventoryText(ar, row.original.item)}</div>
            <div className="text-muted-foreground text-xs">{localizeInventoryText(ar, row.original.category)}</div>
          </div>
        ),
      },
      {
        accessorKey: "location",
        header: tInv(ar, "Location", "الموقع"),
        cell: ({ row }) => <span className="text-muted-foreground">{localizeInventoryText(ar, row.original.location)}</span>,
      },
      {
        accessorKey: "stock",
        header: () => <div className="text-right">{tInv(ar, "Stock", "المخزون")}</div>,
        cell: ({ row }) => (
          <div className="text-right">
            <div className="font-mono">
              {row.original.stock} <span className="text-muted-foreground">{row.original.unit}</span>
            </div>
            {row.original.target ? (
              <div className="text-muted-foreground text-xs">
                {Number(row.original.stockPercent || 0).toLocaleString("en", { maximumFractionDigits: 1 })}% / {row.original.target} {row.original.unit}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "days",
        header: ar ? "التغطية" : "Cover",
        cell: ({ row }) => {
          const tone = inventoryTone(row.original.status);
          const days = Number(row.original.days);
          const hasDays = Number.isFinite(days) && days > 0;
          const pct = hasDays ? Math.min(days / 14, 1) : 0;
          return (
            <div className="flex min-w-32 items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    tone === "critical" && "bg-destructive",
                    tone === "low" && "bg-amber-500",
                    tone === "healthy" && "bg-primary",
                  )}
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
              <span
                className={cn(
                  "min-w-9 text-right font-mono text-xs",
                  tone === "critical" && "text-destructive",
                  tone === "low" && "text-amber-600 dark:text-amber-300",
                  tone === "healthy" && "text-muted-foreground",
                )}
              >
                {hasDays ? `${row.original.days}${ar ? "ي" : "d"}` : "-"}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "supplier",
        header: tInv(ar, "Supplier", "المورد"),
        cell: ({ row }) => <span className="text-muted-foreground">{localizeInventoryText(ar, row.original.supplier)}</span>,
      },
      {
        id: "action",
        header: "",
        cell: ({ row }) => {
          const tone = inventoryTone(row.original.status);
          return (
            <div className="flex justify-end">
              {isActionableInventoryTone(tone) ? (
                <Button onClick={() => onOpenTransferForItem(row.original)} size="xs" type="button" variant="outline">
                  <Truck data-icon="inline-start" />
                  {tInv(ar, "Allocate", "تخصيص")}
                </Button>
              ) : (
                <Badge variant="outline">{ar ? "جيد" : "OK"}</Badge>
              )}
            </div>
          );
        },
      },
    ],
    [ar, onOpenTransferForItem],
  );

  const inventoryTable = useReactTable({
    data: filteredInv,
    columns: inventoryColumns,
    state: {
      pagination,
      sorting,
    },
    getRowId: (row) => `${row.locationKey || row.location || "location"}-${row.item}`,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const pageCount = Math.max(inventoryTable.getPageCount(), 1);
  const currentPage = Math.min(inventoryTable.getState().pagination.pageIndex + 1, pageCount);
  const pageSize = inventoryTable.getState().pagination.pageSize;
  const showingStart = filteredInv.length ? inventoryTable.getState().pagination.pageIndex * pageSize + 1 : 0;
  const showingEnd = filteredInv.length
    ? Math.min(filteredInv.length, showingStart + inventoryTable.getRowModel().rows.length - 1)
    : 0;
  const pageNumbers = pageNumbersFor(currentPage, pageCount);

  return (
    <div className="grid min-h-[820px] grid-rows-[330px_minmax(440px,1fr)] gap-3">
      <div className="min-h-0 overflow-x-auto">
        <div className="grid h-full min-w-[1360px] grid-cols-[560px_minmax(380px,1fr)_minmax(380px,1fr)] gap-3">
        <Card className="account-allocation-card min-h-0" data-testid="inventory-health-card">
          <CardHeader>
            <CardTitle>{tInv(ar, "Inventory health", "صحة المخزون")}</CardTitle>
            <CardDescription>{formatIqd(filteredStockValue)} IQD {ar ? "قيمة مخزون حسب الحالة" : "stock value by status"}</CardDescription>
            <CardAction>
              {filteredLowCount > 0 ? (
                <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300" variant="outline">
                  {filteredLowCount} {ar ? "تحتاج إجراء" : "need action"}
                </Badge>
              ) : (
                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" variant="outline">
                  {ar ? "مستقر" : "Stable"}
                </Badge>
              )}
            </CardAction>
          </CardHeader>
          <CardContent className="account-allocation-content inventory-health-content px-5 pb-5 pt-2">
            <ChartContainer
              className="account-allocation-chart"
              config={inventoryHealthChartConfig}
              data-testid="inventory-health-chart"
            >
              <PieChart accessibilityLayer>
                <ChartTooltip
                  content={<ChartTooltipContent hideLabel className="w-40" nameKey="name" />}
                  cursor={false}
                />
                <Pie
                  cornerRadius={6}
                  data={inventoryHealthRows}
                  dataKey="amount"
                  endAngle={-270}
                  innerRadius={65}
                  isAnimationActive={false}
                  nameKey="name"
                  outerRadius={90}
                  paddingAngle={2}
                  startAngle={90}
                  stroke="var(--card)"
                  strokeWidth={1}
                >
                  <Label
                    content={({ viewBox }) => {
                      if (!(viewBox && "cx" in viewBox && "cy" in viewBox)) return null;
                      return (
                        <text dominantBaseline="middle" textAnchor="middle" x={viewBox.cx} y={viewBox.cy}>
                          <tspan className="account-allocation-center-label" x={viewBox.cx} y={(viewBox.cy || 0) - 8}>
                            {tInv(ar, "Healthy", "سليم")}
                          </tspan>
                          <tspan className="account-allocation-center-value" x={viewBox.cx} y={(viewBox.cy || 0) + 14}>
                            {inventorySummary.healthyPercent}%
                          </tspan>
                        </text>
                      );
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="account-allocation-list" data-testid="inventory-health-list">
              {inventorySummary.rows.map((item) => {
                const percentage = inventorySummary.totalItems ? (item.amount / inventorySummary.totalItems) * 100 : 0;
                return (
                  <div className="account-allocation-row" key={item.key}>
                    <div className="account-allocation-row-main">
                      <div className="account-allocation-name">
                        <span aria-hidden="true" className="account-allocation-dot" style={{ backgroundColor: item.fill }} />
                        <p>{item.name}</p>
                      </div>
                      <p className="account-allocation-amount">{item.amount} {ar ? "بنود" : "items"}</p>
                    </div>
                    <div className="account-allocation-percent">{percentage.toFixed(1)}%</div>
                  </div>
                );
              })}
              <div className="account-allocation-row border-t border-border/30 pt-2">
                <div className="account-allocation-row-main">
                  <div className="account-allocation-name">
                    <span aria-hidden="true" className="account-allocation-dot" style={{ backgroundColor: "var(--ink-3)" }} />
                    <p>{tInv(ar, "Stock value", "قيمة المخزون")}</p>
                  </div>
                  <p className="account-allocation-amount">{formatIqd(filteredStockValue)} IQD</p>
                </div>
                <div className="account-allocation-percent">{filteredAvgDays}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>{tInv(ar, "Warehouse transfers", "تحويلات المستودع")}</CardTitle>
            <CardDescription>{tInv(ar, "Admin creates, warehouse dispatches, kiosk receives", "الإدارة تنشئ، المستودع يرسل، والكشك يستلم")}</CardDescription>
            <CardAction>
              <div className="flex items-center gap-2">
                {openRequestCount > 0 ? (
                  <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300" variant="outline">
                    {openRequestCount === 1
                      ? tInv(ar, "1 open kiosk request", "طلب كشك مفتوح واحد")
                      : `${openRequestCount} ${tInv(ar, "open kiosk requests", "طلبات أكشاك مفتوحة")}`}
                  </Badge>
                ) : null}
                <Button onClick={onOpenTransferModal} size="sm" type="button" variant="outline">
                  <Plus data-icon="inline-start" />
                  {tInv(ar, "New transfer", "تحويل جديد")}
                </Button>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent className="min-h-0 overflow-auto px-0">
            <div className="divide-y divide-border/50">
              {transfers.length ? transfers.map((transfer) => {
                const action = getNextTransferAction(transfer.status);
                return (
                  <div
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3",
                      transfer.requested ? "bg-amber-500/5" : undefined,
                    )}
                    key={transfer.id}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate font-medium">{localizeInventoryText(ar, transfer.to)}</div>
                        {transfer.requested ? (
                          <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300" variant="outline">
                            {tInv(ar, "Kiosk request", "طلب كشك")}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="truncate text-muted-foreground text-xs">{localizeInventoryText(ar, transfer.from)} - {transfer.id}</div>
                      <div className="mt-1 truncate text-muted-foreground text-xs">{localizeInventoryText(ar, transfer.items)}</div>
                    </div>
                    <div className="flex min-w-[104px] flex-col items-end gap-1">
                      <Badge className={statusClass(transfer.status)} variant="outline">
                        {localizeInventoryText(ar, transfer.status)}
                      </Badge>
                      <span className="font-mono text-muted-foreground text-xs">{localizeInventoryText(ar, transfer.eta)}</span>
                      {isDispatchedTransfer(transfer.status) ? (
                        <span className="text-muted-foreground text-xs">{tInv(ar, "waiting kiosk", "بانتظار الكشك")}</span>
                      ) : null}
                      {action && !isDispatchedTransfer(transfer.status) ? (
                        <Button
                          disabled={transferActionBusy === transfer.id}
                          onClick={() => onAdvanceTransferStatus(transfer, action)}
                          size="xs"
                          type="button"
                          variant="outline"
                        >
                          {transferActionBusy === transfer.id ? tInv(ar, "Working", "جار العمل") : localizeInventoryText(ar, action.label)}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              }) : (
                <div className="px-4 py-10 text-center text-muted-foreground text-sm">
                  {tInv(ar, "No warehouse transfers match this stock run.", "لا توجد تحويلات مستودع تطابق تشغيل المخزون هذا.")}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>{tInv(ar, "Kiosk stock needs", "احتياجات مخزون الأكشاك")}</CardTitle>
            <CardDescription>{tInv(ar, "Use this list to create warehouse-to-kiosk transfers", "استخدم هذه القائمة لإنشاء تحويلات من المستودع إلى الكشك")}</CardDescription>
            <CardAction>
              <Badge variant="outline">{tInv(ar, "AI reads verified data", "الذكاء يقرأ بيانات موثقة")}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="min-h-0 overflow-auto px-0">
            <div className="divide-y divide-border/50">
              {suggestions.length ? suggestions.map((suggestion) => {
                const busyKey = `${suggestion.kiosk}-${suggestion.item}`;
                return (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3" key={busyKey}>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{localizeInventoryText(ar, suggestion.item)}</div>
                      <div className="truncate text-muted-foreground text-xs">{localizeInventoryText(ar, suggestion.kiosk)}</div>
                      <div className="mt-1 truncate text-muted-foreground text-xs">{localizeInventoryText(ar, suggestion.reason)}</div>
                    </div>
                    <div className="flex min-w-[96px] flex-col items-end gap-1">
                      <span className="font-mono text-sm">{localizeInventoryText(ar, suggestion.qty)}</span>
                      <span className="text-muted-foreground text-xs">{localizeInventoryText(ar, suggestion.cover)}</span>
                      <Button
                        disabled={busyTransfer === busyKey}
                        onClick={() => onCreateSuggestedTransfer(suggestion)}
                        size="xs"
                        type="button"
                        variant="outline"
                      >
                        <Truck data-icon="inline-start" />
                        {busyTransfer === busyKey ? tInv(ar, "Drafting", "جار تجهيز المسودة") : tInv(ar, "Create transfer", "إنشاء تحويل")}
                      </Button>
                    </div>
                  </div>
                );
              }) : (
                <div className="px-4 py-10 text-center text-muted-foreground text-sm">
                  {tInv(ar, "No kiosk needs a warehouse transfer right now.", "لا يوجد كشك يحتاج تحويل مستودع الآن.")}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>

      <Card className="min-h-0" data-testid="inventory-ledger-card">
        <CardHeader>
          <CardTitle>{tInv(ar, "Inventory ledger", "دفتر المخزون")}</CardTitle>
          <CardDescription>{filteredAvgDays} {ar ? "متوسط أيام التغطية عبر الفلتر الحالي" : "average days of cover across the current filter"}</CardDescription>
          <CardAction className="flex items-center gap-2">
            <Select onValueChange={onCategoryChange} value={categoryFilter}>
              <SelectTrigger className="w-40" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {categoryOptions.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category === "all" ? tInv(ar, "All categories", "كل الفئات") : localizeInventoryText(ar, category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={onLocationChange} value={locationFilter}>
              <SelectTrigger className="w-44" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {locationOptions.map((location) => (
                  <SelectItem key={location.key} value={location.key}>
                    {location.key === "all" ? tInv(ar, "All locations", "كل المواقع") : localizeInventoryText(ar, location.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={onExportInventory} size="sm" type="button" variant="outline">
              <Download data-icon="inline-start" />
              {tInv(ar, "Export", "تصدير")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-hidden px-0">
          <StudioTable className="min-w-[920px]" emptyLabel={tInv(ar, "No inventory rows match this filter", "لا توجد صفوف مخزون تطابق هذا الفلتر")} table={inventoryTable} />
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3">
          <div className="flex items-center gap-3 text-muted-foreground text-xs">
            <span>
              {ar ? `عرض ${showingStart}-${showingEnd} من ${filteredInv.length} صفوف مخزون` : `Showing ${showingStart}-${showingEnd} of ${filteredInv.length} stock rows`}
            </span>
            <span className="hidden items-center gap-1 lg:inline-flex">
              <ArrowUpRight className="size-3" />
              {ar ? "صفوف مخزون المحرك تستخدم نفس الإجراءات" : "Engine stock rows use the same actions"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">{ar ? "صفوف لكل صفحة" : "Rows per page"}</span>
              <Select
                onValueChange={(value) => inventoryTable.setPageSize(Number(value))}
                value={`${pageSize}`}
              >
                <SelectTrigger className="w-20" size="sm">
                  <SelectValue placeholder={pageSize} />
                </SelectTrigger>
                <SelectContent align="end" side="top">
                  <SelectGroup>
                    {[10, 20, 50].map((size) => (
                      <SelectItem key={size} value={`${size}`}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <span className="min-w-20 text-center font-medium text-xs">
              {ar ? `صفحة ${currentPage} من ${pageCount}` : `Page ${currentPage} of ${pageCount}`}
            </span>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent className="gap-1">
                <PaginationItem>
                  <PaginationPrevious
                    className={!inventoryTable.getCanPreviousPage() ? "pointer-events-none opacity-50" : undefined}
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      inventoryTable.previousPage();
                    }}
                    text={ar ? "السابق" : "Prev"}
                  />
                </PaginationItem>
                {pageNumbers.map((pageNumber) => (
                  <PaginationItem key={`inventory-page-${pageNumber}`}>
                    <PaginationLink
                      href="#"
                      isActive={currentPage === pageNumber}
                      onClick={(event) => {
                        event.preventDefault();
                        inventoryTable.setPageIndex(pageNumber - 1);
                      }}
                    >
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    className={!inventoryTable.getCanNextPage() ? "pointer-events-none opacity-50" : undefined}
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      inventoryTable.nextPage();
                    }}
                    text={ar ? "التالي" : "Next"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
