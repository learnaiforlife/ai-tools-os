// Real installer and real MarkItDown on a disposable home, never system Python.
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createConverter } from '../scripts/lib/converter.mjs';
import { runProcess } from '../scripts/lib/processes.mjs';

const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-converter-uat-'))), home = join(root, 'Fresh home ü'); fs.mkdirSync(home);
const env = { PATH: '/usr/bin:/bin', HOME: home }, results = [];
const converter = createConverter({ root, home, env, findExecutable: () => null });
try {
  const python = await converter.ensure(new AbortController().signal, console.log);
  assert.equal(converter.status().installed, true); results.push({ name: 'No uv/Python: verified installer provisions private runtime', passed: true });
  fs.writeFileSync(join(root, 'sample.csv'), 'Name,Value\nAlpha,42\n');
  fs.writeFileSync(join(root, 'sample.html'), '<h1>Alpha document</h1><p>Value 42</p><img src="http://127.0.0.1:1/private.png">');
  fs.writeFileSync(join(root, 'empty.txt'), '');
  fs.writeFileSync(join(root, 'broken.pdf'), 'not a PDF');
  await runProcess(python, ['-I', '-c', `import sys,zipfile
from pathlib import Path
from openpyxl import Workbook
from pptx import Presentation
from pptx.util import Inches
root=Path(sys.argv[1])
objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
stream=b'BT /F1 12 Tf 72 720 Td (Alpha PDF 42) Tj ET'
objects.append(b'<< /Length '+str(len(stream)).encode()+b' >>\\nstream\\n'+stream+b'\\nendstream')
pdf=b'%PDF-1.4\\n';offsets=[0]
for i,obj in enumerate(objects,1): offsets.append(len(pdf));pdf+=str(i).encode()+b' 0 obj\\n'+obj+b'\\nendobj\\n'
xref=len(pdf);pdf+=b'xref\\n0 6\\n0000000000 65535 f \\n'+b''.join(('%010d 00000 n \\n'%o).encode() for o in offsets[1:]);pdf+=b'trailer\\n<< /Size 6 /Root 1 0 R >>\\nstartxref\\n'+str(xref).encode()+b'\\n%%EOF\\n';(root/'sample.pdf').write_bytes(pdf)
wb=Workbook();wb.active.append(['Name','Value']);wb.active.append(['Alpha',42]);wb.save(root/'sample.xlsx')
p=Presentation();slide=p.slides.add_slide(p.slide_layouts[6]);shape=slide.shapes.add_textbox(Inches(1),Inches(1),Inches(4),Inches(1));shape.text='Alpha presentation 42';p.save(root/'sample.pptx')
with zipfile.ZipFile(root/'sample.docx','w') as z:
 z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
 z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
 z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Alpha document 42</w:t></w:r></w:p></w:body></w:document>')
`, root], { env, timeout: 30000 });
  for (const name of ['sample.csv', 'sample.html', 'sample.xlsx', 'sample.pptx', 'sample.docx', 'sample.pdf']) {
    const output = join(root, name + '-output'); fs.mkdirSync(output);
    const result = await converter.convert(join(root, name), output, new AbortController().signal, () => {});
    assert.ok(result.content.includes('Alpha'), `${name} text missing`); assert.ok(result.content.includes('42'), `${name} value missing`);
    results.push({ name: `Actual MarkItDown converts ${name}`, passed: true });
  }
  fs.mkdirSync(join(root, 'empty-output'));
  const empty = await converter.convert(join(root, 'empty.txt'), join(root, 'empty-output'), new AbortController().signal, () => {}); assert.ok(empty.warnings.some(w => w.includes('No text')));
  results.push({ name: 'Empty extraction has an explicit warning', passed: true });
  await assert.rejects(converter.convert(join(root, 'broken.pdf'), root, new AbortController().signal, () => {})); results.push({ name: 'Malformed PDF fails visibly', passed: true });
  fs.writeFileSync('/tmp/aios-verified-converter-root', root);
} catch (error) { results.push({ name: 'Conversion integration', passed: false, error: error.stack }); process.exitCode = 1; }
fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/conversion-integration.json', JSON.stringify({ root, results }, null, 2)); console.log(JSON.stringify(results, null, 2));
