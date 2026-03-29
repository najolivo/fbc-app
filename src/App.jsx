import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getSubs, saveSub, deleteSub, updateSubReactions,
  getUsers, saveUser,
  getConfig, saveConfig,
  getLog, addLogEntry,
  getSession, saveSession,
  uploadReactionImage, deleteReactionImage,
  uploadProfilePic, updateUserProfile
} from "./db.js";
import T_ from "./i18n.js";

// ─── Defaults & Config ───────────────────────────────────────────────────────
const DEF_TAGS = ["vibe","discovery","throwback","guilty pleasure","hype","chill","deep cut","classic"];
const DEF_MOODS = ["happy","melancholy","energetic","dreamy","aggressive","peaceful","nostalgic","dark"];
const DEF_GENRES = ["pop","rock","hip-hop","r&b","electronic","jazz","classical","indie","latin","soul","punk","metal","folk","country","afrobeats","reggaeton","k-pop","other"];
const DEF_REACTIONS = ["🔥","💜","🎯","😮","🪩","🥹"];
const OBSESSION = [{v:1,l:"Casual",k:"casual"},{v:2,l:"Vibing",k:"vibing"},{v:3,l:"On Repeat",k:"onRepeat"},{v:4,l:"Obsessed",k:"obsessed"},{v:5,l:"Unhealthy",k:"unhealthy"}];
const MASTER = {name:"Najee",passkey:"fbc",role:"master"};

const THEMES = {
  midnight: {
    name: "Midnight", bg: "#0a0a0f", bgSub: "#101018", card: "rgba(255,255,255,0.03)", cardBorder: "rgba(255,255,255,0.06)",
    text: "#e8e8ed", textSub: "rgba(255,255,255,0.5)", textMuted: "rgba(255,255,255,0.25)",
    accent: "#c4a0ff", accentSub: "#8b6cc7", gradient: "linear-gradient(135deg, #c4a0ff, #7b8cff)",
    inputBg: "#15151f", overlay: "rgba(5,5,15,0.85)", pillBg: "rgba(255,255,255,0.06)",
    tagMood: "rgba(196,160,255,0.12)", tagMoodC: "#c4a0ff", tagGenre: "rgba(123,140,255,0.12)", tagGenreC: "#7b8cff",
    tagObs: "rgba(255,180,120,0.12)", tagObsC: "#ffb478", navActive: "#fff", navActiveBg: "#fff", navActiveText: "#0a0a0f",
  },
  vinyl: {
    name: "Vinyl", bg: "#f5f0e8", bgSub: "#ebe5d9", card: "rgba(0,0,0,0.03)", cardBorder: "rgba(0,0,0,0.08)",
    text: "#1a1a1a", textSub: "rgba(0,0,0,0.55)", textMuted: "rgba(0,0,0,0.25)",
    accent: "#c25a2e", accentSub: "#9b4520", gradient: "linear-gradient(135deg, #c25a2e, #d4813a)",
    inputBg: "#ede7db", overlay: "rgba(245,240,232,0.9)", pillBg: "rgba(0,0,0,0.06)",
    tagMood: "rgba(194,90,46,0.1)", tagMoodC: "#c25a2e", tagGenre: "rgba(60,100,60,0.1)", tagGenreC: "#3c6a3c",
    tagObs: "rgba(180,130,60,0.12)", tagObsC: "#a07030", navActive: "#1a1a1a", navActiveBg: "#1a1a1a", navActiveText: "#f5f0e8",
  },
};

const VIZ_TYPES = [
  {id:"constellation",name:"vizConstellation",desc:"vizDescConstellation"},
  {id:"overlap",name:"vizOverlap",desc:"vizDescOverlap"},
  {id:"terrain",name:"vizTerrain",desc:"vizDescTerrain"},
  {id:"moodring",name:"vizMoodRing",desc:"vizDescMoodRing"},
  {id:"timeline",name:"vizTimeline",desc:"vizDescTimeline"},
  {id:"top",name:"vizTopTracks",desc:"vizDescTopTracks"},
  {id:"tagcloud",name:"vizTagCloud",desc:"vizDescTagCloud"},
  {id:"genrebar",name:"vizGenreBar",desc:"vizDescGenreBar"},
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Storage helpers are in db.js
function getEmbed(url){if(!url)return null;const sp=url.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/)||url.match(/spotify:(track|album|playlist|episode):([a-zA-Z0-9]+)/);if(sp)return{type:"spotify",src:`https://open.spotify.com/embed/${sp[1]}/${sp[2]}?utm_source=generator&theme=0`};const yt=url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);if(yt)return{type:"youtube",src:`https://www.youtube.com/embed/${yt[1]}`};const am=url.match(/music\.apple\.com\/([a-z]{2})\/(?:album|playlist|song)\/([^?]+)/);if(am)return{type:"apple",src:`https://embed.music.apple.com/${am[1]}/album/${am[2]}`};if(/soundcloud\.com/.test(url))return{type:"soundcloud",src:url};return null;}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function getWk(d=new Date()){const x=new Date(d);x.setHours(0,0,0,0);const day=x.getDay();x.setDate(x.getDate()-day+(day===0?-6:1));return x.toISOString().slice(0,10)}
function ago(ts){const m=Math.floor((Date.now()-ts)/60000);if(m<1)return"now";if(m<60)return`${m}m`;const h=Math.floor(m/60);if(h<24)return`${h}h`;const d=Math.floor(h/24);return d<7?`${d}d`:`${Math.floor(d/7)}w`}
function fmtD(ts){return new Date(ts).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}

// No seed data — clean slate for real team use
function genInviteCode(){return "FBC-"+Math.random().toString(36).slice(2,6).toUpperCase()}
function weekNum(){const d=new Date();const start=new Date(d.getFullYear(),0,1);return Math.ceil(((d-start)/86400000+start.getDay()+1)/7)}
function isReactionImage(r){return r&&(r.startsWith("http")||r.startsWith("data:"))}
function isLateNight(ts){const h=new Date(ts).getHours();return h>=0&&h<5;}
function getWeekKeys(subs,name){const wks=new Set();subs.filter(s=>s.name===name&&!s.deleted).forEach(s=>wks.add(getWk(new Date(s.timestamp))));return[...wks].sort();}

// ─── Streak Calculator ──────────────────────────────────────────────────────
function calcStreak(name, subs) {
  const weeks = getWeekKeys(subs, name);
  if (weeks.length === 0) return 0;
  let streak = 1;
  const now = getWk();
  const lastWeek = weeks[weeks.length - 1];
  if (lastWeek !== now) {
    // Check if they missed this week — give grace if week isn't over (before Saturday)
    const today = new Date().getDay();
    if (today > 0 && today < 6 && lastWeek !== now) return 0; // Mon-Fri, didn't drop yet, previous streak broken
    if (lastWeek !== now) return 0;
  }
  for (let i = weeks.length - 1; i > 0; i--) {
    const curr = new Date(weeks[i]);
    const prev = new Date(weeks[i - 1]);
    const diff = (curr - prev) / 86400000;
    if (diff >= 6 && diff <= 8) streak++;
    else break;
  }
  return streak;
}

// ─── Music Personality Badge (primary badge) ─────────────────────────────────
function calcBadge(name, subs) {
  const myDrops = subs.filter(s => s.name === name && !s.deleted);
  if (myDrops.length === 0) return { emoji: "🎵", title: "New Listener", desc: "Drop your first track" };
  const genres = new Set(myDrops.map(s => s.genre));
  const tc = {};
  myDrops.forEach(s => s.tags?.forEach(tg => { tc[tg] = (tc[tg] || 0) + 1; }));
  const avgObs = myDrops.reduce((a, s) => a + (s.obsession || 3), 0) / myDrops.length;

  if (avgObs >= 4.5) return { emoji: "🫠", title: "Unhealthy Listener", desc: "Average obsession 4.5+" };
  if (genres.size >= 6) return { emoji: "🌍", title: "World Listener", desc: `${genres.size} genres explored` };
  if ((tc["discovery"]||0) + (tc["deep cut"]||0) >= 3) return { emoji: "🔭", title: "The Explorer", desc: "Always finding something new" };
  if (genres.size === 1 && myDrops.length >= 3) return { emoji: "💎", title: "Genre Loyalist", desc: `All in on ${[...genres][0]}` };
  if ((tc["throwback"]||0) >= 3) return { emoji: "📼", title: "Time Traveler", desc: "Living in the throwbacks" };
  if ((tc["hype"]||0) >= 3) return { emoji: "⚡", title: "The Hype", desc: "Bringing the energy" };
  if ((tc["vibe"]||0) >= 3) return { emoji: "🌊", title: "Vibe Curator", desc: "Setting the mood" };
  if ((tc["guilty pleasure"]||0) >= 2) return { emoji: "🙈", title: "No Shame", desc: "Guilty pleasures on display" };
  if (myDrops.length >= 8) return { emoji: "🔥", title: "Top Contributor", desc: `${myDrops.length} drops` };
  if (myDrops.length >= 3) return { emoji: "🎧", title: "Regular", desc: "Consistent contributor" };
  return { emoji: "🌱", title: "Rising", desc: "Just getting started" };
}

// ─── Achievement System ──────────────────────────────────────────────────────
function calcAchievements(name, subs) {
  const my = subs.filter(s => s.name === name && !s.deleted);
  const totalRx = my.reduce((a, s) => a + Object.values(s.reactions || {}).reduce((x, y) => x + y, 0), 0);
  const maxRx = Math.max(...my.map(s => Object.values(s.reactions || {}).reduce((x, y) => x + y, 0)), 0);
  const genres = new Set(my.map(s => s.genre)).size;
  const streak = calcStreak(name, subs);
  const lateNights = my.filter(s => isLateNight(s.timestamp)).length;
  const tags = {};
  my.forEach(s => s.tags?.forEach(tg => { tags[tg] = (tags[tg] || 0) + 1; }));

  const all = [
    { id: "first", emoji: "🎤", title: "First Drop", desc: "Shared your first track", earned: my.length >= 1 },
    { id: "five", emoji: "✋", title: "High Five", desc: "5 drops", earned: my.length >= 5 },
    { id: "ten", emoji: "🔟", title: "Double Digits", desc: "10 drops", earned: my.length >= 10 },
    { id: "twenty", emoji: "🏆", title: "Veteran", desc: "20 drops", earned: my.length >= 20 },
    { id: "genres3", emoji: "🎨", title: "Eclectic", desc: "3 different genres", earned: genres >= 3 },
    { id: "genres6", emoji: "🌍", title: "World Tour", desc: "6 different genres", earned: genres >= 6 },
    { id: "genres10", emoji: "🪐", title: "Genre Galaxy", desc: "10 different genres", earned: genres >= 10 },
    { id: "viral", emoji: "📈", title: "Viral", desc: "10+ reactions on one post", earned: maxRx >= 10 },
    { id: "loved", emoji: "💜", title: "Beloved", desc: "50 total reactions", earned: totalRx >= 50 },
    { id: "streak3", emoji: "🔥", title: "On Fire", desc: "3 week streak", earned: streak >= 3 },
    { id: "streak8", emoji: "☄️", title: "Unstoppable", desc: "8 week streak", earned: streak >= 8 },
    { id: "nightowl", emoji: "🌙", title: "Night Owl", desc: "3 late night drops", earned: lateNights >= 3 },
    { id: "explorer", emoji: "🔭", title: "Deep Diver", desc: "5 discovery/deep cut tags", earned: ((tags["discovery"]||0) + (tags["deep cut"]||0)) >= 5 },
    { id: "nostalgia", emoji: "📼", title: "Nostalgia Trip", desc: "5 throwback tags", earned: (tags["throwback"]||0) >= 5 },
    { id: "guilty", emoji: "🙈", title: "Shameless", desc: "3 guilty pleasures", earned: (tags["guilty pleasure"]||0) >= 3 },
    { id: "obsessed", emoji: "🫠", title: "Clinically Obsessed", desc: "5 posts rated Unhealthy", earned: my.filter(s => s.obsession === 5).length >= 5 },
  ];
  return all;
}

