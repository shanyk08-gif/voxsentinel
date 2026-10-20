// Visual adapted from the user-provided VOICEGUARD.OS hologram.
// Only the geometry/animation is reused. Verdicts come from VoxSentinel.
import {FluidOrb as CanvasFallback} from './fluid-orb.js?v=exact4';
let libraryReady=false;
try {
 await new Promise((resolve,reject)=>{
  if(window.THREE){resolve();return;}
  const script=document.createElement('script');
  script.src='/static/vendor/three-r128.min.js';
  script.onload=resolve;script.onerror=reject;document.head.appendChild(script);
 });
 libraryReady=Boolean(window.THREE);
} catch(error){console.warn('Three.js unavailable; using the fluid canvas visual.',error);}
export class FluidOrb {
 constructor(cvs){
  if(!libraryReady)return new CanvasFallback(cvs);
  const THREE=window.THREE;
  // Check support on another canvas so fallback can still acquire its 2D context.
  const probe=document.createElement('canvas');
  const gl=probe.getContext('webgl2')||probe.getContext('webgl');
  if(!gl)return new CanvasFallback(cvs);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  this.running=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.tone='blue';this.analyser=null;
  const N=96;let mode='idle',t=0,fc=0,fd=new Uint8Array(512),lv=Array(N).fill(0);
  let lastFrame=performance.now(),drawnTone='',needsFrame=true;
  const PAL={analyzing:[0xffd000,0xff9500,0xfff27a],idle:[0x00f3ff,0x3b82ff,0xa855f7],auth:[0x00f3ff,0x2bff9a,0x3b82ff],fake:[0xff003c,0xff7a00,0xff2bd6],poor:[0xffd000,0xff9500,0xfff27a],mic:[0x00f3ff,0x3b82ff,0xa855f7]};
  this.setAnalyser=(analyser)=>{this.analyser=analyser;if(analyser)fd=new Uint8Array(analyser.frequencyBinCount);};
const rd=new THREE.WebGLRenderer({canvas:cvs,antialias:true,alpha:true});rd.setPixelRatio(Math.min(devicePixelRatio||1,2));
const sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(45,1,.1,80),cc=[0,1,2].map(()=>new THREE.Color(0x00f3ff)),tc=new THREE.Color(),W=new THREE.Color(0xffffff);
const fit=()=>{
 const w=Math.max(1,cvs.clientWidth),h=Math.max(1,cvs.clientHeight);
 rd.setSize(w,h,false);cam.aspect=w/h;
 cam.position.z=cvs.clientWidth<800?13:9.5;cam.position.y=0;
 cam.updateProjectionMatrix();needsFrame=true;
};
const observer=new ResizeObserver(fit);observer.observe(cvs);fit();
const root=new THREE.Group();sc.add(root);root.position.y=0;
const VS=`uniform float uT,uA,uF,uS;varying vec3 vN,vV;varying float vD;void main(){vec3 n=normalize(position);float d=sin(n.x*uF+uT*uS)*sin(n.y*uF*.9-uT*uS*.8)*sin(n.z*uF*1.1+uT*uS*.6);vD=d;vec3 p=n*1.5*(1.+d*uA);vec4 mv=modelViewMatrix*vec4(p,1.);vN=normalize(normalMatrix*n);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`;
const FS=`uniform vec3 c0,c1,c2;uniform float uT;varying vec3 vN,vV;varying float vD;void main(){float fr=pow(1.-max(dot(normalize(vN),normalize(vV)),0.),2.2);vec3 col=mix(c0,c1,.5+.5*sin(vD*7.+uT));col=mix(col*.55,c2,fr);col+=c1*(.5+.5*sin(vD*34.+uT*2.))*.12;gl_FragColor=vec4(col+fr*c2*.8,.5+fr*.5);}`;
const U={uT:{value:0},uA:{value:.2},uF:{value:2.4},uS:{value:1.8},c0:{value:cc[0]},c1:{value:cc[1]},c2:{value:cc[2]}};
root.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1,6),new THREE.ShaderMaterial({uniforms:U,vertexShader:VS,fragmentShader:FS,transparent:true})));
const cage=new THREE.Mesh(new THREE.IcosahedronGeometry(1,3),new THREE.ShaderMaterial({uniforms:U,vertexShader:VS,fragmentShader:'uniform vec3 c2;void main(){gl_FragColor=vec4(c2,.4);}',wireframe:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));cage.scale.setScalar(1.12);root.add(cage);
const stG=new THREE.ConeGeometry(.08,1,8);stG.translate(0,.5,0);
const stem=new THREE.InstancedMesh(stG,new THREE.MeshBasicMaterial(),N),knob=new THREE.InstancedMesh(new THREE.SphereGeometry(.1,10,10),new THREE.MeshBasicMaterial(),N);root.add(stem,knob);
const dirs=[],qs=[],tips=[],Yv=new THREE.Vector3(0,1,0),D=new THREE.Object3D(),col=new THREE.Color();
for(let i=0;i<N;i++){const y=1-2*(i+.5)/N,rr=Math.sqrt(1-y*y),th=i*2.39996,d=new THREE.Vector3(Math.cos(th)*rr,y,Math.sin(th)*rr);dirs.push(d);qs.push(new THREE.Quaternion().setFromUnitVectors(Yv,d));tips.push(new THREE.Vector3())}
const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.5,2),new THREE.MeshBasicMaterial({wireframe:false}));root.add(core);
const mkT=(r,t0,seg,arc,op)=>{const m=new THREE.MeshBasicMaterial({transparent:true,opacity:op}),o=new THREE.Mesh(new THREE.TorusGeometry(r,t0,8,seg,arc),m);root.add(o);return o};
const cr=[mkT(.72,.035,48,6.283,1),mkT(.88,.025,48,6.283,1)];cr[1].rotation.x=1.2;
const rings=[[2.9,.012,6.283],[3.3,.05,4.4],[3.75,.015,6.283]].map((q,k)=>{const r=mkT(q[0],q[1],160,q[2],.85);r.rotation.x=1.1+k*.5;r.rotation.y=k*.7;const s=new THREE.Mesh(new THREE.SphereGeometry(.09,10,10),new THREE.MeshBasicMaterial());s.position.set(q[0],0,0);r.add(s);return r});
const org=[0,1,2,3,4].map(k=>{const o=new THREE.Mesh(new THREE.SphereGeometry(.12+k*.02,14,14),new THREE.MeshBasicMaterial());root.add(o);return o});
const sh=new THREE.Mesh(new THREE.TorusGeometry(1,.02,8,100),new THREE.MeshBasicMaterial({transparent:true}));sc.add(sh);let shT=1;
const arcG=new THREE.BufferGeometry(),ap=new Float32Array(72);arcG.setAttribute('position',new THREE.BufferAttribute(ap,3));
const arcs=new THREE.LineSegments(arcG,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.9}));arcs.visible=false;root.add(arcs);
const PN=700,pp=new Float32Array(PN*3),pc=new Float32Array(PN*3);
for(let i=0;i<PN;i++){const r=4+Math.random()*6,a=Math.random()*6.283,b=Math.acos(2*Math.random()-1);pp.set([r*Math.sin(b)*Math.cos(a),r*Math.cos(b),r*Math.sin(b)*Math.sin(a)],i*3)}
const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(pp,3));pg.setAttribute('color',new THREE.BufferAttribute(pc,3));
const pts=new THREE.Points(pg,new THREE.PointsMaterial({size:.07,vertexColors:true,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));sc.add(pts);
let cur='',rx=0,ry=0,dr=false,lx=0,ly=0;
cvs.addEventListener('pointerdown',e=>{needsFrame=true;dr=true;lx=e.clientX;ly=e.clientY;cvs.setPointerCapture(e.pointerId)});
cvs.addEventListener('pointermove',e=>{if(dr){needsFrame=true;ry+=(e.clientX-lx)*.01;rx=Math.max(-1.2,Math.min(1.2,rx+(e.clientY-ly)*.01));lx=e.clientX;ly=e.clientY}});
['pointerup','pointercancel'].forEach(n=>cvs.addEventListener(n,()=>dr=false));
const loop=(now)=>{
 requestAnimationFrame(loop);
 if(document.hidden)return;
 mode=this.tone==='amber'?'analyzing':this.tone==='red'?'fake':this.tone==='green'?'auth':this.analyser?'mic':'idle';
 if(!this.running && drawnTone===mode && !needsFrame)return;
 needsFrame=false;drawnTone=mode;
 // Reference timing: 0.016 simulation seconds per frame.
 if(this.running)t+=.016;
 fc++;const f=mode==='fake',p=PAL[mode];
 if(cur!==mode){cur=mode;shT=0;for(let i=0;i<PN;i++){tc.setHex(p[i%3]).lerp(W,Math.random()*.4);pc.set([tc.r,tc.g,tc.b],i*3)}pg.attributes.color.needsUpdate=true}
 cc.forEach((c,k)=>{tc.setHex(p[k]);if(this.running)c.lerp(tc,.07);else c.copy(tc);});if(this.analyser)this.analyser.getByteFrequencyData(fd);
 let av=0;
 for(let i=0;i<N;i++){const j=Math.min(i,N-i);let v;
  if(mode=='idle')v=.04+.03*Math.sin(t*2+i*.3);
  else if(mode=='analyzing')v=.1+.08*Math.sin(t*2+i*.3)+(this.analyser?fd[Math.min(fd.length-1,Math.floor(j/(N/2)*fd.length*.6))]/255*.35:0);
  else if(mode=='auth')v=.12+.38*(Math.sin(i*.4+t*3)*Math.sin(i*.13-t*2)*.5+.5)*(.8+Math.random()*.2);
  else if(f)v=(j%8<4?1:.2)*(.45+.5*Math.abs(Math.sin(t*14)))*.85+Math.random()*.15;
  else if(mode=='poor')v=Math.random()<.18?0:.03+Math.random()*.07;
  else v=this.analyser?Math.pow(fd[Math.floor(j/(N/2)*fd.length*.6)]/255,1.4):0;
  lv[i]+=(v-lv[i])*.35;av+=lv[i]}
 av/=N;const amp=.12+av*.6+(f?.2:0),fr=f?4:2.4,sd=f?7:1.8;U.uT.value=t;U.uA.value=amp;U.uF.value=fr;U.uS.value=sd;
 for(let i=0;i<N;i++){const d=dirs[i],dd=Math.sin(d.x*fr+t*sd)*Math.sin(d.y*fr*.9-t*sd*.8)*Math.sin(d.z*fr*1.1+t*sd*.6),r0=1.5*(1+dd*amp)-.04,L=.25+lv[i]*1.6;
  D.quaternion.copy(qs[i]);D.position.copy(d).multiplyScalar(r0);D.scale.set(1,L,1);D.updateMatrix();stem.setMatrixAt(i,D.matrix);
  tips[i].copy(d).multiplyScalar(r0+L);D.position.copy(tips[i]);D.scale.setScalar(1+lv[i]*1.5);D.updateMatrix();knob.setMatrixAt(i,D.matrix);
  const k=i/N*3,a=Math.floor(k)%3;col.copy(cc[a]).lerp(cc[(a+1)%3],k%1);stem.setColorAt(i,col);col.lerp(W,.45);knob.setColorAt(i,col)}
 [stem,knob].forEach(m=>{m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true});
 core.material.color.copy(cc[0]).lerp(W,.55);core.scale.setScalar(.9+.1*Math.sin(t*4)+av*.7);core.rotation.y+=.03;
 cr.forEach((o,k)=>{o.material.color.copy(cc[k+1]);o.rotation.y+=.04*(k?-1:1)*(f?3:1);o.rotation.z+=.02});
 rings.forEach((o,k)=>{o.material.color.copy(cc[k]);o.children[0].material.color.copy(cc[(k+1)%3]).lerp(W,.4);o.rotation.z+=(k%2?-1:1)*.008*(1+k*.6)*(f?3:1)});
 org.forEach((o,k)=>{o.material.color.copy(cc[k%3]).lerp(W,.3);const a=t*(.5+k*.2)+k*1.3,r=.75+.1*Math.sin(t+k);o.position.set(Math.cos(a)*r,Math.sin(a*1.3)*r*.8,Math.sin(a)*r*.7)});
 if(shT<1){shT+=.025;sh.visible=true;sh.scale.setScalar(1+shT*7);sh.material.opacity=1-shT;sh.material.color.copy(cc[0])}else sh.visible=false;
 arcs.visible=f;if(f){for(let k=0;k<6;k++){const a=tips[(Math.random()*N)|0],b=tips[(Math.random()*N)|0],m=a.clone().add(b).multiplyScalar(.5).add(new THREE.Vector3((Math.random()-.5)*1.2,(Math.random()-.5)*1.2,(Math.random()-.5)*1.2));ap.set([a.x,a.y,a.z,m.x,m.y,m.z,m.x,m.y,m.z,b.x,b.y,b.z],k*12)}arcG.attributes.position.needsUpdate=true;arcs.material.color.copy(cc[1]).lerp(W,.5)}
 pts.rotation.y+=.0012*(f?6:1);cam.position.x=f?Math.sin(t*60)*.04:0;
 if(!dr){ry+=.004+(f?.02:0);rx*=.97}root.rotation.set(rx,ry,0);rd.render(sc,cam);

 };requestAnimationFrame(loop);
 }
}
