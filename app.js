/* ==========================================================================
   SCARALYZE — client-side texture/edge-density analysis + PDF report
   All image processing happens in-browser via <canvas>. No photo ever
   leaves the device. Pipeline: grayscale -> local std -> Sobel edge magnitude
   ("texture map", not a real collagen assay) -> difference map -> threshold.
   ========================================================================== */

const WORK_MAX = 480;         // max working-canvas dimension, for performance
const MIN_WINDOW = 20;
const MAX_WINDOW = 140;
let CURRENT_MODE = 'clinician';
let WINDOW_SIZE = 60;
let THRESHOLD = 160;
let LANG = 'en';

const state = { pre: null, post: null };
let lastAnalysis = null;

/* ================================ i18n ================================== */

const I18N = {
  en: {
    docTitle: "Scaralyze — Scar Texture Progress Tracker",
    navClinician: "Clinician view", navPatient: "My progress", navStartOver: "Start over",
    heroBadge: "Private by design · runs in your browser",
    heroTitle: "Measure the healing, not just the eye test.",
    heroSub: "Scaralyze compares two photos of the same skin — before and after — and turns the change in surface texture into numbers, maps and a plain-language report. Choose how you want to use it.",
    roleClinTitle: "I'm a clinician",
    roleClinDesc: "Full dashboard: region picking, texture maps, difference threshold, metrics table and PDF report.",
    rolePatTitle: "I'm tracking my own scar",
    rolePatDesc: "A simple before/after slider, one auto-picked region and a short summary you can save or share with your provider.",
    heroDisclaimer: "Your photos never leave your device. This is a texture-tracking tool, not a diagnostic device, and it does not replace clinical judgment.",
    caseTitle: "Case details",
    fName: "Patient name", phName: "e.g. Ahmed Basyony",
    fId: "Case / record ID", phOptional: "optional",
    fDatePre: "Pre-treatment date", fDatePost: "Post-treatment date",
    fNotes: "Clinician notes", phNotes: "optional, appears on report",
    regionTitle: "Pick the scar region",
    regionHint: "Upload both photos, then drag the box onto the scar with your mouse (or click anywhere to jump it there). Drag a corner to resize it, or use the slider below.",
    slotPreLabel: "Pre", slotPreSub: "before", slotPostLabel: "Post", slotPostSub: "after",
    dropPre: "Upload or capture the pre photo", dropPost: "Upload or capture the post photo",
    dropSub: "Tap to choose, or drop an image here",
    btnAuto: "Auto-detect region", btnCam: "Take live photo", btnReplace: "Replace photo",
    sampleWindow: "Sample window", diffThreshold: "Difference threshold",
    analyzeHint: "Upload both photos to enable analysis", btnAnalyze: "Run analysis",
    resultsTitle: "Results",
    compareCaption: "Drag the handle to compare the two full photos.",
    tableTitle: "Texture volume table",
    summaryLabel: "Auto-generated summary",
    btnPdf: "Download PDF report",
    pdfHint: "Includes patient details, both photos, texture maps, the table above and this summary.",
    camTitle: "Live skin capture", camCapture: "Capture photo", camCancel: "Cancel",
    camError: "Unable to access the camera. Check your browser permissions.",
    footer: "<strong>Scaralyze</strong> is a texture-tracking aid built for visualizing change between two photos of the same skin area. It is not a diagnostic device, is not validated against histological collagen measurement, and does not replace evaluation by a qualified clinician. All processing happens locally in your browser.",

    // dynamic
    cellPreRegion: "Pre · sampled region", cellPreTex: "Pre · texture map (edge density)",
    cellPostRegion: "Post · sampled region", cellPostTex: "Post · texture map (edge density)",
    cellDiff: "|Pre − Post| difference", cellThresh: "Difference above threshold ({t})",
    thMetric: "Metric", thPre: "Pre", thPost: "Post", thChange: "Change",
    rowStd: "Local std. deviation (σ)", rowVol: "Texture volume (Σ edge magnitude)",
    rowDiff: "Absolute difference volume", rowFlag: "Pixels flagged above threshold",
    thisPatient: "This patient",
    sumDown: "{who}'s sampled region shows a {p}% reduction in surface texture intensity between the pre- and post-treatment photos, consistent with visible smoothing in the tracked area.",
    sumUp: "{who}'s sampled region shows a {p}% increase in surface texture intensity between the pre- and post-treatment photos — worth a closer clinical look at this area.",
    sumFlat: "{who}'s sampled region shows little change ({p}%) in surface texture intensity between the two photos — no substantial difference detected in this window.",
    sumTail: " {f}% of the sampled pixels crossed the difference threshold of {t}.",
    toastAuto: "Auto-detected the highest-texture window on the {side} photo",
    sidePre: "pre", sidePost: "post",
    toastPdf: "PDF report downloaded", runFirst: "Run an analysis first",
    notImage: "Please choose an image file",
    confirmReset: "Clear everything and start over?",
    alt_pre: "Pre-treatment full photo", alt_post: "Post-treatment full photo",

    // PDF (ASCII-safe for the built-in PDF font)
    pdfSub: "Scar texture progress report - generated {date}",
    pdfPatient: "Patient", pdfName: "Name", pdfCase: "Case ID",
    pdfDatePre: "Pre-treatment date", pdfDatePost: "Post-treatment date", pdfNotes: "Clinician notes",
    pdfPhotos: "Photos", pdfPreCap: "Pre-treatment", pdfPostCap: "Post-treatment",
    pdfMaps: "Sampled region - texture & difference maps",
    pdfL1: "Pre region", pdfL2: "Pre texture", pdfL3: "Post region", pdfL4: "Post texture", pdfL5: "Difference", pdfL6: "Above threshold",
    pdfRowStd: "Local std. deviation (sigma)", pdfRowVol: "Texture volume (sum of edge magnitude)",
    pdfRowDiff: "Absolute difference volume", pdfRowFlag: "Pixels flagged above threshold",
    pdfSummary: "Summary", pdfUnnamed: "Unnamed patient",
    pdfFooter: "Scaralyze is a texture-tracking aid, not a validated diagnostic device. It does not replace clinical judgment."
  },

  ar: {
    docTitle: "سكارالايز — متابعة تحسّن ملمس الندبات",
    navClinician: "عرض الطبيب", navPatient: "تقدّمي", navStartOver: "ابدأ من جديد",
    heroBadge: "خصوصية تامة · تعمل داخل متصفحك",
    heroTitle: "قِس التئام الندبة بالأرقام، لا بالنظر فقط.",
    heroSub: "يقارن سكارالايز بين صورتين لنفس الجلد — قبل وبعد — ويحوّل التغيّر في ملمس السطح إلى أرقام وخرائط وتقرير مبسّط. اختر طريقة الاستخدام.",
    roleClinTitle: "أنا طبيب / أخصائي",
    roleClinDesc: "لوحة كاملة: تحديد المنطقة، خرائط الملمس، حدّ الاختلاف، جدول القياسات وتقرير PDF.",
    rolePatTitle: "أتابع ندبتي بنفسي",
    rolePatDesc: "شريط مقارنة بسيط قبل/بعد، ومنطقة واحدة تُحدَّد تلقائياً، وملخص قصير يمكنك حفظه أو مشاركته مع طبيبك.",
    heroDisclaimer: "صورك لا تغادر جهازك أبداً. هذه أداة لتتبّع الملمس وليست جهازاً تشخيصياً، ولا تغني عن تقدير الطبيب.",
    caseTitle: "بيانات الحالة",
    fName: "اسم المريض", phName: "مثال: أحمد بسيوني",
    fId: "رقم الحالة / السجل", phOptional: "اختياري",
    fDatePre: "تاريخ ما قبل العلاج", fDatePost: "تاريخ ما بعد العلاج",
    fNotes: "ملاحظات الطبيب", phNotes: "اختياري، تظهر في التقرير",
    regionTitle: "حدّد منطقة الندبة",
    regionHint: "ارفع الصورتين، ثم اسحب المربع بالماوس إلى الندبة (أو انقر في أي مكان لنقله إليه). اسحب إحدى الزوايا لتغيير الحجم، أو استخدم شريط التمرير أدناه.",
    slotPreLabel: "قبل", slotPreSub: "ما قبل العلاج", slotPostLabel: "بعد", slotPostSub: "ما بعد العلاج",
    dropPre: "ارفع صورة «قبل» أو التقطها", dropPost: "ارفع صورة «بعد» أو التقطها",
    dropSub: "اضغط للاختيار، أو أفلت الصورة هنا",
    btnAuto: "تحديد تلقائي للمنطقة", btnCam: "التقاط صورة", btnReplace: "استبدال الصورة",
    sampleWindow: "حجم المنطقة", diffThreshold: "حدّ الاختلاف",
    analyzeHint: "ارفع الصورتين لتفعيل التحليل", btnAnalyze: "ابدأ التحليل",
    resultsTitle: "النتائج",
    compareCaption: "اسحب المقبض للمقارنة بين الصورتين كاملتين.",
    tableTitle: "جدول حجم الملمس",
    summaryLabel: "ملخص تلقائي",
    btnPdf: "تحميل تقرير PDF",
    pdfHint: "يتضمن بيانات المريض والصورتين وخرائط الملمس والجدول أعلاه وهذا الملخص.",
    camTitle: "التقاط مباشر للجلد", camCapture: "التقاط الصورة", camCancel: "إلغاء",
    camError: "تعذّر الوصول إلى الكاميرا. تحقّق من أذونات المتصفح.",
    footer: "<strong>سكارالايز</strong> أداة مساعدة لتتبّع الملمس، تهدف إلى إظهار التغيّر بين صورتين لنفس منطقة الجلد. وهي ليست جهازاً تشخيصياً، ولم يتم التحقق منها مقارنةً بقياس الكولاجين النسيجي، ولا تغني عن تقييم الطبيب المختص. تتم كل المعالجة محلياً داخل متصفحك.",

    cellPreRegion: "قبل · المنطقة المأخوذة", cellPreTex: "قبل · خريطة الملمس (كثافة الحواف)",
    cellPostRegion: "بعد · المنطقة المأخوذة", cellPostTex: "بعد · خريطة الملمس (كثافة الحواف)",
    cellDiff: "الفرق |قبل − بعد|", cellThresh: "الفرق فوق الحدّ ({t})",
    thMetric: "المقياس", thPre: "قبل", thPost: "بعد", thChange: "التغيّر",
    rowStd: "الانحراف المعياري المحلي (σ)", rowVol: "حجم الملمس (مجموع شدّة الحواف Σ)",
    rowDiff: "حجم الفرق المطلق", rowFlag: "البكسلات فوق الحدّ",
    thisPatient: "هذا المريض",
    sumDown: "لدى {who}، تُظهر المنطقة المحلَّلة انخفاضاً بنسبة {p}% في شدّة ملمس السطح بين صورتي ما قبل العلاج وما بعده، بما يتّسق مع نعومة ظاهرة في المنطقة المتابَعة.",
    sumUp: "لدى {who}، تُظهر المنطقة المحلَّلة ارتفاعاً بنسبة {p}% في شدّة ملمس السطح بين الصورتين — يستحق الأمر نظرة سريرية أدق لهذه المنطقة.",
    sumFlat: "لدى {who}، تُظهر المنطقة المحلَّلة تغيّراً طفيفاً ({p}%) في شدّة ملمس السطح بين الصورتين — لا فرق جوهرياً في هذه المنطقة.",
    sumTail: " تجاوزت {f}% من البكسلات المأخوذة حدّ الاختلاف البالغ {t}.",
    toastAuto: "تم اختيار أعلى منطقة ملمساً في صورة {side}",
    sidePre: "قبل", sidePost: "بعد",
    toastPdf: "تم تحميل تقرير PDF", runFirst: "شغّل التحليل أولاً",
    notImage: "من فضلك اختر ملف صورة",
    confirmReset: "هل تريد مسح كل شيء والبدء من جديد؟",
    alt_pre: "صورة ما قبل العلاج كاملة", alt_post: "صورة ما بعد العلاج كاملة",

    pdfSub: "تقرير تقدّم ملمس الندبة — صدر في {date}",
    pdfPatient: "المريض", pdfName: "الاسم", pdfCase: "رقم الحالة",
    pdfDatePre: "تاريخ ما قبل العلاج", pdfDatePost: "تاريخ ما بعد العلاج", pdfNotes: "ملاحظات الطبيب",
    pdfPhotos: "الصور", pdfPreCap: "قبل العلاج", pdfPostCap: "بعد العلاج",
    pdfMaps: "المنطقة المحلَّلة — خرائط الملمس والاختلاف",
    pdfL1: "منطقة قبل", pdfL2: "ملمس قبل", pdfL3: "منطقة بعد", pdfL4: "ملمس بعد", pdfL5: "الفرق", pdfL6: "فوق الحدّ",
    pdfRowStd: "الانحراف المعياري المحلي (σ)", pdfRowVol: "حجم الملمس (مجموع شدّة الحواف Σ)",
    pdfRowDiff: "حجم الفرق المطلق", pdfRowFlag: "البكسلات فوق الحدّ",
    pdfSummary: "الملخص", pdfUnnamed: "مريض بدون اسم",
    pdfFooter: "سكارالايز أداة لتتبّع الملمس وليست جهازاً تشخيصياً معتمداً، ولا تغني عن تقدير الطبيب."
  }
};

