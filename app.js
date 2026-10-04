// ===== Logic thuần (có test) =====
function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
for(let l=2;l<=n;l<<=1){const a=-2*Math.PI/l,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=l){let cr=1,ci=0;for(let k=0;k<l/2;k++){const u=i+k,v=u+l/2,tr=re[v]*cr-im[v]*ci,ti=re[v]*ci+im[v]*cr;re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;}}}}
const BANDS={sub:[35,90],bass:[90,200],mud:[200,500],mid:[500,2000],voc:[2000,4500],hi:[4500,9000],air:[10000,16000]};
function analyze(x,sr){const N=4096,len=Math.min(x.length,sr*60),st=Math.floor((x.length-len)/2),F=40,hop=Math.max(N,Math.floor((len-N)/F));
const pw=new Float64Array(N/2);let cnt=0;
for(let o=st;o+N<=st+len&&cnt<F;o+=hop,cnt++){const re=new Float64Array(N),im=new Float64Array(N);for(let i=0;i<N;i++)re[i]=x[o+i]*(0.5-0.5*Math.cos(2*Math.PI*i/N));fft(re,im);for(let k=0;k<N/2;k++)pw[k]+=re[k]*re[k]+im[k]*im[k];}
const d={};for(const b in BANDS){const lo=Math.floor(BANDS[b][0]*N/sr),hi=Math.min(N/2-1,Math.ceil(BANDS[b][1]*N/sr));let s=0;for(let k=lo;k<=hi;k++)s+=pw[k];d[b]=10*Math.log10(s/(hi-lo+1)/Math.max(cnt,1)+1e-12);}return d}
const cl=(x,a,b)=>Math.max(a,Math.min(b,x));
const BASE={q1:{sub:3,bass:4,mud:2,det:2,voc:2.5,harsh:1.5,air:2.5},q2:{sub:4,bass:5,mud:2.5,det:3,voc:3,harsh:2,air:3.5}};
// AI chỉ CỘNG THÊM vào mức nền: không bao giờ hạ bass/treble.
function plan(d,b){const p={...b},m=d.mid;
p.bass+=cl((8-(d.bass-m))/2,0,3);p.sub+=cl((7-(d.sub-m))/2.5,0,3);p.mud+=cl((d.mud-m-8)/2,0,3);
p.harsh+=cl((d.hi-d.voc+6)/1.5,0,3);p.voc+=cl((-8-(d.voc-m))/2,0,2.5);p.det+=cl((-22-(d.hi-m))/3,0,2);p.air+=cl((-16-(d.air-d.hi))/3,0,2);
for(const k in p)p[k]=Math.round(p[k]*10)/10;return p}
function encodeWav(ch,sr,bits){const n=ch[0].length,nc=ch.length,by=bits/8,dl=n*nc*by,B=new ArrayBuffer(44+dl),v=new DataView(B);
const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
w(0,'RIFF');v.setUint32(4,36+dl,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,nc,true);v.setUint32(24,sr,true);v.setUint32(28,sr*nc*by,true);v.setUint16(32,nc*by,true);v.setUint16(34,bits,true);w(36,'data');v.setUint32(40,dl,true);
let o=44;const mx=bits===16?32767:8388607;
for(let i=0;i<n;i++)for(let c=0;c<nc;c++){const s=Math.round(cl(ch[c][i],-1,1)*mx);if(bits===16){v.setInt16(o,s,true);o+=2}else{v.setUint8(o,s&255);v.setUint8(o+1,(s>>8)&255);v.setUint8(o+2,(s>>16)&255);o+=3}}
return new Blob([B],{type:'audio/wav'})}
function chain(c){const mk=(t,f,q)=>{const n=c.createBiquadFilter();n.type=t;n.frequency.value=f;n.Q.value=q||1;return n};
const hp=mk('highpass',28,.7),sub=mk('peaking',55,1),bass=mk('lowshelf',120),mud=mk('peaking',320,1.1),det=mk('peaking',1400,.9),voc=mk('peaking',3000,1),har=mk('peaking',6800,2.2),air=mk('highshelf',11000);
const comp=c.createDynamicsCompressor();comp.threshold.value=-14;comp.knee.value=18;comp.ratio.value=2;comp.attack.value=.01;comp.release.value=.2;
const g=c.createGain();[hp,sub,bass,mud,det,voc,har,air,comp,g].reduce((a,b)=>(a.connect(b),b));
return{in:hp,out:g,set(p){sub.gain.value=p.sub;bass.gain.value=p.bass;mud.gain.value=-p.mud;det.gain.value=p.det;voc.gain.value=p.voc;har.gain.value=-p.harsh;air.gain.value=p.air;g.gain.value=0.85}}}
//UI
const $=s=>document.querySelector(s),au=$('#a'),log=t=>$('#log').textContent=t;
let ctx,node,live=null,blob=null,name='',out=null,hires=false,eqOn=true,P={...BASE.q1};
const KEYS=[['sub','Siêu trầm',10],['bass','Bass chắc',10],['mud','Lọc đục',8],['det','Chi tiết',8],['voc','Giọng rõ',8],['harsh','Giảm chói',8],['air','Treble sáng',8]];
KEYS.forEach(([k,l,m])=>{const d=document.createElement('div');d.className='sl';d.innerHTML=`<span>${l}</span><input type="range" min="0" max="${m}" step="0.1" id="s_${k}"><b id="v_${k}"></b>`;$('#sl').appendChild(d);d.querySelector('input').oninput=e=>{P[k]=+e.target.value;sync(false)}});
function sync(setSliders=true){KEYS.forEach(([k])=>{if(setSliders)$('#s_'+k).value=P[k];$('#v_'+k).textContent=P[k].toFixed(1)});if(live)live.set(eqOn?P:{sub:0,bass:0,mud:0,det:0,voc:0,harsh:0,air:0})}
sync();
function ensure(){if(ctx)return;ctx=new(window.AudioContext||window.webkitAudioContext)();const s=ctx.createMediaElementSource(au);live=chain(ctx);s.connect(live.in);live.out.connect(ctx.destination);sync(false)}
au.addEventListener('play',()=>{ensure();ctx.resume()});
function setFile(b,n){blob=b;name=n;out=null;au.src=URL.createObjectURL(b);$('#nm').textContent=n.slice(0,28);$('#ex').disabled=false;$('#sv').disabled=true;
if('mediaSession'in navigator)navigator.mediaSession.metadata=new MediaMetadata({title:n});log('Đã nạp: '+n+'\nBấm "AI phân tích & nâng cấp" hoặc tự chỉnh các thanh.')}
$('#f').onchange=e=>{const f=e.target.files[0];if(f)setFile(f,f.name)};
const cfg=()=>({r:localStorage.gr||'',t:localStorage.gt||''});
$('#cfg').onclick=async()=>{const r=prompt('Kho riêng (dạng tên/kho)',localStorage.gr||'quytayss-cloud/hifi-data');if(r===null)return;const t=prompt('Dán token GitHub (github_pat_...)','');if(t===null)return;
localStorage.gr=r.trim().replace(/^https?:\/\/github\.com\//,'').replace(/\/$/,'');if(t.trim())localStorage.gt=t.replace(/[^A-Za-z0-9_]/g,'');
const tk=localStorage.gt||'';if(!/^(github_pat_|ghp_)/.test(tk))return log('Token sai dạng: phải bắt đầu bằng github_pat_ . Anh sao chép lại token từ GitHub.');
log('Đang kiểm tra kết nối...');try{const a=await gh('');if(a.status===401)return log('401: GitHub không nhận token (sai, thiếu ký tự hoặc hết hạn). Tạo token mới rồi dán lại.');if(a.status===404)return log('404: Tên kho sai ('+localStorage.gr+') hoặc token chưa được cấp quyền cho kho này.');if(!a.ok)return log('Lỗi GitHub '+a.status);
const w=await gh('/actions/workflows/dl.yml');log(w.ok?'Kết nối OK ✅ Kho và file dl.yml đã sẵn sàng.':'Kho OK nhưng chưa thấy dl.yml (hoặc token thiếu quyền Actions). Kiểm tra file .github/workflows/dl.yml.')}catch(e){log(e.message||'Lỗi mạng.')}};
async function gh(p,{m='GET',body,raw}={}){const {r,t}=cfg();if(!r||!t)throw new Error('Chưa cài GitHub. Bấm "Cài GitHub".');return fetch('https://api.github.com/repos/'+r+p,{method:m,cache:'no-store',body:body&&JSON.stringify(body),headers:{Authorization:'Bearer '+t,Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json'}})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function job(q,mode){const id=Date.now()+'-'+Math.random().toString(36).slice(2,6);log('Gửi lệnh lên GitHub...');
const d=await gh('/actions/workflows/dl.yml/dispatches',{m:'POST',body:{ref:'main',inputs:{id,q,fmt:$('#fm').value,mode}}});
if(d.status===401)throw new Error('401: token sai hoặc hết hạn. Bấm "Cài GitHub" và dán token mới.');if(d.status===403)throw new Error('403: token thiếu quyền Actions/Contents (Read and write).');if(d.status===404)throw new Error('404: sai tên kho hoặc chưa có file dl.yml. Bấm "Cài GitHub" để kiểm tra.');if(!d.ok)throw new Error('Lỗi GitHub '+d.status);
for(let i=0;i<150;i++){await sleep(6000);log('GitHub đang xử lý... '+(i*6)+'s (thường 40-120s)');
const j=await gh('/contents/downloads/'+id+'.json?ref=data',{raw:1});if(j.status===404)continue;if(!j.ok)throw new Error('Lỗi đọc kết quả '+j.status);
const o=await j.json();if(o.error)throw new Error('Thất bại: '+o.error);return o}
throw new Error('Quá thời gian chờ. Xem tab Actions trên GitHub.')}
async function share(b,n){const f=new File([b],n,{type:b.type||'audio/mpeg'});try{if(navigator.canShare&&navigator.canShare({files:[f]}))await navigator.share({files:[f],title:n});else{const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=n;a.click()}}catch(e){}}
function addRow(b,n){const r=document.createElement('div');r.className='row';r.style.marginTop='6px';const p=document.createElement('button');p.className='o';p.style.flex='1';p.style.textAlign='left';p.textContent='▶ '+n.slice(0,40);p.onclick=()=>{setFile(b,n);out={blob:b,name:n};$('#sv').disabled=false};const s=document.createElement('button');s.textContent='Lưu';s.onclick=()=>share(b,n);r.append(p,s);$('#rs').appendChild(r)}
async function fetchOne(url){const o=await job(url,'get');log('Đang lấy tệp về máy...');const f=await gh('/contents/downloads/'+o.file+'?ref=data',{raw:1});if(!f.ok)throw new Error('Lỗi lấy tệp '+f.status);const b=await f.blob();addRow(b,o.name);setFile(b,o.name);out={blob:b,name:o.name};$('#sv').disabled=false;return o.name}
$('#dl').onclick=async()=>{const u=$('#u').value.trim();if(!u)return;try{const n=await fetchOne(u);log('Đã tải: '+n+'\nBấm "Lưu vào Tệp" hoặc "AI phân tích & nâng cấp".')}catch(e){log(e.message||'Lỗi mạng.')}};
$('#ls').onclick=async()=>{const u=$('#u').value.trim();if(!u)return;$('#rs').innerHTML='';try{const o=await job(u,'list'),L=o.list||[];if(!L.length)return log('Không thấy bài nào.');log('Tìm thấy '+L.length+' mục. Tick các bài muốn tải rồi bấm "Tải các bài đã chọn".');
const box=document.createElement('div');L.forEach((x,i)=>{const l=document.createElement('label');l.style.cssText='display:flex;gap:8px;align-items:center;margin:8px 0;font-size:14px';const c=document.createElement('input');c.type='checkbox';c.dataset.u=x.u;c.checked=i===0&&!/^https?:/i.test(u)?true:false;l.append(c,document.createTextNode((i===0&&!/^https?:/i.test(u)?'⭐ ':'')+(x.t||'Không tên')+(x.d?' · '+Math.round(x.d/60)+'p':'')));box.appendChild(l)});
const go=document.createElement('button');go.textContent='Tải các bài đã chọn';go.onclick=async()=>{const sel=[...box.querySelectorAll('input:checked')].map(c=>c.dataset.u);if(!sel.length)return log('Chưa tick bài nào.');go.disabled=true;box.style.display='none';let k=0;for(const x of sel){k++;try{await fetchOne(x);log('Xong '+k+'/'+sel.length)}catch(e){log('Bài '+k+' lỗi: '+e.message)}}log('Hoàn tất '+sel.length+' bài. Chạm ▶ để nghe, "Lưu" để lưu vào Tệp.')};
$('#rs').append(box,go)}catch(e){log(e.message||'Lỗi mạng.')}};
function q(h){hires=h;$('#q1').classList.toggle('on',!h);$('#q2').classList.toggle('on',h);P={...BASE[h?'q2':'q1']};sync()}
$('#q1').onclick=()=>q(false);$('#q2').onclick=()=>q(true);
$('#bp').onclick=e=>{eqOn=!eqOn;e.target.textContent='EQ: '+(eqOn?'BẬT':'TẮT');e.target.classList.toggle('on',eqOn);sync(false)};
async function decode(){ensure();return ctx.decodeAudioData(await blob.arrayBuffer())}
$('#ai').onclick=async()=>{if(!blob)return log('Hãy chọn nhạc trước.');log('AI đang phân tích phổ âm thanh...');try{const b=await decode(),L=b.getChannelData(0),R=b.numberOfChannels>1?b.getChannelData(1):L,x=new Float32Array(L.length);for(let i=0;i<x.length;i++)x[i]=(L[i]+R[i])/2;
const d=analyze(x,b.sampleRate);P=plan(d,BASE[hires?'q2':'q1']);sync();
log(`AI đã áp dụng:\n• Siêu trầm ${P.sub} • Bass ${P.bass}\n• Lọc đục ${P.mud} • Chi tiết ${P.det}\n• Giọng rõ ${P.voc}\n• Giảm chói ${P.harsh} • Treble sáng ${P.air}\n(AI chỉ làm sạch & tăng thêm, không hạ bass/treble.)`)}catch(e){log('Lỗi giải mã tệp. Thử định dạng mp3/m4a/wav/flac.')}};
$('#ex').onclick=async()=>{if(!blob)return;$('#ex').disabled=true;log('Đang xử lý '+(hires?'Hi-Res 24bit/48kHz':'Hi-Fi 16bit/44.1kHz')+'...');try{const b=await decode(),sr=hires?48000:44100,oc=new OfflineAudioContext(2,Math.ceil(b.duration*sr),sr),s=oc.createBufferSource();s.buffer=b;const c=chain(oc);c.set(P);s.connect(c.in);c.out.connect(oc.destination);s.start();
const r=await oc.startRendering(),ch=[r.getChannelData(0),r.getChannelData(1)];let pk=0;ch.forEach(a=>{for(let i=0;i<a.length;i++){const v=Math.abs(a[i]);if(v>pk)pk=v}});const k=pk>0?0.89/pk:1;ch.forEach(a=>{for(let i=0;i<a.length;i++)a[i]*=k});
const n=name.replace(/\.[^.]+$/,'')+(hires?' [Hi-Res 24bit]':' [Hi-Fi 16bit]')+'.wav';out={blob:encodeWav(ch,sr,hires?24:16),name:n};$('#sv').disabled=false;log('Xong: '+n+'\nBấm "Lưu vào Tệp" → chọn "Lưu vào Tệp".')}catch(e){log('Lỗi xuất (tệp quá dài/thiếu RAM). Thử bài ngắn hơn.')}$('#ex').disabled=false};
$('#sv').onclick=async()=>{if(!out)return;const f=new File([out.blob],out.name,{type:out.blob.type||'audio/wav'});
try{if(navigator.canShare&&navigator.canShare({files:[f]}))await navigator.share({files:[f],title:out.name});else{const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=out.name;a.click()}}catch(e){}};
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
