import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { readFirstSheetAsCSV } from '../xlsxIO';

describe('xlsxIO.readFirstSheetAsCSV', () => {
  it('reads first sheet and quotes commas, quotes and newlines', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.addRow(['name', 'note']);
    ws.addRow(['منتج, جديد', 'قال "مرحبا"']);
    ws.addRow(['second', 'line1\nline2']);
    const buf = await wb.xlsx.writeBuffer();
    const csv = await readFirstSheetAsCSV(buf);
    expect(csv.split('\n')[0]).toBe('name,note');
    expect(csv).toContain('"منتج, جديد","قال ""مرحبا"""');
    expect(csv).toContain('second,"line1\nline2"');
  });
  it('returns empty string for workbook without sheets', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('x');
    const buf = await wb.xlsx.writeBuffer();
    expect(typeof (await readFirstSheetAsCSV(buf))).toBe('string');
  });
});
