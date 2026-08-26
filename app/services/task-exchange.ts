export type ExportableTask = {
  id: string;
  title: string;
  description?: string;
  owner: string;
  ownerEmail: string;
  status: string;
  priority: string;
  due: string;
  project: string;
};

const utf8 = (value: string) => new TextEncoder().encode(value);

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});

const crc32 = (bytes: Uint8Array) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const concatBytes = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};

const zipFields = (...values: Array<[number, 2 | 4]>) => {
  const bytes = new Uint8Array(values.reduce((sum, [, size]) => sum + size, 0));
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const [value, size] of values) {
    if (size === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
    offset += size;
  }
  return bytes;
};

const createZip = (files: Record<string, Uint8Array>) => {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const [fileName, data] of Object.entries(files)) {
    const name = utf8(fileName);
    const checksum = crc32(data);
    const localHeader = zipFields(
      [0x04034b50, 4], [20, 2], [0x0800, 2], [0, 2], [0, 2], [0, 2],
      [checksum, 4], [data.length, 4], [data.length, 4], [name.length, 2], [0, 2],
    );
    const localFile = concatBytes(localHeader, name, data);
    localParts.push(localFile);
    centralParts.push(concatBytes(zipFields(
      [0x02014b50, 4], [20, 2], [20, 2], [0x0800, 2], [0, 2], [0, 2], [0, 2],
      [checksum, 4], [data.length, 4], [data.length, 4], [name.length, 2], [0, 2],
      [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4],
    ), name));
    offset += localFile.length;
  }
  const local = concatBytes(...localParts);
  const central = concatBytes(...centralParts);
  return concatBytes(local, central, zipFields(
    [0x06054b50, 4], [0, 2], [0, 2], [centralParts.length, 2], [centralParts.length, 2],
    [central.length, 4], [local.length, 4], [0, 2],
  ));
};

const formatDate = (date: string) =>
  date ? new Intl.DateTimeFormat("ru-RU").format(new Date(`${date}T12:00:00`)) : "не определён";

const uniqueRecipients = (tasks: ExportableTask[]) => [...new Set(tasks.flatMap((task) =>
  task.ownerEmail.split(/[;,]/).map((item) => item.trim()).filter(Boolean)
))].join(",");

