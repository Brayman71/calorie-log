/* Camera barcode scanner.
   Uses the phone's built-in BarcodeDetector where it exists (Android Chrome).
   iPhone Safari doesn't have one yet, so we load a small ZXing-based stand-in (barcode-detector on jsDelivr)
   the first time you scan; the service worker keeps a copy so it also works offline afterwards. */
window.CL = window.CL || {};
(function(){
const PONYFILL="https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/dist/iife/ponyfill.min.js";
const FORMATS=["ean_13","ean_8","upc_a","upc_e"];
let DetectorClass=null, loading=null;

function loadScript(src){
  return new Promise((resolve, reject)=>{
    const s=document.createElement("script"); s.src=src; s.async=true; s.crossOrigin="anonymous";
    s.onload=resolve; s.onerror=()=>reject(Object.assign(new Error("Couldn't load the scanner"), {code:"load"}));
    document.head.appendChild(s);
  });
}
async function getDetector(){
  if (DetectorClass) return new DetectorClass({formats:FORMATS});
  if ("BarcodeDetector" in window){
    try {
      const ok=await window.BarcodeDetector.getSupportedFormats();
      if (FORMATS.some(f=>ok.includes(f))){ DetectorClass=window.BarcodeDetector; return new DetectorClass({formats:FORMATS.filter(f=>ok.includes(f))}); }
    } catch(e){}
  }
  if (!loading) loading=loadScript(PONYFILL);
  await loading;
  DetectorClass=window.BarcodeDetectionAPI && window.BarcodeDetectionAPI.BarcodeDetector;
  if (!DetectorClass) throw Object.assign(new Error("Scanner unavailable"), {code:"load"});
  return new DetectorClass({formats:FORMATS});
}

let stream=null, running=false, timer=null;

function stop(){
  running=false; clearTimeout(timer);
  if (stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
}

/* Opens the camera in `video` and resolves with the first barcode it sees.
   onStatus(text) gets friendly progress messages. Rejects with {code} on trouble. */
async function scan(video, onStatus){
  stop();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
    throw Object.assign(new Error("No camera"), {code:window.isSecureContext? "nocamera" : "insecure"});
  onStatus && onStatus("Starting the camera…");
  try {
    stream=await navigator.mediaDevices.getUserMedia({audio:false, video:{facingMode:{ideal:"environment"}, width:{ideal:1280}, height:{ideal:720}}});
  } catch(e){
    throw Object.assign(new Error(e.message), {code: e.name==="NotAllowedError"||e.name==="SecurityError"? "denied" : e.name==="NotFoundError"? "nocamera" : "camera"});
  }
  video.setAttribute("playsinline",""); video.muted=true;
  video.srcObject=stream;
  try { await video.play(); } catch(e){}
  onStatus && onStatus("Loading the scanner…");
  let detector;
  try { detector=await getDetector(); }
  catch(e){ stop(); throw e; }
  onStatus && onStatus("Point the camera at the barcode");
  running=true;
  return new Promise((resolve, reject)=>{
    let last="", hits=0;
    const tick=async()=>{
      if (!running) return reject(Object.assign(new Error("stopped"), {code:"cancelled"}));
      try {
        if (video.readyState>=2){
          const codes=await detector.detect(video);
          const c=codes && codes.find(x=>/^\d{6,14}$/.test(x.rawValue));
          if (c){
            // Two matching reads in a row avoids the odd misread from a blurry frame.
            if (c.rawValue===last) hits++; else { last=c.rawValue; hits=1; }
            if (hits>=2){ stop(); try { navigator.vibrate && navigator.vibrate(60); } catch(e){} return resolve(c.rawValue); }
          }
        }
      } catch(e){ /* a frame that can't be read; keep going */ }
      if (running) timer=setTimeout(tick, 120);
      else reject(Object.assign(new Error("stopped"), {code:"cancelled"}));
    };
    tick();
  });
}

/* Optional flashlight (works on Android; iPhone Safari doesn't expose it). */
function torchSupported(){
  const t=stream && stream.getVideoTracks()[0];
  try { return !!(t && t.getCapabilities && t.getCapabilities().torch); } catch(e){ return false; }
}
async function setTorch(on){
  const t=stream && stream.getVideoTracks()[0];
  if (t) try { await t.applyConstraints({advanced:[{torch:!!on}]}); } catch(e){}
}

function errorText(e){
  switch (e && e.code){
    case "denied": return "Camera access is off. On iPhone: Settings → Safari → Camera → Allow (or, for the home-screen app, tap Allow when it asks). You can also type the barcode numbers below.";
    case "insecure": return "The camera only works when the app is opened over https (like the GitHub Pages link).";
    case "nocamera": return "No camera found on this device. Type the barcode numbers below instead.";
    case "load": return "Couldn't load the scanner. Connect to the internet once so it can download, then it works offline.";
    default: return "The camera didn't start. Close other apps using it and try again, or type the barcode numbers below.";
  }
}

CL.scanner = {scan, stop, torchSupported, setTorch, errorText, PONYFILL};
})();