function t(key, params){
  let s = (I18N[LANG] && I18N[LANG][key]);
  if(s === undefined) s = I18N.en[key];
  if(s === undefined) return key;
  if(params) for(const k in params) s = s.split('{'+k+'}').join(params[k]);
  return s;
}

function applyStaticTranslations(){
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $('compareImgPre').alt = t('alt_pre');
  $('compareImgPost').alt = t('alt_post');
  document.title = t('docTitle');
}

function setLang(lang, persist = true){
  LANG = (lang === 'ar') ? 'ar' : 'en';
  const html = document.documentElement;
  html.lang = LANG;
  html.dir = LANG === 'ar' ? 'rtl' : 'ltr';
  document.body.classList.toggle('lang-ar', LANG === 'ar');
  document.querySelectorAll('#langSwitch button').forEach(b => {
    const on = b.dataset.lang === LANG;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  applyStaticTranslations();
  if(lastAnalysis){ renderResultGrid(); applyThreshold(); renderSummary(); }
  if(persist){ try{ localStorage.setItem('scaralyze-lang', LANG); }catch(e){} }
}

function detectInitialLang(){
  try{
    const saved = localStorage.getItem('scaralyze-lang');
    if(saved === 'ar' || saved === 'en') return saved;
  }catch(e){}
  return (navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

/* ---------------------------- small utilities ---------------------------- */

function $(id){ return document.getElementById(id); }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

function toast(msg){
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=>el.classList.remove('show'), 2400);
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

function absDiff(a,b){
  const out = new Uint8ClampedArray(a.length);
  for(let i=0;i<a.length;i++) out[i] = Math.abs(a[i]-b[i]);
  return out;
}

function threshold(buf, thr){
  const out = new Uint8ClampedArray(buf.length);
  for(let i=0;i<buf.length;i++) out[i] = buf[i] > thr ? 255 : 0;
  return out;
}

function sum(buf){ let s=0; for(let i=0;i<buf.length;i++) s+=buf[i]; return s; }

/* -------------------------- image loading + overlay -------------------------- */

function handleFile(file, side){
  if(!file) return;
  if(!file.type.startsWith('image/')){ toast(t('notImage')); return; }
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

  $(side === 'pre' ? 'wrapPre' : 'wrapPost').classList.add('has-image');
  drawOverlay(side);
  updateReadout(side);
  updateAnalyzeButton();

  // patient mode promises one auto-picked region
  if(CURRENT_MODE === 'patient') autoDetect(side, true);
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
  const accent = side === 'pre' ? '#19CDB0' : '#FF6B52';

  ctx.save();

  // dim everything outside the ROI so the chosen area pops
  ctx.fillStyle = 'rgba(8,20,28,0.38)';
  ctx.beginPath();
  ctx.rect(0,0,s.w,s.h);
  ctx.rect(x0,y0,WINDOW_SIZE,WINDOW_SIZE);
  ctx.fill('evenodd');

  // dashed frame
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1.5, s.w/220);
  ctx.setLineDash([5,4]);
  ctx.strokeRect(x0, y0, WINDOW_SIZE, WINDOW_SIZE);
  ctx.setLineDash([]);

  // caliper corner ticks
  const tick = Math.max(6, WINDOW_SIZE*0.14);
  ctx.lineWidth = Math.max(2.5, s.w/150);
  ctx.lineCap = 'round';
  [[x0,y0,1,1],[x0+WINDOW_SIZE,y0,-1,1],[x0,y0+WINDOW_SIZE,1,-1],[x0+WINDOW_SIZE,y0+WINDOW_SIZE,-1,-1]].forEach(([cx,cy,dx,dy])=>{
    ctx.beginPath();
    ctx.moveTo(cx, cy+dy*tick); ctx.lineTo(cx,cy); ctx.lineTo(cx+dx*tick, cy);
    ctx.stroke();
  });

  // drag handles on the corners (resize)
  const hs = Math.max(3.5, s.w/110);
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(1.5, s.w/260);
  [[x0,y0],[x0+WINDOW_SIZE,y0],[x0,y0+WINDOW_SIZE],[x0+WINDOW_SIZE,y0+WINDOW_SIZE]].forEach(([cx,cy])=>{
    ctx.beginPath();
    ctx.arc(cx, cy, hs, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
  });

  // crosshair center
  const arm = Math.max(4, WINDOW_SIZE*0.07);
  ctx.lineWidth = Math.max(1.4, s.w/280);
  ctx.beginPath();
  ctx.moveTo(s.center.x-arm, s.center.y); ctx.lineTo(s.center.x+arm, s.center.y);
  ctx.moveTo(s.center.x, s.center.y-arm); ctx.lineTo(s.center.x, s.center.y+arm);
  ctx.stroke();
  ctx.restore();
}

function updateReadout(side){
  const s = state[side];
  if(!s) return;
  const half = Math.floor(WINDOW_SIZE/2);
  const x0 = clamp(s.center.x-half, 0, s.w-WINDOW_SIZE);
  const y0 = clamp(s.center.y-half, 0, s.h-WINDOW_SIZE);
  const { std } = windowStats(s.gray, s.w, x0, y0, WINDOW_SIZE, WINDOW_SIZE);
  $(side === 'pre' ? 'readoutPre' : 'readoutPost').textContent =
    `x ${s.center.x} · y ${s.center.y} · \u03C3 ${std.toFixed(1)}`;
}

/* Map a pointer event to image pixels. The canvas uses object-fit:contain, so the
   picture can be letterboxed inside the element — account for that offset. */
function canvasMetrics(canvas){
  const rect = canvas.getBoundingClientRect();
  const k = Math.min(rect.width/canvas.width, rect.height/canvas.height); // css px per canvas px
  const ox = (rect.width  - canvas.width*k)/2;
  const oy = (rect.height - canvas.height*k)/2;
  return { rect, k, ox, oy };
}
function canvasPixelFromEvent(canvas, evt){
  const { rect, k, ox, oy } = canvasMetrics(canvas);
  return {
    x: (evt.clientX - rect.left - ox)/k,
    y: (evt.clientY - rect.top  - oy)/k,
    k
  };
}

/* Mouse / touch interaction: drag the ROI box, drag a corner to resize,
   or click/tap outside the box to jump it there (and keep dragging). */
function wireCanvasInteractions(side){
  const canvas = $(side === 'pre' ? 'canvasPre' : 'canvasPost');
  let mode = null;                 // 'move' | 'resize' | null
  let grab = { dx:0, dy:0 };
  let raf = null;

  function hitTest(p){
    const s = state[side];
    const half = WINDOW_SIZE/2;
    const tol = 14 / p.k;          // ~14 css px, expressed in canvas px
    const corners = [
      { x:s.center.x-half, y:s.center.y-half, cur:'nwse-resize' },
      { x:s.center.x+half, y:s.center.y-half, cur:'nesw-resize' },
      { x:s.center.x-half, y:s.center.y+half, cur:'nesw-resize' },
      { x:s.center.x+half, y:s.center.y+half, cur:'nwse-resize' }
    ];
    for(const c of corners){
      if(Math.abs(p.x-c.x) <= tol && Math.abs(p.y-c.y) <= tol) return { type:'resize', cur:c.cur };
    }
    if(Math.abs(p.x-s.center.x) <= half && Math.abs(p.y-s.center.y) <= half) return { type:'move', cur:'grab' };
    return null;
  }

  function schedule(fn){
    if(raf) return;
    raf = requestAnimationFrame(()=>{ raf = null; fn(); });
  }

  canvas.addEventListener('pointerdown', evt => {
    const s = state[side];
    if(!s) return;
    if(evt.pointerType === 'mouse' && evt.button !== 0) return;
    evt.preventDefault();
    const p = canvasPixelFromEvent(canvas, evt);
    const hit = hitTest(p);
    if(hit && hit.type === 'resize'){
      mode = 'resize';
    } else if(hit && hit.type === 'move'){
      mode = 'move';
      grab = { dx: s.center.x - p.x, dy: s.center.y - p.y };
    } else {
      mode = 'move';
      grab = { dx:0, dy:0 };
      s.center = { x: Math.round(p.x), y: Math.round(p.y) };
      drawOverlay(side); updateReadout(side);
    }
    canvas.setPointerCapture(evt.pointerId);
    canvas.style.cursor = mode === 'resize' ? hit.cur : 'grabbing';
  });

  canvas.addEventListener('pointermove', evt => {
    const s = state[side];
    if(!s) return;
    const p = canvasPixelFromEvent(canvas, evt);

    if(!mode){
      const hit = hitTest(p);
      canvas.style.cursor = hit ? hit.cur : 'crosshair';
      return;
    }
    if(mode === 'move'){
      s.center = { x: Math.round(p.x + grab.dx), y: Math.round(p.y + grab.dy) };
      schedule(()=>{ drawOverlay(side); updateReadout(side); });
    } else if(mode === 'resize'){
      const raw = 2*Math.max(Math.abs(p.x - s.center.x), Math.abs(p.y - s.center.y));
      setWindowSize(raw);
    }
  });

  const end = evt => {
    if(!mode) return;
    mode = null;
    try{ canvas.releasePointerCapture(evt.pointerId); }catch(e){}
    const p = canvasPixelFromEvent(canvas, evt);
    const hit = state[side] ? hitTest(p) : null;
    canvas.style.cursor = hit ? hit.cur : 'crosshair';
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

// change the shared sample-window size (slider, corner-drag)
function setWindowSize(raw){
  const maxFit = Math.min(MAX_WINDOW, ...['pre','post'].filter(k=>state[k]).map(k=>Math.min(state[k].w, state[k].h)-2));
  const size = clamp(Math.round(raw/4)*4, MIN_WINDOW, Math.max(MIN_WINDOW, maxFit));
  $('windowSize').value = size;
  $('windowSizeLabel').textContent = size + 'px';
  if(size === WINDOW_SIZE) return;
  WINDOW_SIZE = size;
  ['pre','post'].forEach(k=>{ if(state[k]){ drawOverlay(k); updateReadout(k); } });
}

/* -------------------------- auto-detect region -------------------------- */

function autoDetect(side, silent){
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
  updateReadout(side);
  if(!silent) toast(t('toastAuto', { side: t(side === 'pre' ? 'sidePre' : 'sidePost') }));
}

/* -------------------------- run full analysis -------------------------- */

function updateAnalyzeButton(){
  const ready = !!(state.pre && state.post);
  $('analyzeBtn').disabled = !ready;
  document.querySelector('.analyze-wrap').classList.toggle('ready', ready);
}

function colorRamp(v){
  // 0 -> teal wash, 255 -> coral
  const k = v/255;
  const c1 = [227,245,242], c2 = [255,107,82];
  return [0,1,2].map(i => Math.round(c1[i]+(c2[i]-c1[i])*k));
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

function styleResultCanvas(canvas){
  canvas.style.width = '100%'; canvas.style.aspectRatio = '1/1';
  canvas.style.objectFit = 'contain'; canvas.style.background = '#0F1C22';
}

function addResultCell(container, canvas, label, flag){
  const cell = document.createElement('div');
  cell.className = 'result-cell' + (flag ? ' flag' : '');
  styleResultCanvas(canvas);
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

  const size = WINDOW_SIZE;
  const half = Math.floor(size/2);
  ['pre','post'].forEach(side=>{
    const s = state[side];
    s.center.x = clamp(s.center.x, half, s.w-half-1);
    s.center.y = clamp(s.center.y, half, s.h-half-1);
  });

  const preX0 = state.pre.center.x-half, preY0 = state.pre.center.y-half;
  const postX0 = state.post.center.x-half, postY0 = state.post.center.y-half;

  const preRegion = extractRegion(state.pre.gray, state.pre.w, preX0, preY0, size, size);
  const postRegion = extractRegion(state.post.gray, state.post.w, postX0, postY0, size, size);

  const preStd = windowStats(state.pre.gray, state.pre.w, preX0, preY0, size, size).std;
  const postStd = windowStats(state.post.gray, state.post.w, postX0, postY0, size, size).std;

  const preTexture = sobelMagnitude(preRegion, size, size);
  const postTexture = sobelMagnitude(postRegion, size, size);
  const diffMap = absDiff(preTexture, postTexture);

  const volPre = sum(preTexture), volPost = sum(postTexture), volDiff = sum(diffMap);
  const pctChange = volPre === 0 ? 0 : ((volPost-volPre)/volPre)*100;

  lastAnalysis = { size, preRegion, postRegion, preTexture, postTexture, diffMap, volPre, volPost, volDiff, preStd, postStd, pctChange };

  const panel = $('resultsPanel');
  panel.hidden = false;
  // re-trigger the entrance animation on each run
  panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = '';

  renderResultGrid();
  applyThreshold();
  renderSummary();
  setupCompareSlider();

  panel.scrollIntoView({ behavior:'smooth', block:'start' });
}

function renderResultGrid(){
  const grid = $('resultGrid'); grid.innerHTML = '';
  const a = lastAnalysis, n = a.size;
  addResultCell(grid, bufferToCanvas(a.preRegion, n, n, 'gray'), t('cellPreRegion'));
  addResultCell(grid, bufferToCanvas(a.preTexture, n, n, 'gray'), t('cellPreTex'));
  addResultCell(grid, bufferToCanvas(a.postRegion, n, n, 'gray'), t('cellPostRegion'));
  addResultCell(grid, bufferToCanvas(a.postTexture, n, n, 'gray'), t('cellPostTex'));
  addResultCell(grid, bufferToCanvas(a.diffMap, n, n, 'ramp'), t('cellDiff'), true);
  const threshCanvas = bufferToCanvas(threshold(a.diffMap, THRESHOLD), n, n, 'ramp');
  threshCanvas.id = 'threshCellCanvas';
  addResultCell(grid, threshCanvas, t('cellThresh', { t: THRESHOLD }), true);
}

function applyThreshold(){
  if(!lastAnalysis) return;
  const a = lastAnalysis, n = a.size;
  const bin = threshold(a.diffMap, THRESHOLD);
  a.flaggedPct = (sum(bin)/255/bin.length*100);

  const existing = $('threshCellCanvas');
  if(existing){
    const fresh = bufferToCanvas(bin, n, n, 'ramp');
    existing.replaceWith(fresh);
    fresh.id = 'threshCellCanvas';
    styleResultCanvas(fresh);
    const lbl = fresh.parentElement.querySelector('.cell-label');
    if(lbl) lbl.textContent = t('cellThresh', { t: THRESHOLD });
  }
  renderMetricsTable();
  renderSummary();
}

function renderMetricsTable(){
  const a = lastAnalysis;
  const tbl = $('metricsTable');
  const deltaClass = a.volPost < a.volPre ? 'delta-pos' : (a.volPost > a.volPre ? 'delta-neg' : '');
  tbl.innerHTML = `
    <thead><tr><th>${t('thMetric')}</th><th>${t('thPre')}</th><th>${t('thPost')}</th><th>${t('thChange')}</th></tr></thead>
    <tbody>
      <tr><td>${t('rowStd')}</td><td class="num">${a.preStd.toFixed(2)}</td><td class="num">${a.postStd.toFixed(2)}</td><td class="num">${(a.postStd-a.preStd).toFixed(2)}</td></tr>
      <tr><td>${t('rowVol')}</td><td class="num">${a.volPre.toLocaleString('en-US')}</td><td class="num">${a.volPost.toLocaleString('en-US')}</td><td class="num ${deltaClass}">${a.pctChange>=0?'+':''}${a.pctChange.toFixed(1)}%</td></tr>
      <tr><td>${t('rowDiff')}</td><td class="num" colspan="2">${a.volDiff.toLocaleString('en-US')}</td><td class="num">—</td></tr>
      <tr><td>${t('rowFlag')}</td><td class="num" colspan="2">${a.flaggedPct!==undefined ? a.flaggedPct.toFixed(1)+'%' : '—'}</td><td class="num">thr = ${THRESHOLD}</td></tr>
    </tbody>`;
}

function renderSummary(){
  const a = lastAnalysis;
  if(!a || a.flaggedPct === undefined) return;
  const name = ($('patientName').value || '').trim();
  const who = name || t('thisPatient');
  let verdict;
  if(a.pctChange <= -5)      verdict = t('sumDown', { who, p: Math.abs(a.pctChange).toFixed(1) });
  else if(a.pctChange >= 5)  verdict = t('sumUp',   { who, p: a.pctChange.toFixed(1) });
  else                       verdict = t('sumFlat', { who, p: a.pctChange.toFixed(1) });
  verdict += t('sumTail', { f: a.flaggedPct.toFixed(1), t: THRESHOLD });
  $('summaryText').textContent = verdict;
}

/* -------------------------- compare slider -------------------------- */

function syncCompareWidth(){
  const wrap = $('compareSlider');
  if(!wrap) return;
  $('compareImgPost').style.width = wrap.clientWidth + 'px';
}

function setupCompareSlider(){
  $('compareImgPre').src = state.pre.dataURL;
  $('compareImgPost').src = state.post.dataURL;
  requestAnimationFrame(syncCompareWidth);
  const range = $('compareRange');
  range.value = 50;
  $('compareClip').style.width = '50%';
  $('compareHandle').style.left = '50%';
  range.oninput = () => {
    $('compareClip').style.width = range.value+'%';
    $('compareHandle').style.left = range.value+'%';
  };
}

/* -------------------------- PDF report -------------------------- */

const hasArabic = s => /[\u0600-\u06FF]/.test(s);

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

/* jsPDF's built-in fonts have no Arabic glyphs, so any text containing Arabic
   (and every string in Arabic mode) is rendered to a canvas with the Cairo
   web-font and placed as an image. Latin text uses native PDF text.
   Returns the height used. `y` is the TOP of the text box. */
function pdfText(doc, text, x, y, w, o = {}){
  const size = o.size || 10.5;
  const color = o.color || [16,34,43];
  const bold = !!o.bold;
  const align = o.align || 'left';
  text = String(text);

  if(LANG === 'ar' || hasArabic(text)){
    const scale = 3, lh = size*1.6;
    const font = `${bold?700:400} ${size*scale}px Cairo, Tahoma, sans-serif`;
    const dir = LANG === 'ar' ? 'rtl' : 'ltr';
    const m = document.createElement('canvas').getContext('2d');
    m.font = font; m.direction = dir;
    const lines = []; let cur = '';
    text.split(/\s+/).forEach(word=>{
      const test = cur ? cur+' '+word : word;
      if(cur && m.measureText(test).width > w*scale){ lines.push(cur); cur = word; } else cur = test;
    });
    if(cur) lines.push(cur);

    const c = document.createElement('canvas');
    c.width = Math.ceil(w*scale); c.height = Math.ceil(lines.length*lh*scale);
    const ctx = c.getContext('2d');
    ctx.font = font; ctx.direction = dir; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    ctx.textAlign = align;
    const tx = align === 'right' ? c.width : align === 'center' ? c.width/2 : 0;
    lines.forEach((ln,i)=> ctx.fillText(ln, tx, (i+.5)*lh*scale));
    const h = c.height/scale;
    doc.addImage(c.toDataURL('image/png'), 'PNG', x, y, w, h);
    return h;
  }

  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
  const lines = doc.splitTextToSize(text, w);
  const tx = align === 'right' ? x+w : align === 'center' ? x+w/2 : x;
  doc.text(lines, tx, y + size*0.85, { align });
  return lines.length * size * 1.35;
}

async function exportPdf(){
  if(!lastAnalysis){ toast(t('runFirst')); return; }
  const { jsPDF } = window.jspdf;
  const isAR = LANG === 'ar';
  if(isAR && document.fonts){
    try{ await Promise.all([document.fonts.load('400 20px Cairo'), document.fonts.load('700 20px Cairo')]); }catch(e){}
  }

  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40, contentW = pageW - margin*2;
  const al = isAR ? 'right' : 'left';
  const a = lastAnalysis;
  const GREY = [90,110,118], INK = [16,34,43];
  let y = 0;

  // header band
  doc.setFillColor(11,31,42);
  doc.rect(0,0,pageW,76,'F');
  pdfText(doc, 'Scaralyze', margin, 16, contentW, { size:21, bold:true, color:[255,255,255], align:al });
  pdfText(doc, t('pdfSub', { date: new Date().toLocaleDateString('en-GB') }), margin, 46, contentW, { size:10, color:[190,215,222], align:al });
  y = 98;

  // patient info
  const name = $('patientName').value.trim() || t('pdfUnnamed');
  const pid = $('patientId').value.trim();
  const datePre = $('datePre').value;
  const datePost = $('datePost').value;
  const notes = $('clinicianNotes').value.trim();

  y += pdfText(doc, t('pdfPatient'), margin, y, contentW, { size:13, bold:true, align:al }) + 4;
  const info = [ `${t('pdfName')}: ${name}` ];
  if(pid) info.push(`${t('pdfCase')}: ${pid}`);
  info.push(`${t('pdfDatePre')}: ${datePre || '—'}`);
  info.push(`${t('pdfDatePost')}: ${datePost || '—'}`);
  if(notes) info.push(`${t('pdfNotes')}: ${notes}`);
  info.forEach(line => { y += pdfText(doc, line, margin, y, contentW, { size:10.5, align:al }) + 1; });
  y += 12;

  // full photos side by side (order mirrors the on-screen layout)
  y += pdfText(doc, t('pdfPhotos'), margin, y, contentW, { size:13, bold:true, align:al }) + 6;
  const halfW = (contentW - 16)/2, photoH = 150;
  const xPre = isAR ? margin + halfW + 16 : margin;
  const xPost = isAR ? margin : margin + halfW + 16;
  await addImageFit(doc, state.pre.dataURL, xPre, y, halfW, photoH);
  await addImageFit(doc, state.post.dataURL, xPost, y, halfW, photoH);
  pdfText(doc, t('pdfPreCap'), xPre, y+photoH+4, halfW, { size:9, color:GREY, align:'center' });
  pdfText(doc, t('pdfPostCap'), xPost, y+photoH+4, halfW, { size:9, color:GREY, align:'center' });
  y += photoH + 30;

  // texture / diff thumbnails
  y += pdfText(doc, t('pdfMaps'), margin, y, contentW, { size:13, bold:true, align:al }) + 6;
  const cells = document.querySelectorAll('#resultGrid canvas');
  const labels = ['pdfL1','pdfL2','pdfL3','pdfL4','pdfL5','pdfL6'];
  const gap = 10, cellW = (contentW - 5*gap)/6;
  for(let i=0;i<cells.length;i++){
    const cx = isAR ? margin + (5-i)*(cellW+gap) : margin + i*(cellW+gap);
    await addImageFit(doc, cells[i].toDataURL('image/png'), cx, y, cellW, cellW);
    pdfText(doc, t(labels[i]), cx, y+cellW+3, cellW, { size:7.5, color:GREY, align:'center' });
  }
  y += cellW + 30;

  // metrics table (drawn manually so Arabic labels work)
  const widths = [0.46, 0.18, 0.18, 0.18].map(r => r*contentW);
  const colX = (i, span=1) => {
    const before = widths.slice(0,i).reduce((p,c)=>p+c,0);
    const w = widths.slice(i,i+span).reduce((p,c)=>p+c,0);
    return { x: isAR ? margin + contentW - before - w : margin + before, w };
  };
  const rowH = 26;
  const drawRow = (cellsDef, fill, head) => {
    let col = 0;
    cellsDef.forEach(c => {
      const span = c.span || 1;
      const { x, w } = colX(col, span);
      if(fill){ doc.setFillColor(...fill); doc.rect(x, y, w, rowH, 'F'); }
      doc.setDrawColor(210,222,225); doc.setLineWidth(.6); doc.rect(x, y, w, rowH);
      pdfText(doc, c.text, x+8, y+6, w-16, {
        size: 9.5, bold: head || !!c.bold, color: c.color || (head ? [255,255,255] : INK),
        align: col === 0 ? al : 'center'
      });
      col += span;
    });
    y += rowH;
  };
  const dColor = a.volPost < a.volPre ? [10,131,116] : (a.volPost > a.volPre ? [226,73,47] : INK);
  drawRow([{text:t('thMetric')},{text:t('thPre')},{text:t('thPost')},{text:t('thChange')}], [14,168,147], true);
  drawRow([{text:t('pdfRowStd')},{text:a.preStd.toFixed(2)},{text:a.postStd.toFixed(2)},{text:(a.postStd-a.preStd).toFixed(2)}]);
  drawRow([{text:t('pdfRowVol')},{text:a.volPre.toLocaleString('en-US')},{text:a.volPost.toLocaleString('en-US')},
           {text:(a.pctChange>=0?'+':'')+a.pctChange.toFixed(1)+'%', bold:true, color:dColor}]);
  drawRow([{text:t('pdfRowDiff')},{text:a.volDiff.toLocaleString('en-US'), span:2},{text:'—'}]);
  drawRow([{text:t('pdfRowFlag')},{text:(a.flaggedPct||0).toFixed(1)+'%', span:2},{text:'thr = '+THRESHOLD}]);
  y += 24;

  // summary box
  const boxH = 108;
  if(y + boxH > pageH - 50){ doc.addPage(); y = 50; }
  doc.setFillColor(226,246,242);
  doc.roundedRect(margin, y, contentW, boxH, 8, 8, 'F');
  pdfText(doc, t('pdfSummary'), margin+16, y+12, contentW-32, { size:10, bold:true, color:[10,131,116], align:al });
  pdfText(doc, $('summaryText').textContent, margin+16, y+32, contentW-32, { size:10.5, align:al });

  pdfText(doc, t('pdfFooter'), margin, pageH-34, contentW, { size:8, color:[140,150,155], align:al });

  doc.save(`Scaralyze_Report_${(name||'patient').replace(/\s+/g,'_')}.pdf`);
  toast(t('toastPdf'));
}

/* -------------------------- live camera -------------------------- */

let camStream = null, camSide = null;

async function openCamera(side){
  camSide = side;
  $('camModal').classList.add('open');
  try{
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no camera API');
    camStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }, audio:false });
    $('camVideo').srcObject = camStream;
  }catch(err){
    console.error('Camera access error:', err);
    closeCamera();
    toast(t('camError'));
  }
}

function closeCamera(){
  if(camStream){ camStream.getTracks().forEach(tr => tr.stop()); camStream = null; }
  $('camVideo').srcObject = null;
  $('camModal').classList.remove('open');
  camSide = null;
}

function captureCamera(){
  if(!camSide) return;
  const video = $('camVideo');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const side = camSide;
  canvas.toBlob(blob => {
    if(blob) handleFile(new File([blob], `live-capture-${side}.jpg`, { type:'image/jpeg' }), side);
    closeCamera();
  }, 'image/jpeg', 0.95);
}

/* -------------------------- mode + wiring -------------------------- */

function setMode(mode){
  CURRENT_MODE = mode;
  document.body.classList.toggle('mode-patient', mode === 'patient');
  $('btnModeClinician').classList.toggle('active', mode==='clinician');
  $('btnModePatient').classList.toggle('active', mode==='patient');
  $('btnModeClinician').setAttribute('aria-pressed', mode==='clinician');
  $('btnModePatient').setAttribute('aria-pressed', mode==='patient');
}

function enterWorkspace(mode){
  setMode(mode);
  $('hero').hidden = true;
  $('workspace').hidden = false;
  $('modeSwitch').hidden = false;
  $('btnStartOver').hidden = false;
  window.scrollTo({top:0, behavior:'smooth'});
}

function wireDropZone(side){
  const wrap = $(side === 'pre' ? 'wrapPre' : 'wrapPost');
  ['dragenter','dragover'].forEach(ev => wrap.addEventListener(ev, e => { e.preventDefault(); wrap.classList.add('dragging'); }));
  ['dragleave','drop'].forEach(ev => wrap.addEventListener(ev, e => { e.preventDefault(); wrap.classList.remove('dragging'); }));
  wrap.addEventListener('drop', e => handleFile(e.dataTransfer.files[0], side));
}

function init(){
  setLang(detectInitialLang(), false);
  $('langEn').addEventListener('click', ()=>setLang('en'));
  $('langAr').addEventListener('click', ()=>setLang('ar'));

  $('pickClinician').addEventListener('click', ()=>enterWorkspace('clinician'));
  $('pickPatient').addEventListener('click', ()=>enterWorkspace('patient'));
  $('btnModeClinician').addEventListener('click', ()=>setMode('clinician'));
  $('btnModePatient').addEventListener('click', ()=>setMode('patient'));
  $('btnStartOver').addEventListener('click', ()=>{ if(confirm(t('confirmReset'))) location.reload(); });

  ['Pre','Post'].forEach(S => {
    const side = S.toLowerCase();
    const input = $('fileInput'+S);
    input.addEventListener('change', e => { handleFile(e.target.files[0], side); input.value = ''; });
    $('replace'+S).addEventListener('click', ()=>input.click());
    $('auto'+S).addEventListener('click', ()=>autoDetect(side));
    $('cam'+S).addEventListener('click', ()=>openCamera(side));
    wireCanvasInteractions(side);
    wireDropZone(side);
  });

  $('camCloseBtn').addEventListener('click', closeCamera);
  $('camCaptureBtn').addEventListener('click', captureCamera);
  $('camModal').addEventListener('click', e => { if(e.target === $('camModal')) closeCamera(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && camSide) closeCamera(); });

  $('windowSize').addEventListener('input', e => setWindowSize(parseInt(e.target.value,10)));

  $('threshold').addEventListener('input', e=>{
    THRESHOLD = parseInt(e.target.value,10);
    $('threshLabel').textContent = THRESHOLD;
    if(lastAnalysis) applyThreshold();
  });

  $('analyzeBtn').addEventListener('click', runAnalysis);
  $('exportPdfBtn').addEventListener('click', exportPdf);
  $('patientName').addEventListener('input', ()=>{ if(lastAnalysis) renderSummary(); });
  window.addEventListener('resize', syncCompareWidth);
}

document.addEventListener('DOMContentLoaded', init);
