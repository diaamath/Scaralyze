/* ==========================================================================
   SCARALYZE — client-side texture/edge-density analysis + PDF report
   All image processing happens in-browser via <canvas>. No photo ever
   leaves the device. This mirrors (and lightly cleans up) the reference
   Python pipeline: grayscale -> local std -> Sobel edge magnitude ("texture
   map", not a real collagen assay) -> difference map -> threshold -> sum.
   ========================================================================== */

const WORK_MAX = 480;         // max working-canvas dimension, for performance
let CURRENT_MODE = 'clinician';
let WINDOW_SIZE = 60;
let THRESHOLD = 160;

const state = { pre: null, post: null };
let lastAnalysis = null;

/* ---------------------------- small utilities ---------------------------- */

function $(id){ return document.getElementById(id); }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* -------------------------- grayscale / stats / sobel -------------------------- */

function computeGrayscale(ctx, w, h){
  const { data } = ctx.getImageData(0,0,w,h);
  const gray = new Uint8ClampedArray(w*h);
  for(let i=0, p=0; i<data.length; i+=4, p++){
    gray[p] = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
  }
  return gray;
}

// mean + population std of a rectangular window in a full-width gray buffer
function windowStats(gray, fullW, x0, y0, w, h){
  let sum=0, sumSq=0, n=w*h;
  for(let y=y0; y<y0+h; y++){
    const row = y*fullW;
    for(let x=x0; x<x0+w; x++){
      const v = gray[row+x];
      sum += v; sumSq += v*v;
    }
  }
  const mean = sum/n;
  const variance = Math.max(0, sumSq/n - mean*mean);
  return { mean, std: Math.sqrt(variance) };
}

// extract a w x h region into its own gray buffer
function extractRegion(gray, fullW, x0, y0, w, h){
  const out = new Uint8ClampedArray(w*h);
  for(let y=0; y<h; y++){
    const srcRow = (y0+y)*fullW + x0;
    out.set(gray.subarray(srcRow, srcRow+w), y*w);
  }
  return out;
}

// Sobel gradient magnitude over a region buffer (edge/texture density map)
function sobelMagnitude(region, w, h){
  const out = new Uint8ClampedArray(w*h);
  const at = (x,y) => region[clamp(y,0,h-1)*w + clamp(x,0,w-1)];
  for(let y=0; y<h; y++){
    for(let x=0; x<w; x++){
      const gx = (at(x-1,y-1)+2*at(x-1,y)+at(x-1,y+1)) - (at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1));
      const gy = (at(x-1,y-1)+2*at(x,y-1)+at(x+1,y-1)) - (at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1));
      out[y*w+x] = Math.sqrt(gx*gx + gy*gy);
    }
  }
  return out;
}

// absolute difference of two equal-sized buffers, clipped to 0-255
function absDiff(a,b){
  const out = new Uint8ClampedArray(a.length);
  for(let i=0;i<a.length;i++) out[i] = Math.abs(a[i]-b[i]);
  return out;
}

function threshold(buf, t){
  const out = new Uint8ClampedArray(buf.length);
  for(let i=0;i<buf.length;i++) out[i] = buf[i] > t ? 255 : 0;
  return out;
}

function sum(buf){ let s=0; for(let i=0;i<buf.length;i++) s+=buf[i]; return s; }

/* -------------------------- image loading + overlay -------------------------- */