// ─── Drop of the Week ────────────────────────────────────────────────────────
function getDropOfWeek(subs) {
  const wk = getWk();
  const weekSubs = subs.filter(s => !s.deleted && getWk(new Date(s.timestamp)) === wk);
  if (weekSubs.length === 0) return null;
  return weekSubs.reduce((best, s) => {
    const rx = Object.values(s.reactions || {}).reduce((a, b) => a + b, 0);
    const bestRx = Object.values(best.reactions || {}).reduce((a, b) => a + b, 0);
    return rx > bestRx ? s : best;
  }, weekSubs[0]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISUALIZATIONS
// ═══════════════════════════════════════════════════════════════════════════════

function GenreConstellation({submissions, theme}){
  const canvasRef=useRef(null),animRef=useRef(null);
  const gd=useMemo(()=>{const c={};submissions.forEach(s=>{c[s.genre]=(c[s.genre]||0)+1;});
    const entries=Object.entries(c);const total=entries.length;
    return entries.map(([genre,count],i)=>{
      // Golden angle distribution for more organic spacing
      const golden=2.399963;const a=i*golden;const dist=70+((i*67)%80)+count*15;
      return{genre,count,x:Math.cos(a)*dist,y:Math.sin(a)*dist,
        brightness:0.5+Math.min(count/3,1)*0.5,
        starSize:2+count*1.5,
        hue:200+i*(360/Math.max(total,1)),
        twinkleSpeed:0.5+Math.random()*2,twinklePhase:Math.random()*Math.PI*2,
        // Surrounding dust particles
        dust:Array.from({length:count*5},()=>({
          ox:(Math.random()-0.5)*35+Math.random()*15,
          oy:(Math.random()-0.5)*35+Math.random()*15,
          sz:0.3+Math.random()*0.8,
          alpha:0.05+Math.random()*0.15,
          drift:Math.random()*Math.PI*2,
          driftSpeed:0.1+Math.random()*0.3,
        }))};
    });
  },[submissions]);

  useEffect(()=>{
    const cv=canvasRef.current;if(!cv)return;const ctx=cv.getContext("2d");
    const W=700,H=420;cv.width=W*2;cv.height=H*2;ctx.scale(2,2);let t=0;
    function draw(){
      ctx.fillStyle=theme==="vinyl"?"#1a1815":"#04040a";ctx.fillRect(0,0,W,H);
      const cx=W/2,cy=H/2;

      // Background star field — layered depths
      for(let i=0;i<200;i++){
        const sx=(Math.sin(i*137.508)*0.5+0.5)*W;
        const sy=(Math.cos(i*73.13)*0.5+0.5)*H;
        const flicker=0.06+Math.sin(t*0.008+i*3.7)*0.04;
        const hue=190+((i*23)%80);
        ctx.fillStyle=`hsla(${hue},20%,80%,${flicker})`;
        ctx.beginPath();ctx.arc(sx,sy,0.3+(i%5===0?0.3:0),0,Math.PI*2);ctx.fill();
      }

      // Very subtle nebula wash
      const neb=ctx.createRadialGradient(cx-80,cy+40,20,cx,cy,320);
      neb.addColorStop(0,"rgba(60,30,90,0.06)");neb.addColorStop(0.4,"rgba(20,40,80,0.03)");neb.addColorStop(1,"transparent");
      ctx.fillStyle=neb;ctx.fillRect(0,0,W,H);

      // Constellation connection lines — thin, elegant
      gd.forEach((a,i)=>{gd.forEach((b,j)=>{if(j<=i)return;
        const d=Math.hypot(a.x-b.x,a.y-b.y);
        if(d<200){
          const alpha=0.08*(1-d/200)*Math.min(a.brightness,b.brightness);
          ctx.strokeStyle=`rgba(160,180,220,${alpha})`;
          ctx.lineWidth=0.6;ctx.setLineDash([4,6]);
          ctx.beginPath();ctx.moveTo(cx+a.x,cy+a.y);ctx.lineTo(cx+b.x,cy+b.y);ctx.stroke();
          ctx.setLineDash([]);
        }});});

      // Genre stars
      gd.forEach(g=>{
        const px=cx+g.x,py=cy+g.y;
        const twinkle=0.7+Math.sin(t*0.02*g.twinkleSpeed+g.twinklePhase)*0.3;

        // Dust cloud around star
        g.dust.forEach(d=>{
          const dx=px+d.ox+Math.sin(t*0.003*d.driftSpeed+d.drift)*6;
          const dy=py+d.oy+Math.cos(t*0.003*d.driftSpeed+d.drift)*6;
          ctx.fillStyle=`hsla(${g.hue},30%,70%,${d.alpha*twinkle})`;
          ctx.beginPath();ctx.arc(dx,dy,d.sz,0,Math.PI*2);ctx.fill();
        });

        // Star bloom (soft outer glow)
        const bloom=ctx.createRadialGradient(px,py,0,px,py,g.starSize*6);
        bloom.addColorStop(0,`hsla(${g.hue},40%,80%,${0.12*twinkle})`);
        bloom.addColorStop(0.5,`hsla(${g.hue},30%,70%,${0.04*twinkle})`);
        bloom.addColorStop(1,"transparent");
        ctx.fillStyle=bloom;ctx.beginPath();ctx.arc(px,py,g.starSize*6,0,Math.PI*2);ctx.fill();

        // Star core — bright point of light
        const core=ctx.createRadialGradient(px,py,0,px,py,g.starSize);
        core.addColorStop(0,`hsla(${g.hue},20%,95%,${0.95*twinkle})`);
        core.addColorStop(0.4,`hsla(${g.hue},40%,75%,${0.7*twinkle})`);
        core.addColorStop(1,`hsla(${g.hue},50%,50%,0)`);
        ctx.fillStyle=core;ctx.beginPath();ctx.arc(px,py,g.starSize,0,Math.PI*2);ctx.fill();

        // Cross-hair diffraction spikes (like real stars in telescopes)
        ctx.strokeStyle=`hsla(${g.hue},30%,85%,${0.15*twinkle})`;
        ctx.lineWidth=0.4;
        const spike=g.starSize*3;
        ctx.beginPath();ctx.moveTo(px-spike,py);ctx.lineTo(px+spike,py);ctx.stroke();
        ctx.beginPath();ctx.moveTo(px,py-spike);ctx.lineTo(px,py+spike);ctx.stroke();

        // Label
        ctx.fillStyle=`rgba(200,210,230,${0.65*twinkle})`;ctx.font="600 10px 'DM Sans',sans-serif";ctx.textAlign="center";
        ctx.fillText(g.genre,px,py+g.starSize*3+12);
        ctx.fillStyle=`rgba(200,210,230,${0.35*twinkle})`;ctx.font="10px 'DM Sans',sans-serif";
        ctx.fillText(`${g.count}`,px,py+g.starSize*3+23);
      });
      t++;animRef.current=requestAnimationFrame(draw);}
    draw();return()=>cancelAnimationFrame(animRef.current);
  },[gd,theme]);
  return <canvas ref={canvasRef} style={{width:"100%",height:420,borderRadius:12}} />;
}

function TasteOverlap({submissions,t:th}){
  const T=THEMES[th];
  const data=useMemo(()=>{
    const ppl={};submissions.forEach(s=>{
      if(!ppl[s.name])ppl[s.name]={tags:new Set(),moods:new Set(),genres:new Set(),count:0};
      s.tags.forEach(t=>ppl[s.name].tags.add(t));ppl[s.name].moods.add(s.mood);ppl[s.name].genres.add(s.genre);ppl[s.name].count++;
    });
    const names=Object.keys(ppl);
    // Force-directed-ish layout: start circular, then shift based on connections
    const nodes=names.map((n,i)=>{const a=(i/names.length)*Math.PI*2;const r=100+names.length*8;
      return{name:n,x:300+Math.cos(a)*r,y:200+Math.sin(a)*r,count:ppl[n].count,genres:ppl[n].genres.size};});
    const links=[];
    for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
      const a=ppl[names[i]],b=ppl[names[j]];let o=0;const shared=[];
      a.tags.forEach(t=>{if(b.tags.has(t)){o++;shared.push(t)}});
      a.moods.forEach(m=>{if(b.moods.has(m)){o++;shared.push(m)}});
      a.genres.forEach(g=>{if(b.genres.has(g)){o++;shared.push(g)}});
      if(o>0)links.push({from:i,to:j,strength:o,shared});
    }
    return{nodes,links};
  },[submissions]);
  const cl=th==="vinyl"?["#c25a2e","#8b6340","#3c6a3c","#5a6a8b","#8b5a6a","#6a5a3c","#4a7a7a","#7a5a4a"]:["#7b8cff","#c4a0ff","#6bc7a0","#ff8b8b","#ffb478","#78c4ff","#a0ffc4","#ffa0d0"];
  const maxStr=Math.max(...data.links.map(l=>l.strength),1);
  return(<svg viewBox="0 0 600 400" style={{width:"100%",height:400}}>
    <defs>
      {data.links.map((l,i)=>(<linearGradient key={i} id={`tl${i}`} x1={data.nodes[l.from].x} y1={data.nodes[l.from].y} x2={data.nodes[l.to].x} y2={data.nodes[l.to].y} gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={cl[l.from%cl.length]} stopOpacity={0.5}/><stop offset="100%" stopColor={cl[l.to%cl.length]} stopOpacity={0.5}/>
      </linearGradient>))}
    </defs>
    {/* Connection lines with width by strength */}
    {data.links.map((l,i)=>{const w=1.5+(l.strength/maxStr)*5;
      const mx=(data.nodes[l.from].x+data.nodes[l.to].x)/2,my=(data.nodes[l.from].y+data.nodes[l.to].y)/2;
      return(<g key={i}>
        <line x1={data.nodes[l.from].x} y1={data.nodes[l.from].y} x2={data.nodes[l.to].x} y2={data.nodes[l.to].y} stroke={`url(#tl${i})`} strokeWidth={w} strokeLinecap="round" opacity={0.4}/>
        {l.strength>=2&&<text x={mx} y={my-4} textAnchor="middle" fill={T.textMuted} fontSize={8} fontFamily="DM Sans">{l.shared.slice(0,2).join(", ")}</text>}
      </g>);})}
    {/* Nodes — sized by drop count */}
    {data.nodes.map((n,i)=>{const r=10+n.count*3;const c=cl[i%cl.length];
      return(<g key={i}>
        <circle cx={n.x} cy={n.y} r={r+8} fill={c} opacity={0.06}>
          <animate attributeName="r" values={`${r+6};${r+12};${r+6}`} dur="3s" repeatCount="indefinite"/>
        </circle>
        <circle cx={n.x} cy={n.y} r={r} fill={c} opacity={0.85}/>
        <text x={n.x} y={n.y+4} textAnchor="middle" fill="#fff" fontSize={n.count>2?11:10} fontFamily="DM Sans" fontWeight={700}>{n.count}</text>
        <text x={n.x} y={n.y+r+14} textAnchor="middle" fill={T.textSub} fontSize={11} fontFamily="DM Sans" fontWeight={600}>{n.name}</text>
        <text x={n.x} y={n.y+r+25} textAnchor="middle" fill={T.textMuted} fontSize={9} fontFamily="DM Sans">{n.genres}g</text>
      </g>);})}
    <text x={300} y={20} textAnchor="middle" fill={T.textMuted} fontSize={10} fontFamily="DM Sans">Node size = drops · line width = shared tags, moods &amp; genres</text>
  </svg>);
}

function ObsessionTerrain({submissions,t:th}){
  const T=THEMES[th];
  const pts=useMemo(()=>submissions.map((s,i)=>({x:50+(i/Math.max(submissions.length-1,1))*500,y:340-s.obsession*55,obs:s.obsession,name:s.name,mood:s.mood})),[submissions]);
  const pathD=useMemo(()=>{if(pts.length<2)return"";let d=`M ${pts[0].x} ${pts[0].y}`;for(let i=1;i<pts.length;i++){const p=pts[i-1],c=pts[i],cpx=(p.x+c.x)/2;d+=` C ${cpx} ${p.y}, ${cpx} ${c.y}, ${c.x} ${c.y}`;}return d;},[pts]);
  const mc=th==="vinyl"?{happy:"#c25a2e",melancholy:"#5a6a8b",energetic:"#a04020",dreamy:"#8b6a9b",aggressive:"#8b2020",peaceful:"#3c6a3c",nostalgic:"#8b6340",dark:"#4a4a5a"}:{happy:"#ffb478",melancholy:"#7b8cff",energetic:"#ff8b8b",dreamy:"#c4a0ff",aggressive:"#ff5555",peaceful:"#6bc7a0",nostalgic:"#ffb478",dark:"#8b7bff"};
  const obsLabel=["","Casual","Vibing","On Repeat","Obsessed","Unhealthy"];
  const accentRgb=th==="vinyl"?"194,90,46":"196,160,255";
  return(<svg viewBox="0 0 600 400" style={{width:"100%",height:400}}>
    <defs>
      <linearGradient id="oag" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={T.accent} stopOpacity={0.25}/>
        <stop offset="50%" stopColor={T.accent} stopOpacity={0.08}/>
        <stop offset="100%" stopColor={T.accent} stopOpacity={0}/>
      </linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    {/* Grid lines with labels */}
    {[1,2,3,4,5].map(l=>(<g key={l}>
      <line x1={50} y1={340-l*55} x2={550} y2={340-l*55} stroke={T.cardBorder} strokeDasharray="2 6" strokeWidth={0.5}/>
      <text x={42} y={344-l*55} textAnchor="end" fill={T.textMuted} fontSize={8} fontFamily="DM Sans">{obsLabel[l]}</text>
    </g>))}
    {/* Terrain fill */}
    {pts.length>=2&&<>
      <path d={pathD+` L ${pts[pts.length-1].x} 340 L ${pts[0].x} 340 Z`} fill="url(#oag)"/>
      {/* Multiple layered strokes for depth */}
      <path d={pathD} fill="none" stroke={`rgba(${accentRgb},0.1)`} strokeWidth={8} strokeLinecap="round" filter="url(#glow)"/>
      <path d={pathD} fill="none" stroke={`rgba(${accentRgb},0.3)`} strokeWidth={3} strokeLinecap="round"/>
      <path d={pathD} fill="none" stroke={T.accent} strokeWidth={1.5} strokeLinecap="round"/>
    </>}
    {/* Data points */}
    {pts.map((p,i)=>{const c=mc[p.mood]||"#888";return(<g key={i}>
      {/* Vertical drop line */}
      <line x1={p.x} y1={p.y} x2={p.x} y2={340} stroke={c} strokeWidth={0.5} opacity={0.15} strokeDasharray="2 3"/>
      {/* Outer ring */}
      <circle cx={p.x} cy={p.y} r={12} fill={c} opacity={0.1}/>
      <circle cx={p.x} cy={p.y} r={6} fill={c} opacity={0.9}/>
      <circle cx={p.x} cy={p.y} r={2.5} fill="#fff" opacity={0.6}/>
      {/* Name + obsession label */}
      <text x={p.x} y={p.y-15} textAnchor="middle" fill={T.textSub} fontSize={9} fontFamily="DM Sans" fontWeight={600}>{p.name}</text>
      <text x={p.x} y={345} textAnchor="middle" fill={T.textMuted} fontSize={7} fontFamily="DM Sans">{p.mood}</text>
    </g>);})}
    <text x={300} y={385} textAnchor="middle" fill={T.textMuted} fontSize={10} fontFamily="DM Sans">Obsession terrain · each point colored by mood</text>
  </svg>);
}

function DiscoveryScore({submissions,t:th}){
  const T=THEMES[th];
  const totalGenres=DEF_GENRES.length;
  const scores=useMemo(()=>{const p={};submissions.forEach(s=>{if(!p[s.name])p[s.name]={t:0,disc:0,deep:0,g:new Set()};p[s.name].t++;if(s.tags.includes("discovery"))p[s.name].disc++;if(s.tags.includes("deep cut"))p[s.name].deep++;p[s.name].g.add(s.genre);});
    return Object.entries(p).map(([n,d])=>{
      const diversity=Math.round((d.g.size/Math.min(totalGenres,10))*40); // up to 40pts for genre range
      const exploration=Math.round(((d.disc+d.deep)/d.t)*40); // up to 40pts for discovery/deep cut ratio
      const volume=Math.min(d.t*4,20); // up to 20pts for number of drops
      return{name:n,score:diversity+exploration+volume,diversity,exploration,volume,drops:d.t,unique:d.g.size};
    }).sort((a,b)=>b.score-a.score);},[submissions]);
  const max=Math.max(...scores.map(s=>s.score),1),medals=["👑","⚡","🌟","✨","🎵"];
  return(<div style={{padding:"12px 8px"}}>
    <p style={{textAlign:"center",color:T.textMuted,fontSize:11,marginBottom:6,fontFamily:"DM Sans"}}>Score = Genre Diversity (40) + Exploration Tags (40) + Volume (20)</p>
    <p style={{textAlign:"center",color:T.textMuted,fontSize:11,marginBottom:20,fontFamily:"DM Sans"}}>Who dove deepest into the unknown?</p>
    {scores.map((s,i)=>(<div key={s.name} style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
      <span style={{fontSize:18,width:26,textAlign:"center"}}>{medals[i]||"🎶"}</span>
      <div style={{flex:1}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{color:T.text,fontWeight:700,fontSize:13,fontFamily:"DM Sans"}}>{s.name}</span>
          <span style={{color:T.textMuted,fontSize:11,fontFamily:"DM Sans"}}>{s.unique}g · {s.drops}d</span>
        </div>
        <div style={{height:6,background:T.pillBg,borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:3,width:`${(s.score/max)*100}%`,background:T.gradient,transition:"width 0.8s ease"}}/></div>
        <div style={{display:"flex",gap:8,marginTop:3}}>
          <span style={{fontSize:9,color:T.textMuted}}>diversity {s.diversity}</span>
          <span style={{fontSize:9,color:T.textMuted}}>explore {s.exploration}</span>
          <span style={{fontSize:9,color:T.textMuted}}>volume {s.volume}</span>
        </div>
      </div>
      <span style={{color:T.accent,fontWeight:800,fontSize:16,fontFamily:"DM Sans",minWidth:32,textAlign:"right"}}>{s.score}</span>
    </div>))}</div>);
}

// ── New Viz: Mood Ring ───────────────────────────────────────────────────────
function MoodRing({submissions,t:th}){
  const T=THEMES[th];
  const data=useMemo(()=>{const c={};submissions.forEach(s=>{c[s.mood]=(c[s.mood]||0)+1});
    const total=submissions.length||1;
    return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([mood,count],i)=>({mood,count,pct:count/total,angle:0}));
  },[submissions]);
  // Calculate arc angles
  let cum=0;data.forEach(d=>{d.startAngle=cum;cum+=d.pct*360;d.endAngle=cum;});
  const mc=th==="vinyl"?{happy:"#c25a2e",melancholy:"#5a6a8b",energetic:"#a04020",dreamy:"#8b6a9b",aggressive:"#8b2020",peaceful:"#3c6a3c",nostalgic:"#8b6340",dark:"#4a4a5a"}:{happy:"#ffb478",melancholy:"#7b8cff",energetic:"#ff8b8b",dreamy:"#c4a0ff",aggressive:"#ff5555",peaceful:"#6bc7a0",nostalgic:"#ffb478",dark:"#8b7bff"};
  function arc(cx,cy,r,start,end){const s=start*Math.PI/180-Math.PI/2,e=end*Math.PI/180-Math.PI/2;const large=end-start>180?1:0;
    return`M ${cx+Math.cos(s)*r} ${cy+Math.sin(s)*r} A ${r} ${r} 0 ${large} 1 ${cx+Math.cos(e)*r} ${cy+Math.sin(e)*r}`;}
  return(<svg viewBox="0 0 600 400" style={{width:"100%",height:400}}>
    {data.map((d,i)=>{const mid=(d.startAngle+d.endAngle)/2*Math.PI/180-Math.PI/2;const lx=300+Math.cos(mid)*155,ly=200+Math.sin(mid)*155;
      return(<g key={d.mood}>
        <path d={arc(300,200,120,d.startAngle+1,d.endAngle-1)} fill="none" stroke={mc[d.mood]||"#888"} strokeWidth={40} strokeLinecap="round" opacity={0.85}/>
        <line x1={300+Math.cos(mid)*100} y1={200+Math.sin(mid)*100} x2={lx} y2={ly} stroke={T.cardBorder} strokeWidth={0.5}/>
        <text x={lx} y={ly-6} textAnchor="middle" fill={T.textSub} fontSize={11} fontFamily="DM Sans" fontWeight={600}>{d.mood}</text>
        <text x={lx} y={ly+8} textAnchor="middle" fill={T.textMuted} fontSize={10} fontFamily="DM Sans">{d.count} ({Math.round(d.pct*100)}%)</text>
      </g>);})}
    <text x={300} y={196} textAnchor="middle" fill={T.text} fontSize={28} fontFamily="DM Sans" fontWeight={800}>{submissions.length}</text>
    <text x={300} y={214} textAnchor="middle" fill={T.textMuted} fontSize={11} fontFamily="DM Sans">drops</text>
  </svg>);
}

