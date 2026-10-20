import JSZip from 'jszip';

type CellValue = string | number | null | undefined;

function xml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;'
    })[char] || char);
}

function columnName(index: number): string {
    let value = index + 1;
    let result = '';
    while (value > 0) {
        const remainder = (value - 1) % 26;
        result = String.fromCharCode(65 + remainder) + result;
        value = Math.floor((value - 1) / 26);
    }
    return result;
}

function dateSerial(value: string): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + 'T00:00:00Z');
    if (Number.isNaN(date.getTime())) return null;
    return date.getTime() / 86400000 + 25569;
}

function cell(value: CellValue, ref: string, style: number): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return '<c r="' + ref + '" s="' + style + '"><v>' + value + '</v></c>';
    }
    const text = String(value ?? '');
    const date = dateSerial(text);
    if (date !== null) return '<c r="' + ref + '" s="1"><v>' + date + '</v></c>';
    return '<c r="' + ref + '" t="inlineStr" s="' + style + '"><is><t xml:space="preserve">' + xml(text) + '</t></is></c>';
}

async function xlsx(
    title: string,
    headers: string[],
    rows: CellValue[][],
    metadata: { from: string; to: string; building: string; exportedAt: string }
): Promise<Blob> {
    const zip = new JSZip();
    const sheetRows: string[] = [];
    const addRow = (number: number, values: CellValue[], header = false): string => {
        const cells = values.map((value, index) => {
            const label = headers[index] || '';
            const isMoney = /(số tiền|thực thu|thực chi|doanh thu|chi phí|thu chi|công nợ|thanh toán|nguồn|chênh lệch|đặt cọc|đã trả|còn phải|thực nhận|hoàn trả|khấu trừ|đang giữ|theo hợp đồng)/i.test(label);
            const isDate = /(ngày|hạn thanh toán)/i.test(label);
            const style = header ? 3 : (isDate ? 1 : (isMoney && typeof value === 'number' ? 2 : 0));
            return cell(value, columnName(index) + number, style);
        }).join('');
        return '<row r="' + number + '">' + cells + '</row>';
    };
    sheetRows.push('<row r="1">' + cell(title, 'A1', 4) + '</row>');
    sheetRows.push('<row r="2">' + cell('Thời gian báo cáo: ' + metadata.from + ' – ' + metadata.to, 'A2', 0) + '</row>');
    sheetRows.push('<row r="3">' + cell('Tòa nhà: ' + metadata.building, 'A3', 0) + '</row>');
    sheetRows.push('<row r="4">' + cell('Ngày xuất: ' + metadata.exportedAt, 'A4', 0) + '</row>');
    sheetRows.push(addRow(6, headers, true));
    rows.forEach((row, index) => sheetRows.push(addRow(index + 7, row)));
    const lastColumn = columnName(Math.max(headers.length - 1, 0));
    const lastRow = rows.length + 6;

    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Báo cáo" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0 &quot;₫&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1683FF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>');
    zip.file('xl/worksheets/sheet1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:' + lastColumn + lastRow + '"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="' + headers.length + '" width="20" customWidth="1"/></cols><sheetData>' + sheetRows.join('') + '</sheetData><autoFilter ref="A6:' + lastColumn + lastRow + '"/></worksheet>');
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

declare global {
    interface Window {
        RHFinancialExport: { xlsx: typeof xlsx };
    }
}

window.RHFinancialExport = { xlsx };