function handleFile(file, side){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => initSide(side, img, e.target.result);
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function initSide(side, img, dataURL){
  const scale = Math.min(1, WORK_MAX/Math.max(img.width, img.height));
  const w = Math.round(img.width*scale), h = Math.round(img.height*scale);

  const imgCanvas = document.createElement('canvas');
  imgCanvas.width = w; imgCanvas.height = h;
  const ictx = imgCanvas.getContext('2d');
  ictx.drawImage(img, 0, 0, w, h);

  const gray = computeGrayscale(ictx, w, h);

  const displayCanvas = $(side === 'pre' ? 'canvasPre' : 'canvasPost');
  displayCanvas.width = w; displayCanvas.height = h;

  state[side] = {
    img, dataURL, imgCanvas, gray, w, h,
    center: { x: Math.round(w/2), y: Math.round(h/2) },
    displayCanvas
  };

  $(side === 'pre' ? 'dropEmptyPre' : 'dropEmptyPost').style.display = 'none';
  drawOverlay(side);
  updateReadout(side, state[side].center.x, state[side].center.y);
  updateAnalyzeButton();
}

function clampCenterForWindow(side){
  const s = state[side];
  if(!s) return;
  const half = Math.floor(WINDOW_SIZE/2);
  s.center.x = clamp(s.center.x, half, s.w-half-1);
  s.center.y = clamp(s.center.y, half, s.h-half-1);
}

function drawOverlay(side){
  const s = state[side];
  if(!s) return;
  clampCenterForWindow(side);
  const ctx = s.displayCanvas.getContext('2d');
  ctx.clearRect(0,0,s.w,s.h);
  ctx.drawImage(s.imgCanvas, 0, 0);

  const half = WINDOW_SIZE/2;
  const x0 = s.center.x-half, y0 = s.center.y-half;
  const accent = side === 'pre' ? '#0EA893' : '#FF6B52';

  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1.5, s.w/220);
  ctx.setLineDash([5,4]);
  ctx.strokeRect(x0, y0, WINDOW_SIZE, WINDOW_SIZE);
  ctx.setLineDash([]);

  // caliper corner ticks — the signature instrument mark
  const tick = Math.max(6, WINDOW_SIZE*0.12);
  ctx.lineWidth = Math.max(2, s.w/160);
  [[x0,y0,1,1],[x0+WINDOW_SIZE,y0,-1,1],[x0,y0+WINDOW_SIZE,1,-1],[x0+WINDOW_SIZE,y0+WINDOW_SIZE,-1,-1]].forEach(([cx,cy,dx,dy])=>{
    ctx.beginPath();
    ctx.moveTo(cx, cy+dy*tick); ctx.lineTo(cx,cy); ctx.lineTo(cx+dx*tick, cy);
    ctx.stroke();
  });

  // crosshair center dot
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(s.center.x, s.center.y, Math.max(2, s.w/240), 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function updateReadout(side, x, y){
  const s = state[side];
  if(!s) return;
  const half = Math.floor(WINDOW_SIZE/2);
  const x0 = clamp(x-half, 0, s.w-WINDOW_SIZE);
  const y0 = clamp(y-half, 0, s.h-WINDOW_SIZE);
  const { std } = windowStats(s.gray, s.w, x0, y0, WINDOW_SIZE, WINDOW_SIZE);
  $(side === 'pre' ? 'readoutPre' : 'readoutPost').textContent =
    `x ${x} · y ${y} · \u03C3 ${std.toFixed(1)}`;
}

function canvasPixelFromEvent(canvas, evt){
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width/rect.width, scaleY = canvas.height/rect.height;
  return {
    x: Math.round((evt.clientX-rect.left)*scaleX),
    y: Math.round((evt.clientY-rect.top)*scaleY)
  };
}

function wireCanvasInteractions(side){
  const canvas = $(side === 'pre' ? 'canvasPre' : 'canvasPost');
  let raf = null;
  canvas.addEventListener('mousemove', evt => {
    if(!state[side]) return;
    if(raf) return;
    raf = requestAnimationFrame(()=>{
      const {x,y} = canvasPixelFromEvent(canvas, evt);
      updateReadout(side, x, y);
      raf = null;
    });
  });
  canvas.addEventListener('click', evt => {
    if(!state[side]) return;
    const {x,y} = canvasPixelFromEvent(canvas, evt);
    state[side].center = { x, y };
    drawOverlay(side);
    updateReadout(side, x, y);
  });
}

/* -------------------------- auto-detect region -------------------------- */

function autoDetect(side){
  const s = state[side];
  if(!s) return;
  const half = Math.floor(WINDOW_SIZE/2);
  const step = Math.max(4, Math.round(WINDOW_SIZE/5));
  let best = { std: -1, x: s.center.x, y: s.center.y };
  for(let y=half; y<=s.h-half-1; y+=step){
    for(let x=half; x<=s.w-half-1; x+=step){
      const { std } = windowStats(s.gray, s.w, x-half, y-half, WINDOW_SIZE, WINDOW_SIZE);
      if(std > best.std) best = { std, x, y };
    }
  }
  s.center = { x: best.x, y: best.y };
  drawOverlay(side);
  updateReadout(side, best.x, best.y);
  toast(`Auto-detected the highest-texture window on the ${side === 'pre' ? 'pre' : 'post'} photo`);
}

/* -------------------------- run full analysis -------------------------- */

function updateAnalyzeButton(){
  $('analyzeBtn').disabled = !(state.pre && state.post);
}

function colorRamp(v){
  // 0 -> teal wash, 255 -> coral (brand-consistent replacement for a generic heatmap)
  const t = v/255;
  const c1 = [227,245,242], c2 = [255,107,82];
  const r = Math.round(c1[0]+(c2[0]-c1[0])*t);
  const g = Math.round(c1[1]+(c2[1]-c1[1])*t);
  const b = Math.round(c1[2]+(c2[2]-c1[2])*t);
  return [r,g,b];
}

function bufferToCanvas(buf, w, h, mode){
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(w,h);
  for(let i=0;i<buf.length;i++){
    if(mode === 'ramp'){
      const [r,g,b] = colorRamp(buf[i]);
      imgData.data[i*4]=r; imgData.data[i*4+1]=g; imgData.data[i*4+2]=b; imgData.data[i*4+3]=255;
    } else {
      const v = buf[i];
      imgData.data[i*4]=v; imgData.data[i*4+1]=v; imgData.data[i*4+2]=v; imgData.data[i*4+3]=255;
    }
  }
  ctx.putImageData(imgData,0,0);
  return canvas;
}

function addResultCell(container, canvas, label, flag){
  const cell = document.createElement('div');
  cell.className = 'result-cell' + (flag ? ' flag' : '');
  canvas.style.width = '100%'; canvas.style.aspectRatio = '1/1'; canvas.style.objectFit = 'contain'; canvas.style.background = '#0F1C22';
  cell.appendChild(canvas);
  const lbl = document.createElement('div');
  lbl.className = 'cell-label';
  lbl.textContent = label;
  cell.appendChild(lbl);
  container.appendChild(cell);
  return cell;
}

function runAnalysis(){
  if(!state.pre || !state.post) return;

  const half = Math.floor(WINDOW_SIZE/2);
  ['pre','post'].forEach(side=>{
    const s = state[side];
    s.center.x = clamp(s.center.x, half, s.w-half-1);
    s.center.y = clamp(s.center.y, half, s.h-half-1);
  });

  const preX0 = state.pre.center.x-half, preY0 = state.pre.center.y-half;
  const postX0 = state.post.center.x-half, postY0 = state.post.center.y-half;

  const preRegion = extractRegion(state.pre.gray, state.pre.w, preX0, preY0, WINDOW_SIZE, WINDOW_SIZE);
  const postRegion = extractRegion(state.post.gray, state.post.w, postX0, postY0, WINDOW_SIZE, WINDOW_SIZE);

  const preStd = windowStats(state.pre.gray, state.pre.w, preX0, preY0, WINDOW_SIZE, WINDOW_SIZE).std;
  const postStd = windowStats(state.post.gray, state.post.w, postX0, postY0, WINDOW_SIZE, WINDOW_SIZE).std;

  const preTexture = sobelMagnitude(preRegion, WINDOW_SIZE, WINDOW_SIZE);
  const postTexture = sobelMagnitude(postRegion, WINDOW_SIZE, WINDOW_SIZE);
  const diffMap = absDiff(preTexture, postTexture);

  const volPre = sum(preTexture), volPost = sum(postTexture), volDiff = sum(diffMap);
  const pctChange = volPre === 0 ? 0 : ((volPost-volPre)/volPre)*100;

  lastAnalysis = { preRegion, postRegion, preTexture, postTexture, diffMap, volPre, volPost, volDiff, preStd, postStd, pctChange };

  $('resultsPanel').hidden = false;

  renderResultGrid();
  renderMetricsTable();
  applyThreshold();          // draws thresholded cell + flagged-pixel row
  renderSummary();
  setupCompareSlider();

  $('resultsPanel').scrollIntoView({ behavior:'smooth', block:'start' });
}

function renderResultGrid(){
  const grid = $('resultGrid'); grid.innerHTML = '';
  const a = lastAnalysis;
  addResultCell(grid, bufferToCanvas(a.preRegion, WINDOW_SIZE, WINDOW_SIZE, 'gray'), 'PRE · sampled region');
  addResultCell(grid, bufferToCanvas(a.preTexture, WINDOW_SIZE, WINDOW_SIZE, 'gray'), 'PRE · texture map (edge density)');
  addResultCell(grid, bufferToCanvas(a.postRegion, WINDOW_SIZE, WINDOW_SIZE, 'gray'), 'POST · sampled region');
  addResultCell(grid, bufferToCanvas(a.postTexture, WINDOW_SIZE, WINDOW_SIZE, 'gray'), 'POST · texture map (edge density)');
  addResultCell(grid, bufferToCanvas(a.diffMap, WINDOW_SIZE, WINDOW_SIZE, 'ramp'), '|PRE − POST| difference', true);
  const threshCanvas = bufferToCanvas(threshold(a.diffMap, THRESHOLD), WINDOW_SIZE, WINDOW_SIZE, 'ramp');
  threshCanvas.id = 'threshCellCanvas';
  addResultCell(grid, threshCanvas, `Difference above threshold (${THRESHOLD})`, true);
}

function applyThreshold(){
  if(!lastAnalysis) return;
  const bin = threshold(lastAnalysis.diffMap, THRESHOLD);
  const flaggedPct = (sum(bin)/255/bin.length*100);
  lastAnalysis.flaggedPct = flaggedPct;

  const existing = $('threshCellCanvas');
  if(existing){
    const fresh = bufferToCanvas(bin, WINDOW_SIZE, WINDOW_SIZE, 'ramp');
    existing.replaceWith(fresh);
    fresh.id = 'threshCellCanvas';
    fresh.style.width='100%'; fresh.style.aspectRatio='1/1'; fresh.style.objectFit='contain'; fresh.style.background='#0F1C22';
    const lbl = fresh.parentElement.querySelector('.cell-label');
    if(lbl) lbl.textContent = `Difference above threshold (${THRESHOLD})`;
  }
  renderMetricsTable();
}

function renderMetricsTable(){
  const a = lastAnalysis;
  const tbl = $('metricsTable');
  const deltaClass = a.volPost < a.volPre ? 'delta-pos' : (a.volPost > a.volPre ? 'delta-neg' : '');
  tbl.innerHTML = `
    <thead><tr><th>Metric</th><th>Pre</th><th>Post</th><th>Change</th></tr></thead>
    <tbody>
      <tr><td>Local std. deviation (σ)</td><td class="num">${a.preStd.toFixed(2)}</td><td class="num">${a.postStd.toFixed(2)}</td><td class="num">${(a.postStd-a.preStd).toFixed(2)}</td></tr>
      <tr><td>Texture volume (Σ edge magnitude)</td><td class="num">${a.volPre.toLocaleString()}</td><td class="num">${a.volPost.toLocaleString()}</td><td class="num ${deltaClass}">${a.pctChange>=0?'+':''}${a.pctChange.toFixed(1)}%</td></tr>
      <tr><td>Absolute difference volume</td><td class="num" colspan="2" style="text-align:right">${a.volDiff.toLocaleString()}</td><td class="num">—</td></tr>
      <tr><td>Pixels flagged above threshold</td><td class="num" colspan="2" style="text-align:right">${a.flaggedPct!==undefined ? a.flaggedPct.toFixed(1)+'%' : '—'}</td><td class="num">thr = ${THRESHOLD}</td></tr>
    </tbody>`;
}

function renderSummary(){
  const a = lastAnalysis;
  const name = ($('patientName').value || '').trim();
  const who = name ? name : 'This patient';
  let verdict;
  if(a.pctChange <= -5){
    verdict = `${who}'s sampled region shows a ${Math.abs(a.pctChange).toFixed(1)}% reduction in surface texture intensity between the pre- and post-treatment photos, consistent with visible smoothing in the tracked area.`;
  } else if(a.pctChange >= 5){
    verdict = `${who}'s sampled region shows a ${a.pctChange.toFixed(1)}% increase in surface texture intensity between the pre- and post-treatment photos — worth a closer clinical look at this area.`;
  } else {
    verdict = `${who}'s sampled region shows little change (${a.pctChange.toFixed(1)}%) in surface texture intensity between the two photos — no substantial difference detected in this window.`;
  }
  verdict += ` ${a.flaggedPct.toFixed(1)}% of the sampled pixels crossed the difference threshold of ${THRESHOLD}.`;
  $('summaryText').textContent = verdict;
}

/* -------------------------- compare slider -------------------------- */

function setupCompareSlider(){
  const wrap = $('compareSlider');
  $('compareImgPre').src = state.pre.dataURL;
  $('compareImgPost').src = state.post.dataURL;
  const setFullWidth = () => {
    const w = wrap.clientWidth;
    $('compareClip').querySelector('img').style.width = w+'px';
  };
  requestAnimationFrame(setFullWidth);
  window.addEventListener('resize', setFullWidth);
  const range = $('compareRange');
  range.oninput = () => {
    $('compareClip').style.width = range.value+'%';
    $('compareHandle').style.left = range.value+'%';
  };
}

/* -------------------------- PDF report -------------------------- */

function detectImageFormat(dataURL){
  const m = /^data:image\/(\w+);/.exec(dataURL);
  const type = m ? m[1].toLowerCase() : 'jpeg';
  if(type === 'png') return 'PNG';
  if(type === 'webp') return 'WEBP';
  return 'JPEG';
}

function addImageFit(doc, dataURL, x, y, maxW, maxH){
  return new Promise(resolve=>{
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxW/img.width, maxH/img.height);
      const w = img.width*ratio, h = img.height*ratio;
      doc.addImage(dataURL, detectImageFormat(dataURL), x + (maxW-w)/2, y + (maxH-h)/2, w, h);
      resolve({w,h});
    };
    img.src = dataURL;
  });
}