// ── New Viz: Drop Timeline ───────────────────────────────────────────────────
function DropTimeline({submissions,t:th}){
  const T=THEMES[th];
  const days=useMemo(()=>{const d={};const names=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    submissions.forEach(s=>{const day=new Date(s.timestamp).getDay();const idx=day===0?6:day-1;
      if(!d[idx])d[idx]=[];d[idx].push(s);});
    return names.map((n,i)=>({name:n,drops:d[i]||[]}));
  },[submissions]);
  const maxD=Math.max(...days.map(d=>d.drops.length),1);
  const mc=th==="vinyl"?{happy:"#c25a2e",melancholy:"#5a6a8b",energetic:"#a04020",dreamy:"#8b6a9b",peaceful:"#3c6a3c",nostalgic:"#8b6340",dark:"#4a4a5a"}:{happy:"#ffb478",melancholy:"#7b8cff",energetic:"#ff8b8b",dreamy:"#c4a0ff",peaceful:"#6bc7a0",nostalgic:"#ffb478",dark:"#8b7bff"};
  return(<svg viewBox="0 0 600 380" style={{width:"100%",height:380}}>
    {days.map((day,i)=>{const x=60+i*75;
      return(<g key={day.name}>
        <text x={x} y={360} textAnchor="middle" fill={day.name==="Fri"?T.accent:T.textMuted} fontSize={11} fontFamily="DM Sans" fontWeight={day.name==="Fri"?700:500}>{day.name}</text>
        <line x1={x} y1={340} x2={x} y2={40} stroke={T.cardBorder} strokeWidth={0.5} strokeDasharray="2 4"/>
        {day.drops.map((s,j)=>{const y=330-j*38;const c=mc[s.mood]||"#888";
          return(<g key={s.id}>
            <circle cx={x} cy={y} r={14} fill={c} opacity={0.12}/>
            <circle cx={x} cy={y} r={8} fill={c} opacity={0.8}/>
            <text x={x} y={y+3} textAnchor="middle" fill="#fff" fontSize={8} fontFamily="DM Sans" fontWeight={700}>{s.name[0]}</text>
          </g>);})}
      </g>);})}
    <text x={300} y={24} textAnchor="middle" fill={T.textMuted} fontSize={10} fontFamily="DM Sans">Each dot = one drop · Friday highlighted</text>
  </svg>);
}

// ── New Viz: Most Loved ──────────────────────────────────────────────────────
function MostLoved({submissions,t:th}){
  const T=THEMES[th];
  const ranked=useMemo(()=>submissions.map(s=>({...s,total:Object.values(s.reactions||{}).reduce((a,b)=>a+b,0)})).sort((a,b)=>b.total-a.total).slice(0,6),[submissions]);
  const maxR=Math.max(...ranked.map(r=>r.total),1);
  return(<div style={{padding:"12px 8px"}}>
    {ranked.length===0?<p style={{color:T.textMuted,fontSize:12,textAlign:"center",padding:20}}>No reactions yet</p>:
    ranked.map((s,i)=>(<div key={s.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"0 4px"}}>
      <span style={{fontSize:16,width:24,textAlign:"center",color:i===0?T.accent:T.textMuted,fontWeight:800}}>{i+1}</span>
      <div style={{flex:1}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
          <span style={{fontWeight:700,fontSize:13,color:T.text}}>{s.name}</span>
          <span style={{fontSize:11,color:T.textMuted}}>{s.genre} · {s.mood}</span>
        </div>
        <p style={{fontSize:11,color:T.textSub,fontStyle:"italic",marginBottom:4,lineHeight:1.4}}>"{s.note?.slice(0,60)}{s.note?.length>60?"...":""}"</p>
        <div style={{height:5,background:T.pillBg,borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:3,width:`${(s.total/maxR)*100}%`,background:T.gradient,transition:"width 0.6s"}}/>
        </div>
      </div>
      <span style={{fontWeight:800,fontSize:15,color:T.accent,minWidth:28,textAlign:"right"}}>{s.total}</span>
    </div>))}
  </div>);
}

// ── New Viz: Tag Map ─────────────────────────────────────────────────────────
function TagMap({submissions,t:th}){
  const T=THEMES[th];
  const data=useMemo(()=>{const c={};submissions.forEach(s=>s.tags?.forEach(t=>{c[t]=(c[t]||0)+1}));
    return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([tag,count])=>({tag,count}));
  },[submissions]);
  const maxC=Math.max(...data.map(d=>d.count),1);
  const colors=th==="vinyl"?["#c25a2e","#8b6340","#3c6a3c","#5a6a8b","#8b5a6a","#7a5a4a"]:["#c4a0ff","#7b8cff","#6bc7a0","#ff8b8b","#ffb478","#ffa0d0"];
  return(<svg viewBox="0 0 600 360" style={{width:"100%",height:360}}>
    {data.map((d,i)=>{
      const cols=3;const row=Math.floor(i/cols);const col=i%cols;
      const x=80+col*190;const y=50+row*80;const w=140*(d.count/maxC);const h=28+d.count*4;
      return(<g key={d.tag}>
        <rect x={x} y={y} width={Math.max(w,60)} height={h} rx={6} fill={colors[i%colors.length]} opacity={0.15}/>
        <rect x={x} y={y} width={Math.max(w,60)} height={h} rx={6} fill="none" stroke={colors[i%colors.length]} strokeWidth={1} opacity={0.4}/>
        <text x={x+Math.max(w,60)/2} y={y+h/2-4} textAnchor="middle" fill={T.text} fontSize={13} fontFamily="DM Sans" fontWeight={700}>{d.tag}</text>
        <text x={x+Math.max(w,60)/2} y={y+h/2+10} textAnchor="middle" fill={T.textMuted} fontSize={10} fontFamily="DM Sans">{d.count}×</text>
      </g>);
    })}
  </svg>);
}

// ── New Viz: Genre Breakdown Bar Chart ───────────────────────────────────────
function GenreBar({submissions,t:th}){
  const T=THEMES[th];
  const data=useMemo(()=>{const c={};submissions.forEach(s=>{c[s.genre]=(c[s.genre]||0)+1});
    return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,10);
  },[submissions]);
  const maxC=Math.max(...data.map(d=>d[1]),1);
  const colors=th==="vinyl"?["#c25a2e","#a07030","#3c6a3c","#5a6a8b","#8b5a6a","#6a5a3c","#4a7a7a","#7a5a4a","#8b6340","#5a5a5a"]:["#c4a0ff","#7b8cff","#6bc7a0","#ff8b8b","#ffb478","#78c4ff","#a0ffc4","#ffa0d0","#8b7bff","#88ddaa"];
  return(<svg viewBox="0 0 600 380" style={{width:"100%",height:380}}>
    {data.map(([genre,count],i)=>{const y=30+i*34;const w=420*(count/maxC);
      return(<g key={genre}>
        <text x={120} y={y+18} textAnchor="end" fill={T.textSub} fontSize={11} fontFamily="DM Sans" fontWeight={600}>{genre}</text>
        <rect x={130} y={y+4} width={w} height={20} rx={4} fill={colors[i%colors.length]} opacity={0.7}/>
        <text x={135+w} y={y+18} fill={T.textMuted} fontSize={10} fontFamily="DM Sans" fontWeight={700}>{count}</text>
      </g>);
    })}
  </svg>);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════

