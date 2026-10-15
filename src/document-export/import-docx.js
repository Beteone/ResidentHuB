import JSZip from 'jszip';

const WORD='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const children=(node,name)=>Array.from(node?.children||[]).filter(n=>n.namespaceURI===WORD&&(!name||n.localName===name));
const child=(node,name)=>children(node,name)[0];
const attr=(node,name='val')=>node?.getAttributeNS(WORD,name)||node?.getAttribute('w:'+name)||'';
const val=(node,name)=>attr(child(node,name));
const on=node=>!!node&&!['0','false','off'].includes(attr(node));
const PAGE='\uE000';

class ImportError extends Error {}
export async function importDocx(file){try{return await importCore(file);}catch(error){if(error instanceof ImportError)throw error;throw new Error('Không đọc được file DOCX. File có thể bị lỗi, được mã hóa hoặc không đúng định dạng. Hãy mở và lưu lại bằng Word rồi thử lại.');}}
async function importCore(file){
    if(!file||!file.name.toLowerCase().endsWith('.docx'))throw new ImportError('Chọn file Word .docx. PDF chưa hỗ trợ chuyển sang tài liệu chỉnh sửa.');
    if(!file.size||file.size>2*1024*1024)throw new ImportError('File DOCX phải có nội dung và không vượt quá 2 MB để lưu kèm bản gốc trên trình duyệt.');
    const bytes=await file.arrayBuffer();if(new Uint8Array(bytes)[0]!==80||new Uint8Array(bytes)[1]!==75)throw new ImportError('File không phải tài liệu DOCX hợp lệ.');
    const zip=await JSZip.loadAsync(bytes,{checkCRC32:false,createFolders:false});
    const entries=Object.values(zip.files);let total=0;
    if(entries.length>2000)throw new ImportError('Tài liệu có quá nhiều thành phần. Hãy lưu lại thành file DOCX đơn giản hơn.');
    for(const entry of entries){const size=entry._data?.uncompressedSize||0;total+=size;if(size>12*1024*1024||total>30*1024*1024)throw new ImportError('Nội dung giải nén quá lớn. Không thể nhập tài liệu này.');if(/vbaProject|activeX|embeddings\//i.test(entry.name))throw new ImportError('Tài liệu chứa macro hoặc đối tượng nhúng không được hỗ trợ.');}
    if(!zip.file('[Content_Types].xml')||!zip.file('word/document.xml'))throw new ImportError('Không tìm thấy nội dung Word trong file DOCX.');
    async function xml(path){const entry=zip.file(path);if(!entry)return null;const text=await entry.async('string');if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new ImportError('Tài liệu chứa khai báo XML không an toàn.');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new ImportError('Nội dung Word bị lỗi. Hãy mở và lưu lại bằng Word rồi thử lại.');return doc;}
    const documentXml=await xml('word/document.xml'),body=documentXml.getElementsByTagNameNS(WORD,'body')[0];
    if(!body)throw new ImportError('Tài liệu không có phần nội dung hợp lệ.');
    const styleXml=await xml('word/styles.xml'),styleMap=new Map();
    for(const style of Array.from(styleXml?.getElementsByTagNameNS(WORD,'style')||[]))styleMap.set(attr(style,'styleId'),style);
    function styles(id,depth=0){const style=styleMap.get(id);if(!style||depth>8)return [];return [...styles(val(style,'basedOn'),depth+1),style];}
    const numberingXml=await xml('word/numbering.xml'),abstract=new Map(),numbering=new Map();
    for(const n of Array.from(numberingXml?.getElementsByTagNameNS(WORD,'abstractNum')||[]))abstract.set(attr(n,'abstractNumId'),val(child(n,'lvl'),'numFmt'));
    for(const n of Array.from(numberingXml?.getElementsByTagNameNS(WORD,'num')||[]))numbering.set(attr(n,'numId'),abstract.get(val(n,'abstractNumId')));
    const warnings=[];
    if(documentXml.getElementsByTagNameNS(WORD,'drawing').length||documentXml.getElementsByTagNameNS(WORD,'pict').length)warnings.push('Hình ảnh, sơ đồ và chữ ký ảnh chưa được nhập. File gốc được giữ lại để đối chiếu.');
    function run(r,inherited=[]){
        const props=[...inherited,child(r,'rPr')].filter(Boolean),css={};
        for(const p of props){const fonts=child(p,'rFonts'),font=attr(fonts,'ascii')||attr(fonts,'hAnsi');if(font&&/^[\p{L}\p{N} _-]+$/u.test(font))css['font-family']=font;
            const size=Number(val(p,'sz'));if(size>0&&size<=400)css['font-size']=(size/2)+'pt';
            if(child(p,'b'))css['font-weight']=on(child(p,'b'))?'700':'400';if(child(p,'i'))css['font-style']=on(child(p,'i'))?'italic':'normal';
            if(child(p,'u')&&val(p,'u')!=='none')css['text-decoration']='underline';const color=val(p,'color');if(/^[a-f\d]{6}$/i.test(color))css.color='#'+color;
        }
        let text='';for(const n of children(r)){if(n.localName==='t')text+=esc(n.textContent);else if(n.localName==='tab')text+='&#8195;';else if(n.localName==='br')text+=attr(n,'type')==='page'?PAGE:'<br>';else if(n.localName==='cr')text+='<br>';}
        const style=Object.entries(css).map(([k,v])=>k+':'+v).join(';');return text.split(PAGE).map(part=>style?'<span style="'+esc(style)+'">'+part+'</span>':part).join(PAGE);
    }
    function para(p){const direct=child(p,'pPr'),chain=styles(val(direct,'pStyle')),props=[...chain.map(n=>child(n,'pPr')),direct].filter(Boolean),runsInherited=[child(styleXml?.getElementsByTagNameNS(WORD,'rPrDefault')[0],'rPr'),...chain.map(n=>child(n,'rPr'))].filter(Boolean),css={};let page=false;
        for(const prop of props){const jc=val(prop,'jc');if(jc)css['text-align']=({both:'justify',distribute:'justify',center:'center',right:'right',left:'left'}[jc]||'left');if(on(child(prop,'pageBreakBefore')))page=true;const spacing=child(prop,'spacing');for(const [k,a]of [['margin-top','before'],['margin-bottom','after']]){const n=Number(attr(spacing,a));if(n>=0&&attr(spacing,a))css[k]=(n/20)+'pt';}const indent=Number(attr(child(prop,'ind'),'left'));if(indent>0)css['margin-left']=(indent/20)+'pt';}
        let inner='';for(const n of children(p)){if(n.localName==='r')inner+=run(n,runsInherited);else if(['hyperlink','sdt','ins'].includes(n.localName))for(const r of Array.from(n.getElementsByTagNameNS(WORD,'r')))inner+=run(r,runsInherited);}
        const styleId=val(direct,'pStyle'),styleName=val(styleMap.get(styleId),'name'),heading=(styleId+' '+styleName).match(/(?:heading|tiêu đề)\s*([1-6])/i),tag=heading?'h'+heading[1]:'p';
        const attrs=Object.entries(css).map(([k,v])=>k+':'+v).join(';');const html=(page?'<div class="page-break" style="break-before:page"></div>':'')+inner.split(PAGE).map(text=>'<'+tag+' style="'+esc(attrs)+'">'+(text||'<br>')+'</'+tag+'>').join('<div class="page-break" style="break-before:page"></div>');
        const numId=val(child(direct,'numPr'),'numId');return {html,list:numId?(numbering.get(numId)==='bullet'?'ul':'ol'):null};
    }
    function table(tbl){const rows=[],active=new Map();for(const tr of children(tbl,'tr')){const cells=[];let col=0;for(const tc of children(tr,'tc')){const pr=child(tc,'tcPr'),span=Math.max(1,Number(val(pr,'gridSpan'))||1),merge=child(pr,'vMerge');if(merge&&attr(merge)!=='restart'&&active.has(col)){active.get(col).rowSpan++;col+=span;continue;}const width=child(pr,'tcW'),widthValue=Number(attr(width,'w')),widthCss=widthValue>0?(attr(width,'type')==='pct'?widthValue/50+'%':widthValue/20+'pt'):'';const cell={colSpan:span,rowSpan:1,html:blocks(tc),style:(widthCss?'width:'+widthCss+';':'')+'vertical-align:'+({center:'middle',bottom:'bottom'}[val(pr,'vAlign')]||'top')};cells.push(cell);if(merge)for(let i=0;i<span;i++)active.set(col+i,cell);else for(let i=0;i<span;i++)active.delete(col+i);col+=span;}rows.push(cells);}return '<table style="width:100%;border-collapse:collapse" border="1"><tbody>'+rows.map(cells=>'<tr>'+cells.map(c=>'<td colspan="'+c.colSpan+'" rowspan="'+c.rowSpan+'" style="'+esc(c.style)+'">'+c.html+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
    function blocks(parent){let html='',list=null;for(const n of children(parent)){if(n.localName==='p'){const result=para(n);if(result.list!==list){if(list)html+='</'+list+'>';list=result.list;if(list)html+='<'+list+'>';}html+=list?'<li>'+result.html+'</li>':result.html;}else{if(list){html+='</'+list+'>';list=null;}if(n.localName==='tbl')html+=table(n);else if(n.localName==='sdt')html+=blocks(child(n,'sdtContent'));}}if(list)html+='</'+list+'>';return html;}
    let html=blocks(body);
    if(!html.replace(/<[^>]*>/g,'').trim()&&!body.getElementsByTagNameNS(WORD,'tbl').length)throw new ImportError('Tài liệu chưa có văn bản hoặc bảng có thể chỉnh sửa.');
    for(const [kind,tag]of [['header','header'],['footer','footer']]){const path=entries.find(e=>new RegExp('^word/'+kind+'\\d+\\.xml$').test(e.name));if(path){const part=await xml(path.name),content=blocks(part.documentElement);html=tag==='header'?'<header>'+content+'</header>'+html:html+'<footer>'+content+'</footer>';}}
    let binary='';const array=new Uint8Array(bytes);for(let i=0;i<array.length;i+=32768)binary+=String.fromCharCode(...array.subarray(i,i+32768));
    return {html:window.RHT.sanitize('<div class="doc">'+html+'</div>'),warnings,originalFile:{name:file.name,type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',size:file.size,base64:btoa(binary)}};
}
