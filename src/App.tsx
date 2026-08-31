import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css"; // 👈 เพิ่มบรรทัดนี้ลงไป

// ============================================================
// MARKDOWN RENDERER — ไม่ต้องติดตั้ง library เพิ่ม
// รองรับ: **bold**, *italic*, `code`, ~~strikethrough~~, \n
// ============================================================
// ✅ เปลี่ยนเป็นอันนี้ (แสดงสมการและ Markdown ได้สมบูรณ์)
const MdText = React.memo(function MdText({
  children,
  style = {},
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  if (!children) return null;
  return (
    <span style={{ display: "inline-block", ...style }}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ node, ...props }) => <span {...props} />,
        }}
      >
        {String(children)}
      </ReactMarkdown>
    </span>
  );
});

// โจทย์ข้อความ (ใช้ MdText)
function QuestionText({ text }) {
  if (!text) return null;
  return (
    <p style={{color:"#f5e6c8",fontFamily:"'Sarabun',sans-serif",fontSize:"18px",
      textAlign:"center",margin:0,lineHeight:1.8}}>
      <MdText>{text}</MdText>
    </p>
  );
}

// ============================================================

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzTTMBPvbsZckZgmQz274CBFDD1DYisym4T1Eh_CbvkzV-iDdfvXZzwrT2OSRQo4NPvhw/exec";

const LOOKER_STUDIO_URL =
  "https://datastudio.google.com/reporting/658dffb1-a471-427e-8b1a-4f97ffc9a509";

const QUIZ_SETS = [
  { id:"BO-BASIC1", name:"ระบบนิเวศ", total:10, passingScore:8, timeLimit:10*60 },
  { id:"GK-BASIC1", name:"วัฐจักรหิน", total:10, passingScore:8, timeLimit:10*60 },
  { id:"WA-BASIC1", name:"ลม และสภาพอากาศ", total:10, passingScore:8, timeLimit:10*60 },
];

const DEFAULT_THEME = {
  logoEmoji:"⚔", themeColor:"#d4af37", fontSize:"22px",
  bgColor:"#0d0803", bgImageUrl:"",
};

function getSetFromUrl() {
  try { return new URLSearchParams(window.location.search).get("set") || null; }
  catch { return null; }
}
function getModeFromUrl() {
  try { return new URLSearchParams(window.location.search).get("mode") || "normal"; }
  catch { return "normal"; }
}

async function apiGet(params) {
  const query = new URLSearchParams(
    Object.entries(params).reduce((acc,[k,v])=>{ acc[k]=String(v); return acc; },{})
  );
  const res = await fetch(`${APPS_SCRIPT_URL}?${query}`);
  return res.json();
}
async function apiPost(body) {
  const res = await fetch(APPS_SCRIPT_URL, { method:"POST", body:JSON.stringify(body) });
  return res.json();
}