const xmlEscape = (value: string | number) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const inlineCell = (ref: string, value: string | number, style: number) =>
  `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;

const numberCell = (ref: string, value: number, style: number) =>
  `<c r="${ref}" s="${style}"><v>${value}</v></c>`;

const workbookDate = () => new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Saratov", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const fileDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Saratov", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export function createTasksWorkbook(tasks: ExportableTask[]) {
  const headers = ["№", "ID", "Поручение", "Описание", "Ответственный", "Email", "Объект", "Приоритет", "Статус", "Срок", "Комментарий исполнителя"];
  const lastRow = tasks.length + 4;
  const rows = tasks.map((task, index) => {
    const row = index + 5;
    const alternate = index % 2 === 0;
    const bodyStyle = alternate ? 7 : 4;
    const centerStyle = alternate ? 8 : 5;
    const dateStyle = alternate ? 9 : 6;
    const due = task.due ? formatDate(task.due) : "Не определён";
    return `<row r="${row}" ht="48" customHeight="1">${[
      numberCell(`A${row}`, index + 1, centerStyle),
      inlineCell(`B${row}`, task.id, bodyStyle),
      inlineCell(`C${row}`, task.title, bodyStyle),
      inlineCell(`D${row}`, task.description ?? "", bodyStyle),
      inlineCell(`E${row}`, task.owner, bodyStyle),
      inlineCell(`F${row}`, task.ownerEmail, bodyStyle),
      inlineCell(`G${row}`, task.project, bodyStyle),
      inlineCell(`H${row}`, task.priority, centerStyle),
      inlineCell(`I${row}`, task.status, centerStyle),
      inlineCell(`J${row}`, due, dateStyle),
      inlineCell(`K${row}`, "", 10),
    ].join("")}</row>`;
  }).join("");

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols><col min="1" max="1" width="6" customWidth="1"/><col min="2" max="2" width="18" customWidth="1"/><col min="3" max="3" width="46" customWidth="1"/><col min="4" max="4" width="50" customWidth="1"/><col min="5" max="5" width="30" customWidth="1"/><col min="6" max="6" width="32" customWidth="1"/><col min="7" max="7" width="25" customWidth="1"/><col min="8" max="8" width="15" customWidth="1"/><col min="9" max="9" width="19" customWidth="1"/><col min="10" max="10" width="14" customWidth="1"/><col min="11" max="11" width="48" customWidth="1"/></cols>
  <sheetData>
    <row r="1" ht="30" customHeight="1">${inlineCell("A1", "Поручения WorkSGA", 1)}</row>
    <row r="2" ht="22" customHeight="1">${inlineCell("A2", `Сформировано: ${workbookDate()} · Выбрано поручений: ${tasks.length}`, 2)}</row>
    <row r="3" ht="8" customHeight="1"/>
    <row r="4" ht="30" customHeight="1">${headers.map((header, index) => inlineCell(`${String.fromCharCode(65 + index)}4`, header, 3)).join("")}</row>
    ${rows}
  </sheetData>
  <autoFilter ref="A4:K${lastRow}"/>
  <mergeCells count="2"><mergeCell ref="A1:K1"/><mergeCell ref="A2:K2"/></mergeCells>
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/></numFmts>
  <fonts count="5"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="16"/><name val="Calibri"/></font><font><color rgb="FF91A4BD"/><sz val="10"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Calibri"/></font><font><color rgb="FF17202A"/><sz val="10"/><name val="Calibri"/></font></fonts>
  <fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF07111F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7F4F7"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4CC"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9E2EC"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="11"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="top"/></xf><xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="4" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="top"/></xf><xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const created = new Date().toISOString();
  const files = {
    "[Content_Types].xml": utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`),
    "_rels/.rels": utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
    "docProps/app.xml": utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>WorkSGA</Application></Properties>`),
    "docProps/core.xml": utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Поручения WorkSGA</dc:title><dc:creator>WorkSGA</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created></cp:coreProperties>`),
    "xl/workbook.xml": utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Поручения" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="0"/></workbook>`),
    "xl/_rels/workbook.xml.rels": utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": utf8(sheet),
    "xl/styles.xml": utf8(styles),
  };
  return new Blob([createZip(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function createTaskMailto(task: ExportableTask, attachmentName: string) {
  const subject = `[${task.id}] ${task.title}`;
  const body = `Добрый день!\n\nНаправляю поручение в прилагаемой таблице Excel «${attachmentName}».\n\nСрок: ${formatDate(task.due)}.\n\nС уважением,\nГлавный инженер`;
  return `mailto:${uniqueRecipients([task])}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function createTasksMailto(tasks: ExportableTask[], attachmentName: string) {
  const subject = `[WorkSGA] ${tasks.length} поручений для исполнения`;
  const body = `Добрый день!\n\nНаправляю перечень выбранных поручений в прилагаемой таблице Excel «${attachmentName}».\n\nКоличество поручений: ${tasks.length}.\n\nС уважением,\nГлавный инженер`;
  return `mailto:${uniqueRecipients(tasks)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function downloadTasksXlsx(tasks: ExportableTask[]) {
  const fileName = `porucheniya-worksga-${fileDate()}.xlsx`;
  const url = URL.createObjectURL(createTasksWorkbook(tasks));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}

// Сохраняем отдельный CSV-экспорт реестра: он не участвует в рассылке.
export function downloadTasksCsv(rows: ExportableTask[], suffix: string) {
  const headers = ["ID", "Поручение", "Ответственный", "Статус", "Приоритет", "Срок", "Объект"];
  const csvRows = rows.map((task) => [
    task.id, task.title, task.owner, task.status, task.priority, formatDate(task.due), task.project,
  ]);
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const content = "\uFEFF" + [headers, ...csvRows].map((row) => row.map(escape).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `porucheniya-${suffix}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
