import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Lead } from "@/lib/format";
import type { ViolationRecord } from "@/lib/violation-history.functions";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export function generateViolationReport(lead: Lead, violations: ViolationRecord[]): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Water System Violation Report", margin, y);
  y += 22;

  doc.setFontSize(13);
  doc.text(lead["System Name"], margin, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`PWSID: ${lead.PWSID}`, margin, y);
  doc.text(
    `Generated: ${new Date().toLocaleString()}`,
    pageWidth - margin,
    y,
    { align: "right" },
  );
  y += 14;
  const loc = [lead.Address, lead.City, lead.Zip].filter(Boolean).join(", ");
  if (loc) {
    doc.text(loc, margin, y);
    y += 14;
  }
  doc.text(
    `Population served: ${lead["Population Served"]?.toLocaleString() ?? "—"} · Connections: ${lead["Service Connections"]?.toLocaleString() ?? "—"}`,
    margin,
    y,
  );
  y += 18;

  doc.setDrawColor(220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Summary", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const pbUg = (lead["Lead 90th %ile (mg/L)"] || 0) * 1000;
  const cuMg = lead["Copper 90th %ile (mg/L)"] || 0;
  const summary = [
    `Total violations on record: ${violations.length}`,
    `Active MCL violations: ${lead["Active MCL Violations"] ?? 0}`,
    `Active health-based violations: ${lead["Active Health-Based Violations"] ?? 0}`,
    `Unresolved (5yr): ${lead["Unresolved Violations (5yr)"] ?? 0}`,
    `Lead 90th percentile: ${pbUg ? `${pbUg.toFixed(1)} µg/L (action level 15)` : "—"}`,
    `Copper 90th percentile: ${cuMg ? `${cuMg.toFixed(2)} mg/L (action level 1.3)` : "—"}`,
  ];
  for (const line of summary) {
    doc.text(line, margin, y);
    y += 13;
  }
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Violation history (EPA SDWIS)", margin, y);
  y += 8;

  if (violations.length === 0) {
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text("No violation records returned from EPA SDWIS for this PWSID.", margin, y);
  } else {
    autoTable(doc, {
      startY: y + 4,
      margin: { left: margin, right: margin },
      head: [["Begin", "End", "Category", "Contaminant", "Health", "Status", "Enforcement"]],
      body: violations.map((v) => [
        fmtDate(v.beginDate),
        fmtDate(v.endDate),
        v.category,
        v.contaminantName,
        v.isHealthBased ? "Yes" : "No",
        v.status,
        v.enforcementAction
          ? `${v.enforcementAction}${v.enforcementDate ? ` (${fmtDate(v.enforcementDate)})` : ""}`
          : "—",
      ]),
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 55 },
        2: { cellWidth: 75 },
        3: { cellWidth: 130 },
        4: { cellWidth: 38, halign: "center" },
        5: { cellWidth: 70 },
      },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(
      `Source: EPA SDWIS Federal Reporting · Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: "center" },
    );
  }

  return doc;
}

export function downloadViolationReport(lead: Lead, violations: ViolationRecord[]) {
  const doc = generateViolationReport(lead, violations);
  const safeName = lead["System Name"].replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  doc.save(`violation-report-${safeName || lead.PWSID}-${lead.PWSID}.pdf`);
}