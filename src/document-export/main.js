import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer, WidthType, AlignmentType, LevelFormat, BorderStyle, VerticalAlignTable } from 'docx';
import html2pdf from 'html2pdf.js';
import { importDocx } from './import-docx.js';

function assertDocument(doc) {
    if (!doc || !doc.html || /\{\{[\s\S]*?\}\}/.test(doc.html)) throw new Error('Tài liệu chưa được render. Hãy mở bản xem trước trước khi xuất.');
}
function download(blob, name) {
    if (!blob || blob.size < 100) throw new Error('Chưa tạo được tài liệu hoàn chỉnh. Vui lòng thử lại.');
    const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function stage(doc) {
    assertDocument(doc);
    const wrapper=document.createElement('div');wrapper.style.cssText='position:absolute;left:-10000px;top:0;';
    const root=document.createElement('div');root.style.cssText='width:170mm;background:#fff;color:#10213c;font:14px/1.6 Arial;';
    root.innerHTML=window.RHT.DOC_STYLE+'<style>.page-break{break-before:page}tr{break-inside:avoid}</style>'+window.RHT.sanitize(doc.html);wrapper.appendChild(root);document.body.appendChild(wrapper);return root;
}
const alignment=style=>({'center':AlignmentType.CENTER,'right':AlignmentType.RIGHT,'justify':AlignmentType.JUSTIFIED}[style.textAlign]||AlignmentType.LEFT);
function runs(node) {
    if(node.nodeType===Node.TEXT_NODE){const style=getComputedStyle(node.parentElement);return [new TextRun({text:node.textContent,font:style.fontFamily.split(',')[0].replace(/["']/g,''),size:Math.round(parseFloat(style.fontSize)*1.5),bold:Number(style.fontWeight)>=600,italics:style.fontStyle==='italic',underline:style.textDecorationLine.includes('underline')?{}:undefined,color:color(style.color)})];}
    if(node.nodeType!==Node.ELEMENT_NODE)return [];
    if(node.tagName==='BR')return [new TextRun({break:1})];
    return Array.from(node.childNodes).flatMap(runs);
}
function color(css) {const n=css.match(/\d+/g);return n&&n.length>=3?n.slice(0,3).map(v=>Number(v).toString(16).padStart(2,'0')).join(''):'10213c';}
function paragraph(node, extra={}) {
    const style=getComputedStyle(node);
    return new Paragraph({children:Array.from(node.childNodes).flatMap(runs),alignment:alignment(style),spacing:{after:120,line:Math.round((parseFloat(style.lineHeight)||22)*15)},keepNext:/^H[1-6]$/.test(node.tagName),pageBreakBefore:style.breakBefore==='page'||node.classList.contains('page-break'),...extra});
}
function blocks(parent) {
    const result=[];let inline=[];
    function flush(){if(inline.length){result.push(new Paragraph({children:inline,spacing:{after:100}}));inline=[];}}
    for(const node of parent.childNodes){
        if(node.nodeType===Node.TEXT_NODE){if(node.textContent.trim())inline.push(...runs(node));continue;}
        if(node.nodeType!==Node.ELEMENT_NODE||['STYLE','HEADER','FOOTER'].includes(node.tagName))continue;
        if(node.tagName==='TABLE'){
            flush();const rows=Array.from(node.rows).map(row=>new TableRow({cantSplit:true,tableHeader:row.parentElement.tagName==='THEAD',children:Array.from(row.cells).map(cell=>new TableCell({children:blocks(cell).length?blocks(cell):[new Paragraph('')],columnSpan:cell.colSpan,rowSpan:cell.rowSpan,width:{size:Math.max(1,Math.round(cell.getBoundingClientRect().width*15)),type:WidthType.DXA},verticalAlign:({middle:VerticalAlignTable.CENTER,bottom:VerticalAlignTable.BOTTOM}[getComputedStyle(cell).verticalAlign]||VerticalAlignTable.TOP),shading:cell.tagName==='TH'?{fill:'f1f5f9'}:undefined,borders:Object.fromEntries(['top','bottom','left','right'].map(k=>[k,{style:BorderStyle.SINGLE,size:4,color:'CBD5E1'}]))}))}));
            if(rows.length)result.push(new Table({rows,width:{size:100,type:WidthType.PERCENTAGE}}));continue;
        }
        if(node.classList.contains('doc-row')||node.classList.contains('doc-signs')||node.classList.contains('doc-meta')){
            flush();result.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:Object.fromEntries(['top','bottom','left','right','insideHorizontal','insideVertical'].map(k=>[k,{style:BorderStyle.NONE,size:0,color:'FFFFFF'}])),rows:[new TableRow({children:Array.from(node.children).map(cell=>new TableCell({children:blocks(cell).length?blocks(cell):[paragraph(cell)]}))})]}));continue;
        }
        if(node.tagName==='UL'||node.tagName==='OL'){
            flush();Array.from(node.children).filter(n=>n.tagName==='LI').forEach(li=>result.push(paragraph(li,node.tagName==='UL'?{bullet:{level:0}}:{numbering:{reference:'ordered',level:0}})));continue;
        }
        const style=getComputedStyle(node);
        if(node.classList.contains('page-break')||style.breakBefore==='page'){flush();result.push(new Paragraph({pageBreakBefore:true,children:[]}));const clone=node.cloneNode(true);clone.classList.remove('page-break');clone.style.breakBefore='auto';if(clone.textContent.trim())result.push(paragraph(node));continue;}
        if(/^(P|H[1-6]|LI)$/.test(node.tagName)||(!node.querySelector('p,div,table,ul,ol,section')&&style.display==='block')){flush();result.push(paragraph(node));continue;}
        if(['DIV','SECTION','ARTICLE','MAIN'].includes(node.tagName)){flush();result.push(...blocks(node));continue;}
        inline.push(...runs(node));
    }
    flush();return result;
}
async function wordBlob(doc) {
    const root=stage(doc);
    try {
        if(root.querySelector('img,video,canvas'))throw new Error('Mẫu có hình ảnh chưa hỗ trợ chuyển chính xác sang Word. Hãy tải PDF hoặc thay hình bằng nội dung văn bản.');
        await document.fonts.ready;
        const body=blocks(root);if(!body.length)throw new Error('Biểu mẫu chưa có nội dung để xuất.');
        const headers=Array.from(root.querySelectorAll('header')).flatMap(blocks),footers=Array.from(root.querySelectorAll('footer')).flatMap(blocks);
        const file=new Document({numbering:{config:[{reference:'ordered',levels:[{level:0,format:LevelFormat.DECIMAL,text:'%1.',alignment:AlignmentType.LEFT}]}]},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1134,bottom:1134,left:1134,right:1134}}},headers:headers.length?{default:new Header({children:headers})}:undefined,footers:footers.length?{default:new Footer({children:footers})}:undefined,children:body}]});
        return await Packer.toBlob(file);
    } finally {root.parentElement.remove();}
}
async function pdfBlob(doc) {
    const root=stage(doc);
    try {await document.fonts.ready;return await html2pdf().set({margin:20,filename:'hop-dong.pdf',image:{type:'jpeg',quality:0.98},html2canvas:{scale:2,logging:false,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy'],before:'.page-break',avoid:['tr','h1','h2','h3']}}).from(root).outputPdf('blob');}finally{root.parentElement.remove();}
}
window.RHDocumentExport={importDocx,wordBlob,pdfBlob,async word(doc){download(await wordBlob(doc),'hop-dong.docx');},async pdf(doc){download(await pdfBlob(doc),'hop-dong.pdf');}};
