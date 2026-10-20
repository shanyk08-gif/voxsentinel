import {FluidOrb} from './orb.js?v=amber1';
const $=s=>document.querySelector(s);
const names={wav2vec2:'Wav2Vec2 V7',wavlm:'WavLM',spectral:'Spectral CNN',voxguard:'VoxGuard'};
const orb=new FluidOrb($('#orb'));
let audioContext,analyser,micStream,micSource,capture,mute,playbackSource,ring,write=0,count=0;
let live=false,starting=false,session=0,timer,request=null,busy=false,lastResult=null,lastReceived=0,started=0,previewURL;
let history=[],resultTime='',lastLog='';
$('#motion').setAttribute('aria-pressed',String(orb.running));$('#motion').textContent=orb.running?'Pause motion':'Enable motion';
$('#motion').onclick=()=>{orb.running=!orb.running;$('#motion').setAttribute('aria-pressed',String(orb.running));$('#motion').textContent=orb.running?'Pause motion':'Enable motion';};
$('#detectors').innerHTML=Object.entries(names).map(([key,name])=>`<section class="detector" id="model-${key}"><div class="detector-head"><h3>${name}</h3><strong>—</strong></div><small>Waiting for audio</small><div class="meter"><i></i></div></section>`).join('');
function log(message){if(message===lastLog)return;lastLog=message;const li=document.createElement('li'),time=document.createElement('time'),text=document.createElement('span');time.textContent=new Date().toLocaleTimeString();text.textContent=message;li.append(time,text);$('#logs').prepend(li);while($('#logs').children.length>18)$('#logs').lastChild.remove();}
function state(tone,title,note,kicker){document.body.dataset.tone=tone;orb.tone=tone;$('#verdict').textContent=title;$('#verdictNote').textContent=note;$('#verdictKicker').textContent=kicker;$('#visualMode').textContent=live?'LIVE MICROPHONE':busy?'ANALYZING':kicker;}
function failure(message){$('#error').hidden=false;$('#error').textContent=message;log(message);state('blue','Analysis unavailable.',live?'Listening continues. Waiting for a fresh result.':'Please retry your recording.','NO CURRENT VERDICT');$('#resultAge').textContent='Previous scores, if shown, are not current';}
function clearError(){$('#error').hidden=true;}
function drawHistory(){const canvas=$('#history'),c=canvas.getContext('2d');const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;const d=Math.min(devicePixelRatio||1,2);canvas.width=w*d;canvas.height=h*d;c.scale(d,d);c.strokeStyle='#243145';c.lineWidth=1;for(let i=1;i<4;i++){c.beginPath();c.moveTo(0,h*i/4);c.lineTo(w,h*i/4);c.stroke();}if(!history.length)return;c.beginPath();history.forEach((n,i)=>{const x=i/Math.max(1,history.length-1)*w,y=h-4-n/100*(h-8);i?c.lineTo(x,y):c.moveTo(x,y);});c.strokeStyle=getComputedStyle(document.body).getPropertyValue('--accent');c.lineWidth=1.7;c.stroke();}
new ResizeObserver(drawHistory).observe($('#history'));
function showResult(result){
  refreshDisabledCards(result);
  lastResult=result;lastReceived=Date.now();resultTime=new Date().toLocaleTimeString();$('#report').disabled=false;
  const fake=result.overall.verdict==='synthetic';const score=Number(result.overall.synthetic);
  state(fake?'red':'green',fake?'AI indicators detected.':'Likely human speech.',fake?'One or more detectors flagged synthetic characteristics.':'No enabled detector flagged this audio window.','LATEST ANALYSIS');
  $('#score').innerHTML=`${score.toFixed(1)}<small>%</small>`;
  $('#resultAge').textContent=`Updated ${resultTime}`;
  for(const [key,item] of Object.entries(result.models)){const node=document.getElementById('model-'+key);if(!node)continue;node.dataset.tone=item.verdict==='synthetic'?'red':'green';node.querySelector('strong').textContent=Number(item.synthetic).toFixed(1)+'%';node.querySelector('small').textContent=item.verdict==='synthetic'?'Synthetic indicators':'No synthetic flag';node.querySelector('.meter i').style.width=Math.max(0,Math.min(100,item.synthetic))+'%';}
  history.push(score);if(history.length>50)history.shift();drawHistory();log(`${live?'Microphone':'Upload'}: ${fake?'AI indicators detected':'likely human'} · ${score.toFixed(1)}% highest synthetic indicator.`);
}
async function context(){if(!audioContext)audioContext=new AudioContext();if(audioContext.state==='suspended')await audioContext.resume();return audioContext;}
function makeAnalyser(ctx){const a=ctx.createAnalyser();a.fftSize=1024;a.smoothingTimeConstant=.82;return a;}
function wav(samples,rate){const b=new ArrayBuffer(44+samples.length*2),v=new DataView(b);const str=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};str(0,'RIFF');v.setUint32(4,b.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples.length*2,true);samples.forEach((x,i)=>v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,x))*(x<0?32768:32767)),true));return new Blob([b],{type:'audio/wav'});}
async function analyze(file,isLive,token){
  if(busy)return;busy=true;const controller=new AbortController();request=controller;const timeout=setTimeout(()=>controller.abort(),60000);
  const form=new FormData();form.append('file',file,isLive?'microphone.wav':file.name);form.append('live',String(isLive));
  if(!isLive){$('#upload').disabled=true;$('#microphone').disabled=true;state('blue','Inspecting the signal.','Running your selected detectors.','ANALYZING');}
  state('amber','Analyzing audio.','Checking the signal with your enabled detectors.','ANALYZING');
  $('#visualMode').textContent='ANALYZING';
  $('#statusHint').textContent=isLive?'Listening · analyzing the latest audio window…':'Analyzing your recording…';
  try{const response=await fetch('/api/analyze',{method:'POST',body:form,signal:controller.signal});const result=await response.json();if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'Analysis failed.');if(token!==session)return;clearError();showResult(result);$('#statusHint').textContent=isLive?'Listening · scores refresh as analysis completes.':'Analysis complete. Play the recording or choose another source.';}
  catch(error){if(token===session)failure(error.name==='AbortError'?'Analysis timed out. Please try again.':error.message);}
  finally{clearTimeout(timeout);if(request===controller){request=null;busy=false;if(!live&&!starting){$('#upload').disabled=false;$('#microphone').disabled=false;}}}
}
async function liveTick(token){
  if(!live||token!==session||busy||count<audioContext.sampleRate*3)return;
  const samples=new Float32Array(count),start=(write-count+ring.length)%ring.length;
  for(let i=0;i<count;i++)samples[i]=ring[(start+i)%ring.length];
  // Gate on the most recent second, not old speech still in the rolling window.
  let energy=0;const n=Math.min(samples.length,audioContext.sampleRate);for(let i=samples.length-n;i<samples.length;i++)energy+=samples[i]**2;
  if(Math.sqrt(energy/n)<.001){state('amber','Listening for speech.','Speak naturally. The waveform follows your microphone.','LISTENING');$('#resultAge').textContent=lastResult?'Previous result · waiting for speech':'Waiting for speech';return;}
  await analyze(wav(samples,audioContext.sampleRate),true,token);
}
function stopMicrophone(){
  session++;live=false;starting=false;clearInterval(timer);request?.abort();request=null;busy=false;
  if(capture){capture.port.onmessage=null;capture.disconnect();capture=null;}micSource?.disconnect();micSource=null;mute?.disconnect();mute=null;micStream?.getTracks().forEach(t=>t.stop());micStream=null;ring=null;
  orb.setAnalyser(null);$('#microphone').classList.remove('recording');$('#micLabel').textContent='Start microphone';$('#microphone').disabled=false;$('#upload').disabled=false;
  $('#sourceLabel').textContent='MICROPHONE STOPPED';$('#visualMode').textContent='SESSION STOPPED';
  if(lastResult){state(lastResult.overall.verdict==='synthetic'?'red':'green',lastResult.overall.verdict==='synthetic'?'AI indicators detected.':'Likely human speech.','Showing the last completed assessment.','SESSION STOPPED');$('#verdictNote').textContent='Microphone stopped. Showing the last completed assessment.';$('#resultAge').textContent=`Last result ${resultTime} · microphone stopped`;}
  else state('blue','Ready to listen.','Start your microphone or upload a recording.','STANDBY');
  $('#statusHint').textContent='Microphone off. No audio is being captured.';
}
async function startMicrophone(){
  if(live||starting)return;starting=true;const token=++session;$('#microphone').disabled=true;$('#upload').disabled=true;clearError();$('#audio').pause();lastReceived=0;
  state('blue','Connecting microphone.','Allow microphone access to begin.','CONNECTING');
  try{
    const ctx=await context();const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(token!==session){stream.getTracks().forEach(t=>t.stop());return;}micStream=stream;
    await ctx.audioWorklet.addModule('/static/capture-worklet.js?v=fluid1');if(token!==session)return;
    micSource=ctx.createMediaStreamSource(stream);analyser=makeAnalyser(ctx);micSource.connect(analyser);orb.setAnalyser(analyser);
    capture=new AudioWorkletNode(ctx,'vox-capture');mute=ctx.createGain();mute.gain.value=0;micSource.connect(capture);capture.connect(mute);mute.connect(ctx.destination);
    ring=new Float32Array(ctx.sampleRate*10);write=count=0;
    capture.port.onmessage=event=>{if(token!==session||!ring)return;for(const sample of event.data){ring[write]=sample;write=(write+1)%ring.length;count=Math.min(count+1,ring.length);}};
    live=true;starting=false;started=Date.now();$('#microphone').disabled=false;$('#microphone').classList.add('recording');$('#micLabel').textContent='Stop microphone';$('#sourceLabel').textContent='LIVE MICROPHONE';$('#fileName').textContent='Microphone connected';$('#sourceHint').textContent='Rolling audio analysis · 00:00';$('#preview').hidden=true;
    state('amber','Listening to your voice.','The first assessment appears after enough speech is captured.','LISTENING');$('#statusHint').textContent='Listening · collecting the first audio window.';log('Microphone connected. Live analysis started.');timer=setInterval(()=>liveTick(token),3000);
    for(const track of stream.getAudioTracks())track.onended=()=>{if(live){stopMicrophone();failure('Microphone disconnected.');}};
  }catch(error){if(token!==session)return;stopMicrophone();failure(error.name==='NotAllowedError'?'Microphone permission was denied. Allow access in your browser and retry.':error.message);}
}
$('#microphone').onclick=()=>live?stopMicrophone():startMicrophone();
$('#upload').onclick=()=>$('#file').click();
$('#file').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;event.target.value='';if(file.size>20*1024*1024){failure('Please choose an audio file under 20 MB.');return;}
  stopMicrophone();const token=session;clearError();$('#audio').pause();if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(file);$('#audio').src=previewURL;$('#preview').hidden=false;$('#fileName').textContent=file.name;$('#sourceHint').textContent=`${(file.size/1048576).toFixed(2)} MB · uploaded recording`;$('#sourceLabel').textContent='UPLOADED RECORDING';log('Recording selected: '+file.name);await analyze(file,false,token);
};
$('#audio').onplay=async()=>{try{const ctx=await context();if(!playbackSource){playbackSource=ctx.createMediaElementSource($('#audio'));const a=makeAnalyser(ctx);playbackSource.connect(a);a.connect(ctx.destination);playbackSource.visualAnalyser=a;}if(!live)orb.setAnalyser(playbackSource.visualAnalyser);}catch(error){log('Audio visualization unavailable: '+error.message);}};
$('#audio').onpause=()=>{if(!live)orb.setAnalyser(null);};
$('#reset').onclick=()=>{stopMicrophone();$('#audio').pause();$('#audio').removeAttribute('src');$('#audio').load();if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;lastResult=null;lastReceived=0;history=[];drawHistory();$('#preview').hidden=true;$('#report').disabled=true;$('#score').innerHTML='—<small>%</small>';$('#resultAge').textContent='No analysis yet';$('#fileName').textContent='Choose your audio source';$('#sourceHint').textContent='Microphone or an audio file up to 20 MB';$('#sourceLabel').textContent='NO SOURCE CONNECTED';for(const node of document.querySelectorAll('.detector')){delete node.dataset.tone;node.querySelector('strong').textContent='—';node.querySelector('small').textContent='Waiting for audio';node.querySelector('.meter i').style.width='0%';}clearError();state('blue','Ready to listen.','Start your microphone or upload a recording.','STANDBY');log('Session reset.');};
$('#report').onclick=()=>{if(!lastResult)return;const lines=['VOXSENTINEL — ANALYSIS REPORT',`Completed: ${resultTime}`,`Source: ${lastResult.live?'Live microphone window':$('#fileName').textContent}`,`Verdict: ${lastResult.overall.verdict==='synthetic'?'AI indicators detected':'Likely human speech'}`,`Highest synthetic indicator: ${Number(lastResult.overall.synthetic).toFixed(4)}%`,...Object.entries(lastResult.models).map(([key,m])=>`${names[key]}: ${Number(m.synthetic).toFixed(4)}% synthetic indicator`),'Selected-detector analysis. Model indicators are not calibrated probabilities or proof of authenticity.'];const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='VoxSentinel-report.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
async function health(){try{const response=await fetch('/api/health');if(!response.ok)throw Error();const j=await response.json();const n=Object.values(j.models||{}).filter(Boolean).length;$('#connection').textContent=`${n}/4 detectors online`;if(n<4)log('Some detectors are unavailable. Check the backend terminal.');}catch{$('#connection').textContent='Backend offline';}}
health();setInterval(health,30000);
setInterval(()=>{$('#clock').textContent=new Date().toLocaleTimeString();if(live){const elapsed=Math.floor((Date.now()-started)/1000);$('#sourceHint').textContent=`Rolling audio analysis · ${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;if(!busy&&lastReceived&&Date.now()-lastReceived>15000){state('amber','Listening. Awaiting an update.','Previous detector scores are no longer current.','LISTENING');$('#resultAge').textContent='Waiting for a fresh assessment';}}},1000);
window.addEventListener('pagehide',stopMicrophone);



const hologramMotionObserver=new MutationObserver(()=>document.body.classList.toggle('motion-paused',document.getElementById('motion').getAttribute('aria-pressed')==='false'));
hologramMotionObserver.observe(document.getElementById('motion'),{attributes:true,attributeFilter:['aria-pressed']});
document.body.classList.toggle('motion-paused',document.getElementById('motion').getAttribute('aria-pressed')==='false');

function refreshDisabledCards(result){
  for(const key of Object.keys(names)){
    const node=document.getElementById('model-'+key);
    const active=Object.hasOwn(result.models,key);
    node.style.opacity=active?'1':'.45';
    if(!active){delete node.dataset.tone;node.querySelector('strong').textContent='—';node.querySelector('small').textContent='Disabled in backend';node.querySelector('.meter i').style.width='0%';}
  }
}