export default function FBC(){
  // Session & auth
  const [user, setUser] = useState(null); // {name, passkey}
  const [users, setUsers] = useState([MASTER]); // all registered users
  const [authMode, setAuthMode] = useState("login"); // "login"|"signup"
  const [authName, setAuthName] = useState("");
  const [authKey, setAuthKey] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authErr, setAuthErr] = useState("");

  // Language
  const [lang, setLang] = useState("en");
  const t = useCallback((key) => T_[lang]?.[key] || T_.en[key] || key, [lang]);

  // Theme
  const [theme, setTheme] = useState("midnight");
  const T = THEMES[theme];

  // Core
  const [page, setPage] = useState("board");
  const [subs, setSubs] = useState([]);
  const [showSubmit, setShowSubmit] = useState(false);
  const [vizIndex, setVizIndex] = useState(()=>weekNum()%VIZ_TYPES.length);

  // Profile
  const [showProfile, setShowProfile] = useState(false);
  const [pfpUploading, setPfpUploading] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editFavGenres, setEditFavGenres] = useState([]);

  // Mini profile card (viewing other users)
  const [viewingProfile, setViewingProfile] = useState(null); // user name or null

  // Save feedback
  const [savedMsg, setSavedMsg] = useState("");
  const flash = useCallback((msg="✓") => { setSavedMsg(msg); setTimeout(() => setSavedMsg(""), 1500); }, []);

  // Admin viz override
  const [vizOverride, setVizOverride] = useState("");

  // Admin
  const [adminUser, setAdminUser] = useState(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminInput, setAdminInput] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState("theme");

  // Config
  const [genres, setGenres] = useState(DEF_GENRES);
  const [tags, setTags] = useState(DEF_TAGS);
  const [moods, setMoods] = useState(DEF_MOODS);
  const [reactions, setReactions] = useState(DEF_REACTIONS);
  const [admins, setAdmins] = useState([MASTER]);
  const [changelog, setChangelog] = useState([]);

  // Invite system
  const [inviteCodes, setInviteCodes] = useState([]); // [{code, used, usedBy}]

  // Weekly theme
  const [weeklyTheme, setWeeklyTheme] = useState(""); // set by admin

  // Filters
  const [fTag, setFTag] = useState("");
  const [fPerson, setFPerson] = useState("");
  const [fTime, setFTime] = useState("all");
  const [sortBy, setSortBy] = useState("recent");

  // Form
  const [fl, setFl] = useState("");
  const [fno, setFno] = useState("");
  const [ft, setFt] = useState([]);
  const [fm, setFm] = useState("");
  const [fg, setFg] = useState("");
  const [fo, setFo] = useState(3);
  const [sok, setSok] = useState(false);

  // Edit
  const [editId, setEditId] = useState(null);
  const [editNote, setEditNote] = useState("");
  const [uploading, setUploading] = useState(false);

  const doAddLog = useCallback(async(who,action,details)=>{
    const e={id:uid(),timestamp:Date.now(),who,action,details};
    setChangelog(p=>[e,...p]);
    await addLogEntry(e);
  },[]);

  const saveCfg = useCallback(async(f,v,label)=>{
    const cfg={genres,tags,moods,reactions,admins,inviteCodes,weeklyTheme,vizOverride};cfg[f]=v;
    if(f==="genres")setGenres(v);if(f==="tags")setTags(v);if(f==="moods")setMoods(v);if(f==="reactions")setReactions(v);if(f==="admins")setAdmins(v);
    if(f==="inviteCodes")setInviteCodes(v);if(f==="weeklyTheme")setWeeklyTheme(v);if(f==="vizOverride")setVizOverride(v);
    await saveConfig(cfg);
    if(adminUser&&label)doAddLog(adminUser.name,"config",label);
  },[genres,tags,moods,reactions,admins,inviteCodes,weeklyTheme,vizOverride,adminUser,doAddLog]);

  // Hydrate
  useEffect(()=>{let c=false;(async()=>{try{
    const[sr,cr,lr,ur]=await Promise.all([getSubs(),getConfig(),getLog(),getUsers()]);
    const ss=getSession();
    if(c)return;
    if(sr?.length)setSubs(sr);
    if(cr){if(cr.genres?.length)setGenres(cr.genres);if(cr.tags?.length)setTags(cr.tags);if(cr.moods?.length)setMoods(cr.moods);if(cr.reactions?.length)setReactions(cr.reactions);if(cr.admins?.length)setAdmins(cr.admins);if(cr.inviteCodes)setInviteCodes(cr.inviteCodes);if(cr.weeklyTheme)setWeeklyTheme(cr.weeklyTheme);if(cr.vizOverride)setVizOverride(cr.vizOverride);}
    if(lr?.length)setChangelog(lr);
    if(ur?.length)setUsers(ur);
    else { await saveUser(MASTER); setUsers([MASTER]); }
    if(ss?.name)setUser(ss);
    if(ss?.theme)setTheme(ss.theme);
    if(ss?.lang)setLang(ss.lang);
  }catch(e){console.error("Hydrate error:",e)}})();return()=>{c=true;};},[]);

  // Auth handlers
  const doLogin = useCallback(()=>{
    const found=users.find(u=>u.name.toLowerCase()===authName.trim().toLowerCase()&&u.passkey===authKey);
    if(found){setUser(found);saveSession({...found,theme,lang});setAuthErr("");setAuthName("");setAuthKey("");}
    else setAuthErr(t("badLogin"));
  },[users,authName,authKey,theme,lang,t]);

  const doSignup = useCallback(async()=>{
    const name=authName.trim();if(!name||!authKey){setAuthErr(t("needNameKey"));return;}
    const code=authCode.trim().toUpperCase();
    const invite=inviteCodes.find(c=>c.code===code&&!c.used);
    if(!invite){setAuthErr(t("badInvite"));return;}
    if(users.find(u=>u.name.toLowerCase()===name.toLowerCase())){setAuthErr(t("nameTaken"));return;}
    const newU={name,passkey:authKey,role:"member"};
    await saveUser(newU);
    setUsers(prev=>[...prev,newU]);
    // Mark invite as used
    const updatedCodes=inviteCodes.map(c=>c.code===code?{...c,used:true,usedBy:name}:c);
    saveCfg("inviteCodes",updatedCodes,`Invite ${code} used by ${name}`);
    setUser(newU);saveSession({...newU,theme,lang});setAuthErr("");setAuthName("");setAuthKey("");setAuthCode("");
  },[users,authName,authKey,authCode,inviteCodes,theme,lang,t,saveCfg]);

  const logout = useCallback(()=>{setUser(null);saveSession(null);setAdminUser(null);},[]);

  // Theme switch
  const toggleTheme = useCallback(()=>{
    const next=theme==="midnight"?"vinyl":"midnight";setTheme(next);
    if(user)saveSession({...user,theme:next,lang});
  },[theme,user,lang]);

  // Language switch
  const toggleLang = useCallback(()=>{
    const next=lang==="en"?"es":"en";setLang(next);
    if(user)saveSession({...user,theme,lang:next});
  },[lang,user,theme]);

  // Submit
  const handleSubmit = useCallback(async()=>{
    if(!user||!fl||!fno||!fm||!fg||ft.length===0)return;
    const now=Date.now();
    const finalTags=[...ft];
    if(isLateNight(now)&&!finalTags.includes("🌙 late night"))finalTags.push("🌙 late night");
    const ns={id:uid(),name:user.name,link:fl,note:fno,tags:finalTags,mood:fm,genre:fg,obsession:fo,reactions:{},timestamp:now,deleted:false,mystery:false};
    setSubs(prev=>[ns,...prev]);
    await saveSub(ns);
    setFl("");setFno("");setFt([]);setFm("");setFg("");setFo(3);
    setSok(true);setTimeout(()=>{setSok(false);setShowSubmit(false);},1200);
  },[user,fl,fno,ft,fm,fg,fo]);

  const handleReaction = useCallback(async(id,emoji)=>{
    const sub=subs.find(s=>s.id===id);if(!sub)return;
    const r={...sub.reactions};r[emoji]=(r[emoji]||0)+1;
    setSubs(prev=>prev.map(s=>s.id===id?{...s,reactions:r}:s));
    await updateSubReactions(id,r);
  },[subs]);

  const userDel = useCallback(async(id)=>{
    const updated=subs.find(s=>s.id===id);if(!updated)return;
    const mod={...updated,deleted:true,deletedBy:user?.name};
    setSubs(prev=>prev.map(s=>s.id===id?mod:s));
    await saveSub(mod);
  },[subs,user]);

  const adminDel = useCallback(async(id)=>{
    setSubs(prev=>prev.filter(s=>s.id!==id));
    await deleteSub(id);
    if(adminUser)doAddLog(adminUser.name,"delete",`Removed post ${id.slice(0,8)}`);
  },[adminUser,doAddLog]);

  const saveEditFn = useCallback(async(id)=>{
    if(!editNote.trim())return;
    const sub=subs.find(s=>s.id===id);if(!sub)return;
    const mod={...sub,note:editNote.trim(),edited:true};
    setSubs(prev=>prev.map(s=>s.id===id?mod:s));
    await saveSub(mod);
    setEditId(null);setEditNote("");
  },[subs,editNote]);

  const tryAdminLogin = useCallback(()=>{const f=admins.find(a=>a.passkey===adminInput);if(f){setAdminUser({name:f.name,isMaster:f.name===MASTER.name&&f.passkey===MASTER.passkey});setShowAdminLogin(false);setShowAdmin(true);setAdminInput("");doAddLog(f.name,"login","Admin login");}},[admins,adminInput,doAddLog]);

  const wk=getWk();
  const filtered=useMemo(()=>{let l=subs.filter(s=>!s.deleted||s.deletedBy);if(fTime==="week")l=l.filter(s=>getWk(new Date(s.timestamp))===wk);if(fTag)l=l.filter(s=>s.tags?.includes(fTag));if(fPerson)l=l.filter(s=>s.name===fPerson);if(sortBy==="hot")l.sort((a,b)=>Object.values(b.reactions||{}).reduce((x,y)=>x+y,0)-Object.values(a.reactions||{}).reduce((x,y)=>x+y,0));else l.sort((a,b)=>b.timestamp-a.timestamp);return l;},[subs,fTag,fPerson,fTime,sortBy,wk]);
  const tw=useMemo(()=>subs.filter(s=>!s.deleted&&getWk(new Date(s.timestamp))===wk),[subs,wk]);
  const viz=tw.length>=3?tw:subs.filter(s=>!s.deleted).slice(0,8);
  const ppl=useMemo(()=>[...new Set(subs.filter(s=>!s.deleted).map(s=>s.name))].sort(),[subs]);
  const activeViz=useMemo(()=>{
    if(vizOverride){const idx=VIZ_TYPES.findIndex(v=>v.id===vizOverride);if(idx>=0)return idx;}
    return vizIndex%VIZ_TYPES.length;
  },[vizOverride,vizIndex]);
  const getUserPic=useCallback((name)=>{const u=users.find(u=>u.name===name);return u?.picture||null;},[users]);
  const getUserProfile=useCallback((name)=>users.find(u=>u.name===name)||null,[users]);
  const dotw=useMemo(()=>getDropOfWeek(subs),[subs]);

  // ═══════════════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════════════
  const css = `
    
    *{box-sizing:border-box;margin:0;padding:0}
    ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.cardBorder};border-radius:3px}
    .p{display:inline-block;padding:3px 10px;border-radius:16px;font-size:10px;font-weight:600;background:${T.pillBg};color:${T.textSub};margin:2px 3px 2px 0}
    .ts{cursor:pointer;border:1px solid ${T.cardBorder};transition:all 0.15s}.ts:hover{opacity:0.8}.ts.on{background:${T.tagMood};color:${T.accent};border-color:${T.accent}}
    .rb{display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:16px;border:1px solid ${T.cardBorder};background:${T.card};cursor:pointer;font-size:13px;color:${T.textSub};transition:all 0.15s}
    .rb:hover{opacity:0.8;transform:scale(1.05)}
    .rb img{display:block}
    .ch{padding:5px 12px;border-radius:16px;border:1px solid ${T.cardBorder};background:transparent;color:${T.textSub};font-size:11px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;transition:all 0.15s;white-space:nowrap}
    .ch:hover{opacity:0.8}.ch.on{background:${T.pillBg};color:${T.text};border-color:${T.textMuted}}
    .nb{padding:7px 18px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:700;font-family:'DM Sans',sans-serif;transition:all 0.2s}
    .nb.on{background:${T.navActiveBg};color:${T.navActiveText}}.nb:not(.on){background:transparent;color:${T.textSub}}.nb:not(.on):hover{opacity:0.8}
    .cd{background:${T.card};border:1px solid ${T.cardBorder};border-radius:14px;overflow:hidden;transition:border-color 0.2s}.cd:hover{border-color:${T.textMuted}}
    .ov{position:fixed;inset:0;background:${T.overlay};backdrop-filter:blur(16px);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px}
    .ml{background:${T.bgSub};border:1px solid ${T.cardBorder};border-radius:18px;padding:28px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto}
    .in{width:100%;padding:11px 14px;background:${T.inputBg};border:1px solid ${T.cardBorder};border-radius:8px;color:${T.text};font-size:13px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color 0.2s;-webkit-appearance:none;appearance:none}
    select.in{background:${T.inputBg} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='${encodeURIComponent(T.textMuted)}' stroke-width='1.5' fill='none'/%3E%3C/svg%3E") no-repeat right 12px center;padding-right:32px}
    select.in option{background:${T.inputBg};color:${T.text}}
    .in:focus{border-color:${T.accent}}.in::placeholder{color:${T.textMuted}}textarea.in{resize:vertical;min-height:70px}
    .pb{width:100%;padding:12px;border-radius:10px;border:none;background:${T.gradient};color:#fff;font-size:14px;font-weight:800;font-family:'DM Sans',sans-serif;cursor:pointer;transition:all 0.2s}
    .pb:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,0,0,0.2)}.pb:disabled{opacity:0.35;cursor:not-allowed;transform:none;box-shadow:none}
    .vt{padding:6px 14px;border-radius:8px;border:1px solid ${T.cardBorder};background:transparent;color:${T.textSub};font-size:11px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;white-space:nowrap;transition:all 0.2s}.vt.on{background:${T.pillBg};color:${T.text};border-color:${T.textMuted}}
    .fi{animation:fi 0.3s ease}@keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    .fab{position:fixed;bottom:20px;right:20px;z-index:50;width:52px;height:52px;border-radius:50%;background:${T.gradient};border:none;color:#fff;font-size:26px;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,0.25);transition:all 0.2s;display:flex;align-items:center;justify-content:center}
    .fab:hover{transform:scale(1.08)}
    .xb{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;border:none;background:rgba(200,60,60,0.15);color:#cc4444;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.15s;z-index:2}.cd:hover .xb{opacity:1}
    .lb{font-size:10px;font-weight:700;color:${T.textMuted};text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:5px}
    .ghost{opacity:0.4;padding:16px;text-align:center;font-style:italic;font-size:12px;color:${T.textMuted}}
    .at{padding:5px 10px;border-radius:6px;border:1px solid ${T.cardBorder};background:transparent;color:${T.textMuted};font-size:11px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer}.at.on{background:${T.pillBg};color:${T.text}}
    .ib{background:none;border:none;cursor:pointer;font-size:11px;padding:3px 6px;border-radius:4px;transition:all 0.15s;color:${T.textMuted}}.ib:hover{background:${T.pillBg};color:${T.text}}
    .thb{width:28px;height:28px;border-radius:50%;border:1.5px solid ${T.textMuted};cursor:pointer;transition:all 0.15s;display:flex;align-items:center;justify-content:center;font-size:13px;background:${T.pillBg};color:${T.text}}.thb:hover{border-color:${T.accent};background:${T.card}}
    @media(max-width:600px){
      .ml{padding:20px 16px;border-radius:14px;max-height:85vh}
      .cd iframe{height:132px !important}
      .fab{width:48px;height:48px;font-size:24px;bottom:16px;right:16px}
      .nb{padding:6px 14px;font-size:11px}
      .ch{padding:4px 10px;font-size:10px}
      .vt{padding:5px 10px;font-size:10px}
      .at{padding:4px 8px;font-size:10px}
    }
  `;

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (!user) {
    return (
      <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'DM Sans',sans-serif",color:T.text,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <style>{css}</style>
        <div style={{maxWidth:360,width:"100%",textAlign:"center"}}>
          <h1 style={{fontFamily:"'Instrument Serif',serif",fontSize:48,fontWeight:400,marginBottom:4}}>FBC</h1>
          <p style={{color:T.textMuted,fontSize:12,letterSpacing:2,textTransform:"uppercase",marginBottom:40}}>{t("fridayBeatClub")}</p>

          <div style={{display:"flex",gap:0,marginBottom:24,background:T.pillBg,borderRadius:8,padding:3}}>
            <button onClick={()=>{setAuthMode("login");setAuthErr("");}} style={{flex:1,padding:8,borderRadius:6,border:"none",background:authMode==="login"?T.navActiveBg:"transparent",color:authMode==="login"?T.navActiveText:T.textSub,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>{t("signIn")}</button>
            <button onClick={()=>{setAuthMode("signup");setAuthErr("");}} style={{flex:1,padding:8,borderRadius:6,border:"none",background:authMode==="signup"?T.navActiveBg:"transparent",color:authMode==="signup"?T.navActiveText:T.textSub,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>{t("createAccount")}</button>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {authMode==="signup"&&<input className="in" placeholder={t("inviteCode")} value={authCode} onChange={e=>setAuthCode(e.target.value)} style={{textTransform:"uppercase",letterSpacing:2,textAlign:"center"}} />}
            <input className="in" placeholder={authMode==="signup"?t("chooseName"):t("yourName")} value={authName} onChange={e=>setAuthName(e.target.value)} />
            <input className="in" type="password" placeholder={authMode==="signup"?t("createPasskey"):t("yourPasskey")} value={authKey} onChange={e=>setAuthKey(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"){authMode==="login"?doLogin():doSignup();}}} />
            {authErr && <p style={{color:"#cc4444",fontSize:12}}>{authErr}</p>}
            <button className="pb" onClick={authMode==="login"?doLogin:doSignup}>
              {authMode==="login"?t("enter"):t("joinFBC")}
            </button>
          </div>

          <p style={{color:T.textMuted,fontSize:11,marginTop:24,lineHeight:1.6}}>
            {authMode==="signup" ? t("signupHint") : t("loginHint")}
          </p>

          <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:20}}>
            <button onClick={toggleTheme} style={{padding:"6px 14px",borderRadius:16,border:`1px solid ${T.cardBorder}`,background:T.pillBg,color:T.textSub,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
              {theme==="midnight"?`☀ ${t("lightMode")}`:`☾ ${t("darkMode")}`}
            </button>
            <button onClick={toggleLang} style={{padding:"6px 14px",borderRadius:16,border:`1px solid ${T.cardBorder}`,background:T.pillBg,color:T.textSub,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
              🌐 {lang==="en"?"Español":"English"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN APP
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'DM Sans',sans-serif",color:T.text}}>
      <style>{css}</style>

      {/* Toast notification */}
      {savedMsg&&<div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",padding:"8px 20px",borderRadius:20,background:T.accent,color:"#fff",fontSize:12,fontWeight:700,zIndex:200,animation:"fi 0.2s ease",boxShadow:"0 4px 16px rgba(0,0,0,0.3)"}}>{savedMsg}</div>}

      <header style={{padding:"16px 20px 0",position:"sticky",top:0,zIndex:40,background:T.bg}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,maxWidth:860,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"baseline",gap:8}}>
            <h1 style={{fontFamily:"'Instrument Serif',serif",fontSize:28,fontWeight:400}}>FBC</h1>
            <span style={{fontSize:11,color:T.textMuted,fontWeight:500,letterSpacing:1.5,textTransform:"uppercase"}}>{t("fridayBeatClub")}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button className="thb" onClick={toggleTheme} title={theme==="midnight"?t("lightMode"):t("darkMode")}>
              {theme==="midnight"?"☀":"☾"}
            </button>
            <button className="thb" onClick={toggleLang} title={lang==="en"?"Español":"English"} style={{fontSize:10,fontWeight:700}}>
              {lang==="en"?"ES":"EN"}
            </button>
            {/* Profile pic / name — clickable */}
            <button onClick={()=>setShowProfile(true)} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",padding:2}}>
              {getUserPic(user.name)
                ? <img src={getUserPic(user.name)} style={{width:24,height:24,borderRadius:"50%",objectFit:"cover"}} alt="" />
                : <div style={{width:24,height:24,borderRadius:"50%",background:`hsl(${user.name.charCodeAt(0)*37%360},45%,${theme==="vinyl"?"45%":"55%"})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff"}}>{user.name[0]}</div>}
              <span style={{fontSize:10,color:T.textMuted}}>{user.name}</span>
            </button>
            <button onClick={()=>adminUser?setShowAdmin(true):setShowAdminLogin(true)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:adminUser?T.accent:T.textMuted,padding:2}}>⚙</button>
            <button className="ib" onClick={logout} style={{fontSize:10}}>{t("logout")}</button>
          </div>
        </div>
        <nav style={{display:"flex",gap:4,maxWidth:860,margin:"0 auto",paddingBottom:12}}>
          <button className={`nb ${page==="board"?"on":""}`} onClick={()=>setPage("board")}>{t("dropBoard")}</button>
          <button className={`nb ${page==="discover"?"on":""}`} onClick={()=>setPage("discover")}>{t("discovery")}</button>
        </nav>
        <div style={{height:1,background:T.cardBorder,maxWidth:860,margin:"0 auto"}} />
      </header>

      {/* ══════ BOARD ══════ */}
      {page==="board"&&(
        <main style={{padding:"20px 20px 90px",maxWidth:860,margin:"0 auto"}} className="fi">
          {/* Weekly theme banner */}
          {weeklyTheme&&(
            <div style={{background:T.gradient,borderRadius:12,padding:"16px 20px",marginBottom:16,position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:0,right:0,width:80,height:"100%",background:"rgba(255,255,255,0.05)",borderRadius:"0 12px 12px 0"}} />
              <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,color:"rgba(255,255,255,0.6)",marginBottom:4}}>{t("thisWeeksThemeBanner")}</div>
              <div style={{fontSize:16,fontWeight:800,color:"#fff"}}>{weeklyTheme}</div>
            </div>
          )}
          <div style={{display:"flex",gap:10,marginBottom:16,overflowX:"auto",paddingBottom:4}}>
            {[{l:t("thisWeek"),v:tw.length},{l:t("contributors"),v:ppl.length},{l:t("genres"),v:new Set(subs.filter(s=>!s.deleted).map(s=>s.genre)).size}].map((s,i)=>(
              <div key={i} style={{background:T.card,border:`1px solid ${T.cardBorder}`,borderRadius:10,padding:"10px 16px",minWidth:90}}>
                <div style={{fontSize:20,fontWeight:800}}>{s.v}</div><div style={{fontSize:10,color:T.textMuted}}>{s.l}</div>
              </div>))}
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:16,alignItems:"center"}}>
            <button className={`ch ${fTime==="all"?"on":""}`} onClick={()=>setFTime("all")}>{t("allTime")}</button>
            <button className={`ch ${fTime==="week"?"on":""}`} onClick={()=>setFTime("week")}>{t("thisWeek")}</button>
            <div style={{width:1,height:16,background:T.cardBorder,margin:"0 2px"}} />
            <button className={`ch ${sortBy==="recent"?"on":""}`} onClick={()=>setSortBy("recent")}>{t("recent")}</button>
            <button className={`ch ${sortBy==="hot"?"on":""}`} onClick={()=>setSortBy("hot")}>🔥</button>
            <div style={{width:1,height:16,background:T.cardBorder,margin:"0 2px"}} />
            <select className="ch" value={fTag} onChange={e=>setFTag(e.target.value)} style={{background:fTag?T.pillBg:"transparent",color:fTag?T.text:undefined}}>
              <option value="" style={{background:T.inputBg,color:T.text}}>{t("allTags")}</option>
              {tags.map(tg=><option key={tg} value={tg} style={{background:T.inputBg,color:T.text}}>{tg}</option>)}
            </select>
            <select className="ch" value={fPerson} onChange={e=>setFPerson(e.target.value)} style={{background:fPerson?T.pillBg:"transparent",color:fPerson?T.text:undefined}}>
              <option value="" style={{background:T.inputBg,color:T.text}}>{t("everyone")}</option>
              {ppl.map(p=><option key={p} value={p} style={{background:T.inputBg,color:T.text}}>{p}</option>)}
            </select>
            {(fTag||fPerson||fTime!=="all")&&<button className="ch" onClick={()=>{setFTag("");setFPerson("");setFTime("all");setSortBy("recent");}} style={{color:T.accent}}>{t("clear")}</button>}
          </div>

          {filtered.length===0?(<div style={{textAlign:"center",padding:"50px 20px",color:T.textMuted}}>
            <div style={{fontSize:32,marginBottom:8}}>🎵</div>
            <div style={{fontSize:13}}>{subs.length===0?t("noDropsYet"):t("noMatch")}</div>
          </div>):(
            <div style={{display:"grid",gap:14}}>
              {filtered.map((sub,idx)=>{
                if(sub.deleted&&sub.deletedBy)return(<div key={sub.id} className="cd ghost fi">{t("removedBy")} {sub.deletedBy}{adminUser&&<button className="ib" style={{marginLeft:6,color:"#cc4444"}} onClick={()=>adminDel(sub.id)}>{t("removePerm")}</button>}</div>);
                const embed=getEmbed(sub.link),isOwn=user&&sub.name===user.name,isEd=editId===sub.id;
                const obsK=OBSESSION.find(o=>o.v===sub.obsession)?.k||"";
                return(
                  <div key={sub.id} className="cd fi" style={{animationDelay:`${Math.min(idx,10)*35}ms`,position:"relative"}}>
                    {adminUser&&<button className="xb" onClick={()=>adminDel(sub.id)}>×</button>}
                    {embed?.type==="spotify"&&<iframe src={embed.src} width="100%" height="152" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style={{borderRadius:"14px 14px 0 0",display:"block"}}/>}
                    {embed?.type==="youtube"&&<iframe src={embed.src} width="100%" height="200" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{borderRadius:"14px 14px 0 0",display:"block"}}/>}
                    {embed?.type==="apple"&&<iframe src={embed.src} width="100%" height="175" frameBorder="0" allow="autoplay; encrypted-media" loading="lazy" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation" style={{borderRadius:"14px 14px 0 0",display:"block"}}/>}
                    {(!embed||embed.type==="soundcloud")&&<div style={{padding:"14px 18px 0"}}><a href={sub.link} target="_blank" rel="noopener noreferrer" style={{color:T.accent,fontSize:12,wordBreak:"break-all",textDecoration:"none"}}>{embed?.type==="soundcloud"?"🔊":"🔗"} {sub.link}</a></div>}
                    <div style={{padding:"12px 18px 14px"}}>
                      {/* Crown banner for Drop of the Week */}
                      {dotw&&dotw.id===sub.id&&<div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8,padding:"4px 10px",borderRadius:8,background:T.gradient,width:"fit-content"}}>
                        <span style={{fontSize:12}}>👑</span><span style={{fontSize:10,fontWeight:700,color:"#fff"}}>{lang==="es"?"Drop de la Semana":"Drop of the Week"}</span>
                      </div>}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:7}}>
                        {sub.mystery&&!sub.mysteryRevealed?(
                          <div style={{display:"flex",alignItems:"center",gap:7}}>
                            <div style={{width:26,height:26,borderRadius:"50%",background:T.gradient,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>?</div>
                            <span style={{fontWeight:700,fontSize:13,color:T.accent,fontStyle:"italic"}}>{lang==="es"?"Misterio":"Mystery Drop"}</span>
                            <span style={{fontSize:11}}>🕵️</span>
                          </div>
                        ):(
                          <button style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",padding:0}} onClick={()=>setViewingProfile(sub.name)}>
                            {getUserPic(sub.name)
                              ?<img src={getUserPic(sub.name)} style={{width:26,height:26,borderRadius:"50%",objectFit:"cover",flexShrink:0}} alt="" />
                              :<div style={{width:26,height:26,borderRadius:"50%",background:`hsl(${sub.name.charCodeAt(0)*37%360},45%,${theme==="vinyl"?"45%":"55%"})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff",flexShrink:0}}>{sub.name[0]}</div>}
                            <span style={{fontWeight:700,fontSize:13,color:T.text}}>{sub.name}</span>
                            {(()=>{const b=calcBadge(sub.name,subs);return <span style={{fontSize:12}} title={b.title}>{b.emoji}</span>;})()}
                            {(()=>{const sk=calcStreak(sub.name,subs);return sk>=2?<span style={{fontSize:11,display:"flex",alignItems:"center",gap:1}} title={`${sk} week streak`}>{"🔥".repeat(Math.min(sk,5))}<span style={{fontSize:9,fontWeight:800,color:T.accent}}>{sk}</span></span>:null;})()}
                          </button>
                        )}
                          {sub.edited&&<span style={{fontSize:9,color:T.textMuted}}>{t("edited")}</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          {isOwn&&!isEd&&<><button className="ib" onClick={()=>{setEditId(sub.id);setEditNote(sub.note);}}>{t("edit")}</button><button className="ib" style={{color:"#cc4444"}} onClick={()=>userDel(sub.id)}>{t("delete")}</button></>}
                          <span style={{fontSize:10,color:T.textMuted}}>{ago(sub.timestamp)}</span>
                        </div>
                      </div>
                      {isEd?(<div style={{marginBottom:8}}><textarea className="in" value={editNote} onChange={e=>setEditNote(e.target.value)} style={{minHeight:50,marginBottom:6}}/><div style={{display:"flex",gap:6}}><button className="ib" style={{color:T.accent}} onClick={()=>{saveEditFn(sub.id);flash("✓")}}>{t("save")}</button><button className="ib" onClick={()=>{setEditId(null);setEditNote("");}}>{t("cancel")}</button></div></div>):(
                        <p style={{fontSize:13,color:T.textSub,lineHeight:1.5,marginBottom:8,fontStyle:"italic"}}>"{sub.note}"</p>)}
                      <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:8}}>
                        {sub.tags?.map(tg=><span key={tg} className="p">{tg}</span>)}
                        <span className="p" style={{background:T.tagMood,color:T.tagMoodC}}>{sub.mood}</span>
                        <span className="p" style={{background:T.tagGenre,color:T.tagGenreC}}>{sub.genre}</span>
                        <span className="p" style={{background:T.tagObs,color:T.tagObsC}}>{t(obsK)}</span>
                      </div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        {reactions.map(r=>(<button key={r} className="rb" onClick={()=>handleReaction(sub.id,r)}>
                          {isReactionImage(r)?<img src={r} alt="" style={{width:18,height:18,objectFit:"contain",borderRadius:3,verticalAlign:"middle"}} />:r}
                          {sub.reactions?.[r]?<span style={{fontSize:10,fontWeight:700}}>{sub.reactions[r]}</span>:null}
                        </button>))}
                      </div>
                    </div>
                  </div>);
              })}
            </div>
          )}
        </main>
      )}

      {/* ══════ DISCOVERY ══════ */}
      {page==="discover"&&(
        <main style={{padding:"20px 20px 90px",maxWidth:860,margin:"0 auto"}} className="fi">
          <div style={{textAlign:"center",marginBottom:24}}>
            <h2 style={{fontFamily:"'Instrument Serif',serif",fontSize:32,fontWeight:400,marginBottom:4}}>{t("thisWeeksStory")}</h2>
            <p style={{color:T.textMuted,fontSize:12}}>{viz.length} {t("submissions")} · {t("weekOf")} {new Date().toLocaleDateString(lang==="es"?"es-MX":"en-US",{month:"short",day:"numeric"})}</p>
          </div>
          {viz.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",color:T.textMuted}}>
              <div style={{fontSize:36,marginBottom:12}}>🔭</div>
              <div style={{fontSize:14,marginBottom:4}}>{t("nothingToViz")}</div>
              <div style={{fontSize:12}}>{t("dropSomeTracks")}</div>
            </div>
          ):(<>
          <div style={{display:"flex",gap:5,overflowX:"auto",padding:"4px 0",marginBottom:16,justifyContent:"center",flexWrap:"wrap"}}>
            {VIZ_TYPES.map((v,i)=>(<button key={v.id} className={`vt ${activeViz===i?"on":""}`} onClick={()=>setVizIndex(i)}>{t(v.name)}</button>))}
          </div>
          <div className="cd" style={{padding:18,marginBottom:20}}>
            <h3 style={{fontFamily:"'Instrument Serif',serif",fontSize:20,marginBottom:4}}>{t(VIZ_TYPES[activeViz]?.name)}</h3>
            <p style={{color:T.textMuted,fontSize:11,marginBottom:14}}>{t(VIZ_TYPES[activeViz]?.desc)}</p>
            <div style={{borderRadius:10,overflow:"hidden"}}>
              {activeViz===0&&<GenreConstellation submissions={viz} theme={theme}/>}
              {activeViz===1&&<TasteOverlap submissions={viz} t={theme}/>}
              {activeViz===2&&<ObsessionTerrain submissions={viz} t={theme}/>}
              {activeViz===3&&<MoodRing submissions={viz} t={theme}/>}
              {activeViz===4&&<DropTimeline submissions={viz} t={theme}/>}
              {activeViz===5&&<MostLoved submissions={viz} t={theme}/>}
              {activeViz===6&&<TagMap submissions={viz} t={theme}/>}
              {activeViz===7&&<GenreBar submissions={viz} t={theme}/>}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(120px, 1fr))",gap:10}}>
            {[{i:"🎵",l:t("totalDrops"),v:viz.length},{i:"🌍",l:t("genres"),v:new Set(viz.map(s=>s.genre)).size},{i:"👥",l:t("people"),v:new Set(viz.map(s=>s.name)).size},{i:"💜",l:t("avgObsession"),v:(viz.reduce((a,s)=>a+(s.obsession||3),0)/Math.max(viz.length,1)).toFixed(1)}].map((s,i)=>(
              <div key={i} className="cd" style={{padding:"14px",textAlign:"center"}}>
                <div style={{fontSize:20,marginBottom:2}}>{s.i}</div><div style={{fontSize:18,fontWeight:800}}>{s.v}</div><div style={{fontSize:10,color:T.textMuted}}>{s.l}</div>
              </div>))}
          </div>
          </>)}
        </main>
      )}

      {/* ══════ FULL PROFILE PAGE ══════ */}
      {page==="profile"&&viewingProfile&&(
        <main style={{padding:"20px 20px 90px",maxWidth:860,margin:"0 auto"}} className="fi">
          {(()=>{
            const p=getUserProfile(viewingProfile);
            const badge=calcBadge(viewingProfile,subs);
            const streak=calcStreak(viewingProfile,subs);
            const achievements=calcAchievements(viewingProfile,subs);
            const earned=achievements.filter(a=>a.earned);
            const locked=achievements.filter(a=>!a.earned);
            const drops=subs.filter(s=>s.name===viewingProfile&&!s.deleted).sort((a,b)=>b.timestamp-a.timestamp);
            const dropGenres=[...new Set(drops.map(s=>s.genre))];
            const favGenres=(typeof p?.favGenres==="string"?JSON.parse(p.favGenres):p?.favGenres)||[];
            const totalRx=drops.reduce((a,s)=>a+Object.values(s.reactions||{}).reduce((x,y)=>x+y,0),0);
            const topMood=(()=>{const c={};drops.forEach(s=>{c[s.mood]=(c[s.mood]||0)+1});return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—";})();
            return(<>
              {/* Back button */}
              <button className="ib" onClick={()=>{setPage("board");setViewingProfile(null);}} style={{marginBottom:16,fontSize:12}}>← {t("dropBoard")}</button>

              {/* Header */}
              <div style={{textAlign:"center",marginBottom:28}}>
                {p?.picture
                  ? <img src={p.picture} style={{width:88,height:88,borderRadius:"50%",objectFit:"cover",border:`3px solid ${T.cardBorder}`,margin:"0 auto 12px",display:"block"}} alt="" />
                  : <div style={{width:88,height:88,borderRadius:"50%",background:`hsl(${viewingProfile.charCodeAt(0)*37%360},45%,${theme==="vinyl"?"45%":"55%"})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,fontWeight:800,color:"#fff",margin:"0 auto 12px"}}>{viewingProfile[0]}</div>}
                <h2 style={{fontFamily:"'Instrument Serif',serif",fontSize:28,fontWeight:400,marginBottom:4}}>{viewingProfile}</h2>
                {p?.bio&&<p style={{color:T.textSub,fontSize:13,fontStyle:"italic",marginBottom:8}}>"{p.bio}"</p>}

                {/* Badge + streak */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                  <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",borderRadius:16,background:T.pillBg,fontSize:12}}>
                    <span>{badge.emoji}</span><span style={{fontWeight:700,color:T.text}}>{badge.title}</span>
                  </span>
                  {streak>=1&&<span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",borderRadius:16,background:T.pillBg,fontSize:12}}>
                    {"🔥".repeat(Math.min(streak,5))}<span style={{fontWeight:700,color:T.accent}}>{streak}w</span>
                  </span>}
                </div>

                {/* Stats */}
                <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:16}}>
                  {[{v:drops.length,l:t("totalDrops")},{v:dropGenres.length,l:t("genres")},{v:totalRx,l:lang==="es"?"Reacciones":"Reactions"},{v:topMood,l:lang==="es"?"Mood principal":"Top Mood"}].map((s,i)=>(
                    <div key={i} style={{padding:"10px 16px",borderRadius:12,background:T.card,border:`1px solid ${T.cardBorder}`,textAlign:"center",minWidth:65}}>
                      <div style={{fontSize:18,fontWeight:800}}>{s.v}</div>
                      <div style={{fontSize:9,color:T.textMuted}}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Fav genres */}
                {favGenres.length>0&&<div style={{marginBottom:12}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center"}}>
                    {favGenres.map(g=>(<span key={g} className="p" style={{background:T.tagGenre,color:T.tagGenreC}}>{g}</span>))}
                  </div>
                </div>}
              </div>

              {/* Achievements */}
              <div className="cd" style={{padding:18,marginBottom:20}}>
                <h3 style={{fontFamily:"'Instrument Serif',serif",fontSize:18,marginBottom:4}}>{lang==="es"?"Logros":"Achievements"}</h3>
                <p style={{fontSize:11,color:T.textMuted,marginBottom:14}}>{earned.length} / {achievements.length} {lang==="es"?"desbloqueados":"unlocked"}</p>

                {/* Earned */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))",gap:8,marginBottom:12}}>
                  {earned.map(a=>(
                    <div key={a.id} style={{padding:"10px 12px",borderRadius:10,background:T.pillBg,border:`1px solid ${T.cardBorder}`}}>
                      <div style={{fontSize:24,marginBottom:4}}>{a.emoji}</div>
                      <div style={{fontSize:12,fontWeight:700,color:T.text}}>{a.title}</div>
                      <div style={{fontSize:9,color:T.textMuted}}>{a.desc}</div>
                    </div>
                  ))}
                </div>

                {/* Locked */}
                {locked.length>0&&<>
                  <div style={{fontSize:10,color:T.textMuted,marginBottom:8}}>{lang==="es"?"Por desbloquear":"Locked"}</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))",gap:8}}>
                    {locked.map(a=>(
                      <div key={a.id} style={{padding:"10px 12px",borderRadius:10,border:`1px dashed ${T.cardBorder}`,opacity:0.4}}>
                        <div style={{fontSize:24,marginBottom:4,filter:"grayscale(1)"}}>🔒</div>
                        <div style={{fontSize:12,fontWeight:700,color:T.textMuted}}>{a.title}</div>
                        <div style={{fontSize:9,color:T.textMuted}}>{a.desc}</div>
                      </div>
                    ))}
                  </div>
                </>}
              </div>

              {/* Drop History */}
              <h3 style={{fontFamily:"'Instrument Serif',serif",fontSize:18,marginBottom:12}}>{lang==="es"?"Historial de Drops":"Drop History"} ({drops.length})</h3>
              <div style={{display:"grid",gap:10}}>
                {drops.map(sub=>{
                  const embed=getEmbed(sub.link);const obsK=OBSESSION.find(o=>o.v===sub.obsession)?.k||"";
                  const rx=Object.values(sub.reactions||{}).reduce((a,b)=>a+b,0);
                  return(
                    <div key={sub.id} className="cd" style={{padding:"12px 16px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                          {sub.tags?.map(tg=><span key={tg} className="p">{tg}</span>)}
                          <span className="p" style={{background:T.tagMood,color:T.tagMoodC}}>{sub.mood}</span>
                          <span className="p" style={{background:T.tagGenre,color:T.tagGenreC}}>{sub.genre}</span>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                          {rx>0&&<span style={{fontSize:11,color:T.accent,fontWeight:700}}>{rx} ❤</span>}
                          <span style={{fontSize:10,color:T.textMuted}}>{ago(sub.timestamp)}</span>
                        </div>
                      </div>
                      <p style={{fontSize:12,color:T.textSub,fontStyle:"italic",lineHeight:1.4}}>"{sub.note}"</p>
                      {embed&&<a href={sub.link} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:T.accent,textDecoration:"none",marginTop:4,display:"block"}}>{embed.type} ↗</a>}
                    </div>
                  );
                })}
              </div>
            </>);
          })()}
        </main>
      )}

      <button className="fab" onClick={()=>setShowSubmit(true)}>+</button>

      {/* ══════ SUBMIT ══════ */}
      {showSubmit&&(
        <div className="ov" onClick={e=>{if(e.target===e.currentTarget)setShowSubmit(false);}}>
          <div className="ml fi">
            {sok?(<div style={{textAlign:"center",padding:"36px 0"}}><div style={{fontSize:44,marginBottom:10}}>🎶</div><h3 style={{fontFamily:"'Instrument Serif',serif",fontSize:22}}>{t("dropped")}</h3><p style={{color:T.textMuted,fontSize:12,marginTop:4}}>{t("itsOnBoard")}</p></div>):(
              <><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                <h3 style={{fontFamily:"'Instrument Serif',serif",fontSize:22}}>{t("dropABeat")}</h3>
                <button onClick={()=>setShowSubmit(false)} style={{background:"none",border:"none",color:T.textMuted,fontSize:22,cursor:"pointer"}}>×</button></div>
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  <div><label className="lb">{t("musicLink")}</label><input className="in" placeholder={t("linkPlaceholder")} value={fl} onChange={e=>setFl(e.target.value)}/>
                    {fl&&getEmbed(fl)&&<div style={{marginTop:4,fontSize:10,color:T.accent}}>✓ {getEmbed(fl).type} {t("detected")}</div>}</div>
                  <div><label className="lb">{t("whyTrack")}</label><textarea className="in" placeholder={t("whatsStory")} value={fno} onChange={e=>setFno(e.target.value)}/></div>
                  <div><label className="lb">{t("tags")} ({t("pick13")})</label><div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {tags.map(tag=>(<span key={tag} className={`p ts ${ft.includes(tag)?"on":""}`} onClick={()=>setFt(p=>p.includes(tag)?p.filter(tg=>tg!==tag):p.length<3?[...p,tag]:p)}>{tag}</span>))}</div></div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div><label className="lb">{t("mood")}</label><select className="in" value={fm} onChange={e=>setFm(e.target.value)} style={{cursor:"pointer"}}><option value="" disabled>{t("select")}</option>{moods.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
                    <div><label className="lb">{t("genre")}</label><select className="in" value={fg} onChange={e=>setFg(e.target.value)} style={{cursor:"pointer"}}><option value="" disabled>{t("select")}</option>{genres.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
                  </div>
                  <div><label className="lb">{t("obsessionLevel")}</label>
                    <div style={{display:"flex",gap:6,justifyContent:"center"}}>
                      {OBSESSION.map(o=>(<div key={o.v} onClick={()=>setFo(o.v)} style={{display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer",padding:"6px 8px",borderRadius:8,border:`2px solid ${o.v===fo?T.accent:"transparent"}`,background:o.v<=fo?T.pillBg:"transparent",transition:"all 0.15s"}}>
                        <span style={{fontSize:13,fontWeight:700,color:o.v<=fo?T.text:T.textMuted}}>{o.v}</span>
                        <span style={{fontSize:8,color:o.v===fo?T.accent:T.textMuted,marginTop:2}}>{t(o.k)}</span>
                      </div>))}
                    </div></div>
                  <button className="pb" onClick={handleSubmit} disabled={!fl||!fno||!fm||!fg||ft.length===0}>{t("drop")}</button>
                </div></>)}
          </div>
        </div>
      )}

      {/* ══════ ADMIN LOGIN ══════ */}
      {showAdminLogin&&(<div className="ov" onClick={e=>{if(e.target===e.currentTarget)setShowAdminLogin(false);}}>
        <div className="ml fi" style={{maxWidth:340}}>
          <h3 style={{fontFamily:"'Instrument Serif',serif",fontSize:20,marginBottom:14}}>'{t("adminAccess")}</h3>
          <input className="in" type="password" placeholder={t("adminPasskey")} value={adminInput} onChange={e=>setAdminInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")tryAdminLogin();}}/>
          <div style={{display:"flex",gap:6,marginTop:10}}>
            <button style={{flex:1,padding:9,borderRadius:8,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:12}} onClick={()=>{setShowAdminLogin(false);setAdminInput("");}}>Cancel</button>
            <button className="pb" style={{flex:1}} onClick={tryAdminLogin}>Enter</button>
          </div></div></div>)}

      {/* ══════ PROFILE MODAL (own profile editing) ══════ */}
      {showProfile&&user&&(
        <div className="ov" onClick={e=>{if(e.target===e.currentTarget)setShowProfile(false);}}>
          <div className="ml fi" style={{maxWidth:400}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <h3 style={{fontFamily:"'Instrument Serif',serif",fontSize:20}}>{t("profile")}</h3>
              <button onClick={()=>setShowProfile(false)} style={{background:"none",border:"none",color:T.textMuted,fontSize:22,cursor:"pointer"}}>×</button>
            </div>

            {/* Avatar + badge */}
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,marginBottom:20}}>
              {getUserPic(user.name)
                ? <img src={getUserPic(user.name)} style={{width:72,height:72,borderRadius:"50%",objectFit:"cover",border:`3px solid ${T.cardBorder}`}} alt="" />
                : <div style={{width:72,height:72,borderRadius:"50%",background:`hsl(${user.name.charCodeAt(0)*37%360},45%,${theme==="vinyl"?"45%":"55%"})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:800,color:"#fff"}}>{user.name[0]}</div>}
              {(()=>{const b=calcBadge(user.name,subs);return(
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",borderRadius:16,background:T.pillBg}}>
                  <span style={{fontSize:16}}>{b.emoji}</span>
                  <span style={{fontSize:12,fontWeight:700,color:T.text}}>{b.title}</span>
                </div>
              );})()}
              <div style={{fontSize:11,color:T.textMuted}}>{user.role||"member"}</div>
            </div>

            {/* Photo upload */}
            <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:20}}>
              <label style={{padding:"6px 16px",borderRadius:8,background:T.gradient,color:"#fff",fontSize:11,fontWeight:700,cursor:pfpUploading?"wait":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:pfpUploading?0.5:1}}>
                {pfpUploading?t("uploading"):t("changePicture")}
                <input type="file" accept="image/*" style={{display:"none"}} disabled={pfpUploading} onChange={async e=>{
                  const file=e.target.files?.[0];if(!file)return;
                  if(file.size>500000){alert("Max 500KB");return;}
                  setPfpUploading(true);
                  try{
                    const url=await uploadProfilePic(file,user.name);
                    await updateUserProfile(user.name,{picture:url});
                    setUsers(prev=>prev.map(u=>u.name===user.name?{...u,picture:url}:u));
                    setUser(prev=>({...prev,picture:url}));
                    saveSession({...user,picture:url,theme,lang});
                  }catch(err){alert("Upload failed: "+err.message)}
                  finally{setPfpUploading(false);e.target.value="";}
                }} />
              </label>
              {getUserPic(user.name)&&<button className="ib" style={{color:"#cc4444"}} onClick={async()=>{
                await updateUserProfile(user.name,{picture:null});
                setUsers(prev=>prev.map(u=>u.name===user.name?{...u,picture:null}:u));
                setUser(prev=>({...prev,picture:null}));
                saveSession({...user,picture:null,theme,lang});
              }}>{t("removePicture")}</button>}
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:14,textAlign:"left"}}>
              {/* Display name */}
              <div>
                <label className="lb">{t("edit")} {t("yourName")}</label>
                <div style={{display:"flex",gap:6}}>
                  <input className="in" value={editDisplayName||user.name} onChange={e=>setEditDisplayName(e.target.value)} style={{flex:1}} />
                  {editDisplayName&&editDisplayName!==user.name&&<button className="pb" style={{width:"auto",padding:"8px 14px",fontSize:11}} onClick={async()=>{
                    const newName=editDisplayName.trim();if(!newName)return;
                    if(users.find(u=>u.name.toLowerCase()===newName.toLowerCase()&&u.name!==user.name)){alert(t("nameTaken"));return;}
                    await updateUserProfile(user.name,{name:newName});
                    setUsers(prev=>prev.map(u=>u.name===user.name?{...u,name:newName}:u));
                    setUser(prev=>({...prev,name:newName}));
                    saveSession({...user,name:newName,theme,lang});
                    setEditDisplayName("");flash("✓ Saved");
                  }}>{t("save")}</button>}
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="lb">Bio</label>
                <div style={{display:"flex",gap:6}}>
                  <input className="in" placeholder={lang==="es"?"ej. amante del jazz, coleccionista de vinilos":"e.g. jazz head, vinyl collector"} value={editBio||(getUserProfile(user.name)?.bio||"")} onChange={e=>setEditBio(e.target.value)} style={{flex:1}} />
                  <button className="pb" style={{width:"auto",padding:"8px 14px",fontSize:11}} onClick={async()=>{
                    await updateUserProfile(user.name,{bio:editBio.trim()});
                    setUsers(prev=>prev.map(u=>u.name===user.name?{...u,bio:editBio.trim()}:u));
                    setEditBio("");flash("✓ Saved");
                  }}>{t("save")}</button>
                </div>
              </div>

              {/* Favorite genres */}
              <div>
                <label className="lb">{lang==="es"?"Géneros favoritos":"Favorite genres"}</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {genres.map(g=>{
                    const favs=editFavGenres.length?editFavGenres:(getUserProfile(user.name)?.favGenres||[]);
                    const isOn=favs.includes(g);
                    return(<span key={g} className={`p ts ${isOn?"on":""}`} onClick={()=>{
                      const cur=editFavGenres.length?editFavGenres:(getUserProfile(user.name)?.favGenres||[]);
                      const next=isOn?cur.filter(x=>x!==g):cur.length<5?[...cur,g]:cur;
                      setEditFavGenres(next);
                    }}>{g}</span>);
                  })}
                </div>
                {editFavGenres.length>0&&<button className="pb" style={{width:"auto",padding:"6px 14px",fontSize:11,marginTop:8}} onClick={async()=>{
                  await updateUserProfile(user.name,{favGenres:JSON.stringify(editFavGenres)});
                  setUsers(prev=>prev.map(u=>u.name===user.name?{...u,favGenres:editFavGenres}:u));
                  setEditFavGenres([]);flash("✓ Saved");
                }}>{t("save")}</button>}
                <p style={{fontSize:9,color:T.textMuted,marginTop:4}}>{lang==="es"?"Máximo 5":"Max 5"}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MINI PROFILE CARD (viewing others) ══════ */}
      {viewingProfile&&(
        <div className="ov" onClick={e=>{if(e.target===e.currentTarget)setViewingProfile(null);}}>
          {(()=>{
            const p=getUserProfile(viewingProfile);
            const badge=calcBadge(viewingProfile,subs);
            const drops=subs.filter(s=>s.name===viewingProfile&&!s.deleted);
            const dropGenres=[...new Set(drops.map(s=>s.genre))];
            const favGenres=(typeof p?.favGenres==="string"?JSON.parse(p.favGenres):p?.favGenres)||[];
            const totalReactions=drops.reduce((a,s)=>a+Object.values(s.reactions||{}).reduce((x,y)=>x+y,0),0);
            return(
              <div className="ml fi" style={{maxWidth:360,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                <button onClick={()=>setViewingProfile(null)} style={{position:"absolute",top:16,right:16,background:"none",border:"none",color:T.textMuted,fontSize:20,cursor:"pointer"}}>×</button>

                {/* Avatar */}
                {p?.picture
                  ? <img src={p.picture} style={{width:64,height:64,borderRadius:"50%",objectFit:"cover",border:`3px solid ${T.cardBorder}`,margin:"0 auto 12px"}} alt="" />
                  : <div style={{width:64,height:64,borderRadius:"50%",background:`hsl(${viewingProfile.charCodeAt(0)*37%360},45%,${theme==="vinyl"?"45%":"55%"})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:800,color:"#fff",margin:"0 auto 12px"}}>{viewingProfile[0]}</div>}

                <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>{viewingProfile}</div>
                {p?.bio&&<div style={{fontSize:12,color:T.textSub,fontStyle:"italic",marginBottom:8}}>"{p.bio}"</div>}

                {/* Badge */}
                <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 14px",borderRadius:16,background:T.pillBg,marginBottom:16}}>
                  <span style={{fontSize:16}}>{badge.emoji}</span>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontSize:12,fontWeight:700,color:T.text}}>{badge.title}</div>
                    <div style={{fontSize:9,color:T.textMuted}}>{badge.desc}</div>
                  </div>
                </div>

                {/* Stats row */}
                <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:16}}>
                  {[{v:drops.length,l:t("totalDrops")},{v:dropGenres.length,l:t("genres")},{v:totalReactions,l:lang==="es"?"Reacciones":"Reactions"}].map((s,i)=>(
                    <div key={i} style={{padding:"8px 14px",borderRadius:10,background:T.card,border:`1px solid ${T.cardBorder}`,textAlign:"center",minWidth:60}}>
                      <div style={{fontSize:18,fontWeight:800}}>{s.v}</div>
                      <div style={{fontSize:9,color:T.textMuted}}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Fav genres */}
                {favGenres.length>0&&(
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{lang==="es"?"Géneros favoritos":"Favorite genres"}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center"}}>
                      {favGenres.map(g=>(<span key={g} className="p" style={{background:T.tagGenre,color:T.tagGenreC}}>{g}</span>))}
                    </div>
                  </div>
                )}

                {/* Recent genres from drops */}
                {dropGenres.length>0&&(
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{lang==="es"?"Géneros compartidos":"Genres dropped"}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center"}}>
                      {dropGenres.map(g=>(<span key={g} className="p">{g}</span>))}
                    </div>
                  </div>
                )}

                {/* Streak */}
                {(()=>{const sk=calcStreak(viewingProfile,subs);return sk>=1?(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,marginBottom:12}}>
                    <span>{"🔥".repeat(Math.min(sk,5))}</span>
                    <span style={{fontSize:12,fontWeight:800,color:T.accent}}>{sk} {lang==="es"?"semanas seguidas":"week streak"}</span>
                  </div>
                ):null;})()}

                {/* Collectible Badges */}
                {(()=>{const ach=calcAchievements(viewingProfile,subs).filter(a=>a.earned);return ach.length>0?(
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{lang==="es"?"Logros":"Achievements"} ({ach.length})</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center"}}>
                      {ach.map(a=>(<span key={a.id} title={`${a.title}: ${a.desc}`} style={{fontSize:18,cursor:"default",transition:"transform 0.15s"}} onMouseEnter={e=>e.target.style.transform="scale(1.3)"} onMouseLeave={e=>e.target.style.transform="scale(1)"}>{a.emoji}</span>))}
                    </div>
                  </div>
                ):null;})()}

                {/* View full profile */}
                <button className="pb" style={{width:"auto",padding:"8px 20px",fontSize:11,margin:"8px auto 0",display:"block"}} onClick={()=>{setPage("profile");setShowProfile(false);}}>
                  {lang==="es"?"Ver perfil completo":"View full profile"}
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* ══════ ADMIN PANEL ══════ */}
      {showAdmin&&adminUser&&(<div className="ov" onClick={e=>{if(e.target===e.currentTarget)setShowAdmin(false);}}>
        <div className="ml fi" style={{maxWidth:560}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div><h3 style={{fontFamily:"'Instrument Serif',serif",fontSize:20}}>{t("admin")}</h3><p style={{fontSize:10,color:T.textMuted}}>{adminUser.name}{adminUser.isMaster?` · ${t("master")}`:""}</p></div>
            <button onClick={()=>setShowAdmin(false)} style={{background:"none",border:"none",color:T.textMuted,fontSize:22,cursor:"pointer"}}>×</button></div>
          <div style={{display:"flex",gap:5,marginBottom:16,flexWrap:"wrap"}}>
            <button className={`at ${adminTab==="theme"?"on":""}`} onClick={()=>setAdminTab("theme")}>Theme</button>
            <button className={`at ${adminTab==="invites"?"on":""}`} onClick={()=>setAdminTab("invites")}>Invites</button>
            <button className={`at ${adminTab==="config"?"on":""}`} onClick={()=>setAdminTab("config")}>Config</button>
            {adminUser.isMaster&&<button className={`at ${adminTab==="admins"?"on":""}`} onClick={()=>setAdminTab("admins")}>Admins</button>}
            {adminUser.isMaster&&<button className={`at ${adminTab==="users"?"on":""}`} onClick={()=>setAdminTab("users")}>Users</button>}
            {adminUser.isMaster&&<button className={`at ${adminTab==="log"?"on":""}`} onClick={()=>setAdminTab("log")}>Log</button>}
          </div>

          {/* Theme tab */}
          {adminTab==="theme"&&<div>
            <label className="lb">{t("thisWeeksTheme")}</label>
            <p style={{fontSize:11,color:T.textMuted,marginBottom:10}}>{t("themeDesc")}</p>
            <div style={{display:"flex",gap:6}}>
              <input className="in" placeholder="e.g. Song you always return to" value={weeklyTheme} onChange={e=>setWeeklyTheme(e.target.value)} style={{flex:1}} />
              <button className="pb" style={{width:"auto",padding:"8px 20px",fontSize:12}} onClick={()=>{saveCfg("weeklyTheme",weeklyTheme,"Set theme: "+weeklyTheme);flash("✓ Theme saved")}}>{t("save")}</button>
            </div>
            {weeklyTheme&&<button className="ib" style={{marginTop:8,color:"#cc4444"}} onClick={()=>{setWeeklyTheme("");saveCfg("weeklyTheme","","Cleared weekly theme")}}>'{t("clearTheme")}</button>}

            <div style={{marginTop:24}}>
              <label className="lb">Discovery visualization override</label>
              <p style={{fontSize:11,color:T.textMuted,marginBottom:10}}>Auto-rotates each Friday by default. Override to pin a specific visualization this week.</p>
              <select className="in" value={vizOverride} onChange={e=>{const v=e.target.value;setVizOverride(v);saveCfg("vizOverride",v,v?`Pinned viz: ${v}`:"Reset viz to auto-rotate")}} style={{cursor:"pointer"}}>
                <option value="">Auto-rotate (week {weekNum()%VIZ_TYPES.length+1} of {VIZ_TYPES.length})</option>
                {VIZ_TYPES.map(v=>(<option key={v.id} value={v.id}>{t(v.name)}</option>))}
              </select>
            </div>
          </div>}

          {/* Invites tab */}
          {adminTab==="invites"&&<div>
            <p style={{fontSize:11,color:T.textMuted,marginBottom:12}}>Generate invite codes to share with your team. Each code can only be used once.</p>
            <div style={{display:"flex",gap:6,marginBottom:16}}>
              <button className="pb" style={{width:"auto",padding:"8px 20px",fontSize:12}} onClick={()=>{
                const codes=[];for(let i=0;i<5;i++)codes.push({code:genInviteCode(),used:false,usedBy:null});
                const next=[...inviteCodes,...codes];
                saveCfg("inviteCodes",next,`Generated ${codes.length} invite codes`);
              }}>Generate 5 codes</button>
              <button className="pb" style={{width:"auto",padding:"8px 20px",fontSize:12,background:T.pillBg,color:T.text}} onClick={()=>{
                const code={code:genInviteCode(),used:false,usedBy:null};
                saveCfg("inviteCodes",[...inviteCodes,code],`Generated invite ${code.code}`);
              }}>+1 code</button>
            </div>
            {inviteCodes.length===0?<p style={{color:T.textMuted,fontSize:12,fontStyle:"italic"}}>No invite codes yet. Generate some above.</p>:(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontSize:11,color:T.textMuted}}>{inviteCodes.filter(c=>!c.used).length} available · {inviteCodes.filter(c=>c.used).length} used</span>
                  <button className="ib" onClick={()=>{const unused=inviteCodes.filter(c=>!c.used).map(c=>c.code).join("\n");navigator.clipboard?.writeText(unused);}} style={{color:T.accent}}>Copy unused</button>
                </div>
                <div style={{maxHeight:300,overflowY:"auto"}}>
                  {inviteCodes.map((c,i)=>(
                    <div key={c.code} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",background:T.card,borderRadius:8,marginBottom:4,opacity:c.used?0.5:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:c.used?T.textMuted:T.accent,letterSpacing:1}}>{c.code}</span>
                        {c.used&&<span style={{fontSize:10,color:T.textMuted}}>used by {c.usedBy}</span>}
                      </div>
                      {!c.used&&<div style={{display:"flex",gap:4}}>
                        <button className="ib" onClick={()=>navigator.clipboard?.writeText(c.code)} style={{color:T.accent}}>copy</button>
                        <button className="ib" onClick={()=>saveCfg("inviteCodes",inviteCodes.filter((_,j)=>j!==i),`Removed invite ${c.code}`)} style={{color:"#cc4444"}}>×</button>
                      </div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>}

          {adminTab==="config"&&<>{[
            {l:"Genres",f:"genres",items:genres},{l:"Tags",f:"tags",items:tags},{l:"Moods",f:"moods",items:moods},
          ].map(({l,f,items})=>(<div key={f} style={{marginBottom:18}}>
            <label className="lb">{l} ({items.length})</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6}}>
              {items.map((item,i)=>(<span key={item+i} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 8px 4px 10px",borderRadius:14,fontSize:11,fontWeight:600,background:T.pillBg,color:T.textSub}}>
                {item}<button onClick={()=>saveCfg(f,items.filter((_,j)=>j!==i),`Removed "${item}" from ${l}`)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:12,padding:0}}>×</button></span>))}
            </div>
            <input className="in" placeholder={`Add ${l.toLowerCase().replace(/s$/,"")}`} onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){const v=e.target.value.trim();if(!items.includes(v))saveCfg(f,[...items,v],`Added "${v}" to ${l}`);e.target.value="";}}} />
          </div>))}

          {/* Reactions — special section with image upload */}
          <div style={{marginBottom:18}}>
            <label className="lb">Reactions ({reactions.length})</label>
            <p style={{fontSize:10,color:T.textMuted,marginBottom:8}}>Emoji or custom images. Like Slack — upload any image as a reaction.</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
              {reactions.map((r,i)=>(<span key={r+i} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 8px 4px 10px",borderRadius:14,background:T.pillBg}}>
                {isReactionImage(r)
                  ? <img src={r} alt="reaction" style={{width:22,height:22,objectFit:"contain",borderRadius:4}} />
                  : <span style={{fontSize:16}}>{r}</span>}
                <button onClick={async()=>{
                  if(isReactionImage(r))try{await deleteReactionImage(r)}catch{}
                  saveCfg("reactions",reactions.filter((_,j)=>j!==i),`Removed reaction`)
                }} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:12,padding:0}}>×</button>
              </span>))}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input className="in" placeholder="Type emoji (e.g. 🫠 🎸)" style={{flex:1}} onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){const v=e.target.value.trim();if(!reactions.includes(v))saveCfg("reactions",[...reactions,v],`Added emoji reaction "${v}"`);e.target.value="";}}} />
              <label style={{padding:"8px 16px",borderRadius:8,background:T.gradient,color:"#fff",fontSize:12,fontWeight:700,cursor:uploading?"wait":"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap",opacity:uploading?0.5:1}}>
                {uploading?"Uploading...":"Upload image"}
                <input type="file" accept="image/*" style={{display:"none"}} disabled={uploading} onChange={async e=>{
                  const file=e.target.files?.[0];if(!file)return;
                  if(file.size>500000){alert("Image must be under 500KB");return;}
                  setUploading(true);
                  try{
                    const url=await uploadReactionImage(file);
                    if(url&&!reactions.includes(url))saveCfg("reactions",[...reactions,url],`Added custom image reaction`);
                  }catch(err){alert("Upload failed: "+err.message)}
                  finally{setUploading(false);e.target.value="";}
                }} />
              </label>
            </div>
            <p style={{fontSize:9,color:T.textMuted,marginTop:4}}>Images: PNG, JPG, GIF, SVG. Max 500KB. Square images work best.</p>
          </div>
          </>}
          {adminTab==="admins"&&adminUser.isMaster&&<div>
            <p style={{fontSize:11,color:T.textMuted,marginBottom:12}}>Each admin has a unique passkey. Their actions show in the log.</p>
            {admins.map((a,i)=>(<div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:T.card,borderRadius:8,marginBottom:6}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontWeight:700,fontSize:13}}>{a.name}</span>
                <span className="ib" onClick={e=>{const el=e.currentTarget;el.textContent=el.textContent.includes("•")? `key: ${a.passkey}`:"•••••"}} style={{fontSize:10,color:T.textMuted,cursor:"pointer"}}>•••••</span>
                {a.name===MASTER.name&&<span style={{fontSize:9,color:T.accent}}>master</span>}
              </div>
              {a.name!==MASTER.name&&<button className="ib" style={{color:"#cc4444"}} onClick={()=>saveCfg("admins",admins.filter((_,j)=>j!==i),`Removed admin ${a.name}`)}>Remove</button>}
            </div>))}
            <div style={{marginTop:12}}><label className="lb">Add Admin</label><div style={{display:"flex",gap:6}}>
              <input className="in" placeholder="Name" id="aan" style={{flex:1}}/><input className="in" placeholder="Passkey" id="aak" style={{flex:1}}/>
              <button className="pb" style={{width:"auto",padding:"8px 16px",fontSize:12}} onClick={()=>{const n=document.getElementById("aan"),k=document.getElementById("aak");const nm=n.value.trim(),ky=k.value.trim();if(nm&&ky&&!admins.find(a=>a.name===nm)){saveCfg("admins",[...admins,{name:nm,passkey:ky}],`Added admin ${nm}`);n.value="";k.value="";}}} >Add</button>
            </div></div>
          </div>}
          {adminTab==="users"&&adminUser.isMaster&&<div>
            <p style={{fontSize:11,color:T.textMuted,marginBottom:12}}>All registered users. Tap ••••• to reveal passkey.</p>
            {users.map((u,i)=>(<div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:T.card,borderRadius:8,marginBottom:6}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontWeight:700,fontSize:13}}>{u.name}</span>
                <span className="ib" onClick={e=>{const el=e.currentTarget;el.textContent=el.textContent.includes("•")?`key: ${u.passkey}`:"•••••"}} style={{fontSize:10,color:T.textMuted,cursor:"pointer"}}>•••••</span>
                <span style={{fontSize:9,color:T.textMuted}}>{u.role}</span>
              </div>
            </div>))}
          </div>}
          {adminTab==="log"&&adminUser.isMaster&&<div>{changelog.length===0?<p style={{color:T.textMuted,fontSize:12,fontStyle:"italic"}}>No changes recorded</p>:(
            <div style={{maxHeight:360,overflowY:"auto"}}>{changelog.map(e=>(<div key={e.id} style={{padding:"8px 0",borderBottom:`1px solid ${T.cardBorder}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontWeight:700,fontSize:12}}>{e.who}</span><span style={{fontSize:10,color:T.textMuted}}>{fmtD(e.timestamp)}</span></div>
              <div style={{fontSize:11,color:T.textSub}}><span style={{color:e.action==="delete"?"#cc4444":e.action==="login"?T.accent:T.tagGenreC,marginRight:4,fontWeight:600}}>{e.action}</span>{e.details}</div>
            </div>))}</div>)}</div>}
          <div style={{marginTop:16,paddingTop:12,borderTop:`1px solid ${T.cardBorder}`}}>
            <button onClick={()=>{doAddLog(adminUser.name,"logout","Logged out");setAdminUser(null);setShowAdmin(false);}} style={{padding:"6px 14px",borderRadius:6,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textMuted,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:11}}>'{t("logoutAdmin")}</button>
          </div>
        </div></div>)}
    </div>
  );
}
