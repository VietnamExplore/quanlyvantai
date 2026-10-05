export type Cell = string | number | Date | null | undefined;

export interface ExcelSheet {
  /** Tên sheet (tối đa 31 ký tự) */
  name: string;
  /** Dòng tiêu đề in đậm phía trên bảng, ví dụ "BÁO CÁO DOANH THU 01/10/2026 – 31/10/2026" */
  title?: string;
  /** Các dòng thông tin dưới tiêu đề (đối tượng, MST, kỳ đối chiếu…) */
  info?: string[];
  /** Bảng tóm tắt dưới dòng tổng: [nhãn, số tiền] (ví dụ Tổng phải thu / Đã thu / Còn nợ) */
  summary?: [string, number][];
  headers: string[];
  rows: Cell[][];
  /** Chỉ số các cột tiền / số lượng: định dạng 1.000.000 và cộng tổng ở dòng cuối */
  sumColumns?: number[];
  /** Chỉ số các cột chỉ định dạng số (không cộng tổng) */
  numberColumns?: number[];
  /** Nhãn dòng tổng (đặt ở cột đầu); bỏ trống = không có dòng tổng */
  totalLabel?: string;
}

/**
 * Tạo và tải file Excel (.xlsx) thật: tiêu đề cột in đậm, cố định dòng tiêu đề, có bộ lọc,
 * cột tiền định dạng số và dòng tổng cộng bằng công thức SUM.
 * Thư viện exceljs chỉ được tải khi người dùng bấm xuất để trang mở nhanh.
 */
export async function downloadExcel(filename: string, sheets: ExcelSheet[]) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    let headerRow = 1;
    if (s.title) {
      ws.addRow([s.title]).font = { bold: true, size: 13 };
      ws.mergeCells(1, 1, 1, Math.max(1, s.headers.length));
      headerRow = 2;
      for (const line of s.info ?? []) {
        ws.addRow([line]).font = { italic: true };
        headerRow++;
      }
      ws.addRow([]);
      headerRow++;
    }
    const head = ws.addRow(s.headers);
    head.font = { bold: true };
    head.alignment = { vertical: 'middle', wrapText: true };
    head.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
      c.border = { bottom: { style: 'thin', color: { argb: 'FF9AA5B1' } } };
    });

    for (const r of s.rows) ws.addRow(r.map((v) => (v === undefined ? null : v)));
    const firstData = headerRow + 1;
    const lastData = headerRow + s.rows.length;

    const numeric = new Set([...(s.sumColumns ?? []), ...(s.numberColumns ?? [])]);
    numeric.forEach((i) => (ws.getColumn(i + 1).numFmt = '#,##0'));
    s.headers.forEach((_, i) => {
      const col = ws.getColumn(i + 1);
      const sample = s.rows.slice(0, 500).map((r) => r[i]);
      if (sample.some((v) => v instanceof Date)) col.numFmt = 'dd/mm/yyyy hh:mm';
      const longest = Math.max(
        s.headers[i].length,
        ...sample.map((v) => (v instanceof Date ? 16 : typeof v === 'number' ? v.toLocaleString('vi-VN').length : String(v ?? '').length)),
      );
      col.width = Math.min(48, Math.max(8, longest + 2));
    });

    if (s.totalLabel && s.rows.length) {
      const total = ws.addRow([s.totalLabel]);
      total.font = { bold: true };
      for (const i of s.sumColumns ?? []) {
        const letter = ws.getColumn(i + 1).letter;
        const sum = s.rows.reduce((t, r) => t + (typeof r[i] === 'number' ? (r[i] as number) : 0), 0);
        total.getCell(i + 1).value = { formula: `SUM(${letter}${firstData}:${letter}${lastData})`, result: sum };
      }
      total.eachCell((c) => (c.border = { top: { style: 'thin' } }));
    }

    if (s.summary?.length) {
      ws.addRow([]);
      // Đặt nhãn ở cột kế cuối cột tiền cuối cùng để số tiền thẳng hàng với bảng
      const valueCol = Math.max(2, ...(s.sumColumns ?? [1]).map((i) => i + 1));
      for (const [label, value] of s.summary) {
        const r = ws.addRow([]);
        r.getCell(valueCol - 1).value = label;
        r.getCell(valueCol).value = value;
        r.getCell(valueCol).numFmt = '#,##0';
        r.font = { bold: true };
      }
    }

    ws.views = [{ state: 'frozen', ySplit: headerRow }];
    if (s.rows.length) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastData, column: s.headers.length } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
