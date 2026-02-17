import { useState, useEffect, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
  AreaChart, Area
} from "recharts";
import MapView from "./MapView.jsx";

// ─── DATA CONFIG ─────────────────────────────────────────────
const CSV_PATH = import.meta.env.BASE_URL + "data/boston_311_requests.csv";
const API_BASE = "https://data.boston.gov/api/3/action/datastore_search";
const RESOURCE_ID = "254adca6-64ab-4c5c-9fc0-a6da622be185";
const METADATA_PATH = import.meta.env.BASE_URL + "data/metadata.json";
const API_PAGE_SIZE = 500;
const API_MAX_RECORDS = 5000;

const P = {
  bg: "#06090f", surface: "#0d1520", surfaceAlt: "#131d2e",
  border: "#1a2d47", accent: "#38bdf8", warm: "#f59e0b",
  red: "#ef4444", green: "#22c55e", purple: "#a78bfa",
  pink: "#ec4899", text: "#e2e8f0", muted: "#94a3b8", dim: "#475569",
};
const PIE_COLORS = ["#38bdf8","#f59e0b","#22c55e","#ef4444","#a78bfa","#ec4899","#06b6d4","#84cc16","#f97316","#6366f1","#14b8a6","#e879f9","#fbbf24","#2dd4bf","#fb923c"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function parseCSVLine(line) {
  const result = []; let current = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) { if (ch === '"') { if (i+1<line.length && line[i+1]==='"') { current+='"'; i++; } else inQ=false; } else current+=ch; }
    else { if (ch==='"') inQ=true; else if (ch===',') { result.push(current.trim()); current=""; } else current+=ch; }
  }
  result.push(current.trim()); return result;
}
function parseCSV(text) {
  const lines = text.trim().replace(/\r/g, "").split("\n"); if (lines.length<2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(l => { const v=parseCSVLine(l); const o={}; headers.forEach((h,i)=>{o[h.trim()]=v[i]||""}); return o; });
}
async function fetchFromAPI(onProgress) {
  let all=[], offset=0, total=Infinity;
  while (offset<total && offset<API_MAX_RECORDS) {
    const res = await fetch(`${API_BASE}?resource_id=${RESOURCE_ID}&limit=${API_PAGE_SIZE}&offset=${offset}`);
    const json = await res.json(); if (!json.success) throw new Error("API failed");
    total=json.result.total; all=all.concat(json.result.records); offset+=API_PAGE_SIZE;
    onProgress?.(Math.min(all.length,total),total);
  }
  return all;
}
function parseRecord(r) {
  const od = r.open_date ? new Date(r.open_date) : null;
  const cd = r.close_date ? new Date(r.close_date) : null;
  let dtc = null; if (od&&cd) dtc = Math.max(0,(cd-od)/(864e5));
  return {
    id:r.case_id, topic:r.case_topic||"Unknown", service:r.service_name||"Unknown",
    department:r.assigned_department||"Unknown", team:r.assigned_team||"Unknown",
    status:r.case_status||"Unknown", closureReason:r.closure_reason, onTime:r.on_time,
    source:r.report_source||"Unknown", neighborhood:r.neighborhood||"Unknown",
    zipCode:r.zip_code||"", address:r.full_address||"",
    month:od?od.getMonth():null, monthName:od?MONTHS[od.getMonth()]:"?",
    year:od?od.getFullYear():null, day:od?od.getDate():null,
    weekday:od?od.getDay():null, hour:od?od.getHours():null, daysToClose:dtc,
    lat: parseFloat(r.latitude) || null,
    lng: parseFloat(r.longitude) || null,
  };
}

function LoadingScreen({loaded,total,source}) {
  const pct = total>0?Math.round((loaded/total)*100):0;
  return (<div style={{background:P.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Geist Mono',monospace",color:P.text}}>
    <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;600&family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet"/>
    <div style={{fontSize:48,marginBottom:24}}>📊</div>
    <div style={{fontSize:14,color:P.muted,marginBottom:20,letterSpacing:"0.12em",textTransform:"uppercase"}}>Loading Boston 311 Data</div>
    <div style={{width:320,height:6,background:P.surfaceAlt,borderRadius:3,overflow:"hidden",marginBottom:12}}>
      <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${P.accent},${P.purple})`,borderRadius:3,transition:"width 0.3s ease"}}/>
    </div>
    <div style={{fontSize:12,color:P.dim}}>{source==="csv"?"Reading CSV…":`${loaded.toLocaleString()} / ${total>0?total.toLocaleString():"…"} records`}</div>
  </div>);
}
function ErrorScreen({error,onRetry}) {
  return (<div style={{background:P.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Geist Mono',monospace",color:P.text}}>
    <div style={{fontSize:48,marginBottom:16}}>⚠️</div>
    <div style={{fontSize:16,marginBottom:8}}>Failed to load data</div>
    <div style={{fontSize:13,color:P.dim,marginBottom:24,maxWidth:400,textAlign:"center"}}>{error}</div>
    <button onClick={onRetry} style={{background:P.accent,color:"#000",border:"none",borderRadius:8,padding:"10px 28px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Retry</button>
  </div>);
}
const StatCard=({label,value,sub,color=P.accent})=>(<div style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:14,padding:"20px 24px",flex:1,minWidth:170,position:"relative",overflow:"hidden"}}>
  <div style={{position:"absolute",top:-30,right:-30,width:100,height:100,borderRadius:"50%",background:color,opacity:0.05}}/>
  <div style={{fontSize:11,color:P.dim,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8,fontFamily:"'Geist Mono',monospace"}}>{label}</div>
  <div style={{fontSize:34,fontWeight:800,color,lineHeight:1,fontFamily:"'Outfit',sans-serif"}}>{value}</div>
  {sub&&<div style={{fontSize:12,color:P.dim,marginTop:6}}>{sub}</div>}
</div>);
const Card=({title,children,span=1})=>(<div style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:14,padding:24,gridColumn:`span ${span}`}}>
  <h3 style={{fontSize:12,fontWeight:600,color:P.dim,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:20,paddingBottom:12,borderBottom:`1px solid ${P.border}`,fontFamily:"'Geist Mono',monospace",margin:"0 0 20px 0"}}>{title}</h3>
  {children}
</div>);
const Tip=({active,payload,label})=>{
  if(!active||!payload?.length)return null;
  return(<div style={{background:P.surfaceAlt,border:`1px solid ${P.border}`,borderRadius:8,padding:"10px 14px",boxShadow:"0 12px 40px rgba(0,0,0,0.5)"}}>
    <div style={{fontSize:12,color:P.text,fontWeight:600,marginBottom:4}}>{label}</div>
    {payload.map((p,i)=>(<div key={i} style={{fontSize:12,color:p.color||P.accent}}>{p.name}: {typeof p.value==="number"?p.value.toLocaleString():p.value}</div>))}
  </div>);
};

export default function App() {
  const [rawData,setRawData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [progress,setProgress]=useState({loaded:0,total:0});
  const [dataSource,setDataSource]=useState("csv");
  const [lastUpdated,setLastUpdated]=useState(null);
  const [tab,setTab]=useState("overview");
  const [filterNeighborhood,setFilterNeighborhood]=useState("All");
  const [filterDept,setFilterDept]=useState("All");

  const loadData=useCallback(async()=>{
    setLoading(true); setError(null);
    try {
      setDataSource("csv"); setProgress({loaded:50,total:100});
      const csvRes=await fetch(CSV_PATH);
      if(csvRes.ok){const text=await csvRes.text();const records=parseCSV(text);
        if(records.length>0){setRawData(records.map(parseRecord));setProgress({loaded:100,total:100});
          try{const m=await fetch(METADATA_PATH);if(m.ok){const meta=await m.json();setLastUpdated(meta.last_updated);}}catch{}
          setLoading(false);return;}}
    }catch{}
    try{setDataSource("api");const records=await fetchFromAPI((l,t)=>{setProgress({loaded:l,total:t});});setRawData(records.map(parseRecord));}
    catch(e){setError(e.message);}finally{setLoading(false);}
  },[]);
  useEffect(()=>{loadData();},[loadData]);

  const neighborhoods=useMemo(()=>rawData?[...new Set(rawData.map(d=>d.neighborhood))].filter(n=>n!=="Unknown").sort():[],[rawData]);
  const departments=useMemo(()=>rawData?[...new Set(rawData.map(d=>d.department))].filter(d=>d!=="Unknown").sort():[],[rawData]);
  const data=useMemo(()=>rawData?rawData.filter(d=>(filterNeighborhood==="All"||d.neighborhood===filterNeighborhood)&&(filterDept==="All"||d.department===filterDept)):[],[rawData,filterNeighborhood,filterDept]);

  const monthlyVolume=useMemo(()=>{const m={};MONTHS.forEach((_,i)=>{m[i]={month:MONTHS[i],requests:0,closed:0,overdue:0};});data.forEach(d=>{if(d.month==null)return;m[d.month].requests++;if(d.status==="Closed")m[d.month].closed++;if(d.onTime==="OVERDUE")m[d.month].overdue++;});return Object.values(m).filter(v=>v.requests>0);},[data]);
  const byNeighborhood=useMemo(()=>{const c={};data.forEach(d=>{c[d.neighborhood]=(c[d.neighborhood]||0)+1;});return Object.entries(c).map(([n,v])=>({name:n,value:v})).sort((a,b)=>b.value-a.value).slice(0,15);},[data]);
  const byTopic=useMemo(()=>{const c={};data.forEach(d=>{c[d.topic]=(c[d.topic]||0)+1;});return Object.entries(c).map(([n,v])=>({name:n.length>28?n.slice(0,25)+"…":n,fullName:n,value:v})).sort((a,b)=>b.value-a.value).slice(0,12);},[data]);
  const bySource=useMemo(()=>{const c={};data.forEach(d=>{c[d.source]=(c[d.source]||0)+1;});return Object.entries(c).map(([n,v])=>({name:n,value:v})).sort((a,b)=>b.value-a.value);},[data]);
  const byDepartment=useMemo(()=>{const c={};data.forEach(d=>{const s=d.department.replace(" Department","").replace(" (PWD)","");c[s]=(c[s]||0)+1;});return Object.entries(c).map(([n,v])=>({name:n.length>25?n.slice(0,22)+"…":n,value:v})).sort((a,b)=>b.value-a.value).slice(0,10);},[data]);
  const statusCounts=useMemo(()=>{const c={};data.forEach(d=>{c[d.status]=(c[d.status]||0)+1;});return Object.entries(c).map(([n,v])=>({name:n,value:v}));},[data]);
  const onTimeCounts=useMemo(()=>[{name:"On Time",value:data.filter(d=>d.onTime==="ONTIME").length},{name:"Overdue",value:data.filter(d=>d.onTime==="OVERDUE").length}],[data]);
  const avgResolution=useMemo(()=>{const cl=data.filter(d=>d.daysToClose!=null);return cl.length?(cl.reduce((s,d)=>s+d.daysToClose,0)/cl.length).toFixed(1):"N/A";},[data]);
  const onTimeRate=useMemo(()=>{const r=data.filter(d=>d.onTime);return r.length?((r.filter(d=>d.onTime==="ONTIME").length/r.length)*100).toFixed(1):"N/A";},[data]);
  const resolutionByTopic=useMemo(()=>{const g={};data.filter(d=>d.daysToClose!=null).forEach(d=>{if(!g[d.topic])g[d.topic]=[];g[d.topic].push(d.daysToClose);});return Object.entries(g).map(([t,days])=>({name:t.length>22?t.slice(0,19)+"…":t,avg:+(days.reduce((a,b)=>a+b,0)/days.length).toFixed(1),count:days.length})).filter(d=>d.count>=3).sort((a,b)=>b.avg-a.avg).slice(0,12);},[data]);
  const hourlyDist=useMemo(()=>{const h=Array.from({length:24},(_,i)=>({hour:`${i.toString().padStart(2,"0")}:00`,count:0}));data.forEach(d=>{if(d.hour!=null)h[d.hour].count++;});return h;},[data]);
  const weekdayDist=useMemo(()=>{const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];const c=days.map(d=>({day:d,count:0}));data.forEach(d=>{if(d.weekday!=null)c[d.weekday].count++;});return c;},[data]);

  if(loading) return <LoadingScreen loaded={progress.loaded} total={progress.total} source={dataSource}/>;
  if(error) return <ErrorScreen error={error} onRetry={loadData}/>;

  const sel={background:P.surfaceAlt,color:P.text,border:`1px solid ${P.border}`,borderRadius:8,padding:"8px 14px",fontSize:13,outline:"none",cursor:"pointer",fontFamily:"'Geist Mono',monospace",maxWidth:240};
  const tbtn=(id,label)=>(<button key={id} onClick={()=>setTab(id)} style={{padding:"8px 20px",fontSize:13,fontWeight:tab===id?600:400,color:tab===id?P.accent:P.muted,background:tab===id?`${P.accent}12`:"transparent",border:`1px solid ${tab===id?P.accent+"30":"transparent"}`,borderRadius:8,cursor:"pointer",transition:"all 0.2s",fontFamily:"'Geist Mono',monospace"}}>{label}</button>);
  const updStr=lastUpdated?new Date(lastUpdated).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"}):null;

  return (
    <div style={{background:P.bg,minHeight:"100vh",color:P.text,fontFamily:"'Outfit',-apple-system,sans-serif",padding:"32px clamp(16px,4vw,48px)"}}>
      <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;600&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>

      <header style={{marginBottom:32}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:P.green,boxShadow:`0 0 10px ${P.green}80`}}/>
          <span style={{fontSize:11,color:P.dim,fontFamily:"'Geist Mono',monospace",letterSpacing:"0.12em",textTransform:"uppercase"}}>
            {dataSource==="csv"?"Daily Pipeline":"Live API"} · {data.length.toLocaleString()} records{updStr&&` · Updated ${updStr}`}
          </span>
        </div>
        <h1 style={{fontSize:"clamp(28px,5vw,48px)",fontWeight:800,margin:0,lineHeight:1.05,fontFamily:"'Outfit',sans-serif",background:`linear-gradient(135deg,${P.accent},${P.purple})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Boston 311 Analytics</h1>
        <p style={{color:P.dim,fontSize:15,margin:"8px 0 0 0"}}>Service request insights · data.boston.gov</p>
      </header>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:24}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{tbtn("overview","Overview")}{tbtn("topics","Topics")}{tbtn("performance","Performance")}{tbtn("patterns","Patterns")}{tbtn("map","Map")}</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <select value={filterNeighborhood} onChange={e=>setFilterNeighborhood(e.target.value)} style={sel}><option value="All">All Neighborhoods</option>{neighborhoods.map(n=><option key={n} value={n}>{n}</option>)}</select>
          <select value={filterDept} onChange={e=>setFilterDept(e.target.value)} style={sel}><option value="All">All Departments</option>{departments.map(d=><option key={d} value={d}>{d}</option>)}</select>
        </div>
      </div>

      <div style={{display:"flex",gap:14,marginBottom:24,flexWrap:"wrap"}}>
        <StatCard label="Total Requests" value={data.length.toLocaleString()} sub="Filtered results"/>
        <StatCard label="Avg Resolution" value={avgResolution==="N/A"?avgResolution:`${avgResolution}d`} sub="Days to close" color={P.warm}/>
        <StatCard label="On-Time Rate" value={onTimeRate==="N/A"?onTimeRate:`${onTimeRate}%`} sub="Within SLA target" color={P.green}/>
        <StatCard label="Open Cases" value={data.filter(d=>d.status!=="Closed").length.toLocaleString()} sub="In progress / new" color={P.red}/>
      </div>

      {tab==="overview"&&(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(400px,1fr))",gap:18}}>
        <Card title="Monthly Volume" span={2}>
          <ResponsiveContainer width="100%" height={280}><AreaChart data={monthlyVolume}>
            <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={P.accent} stopOpacity={0.25}/><stop offset="100%" stopColor={P.accent} stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke={P.border}/><XAxis dataKey="month" stroke={P.dim} fontSize={12}/><YAxis stroke={P.dim} fontSize={12}/><Tooltip content={<Tip/>}/>
            <Area type="monotone" dataKey="requests" stroke={P.accent} fill="url(#ag)" strokeWidth={2.5} name="Total"/><Area type="monotone" dataKey="overdue" stroke={P.red} fill="none" strokeWidth={1.5} strokeDasharray="4 4" name="Overdue"/>
          </AreaChart></ResponsiveContainer>
        </Card>
        <Card title="By Neighborhood"><ResponsiveContainer width="100%" height={360}><BarChart data={byNeighborhood} layout="vertical" margin={{left:10}}><CartesianGrid strokeDasharray="3 3" stroke={P.border}/><XAxis type="number" stroke={P.dim} fontSize={11}/><YAxis type="category" dataKey="name" stroke={P.dim} fontSize={11} width={100}/><Tooltip content={<Tip/>}/><Bar dataKey="value" name="Requests" radius={[0,4,4,0]} fill={P.accent} fillOpacity={0.85}/></BarChart></ResponsiveContainer></Card>
        <Card title="Report Source"><ResponsiveContainer width="100%" height={360}><PieChart><Pie data={bySource} cx="50%" cy="50%" outerRadius={130} innerRadius={65} dataKey="value" paddingAngle={3} stroke="none">{bySource.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}</Pie><Tooltip content={<Tip/>}/><Legend iconType="circle" wrapperStyle={{fontSize:12,color:P.muted}}/></PieChart></ResponsiveContainer></Card>
      </div>)}

      {tab==="topics"&&(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(400px,1fr))",gap:18}}>
        <Card title="Top Case Topics" span={2}><ResponsiveContainer width="100%" height={340}><BarChart data={byTopic} margin={{bottom:80}}><CartesianGrid strokeDasharray="3 3" stroke={P.border}/><XAxis dataKey="name" stroke={P.dim} fontSize={10} angle={-40} textAnchor="end" interval={0}/><YAxis stroke={P.dim} fontSize={11}/><Tooltip content={<Tip/>}/><Bar dataKey="value" name="Cases" radius={[4,4,0,0]} fill={P.accent} fillOpacity={0.85}/></BarChart></ResponsiveContainer></Card>
        <Card title="By Department"><ResponsiveContainer width="100%" height={320}><BarChart data={byDepartment} layout="vertical" margin={{left:10}}><CartesianGrid strokeDasharray="3 3" stroke={P.border}/><XAxis type="number" stroke={P.dim} fontSize={11}/><YAxis type="category" dataKey="name" stroke={P.dim} fontSize={10} width={150}/><Tooltip content={<Tip/>}/><Bar dataKey="value" name="Cases" radius={[0,4,4,0]} fill={P.accent} fillOpacity={0.85}/></BarChart></ResponsiveContainer></Card>
        <Card title="Case Status"><div style={{display:"flex",justifyContent:"center",height:320}}><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={statusCounts} cx="50%" cy="50%" outerRadius={110} innerRadius={55} dataKey="value" stroke="none" paddingAngle={4}>{statusCounts.map((d,i)=><Cell key={i} fill={d.name==="Closed"?P.green:d.name==="In progress"?P.warm:d.name==="Open"?P.accent:PIE_COLORS[i]}/>)}</Pie><Tooltip content={<Tip/>}/><Legend iconType="circle" wrapperStyle={{fontSize:12}}/></PieChart></ResponsiveContainer></div></Card>
      </div>)}

      {tab==="performance"&&(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(400px,1fr))",gap:18}}>
        <Card title="Avg Resolution by Topic (Days)" span={2}><ResponsiveContainer width="100%" height={360}><BarChart data={resolutionByTopic} layout="vertical" margin={{left:20}}><CartesianGrid strokeDasharray="3 3" stroke={P.border}/><XAxis type="number" stroke={P.dim} fontSize={11} unit="d"/><YAxis type="category" dataKey="name" stroke={P.dim} fontSize={10} width={160}/><Tooltip content={<Tip/>}/><Bar dataKey="avg" name="Avg Days" radius={[0,6,6,0]} fill={P.warm} fillOpacity={0.85}/></BarChart></ResponsiveContainer></Card>
        <Card title="Monthly Closure Rate"><ResponsiveContainer width="100%" height={280}><LineChart data={monthlyVolume.map(d=>({...d,rate:d.requests>0?+((d.closed/d.requests)*100).toFixed(1):0}))}><CartesianGrid strokeDasharray="3 3" stroke={P.border}/><XAxis dataKey="month" stroke={P.dim} fontSize={12}/><YAxis stroke={P.dim} fontSize={12} domain={[0,100]} unit="%"/><Tooltip content={<Tip/>}/><Line type="monotone" dataKey="rate" stroke={P.green} strokeWidth={2.5} dot={{fill:P.green,r:4}} name="Closure %"/></LineChart></ResponsiveContainer></Card>
        <Card title="On-Time vs Overdue"><div style={{display:"flex",justifyContent:"center",height:280}}><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={onTimeCounts} cx="50%" cy="50%" outerRadius={100} innerRadius={55} dataKey="value" stroke="none" paddingAngle={4}><Cell fill={P.green}/><Cell fill={P.red}/></Pie><Tooltip content={<Tip/>}/><Legend iconType="circle" wrapperStyle={{fontSize:12}}/></PieChart></ResponsiveContainer></div></Card>
      </div>)}

      {tab==="patterns"&&(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(400px,1fr))",gap:18}}>
        <Card title="Requests by Hour of Day" span={2}><ResponsiveContainer width="100%" height={280}><BarChart data={hourlyDist}><CartesianGrid strokeDasharray="3 3" stroke={P.border}/><XAxis dataKey="hour" stroke={P.dim} fontSize={10} interval={1}/><YAxis stroke={P.dim} fontSize={11}/><Tooltip content={<Tip/>}/><Bar dataKey="count" name="Requests" radius={[3,3,0,0]} fill={P.accent} fillOpacity={0.8}/></BarChart></ResponsiveContainer></Card>
        <Card title="Requests by Day of Week"><ResponsiveContainer width="100%" height={280}><BarChart data={weekdayDist}><CartesianGrid strokeDasharray="3 3" stroke={P.border}/><XAxis dataKey="day" stroke={P.dim} fontSize={12}/><YAxis stroke={P.dim} fontSize={11}/><Tooltip content={<Tip/>}/><Bar dataKey="count" name="Requests" radius={[4,4,0,0]} fill={P.accent} fillOpacity={0.85}/></BarChart></ResponsiveContainer></Card>
        <Card title="Monthly Overdue Cases"><ResponsiveContainer width="100%" height={280}><AreaChart data={monthlyVolume}><defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={P.red} stopOpacity={0.3}/><stop offset="100%" stopColor={P.red} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={P.border}/><XAxis dataKey="month" stroke={P.dim} fontSize={12}/><YAxis stroke={P.dim} fontSize={11}/><Tooltip content={<Tip/>}/><Area type="monotone" dataKey="overdue" stroke={P.red} fill="url(#rg)" strokeWidth={2} name="Overdue"/></AreaChart></ResponsiveContainer></Card>
      </div>)}

      {tab==="map"&&(<div><Card title="Complaint Locations" span={2}><MapView data={data}/></Card></div>)}

      <footer style={{marginTop:40,paddingTop:20,borderTop:`1px solid ${P.border}`,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,fontSize:11,color:P.dim,fontFamily:"'Geist Mono',monospace"}}>
        <span>Source: data.boston.gov · {dataSource==="csv"?"CSV pipeline":"Live API"}{updStr&&` · Last fetch: ${updStr}`}</span>
        <span>React + Recharts · GitHub Actions daily pipeline</span>
      </footer>
    </div>
  );
}