async function exportPdf(){
  if(!lastAnalysis){ toast('Run an analysis first'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 0;

  // header band
  doc.setFillColor(16,34,43);
  doc.rect(0,0,pageW,72,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold'); doc.setFontSize(20);
  doc.text('Scaralyze', margin, 32);
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.text('Scar texture progress report — generated ' + new Date().toLocaleDateString(), margin, 50);
  y = 96;

  // patient info
  const name = $('patientName').value || 'Unnamed patient';
  const pid = $('patientId').value;
  const datePre = $('datePre').value;
  const datePost = $('datePost').value;
  const notes = $('clinicianNotes').value;

  doc.setTextColor(16,34,43);
  doc.setFont('helvetica','bold'); doc.setFontSize(13);
  doc.text('Patient', margin, y); y += 16;
  doc.setFont('helvetica','normal'); doc.setFontSize(10.5);
  doc.text(`Name: ${name}`, margin, y); y += 14;
  if(pid) { doc.text(`Case ID: ${pid}`, margin, y); y += 14; }
  doc.text(`Pre-treatment date: ${datePre || '—'}     Post-treatment date: ${datePost || '—'}`, margin, y); y += 14;
  if(notes){ doc.text(`Clinician notes: ${notes}`, margin, y); y += 14; }
  y += 10;

  // full photos side by side
  doc.setFont('helvetica','bold'); doc.setFontSize(13);
  doc.text('Photos', margin, y); y += 10;
  const halfW = (pageW - margin*2 - 16)/2, photoH = 150;
  await addImageFit(doc, state.pre.dataURL, margin, y, halfW, photoH);
  await addImageFit(doc, state.post.dataURL, margin+halfW+16, y, halfW, photoH);
  doc.setFontSize(9); doc.setTextColor(90,110,118);
  doc.text('Pre-treatment', margin, y+photoH+12);
  doc.text('Post-treatment', margin+halfW+16, y+photoH+12);
  y += photoH + 28;
  doc.setTextColor(16,34,43);

  // texture / diff thumbnails strip
  doc.setFont('helvetica','bold'); doc.setFontSize(13);
  doc.text('Sampled region — texture & difference maps', margin, y); y += 10;
  const cells = document.querySelectorAll('#resultGrid canvas');
  const labels = ['Pre region','Pre texture','Post region','Post texture','Difference','Above threshold'];
  const cellW = (pageW - margin*2 - 5*10)/6, cellH = cellW;
  let cx = margin;
  for(let i=0;i<cells.length;i++){
    const durl = cells[i].toDataURL('image/jpeg', 0.92);
    await addImageFit(doc, durl, cx, y, cellW, cellH);
    doc.setFontSize(6.6); doc.setTextColor(90,110,118);
    doc.text(labels[i]||'', cx, y+cellH+9, { maxWidth: cellW });
    doc.setTextColor(16,34,43);
    cx += cellW + 10;
  }
  y += cellH + 26;

  // metrics table
  const a = lastAnalysis;
  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Metric','Pre','Post','Change']],
    body: [
      ['Local std. deviation (\u03C3)', a.preStd.toFixed(2), a.postStd.toFixed(2), (a.postStd-a.preStd).toFixed(2)],
      ['Texture volume (\u03A3 edge magnitude)', a.volPre.toLocaleString(), a.volPost.toLocaleString(), (a.pctChange>=0?'+':'')+a.pctChange.toFixed(1)+'%'],
      ['Absolute difference volume', a.volDiff.toLocaleString(), '', ''],
      ['Pixels flagged above threshold ('+THRESHOLD+')', (a.flaggedPct||0).toFixed(1)+'%', '', ''],
    ],
    styles: { font:'helvetica', fontSize:9.5, textColor:[16,34,43] },
    headStyles: { fillColor:[14,168,147], textColor:255 },
    theme: 'grid'
  });
  y = doc.lastAutoTable.finalY + 24;

  if(y > 700){ doc.addPage(); y = 50; }

  // summary
  doc.setFillColor(227,245,242);
  doc.roundedRect(margin, y, pageW-margin*2, 70, 6, 6, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(11,127,112);
  doc.text('SUMMARY', margin+16, y+20);
  doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(16,34,43);
  doc.text(doc.splitTextToSize($('summaryText').textContent, pageW-margin*2-32), margin+16, y+38);
  y += 90;

  doc.setFontSize(8); doc.setTextColor(140,150,155);
  doc.text('Scaralyze is a texture-tracking aid, not a validated diagnostic device. It does not replace clinical judgment.', margin, 812);

  doc.save(`Scaralyze_Report_${(name||'patient').replace(/\s+/g,'_')}.pdf`);
  toast('PDF report downloaded');
}

/* -------------------------- mode + wiring -------------------------- */

function setMode(mode){
  CURRENT_MODE = mode;
  document.body.classList.toggle('mode-patient', mode === 'patient');
  $('btnModeClinician').classList.toggle('active', mode==='clinician');
  $('btnModePatient').classList.toggle('active', mode==='patient');
}

function enterWorkspace(mode){
  setMode(mode);
  $('hero').hidden = true;
  $('workspace').hidden = false;
  $('modeSwitch').hidden = false;
  window.scrollTo({top:0, behavior:'smooth'});
}

function init(){
  $('pickClinician').addEventListener('click', ()=>enterWorkspace('clinician'));
  $('pickPatient').addEventListener('click', ()=>enterWorkspace('patient'));
  $('btnModeClinician').addEventListener('click', ()=>setMode('clinician'));
  $('btnModePatient').addEventListener('click', ()=>setMode('patient'));
  $('btnStartOver').addEventListener('click', ()=>{ if(confirm('Clear everything and start over?')) location.reload(); });

  $('fileInputPre').addEventListener('change', e=>handleFile(e.target.files[0], 'pre'));
  $('fileInputPost').addEventListener('change', e=>handleFile(e.target.files[0], 'post'));
  $('replacePre').addEventListener('click', ()=>$('fileInputPre').click());
  $('replacePost').addEventListener('click', ()=>$('fileInputPost').click());

  wireCanvasInteractions('pre');
  wireCanvasInteractions('post');

  $('autoPre').addEventListener('click', ()=>autoDetect('pre'));
  $('autoPost').addEventListener('click', ()=>autoDetect('post'));

  $('windowSize').addEventListener('input', e=>{
    WINDOW_SIZE = parseInt(e.target.value,10);
    $('windowSizeLabel').textContent = WINDOW_SIZE+'px';
    if(state.pre) drawOverlay('pre');
    if(state.post) drawOverlay('post');
  });

  $('threshold').addEventListener('input', e=>{
    THRESHOLD = parseInt(e.target.value,10);
    $('threshLabel').textContent = THRESHOLD;
    if(lastAnalysis) applyThreshold();
  });

  $('analyzeBtn').addEventListener('click', runAnalysis);
  $('exportPdfBtn').addEventListener('click', exportPdf);
  $('patientName').addEventListener('input', ()=>{ if(lastAnalysis) renderSummary(); });
}

document.addEventListener('DOMContentLoaded', init);