function shuffle(arr) {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function selectQuestions(questions, count) {
  const groups: Record<string, any[]> = {};
  questions.forEach(q=>{ if(!groups[q.groupId]) groups[q.groupId]=[]; groups[q.groupId].push(q); });
  return shuffle(Object.values(groups).map((g: any) => g[Math.floor(Math.random()*g.length)])).slice(0,count);
}
function orderQuestions(questions, count) {
  const groups={}, order=[];
  questions.forEach(q=>{ if(!groups[q.groupId]){groups[q.groupId]=[];order.push(q.groupId);} groups[q.groupId].push(q); });
  return order.map(gid=>{ const g=groups[gid]; return g[Math.floor(Math.random()*g.length)]; }).slice(0,count);
}
function formatTime(s) {
  return `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;
}
function buildTheme(cfg) {
  if(!cfg) return DEFAULT_THEME;
  return {...DEFAULT_THEME,...cfg};
}
function calcTotalScore(results) {
  return results.reduce((sum,r)=>sum+(r.isCorrect?(r.question.points??1):0),0);
}
function calcMaxScore(questions) {
  return questions.reduce((sum,q)=>sum+(q.points??1),0);
}
function normalizeNumber(str) {
  if(!str && str!==0) return null;
  const s=String(str).trim().replace(/,/g,".");
  const n=parseFloat(s);
  return isNaN(n)?null:n;
}
function checkTextAnswer(userInput, correctAnswer) {
  const u=normalizeNumber(userInput), c=normalizeNumber(correctAnswer);
  if(u!==null&&c!==null) return u===c;
  return String(userInput).trim().toLowerCase()===String(correctAnswer).trim().toLowerCase();
}
function getFastImageUrl(fileId) {
  if(!fileId) return "";
  let id=String(fileId).trim();
  if(id.includes("/d/")) id=id.split("/d/")[1].split("/")[0];
  else if(id.includes("id=")) id=id.split("id=")[1].split("&")[0];
  return `https://lh3.googleusercontent.com/d/${id}`;
}
function pickChallengeQuestion(pool, usedIds) {
  const available=pool.filter(q=>!usedIds.has(q.id));
  if(!available.length) return null;
  return available[Math.floor(Math.random()*available.length)];
}

function Particles({ color }) {
  const pts=useRef([...Array(18)].map(()=>({
    w:Math.random()*2.5+0.5,l:Math.random()*100,t:Math.random()*100,
    d:Math.random()*8+6,delay:Math.random()*6,
  }))).current;
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
      {pts.map((p,i)=>(
        <div key={i} style={{position:"absolute",width:p.w+"px",height:p.w+"px",borderRadius:"50%",
          background:color+"55",left:p.l+"%",top:p.t+"%",
          animation:`pfloat ${p.d}s ease-in-out ${p.delay}s infinite`}}/>
      ))}
    </div>
  );
}

function TimerBar({ timeLeft, totalTime, color }) {
  const pct=(timeLeft/totalTime)*100;
  const c=pct>50?color:pct>20?"#e67e22":"#e74c3c";
  return (
    <div style={{width:"100%",height:"5px",background:"rgba(255,255,255,0.08)",borderRadius:"3px",overflow:"hidden"}}>
      <div style={{height:"100%",width:pct+"%",background:c,borderRadius:"3px",
        transition:"width 1s linear,background .5s",boxShadow:`0 0 6px ${c}`}}/>
    </div>
  );
}

function Spinner({ color }) {
  return (
    <div style={{textAlign:"center",padding:"40px 0"}}>
      <div style={{width:"36px",height:"36px",borderRadius:"50%",margin:"0 auto 14px",
        border:`3px solid ${color}33`,borderTopColor:color,animation:"pspin .8s linear infinite"}}/>
      <p style={{color:"#8b7355",fontFamily:"'Cinzel',serif",fontSize:"12px"}}>กำลังโหลด...</p>
    </div>
  );
}

function PointsBadge({ points, tc }) {
  if(!points||points===1) return null;
  return (
    <span style={{background:`linear-gradient(135deg,${tc}33,${tc}11)`,border:`1px solid ${tc}66`,
      borderRadius:"20px",padding:"3px 12px",fontSize:"12px",color:tc,
      fontFamily:"'Cinzel',serif",fontWeight:700,boxShadow:`0 0 8px ${tc}33`}}>
      ★ {points} คะแนน
    </span>
  );
}

function CharacterPopup({ charData, status, onClose, tc }) {
  const [visible,setVisible]=useState(false);
  const [closing,setClosing]=useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setVisible(true),300); return()=>clearTimeout(t); },[]);
  const handleClose=()=>{ setClosing(true); setTimeout(()=>onClose(),400); };
  if(!charData) return null;
  let imageId="", message="";
  if(status==="perfect"){ imageId=charData.perfectImageId||charData.passImageId||""; message=charData.perfectMsg||"เยี่ยมมาก! ได้เต็มทุกข้อ! 🌟"; }
  else if(status==="pass"){ imageId=charData.passImageId||""; message=charData.passMsg||"ผ่านแล้ว! ยอดเยี่ยม! 🎉"; }
  else { imageId=charData.failImageId||""; message=charData.failMsg||"ยังไม่ผ่าน สู้ต่อไปนะ! 💪"; }
  const imageUrl=getFas
