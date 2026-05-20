import { ArrowRight, Filter } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type WasteReason = {
  reason: string;
  value: number;
  category: string;
};

type WasteRow = {
  id: string;
  flagged?: boolean;
  time?: string;
  kiosk?: string;
  item?: string;
  qty?: number | string;
  cost?: number;
  reason?: string;
};

type StudioWasteWorkspaceProps = {
  ar: boolean;
  reasons: WasteReason[];
  wasteRows: WasteRow[];
};

const chartConfig = {
  value: { label: "Waste", color: "var(--crit)" },
} satisfies ChartConfig;

function formatMoney(value = 0) {
  return `IQD ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
}

const WASTE_AR_TERMS: Record<string, string> = {
  "All kiosks": "كل الأكشاك",
  "Broken packaging": "تغليف تالف",
  "Cost": "التكلفة",
  "Croissant - chocolate": "كرواسون شوكولاتة",
  "Croissant - plain": "كرواسون سادة",
  "End-of-day": "نهاية اليوم",
  "Espresso shot": "جرعة إسبريسو",
  "Flagged": "مؤشر",
  "Free samples": "عينات مجانية",
  "Iced latte": "لاتيه مثلج",
  "Investigation": "تحقيق",
  "Item": "البند",
  "Karrada Center": "مركز الكرادة",
  "Kiosk": "الكشك",
  "Milk": "حليب",
  "Missing stock": "مخزون مفقود",
  "No category": "لا توجد فئة",
  "No reasons": "لا توجد أسباب",
  "Overproduction": "إنتاج زائد",
  "Pistachio cake slice": "شريحة كيك الفستق",
  "Qty": "الكمية",
  "Quality reject": "رفض الجودة",
  "Reason": "السبب",
  "Review variance inputs": "مراجعة مدخلات الفرق",
  "Spillage": "انسكاب",
  "Spoiled fruit": "فاكهة تالفة",
  "Staff meals": "وجبات الموظفين",
  "Stale": "قديم",
  "Time": "الوقت",
  "Top risk": "أعلى خطر",
  "Turns into investigation when close variance appears": "يتحول إلى تحقيق عند ظهور فرق الإغلاق",
  "Unknown loss": "فاقد مجهول",
  "Waste entries - today": "مدخلات الهدر - اليوم",
  "Waste reason control": "ضبط أسباب الهدر",
  "Waste value tracked": "قيمة الهدر المتتبعة",
  "Wrong order": "طلب خاطئ",
  "Wrong orders": "طلبات خاطئة",
  "variance inputs": "مدخلات الفرق",
  "whole": "كامل الدسم",
};

function tWaste(ar: boolean, en: string, arText: string) {
  return ar ? arText : en;
}

function localizeWasteText(ar: boolean, value: unknown) {
  if (!ar || value == null) return value as React.ReactNode;
  let text = String(value);
  const exact = WASTE_AR_TERMS[text];
  if (exact) return exact;
  Object.entries(WASTE_AR_TERMS)
    .filter(([source]) => /[A-Za-z]/.test(source))
    .sort((a, b) => b[0].length - a[0].length)
    .forEach(([source, replacement]) => {
      text = text.replaceAll(source, replacement);
    });
  return text;
}

export function StudioWasteReasonControl({ ar, reasons }: Pick<StudioWasteWorkspaceProps, "ar" | "reasons">) {
  const total = reasons.reduce((sum, reason) => sum + reason.value, 0);
  const topReason = reasons.reduce<WasteReason | null>(
    (top, reason) => (!top || reason.value > top.value ? reason : top),
    null,
  );
  const chartRows = reasons.map((reason) => ({
    ...reason,
    shortReason: String(localizeWasteText(ar, reason.reason)).split(" ").slice(0, 2).join(" "),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tWaste(ar, "Waste reason control", "ضبط أسباب الهدر")}</CardTitle>
        <CardDescription>
          {tWaste(ar, "Turns into investigation when close variance appears", "يتحول إلى تحقيق عند ظهور فرق الإغلاق")}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{tWaste(ar, "variance inputs", "مدخلات الفرق")}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)_290px] gap-5">
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <BarChart accessibilityLayer data={chartRows} margin={{ bottom: 0, left: 0, right: 0, top: 6 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis axisLine={false} dataKey="shortReason" tickLine={false} tickMargin={10} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, item) => (
                    <div className="flex min-w-40 items-center justify-between gap-3">
                      <span className="text-muted-foreground">{localizeWasteText(ar, item.payload.reason)}</span>
                      <span className="font-mono">{formatMoney(Number(value))}</span>
                    </div>
                  )}
                  hideLabel
                />
              }
              cursor={false}
            />
            <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartContainer>
        <div className="grid content-start gap-3">
          <div className="rounded-lg bg-muted p-3">
            <div className="text-muted-foreground text-xs">{tWaste(ar, "Waste value tracked", "قيمة الهدر المتتبعة")}</div>
            <div className="mt-1 font-mono text-2xl">{formatMoney(total)}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{localizeWasteText(ar, topReason?.reason || "No reasons")}</div>
                <div className="text-muted-foreground text-xs">{localizeWasteText(ar, topReason?.category || "No category")}</div>
              </div>
              <Badge className="bg-destructive/10 text-destructive" variant="outline">
                {tWaste(ar, "Top risk", "أعلى خطر")}
              </Badge>
            </div>
            <Button className="mt-3 w-full justify-between" size="sm" type="button" variant="outline">
              {tWaste(ar, "Review variance inputs", "مراجعة مدخلات الفرق")}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {reasons.slice(0, 4).map((reason) => (
              <div className="rounded-lg bg-muted/70 p-2" key={reason.reason}>
                <div className="truncate font-medium">{localizeWasteText(ar, reason.reason)}</div>
                <div className="mt-1 font-mono text-muted-foreground">{formatMoney(reason.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StudioWasteEntriesTable({ ar, wasteRows }: Pick<StudioWasteWorkspaceProps, "ar" | "wasteRows">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tWaste(ar, "Waste entries - today", "مدخلات الهدر - اليوم")}</CardTitle>
        <CardAction className="flex gap-2">
          <Button size="sm" type="button" variant="outline">
            <Filter data-icon="inline-start" />
            {tWaste(ar, "All kiosks", "كل الأكشاك")}
          </Button>
          <Button size="sm" type="button" variant="outline">
            <Filter data-icon="inline-start" />
            {tWaste(ar, "Reason", "السبب")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader className="border-t **:data-[slot='table-head']:h-10 **:data-[slot='table-head']:font-normal **:data-[slot='table-head']:text-foreground **:data-[slot='table-head']:text-xs">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8" />
              <TableHead>{tWaste(ar, "Time", "الوقت")}</TableHead>
              <TableHead>{tWaste(ar, "Kiosk", "الكشك")}</TableHead>
              <TableHead>{tWaste(ar, "Item", "البند")}</TableHead>
              <TableHead className="text-right">{tWaste(ar, "Qty", "الكمية")}</TableHead>
              <TableHead className="text-right">{tWaste(ar, "Cost", "التكلفة")}</TableHead>
              <TableHead>{tWaste(ar, "Reason", "السبب")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody className="**:data-[slot='table-row']:border-border/50 **:data-[slot='table-cell']:py-3">
            {wasteRows.map((row) => (
              <TableRow key={row.id} className="hover:bg-transparent">
                <TableCell>
                  <span
                    className={cn(
                      "block size-2 rounded-full",
                      row.flagged ? "bg-amber-500" : "bg-muted-foreground/25",
                    )}
                  />
                </TableCell>
                <TableCell className="font-mono text-muted-foreground text-xs">{row.time}</TableCell>
                <TableCell className="font-medium">{localizeWasteText(ar, row.kiosk)}</TableCell>
                <TableCell>{localizeWasteText(ar, row.item)}</TableCell>
                <TableCell className="text-right font-mono">x{row.qty}</TableCell>
                <TableCell className="text-right font-mono">{formatMoney(row.cost)}</TableCell>
                <TableCell className="text-muted-foreground">{localizeWasteText(ar, row.reason)}</TableCell>
                <TableCell className="text-right">
                  {row.flagged ? (
                    <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300" variant="outline">
                      {tWaste(ar, "Flagged", "مؤشر")}
                    </Badge>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
