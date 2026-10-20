// Perspective-projected 3D surface, driven by the real Web Audio spectrum.
export class FluidOrb {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.analyser=null;this.tone='blue';
    this.colors={amber:[255,208,0],blue:[88,164,255],red:[255,76,109],green:[59,231,160]};this.color=[...this.colors.blue];
    this.running=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.time=0;this.level=0;this.last=0;
    this.frequency=new Uint8Array(512);this.samples=new Uint8Array(1024);
    this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(canvas);this.fit();
    requestAnimationFrame(t=>this.frame(t));
  }
  fit(){const rect=this.canvas.getBoundingClientRect();this.w=rect.width;this.h=rect.height;const d=Math.min(devicePixelRatio||1,2);this.canvas.width=this.w*d;this.canvas.height=this.h*d;this.ctx.setTransform(d,0,0,d,0,0);}
  setAnalyser(a){this.analyser=a;if(a){this.frequency=new Uint8Array(a.frequencyBinCount);this.samples=new Uint8Array(a.fftSize);}}
  project(x,y,z){const t=this.time*.13,co=Math.cos(t),si=Math.sin(t);const xx=x*co+z*si,zz=-x*si+z*co;const tilt=.27;const yy=y*Math.cos(tilt)-zz*Math.sin(tilt),depth=y*Math.sin(tilt)+zz*Math.cos(tilt);const scale=3.5/(3.5-depth);return [this.w/2+xx*this.radius*scale,this.h*.405+yy*this.radius*scale,depth,scale];}
  surface(lat,lon){
    const x=Math.sin(lat)*Math.cos(lon),y=Math.cos(lat),z=Math.sin(lat)*Math.sin(lon),t=this.time;
    const index=Math.min(this.frequency.length-1,Math.floor((lon/(Math.PI*2))*(this.frequency.length*.38)));
    const band=this.analyser?this.frequency[index]/255:0;
    const wave=Math.sin(x*3.4+t*.85)*Math.cos(y*3.1-t*.65)*Math.sin(z*3.2+t*.4);
    const ripple=Math.sin(lat*7+lon*3-t*1.6);
    const r=1+wave*(.1+this.level*.36)+ripple*(.025+band*.095)+this.level*.13;
    return this.project(x*r,y*r,z*r);
  }
  frame(now){
    requestAnimationFrame(t=>this.frame(t));const dt=Math.min((now-this.last)/1000,.05);this.last=now;
    if(document.hidden)return;if(this.running)this.time+=dt;
    if(this.analyser){this.analyser.getByteFrequencyData(this.frequency);this.analyser.getByteTimeDomainData(this.samples);let energy=0;for(const s of this.samples)energy+=((s-128)/128)**2;this.level+=(Math.min(1,Math.sqrt(energy/this.samples.length)*5)-this.level)*.14;}else this.level*=.94;
    const target=this.colors[this.tone];this.color=this.color.map((v,i)=>v+(target[i]-v)*.045);
    const c=this.ctx;if(!c)return;const rgb=this.color.map(Math.round).join(',');c.clearRect(0,0,this.w,this.h);
    this.radius=Math.min(this.w*.285,this.h*.26);const cy=this.h*.405;
    const glow=c.createRadialGradient(this.w/2,cy,0,this.w/2,cy,this.radius*1.8);glow.addColorStop(0,`rgba(${rgb},.12)`);glow.addColorStop(.55,`rgba(${rgb},.04)`);glow.addColorStop(1,`rgba(${rgb},0)`);c.fillStyle=glow;c.fillRect(0,0,this.w,this.h);
    // Sparse, quiet particles surrounding the surface.
    for(let i=0;i<48;i++){const a=i*2.399963+this.time*.018;const r=this.radius*(1.4+(i%9)*.13);const x=this.w/2+Math.cos(a)*r,y=cy+Math.sin(a)*r*.8;const alpha=.1+(i%5)*.035;c.fillStyle=`rgba(${rgb},${alpha})`;c.fillRect(x,y,i%7===0?2:1,i%7===0?2:1);}
    const rows=30,cols=76,grid=[];
    for(let i=0;i<=rows;i++){const row=[];for(let j=0;j<=cols;j++)row.push(this.surface(i/rows*Math.PI,j/cols*Math.PI*2));grid.push(row);}
    // Rear lines first, front lines last, for genuine spatial depth.
    const segments=[];
    for(let i=1;i<rows;i++)for(let j=0;j<cols;j++){const a=grid[i][j],b=grid[i][j+1];segments.push([a,b,(a[2]+b[2])/2,false]);}
    for(let j=0;j<cols;j+=4)for(let i=0;i<rows;i++){const a=grid[i][j],b=grid[i+1][j];segments.push([a,b,(a[2]+b[2])/2,true]);}
    segments.sort((a,b)=>a[2]-b[2]);
    for(const [a,b,z,vertical] of segments){const front=(z+1.4)/2.8;c.strokeStyle=`rgba(${rgb},${Math.max(.035,front*(vertical?.22:.65))})`;c.lineWidth=vertical?.55:.8+front*.5;c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();}
    // Luminous fluid ribbons on the moving surface.
    c.globalCompositeOperation='lighter';
    for(let k=0;k<3;k++){c.beginPath();for(let j=0;j<=160;j++){const lon=j/160*Math.PI*2;const lat=Math.PI/2+Math.sin(lon*2+this.time*.45+k*1.8)*(.24+this.level*.2)+(k-1)*.25;const p=this.surface(lat,lon);j?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]);}c.strokeStyle=`rgba(${rgb},${.18+k*.1})`;c.lineWidth=1.1+k*.3;c.shadowColor=`rgba(${rgb},.7)`;c.shadowBlur=8;c.stroke();}c.shadowBlur=0;
    for(let i=3;i<rows;i+=3)for(let j=0;j<cols;j+=8){const p=grid[i][j];if(p[2]<-.2)continue;c.fillStyle=`rgba(${rgb},${.35+p[2]*.35})`;c.beginPath();c.arc(p[0],p[1],1.1*p[3],0,Math.PI*2);c.fill();}
    c.globalCompositeOperation='source-over';
  }
}
