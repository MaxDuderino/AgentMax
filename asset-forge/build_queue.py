"""Builds asset-prompts.html, Max's clickable prompt queue, from prompts.json.

Usage:  python build_queue.py assets/prompts.json asset-prompts.html

The page is a working tool, opened in any browser:
  - Copy a prompt (or its file name) with one click
  - "Next up" jumps to and copies the next todo prompt
  - Mark assets done / redo / skip as you go
  - "Copy status update" gives a one-line summary to paste back to the AI,
    which updates prompts.json (the real record) and rebuilds this page.
Marks made on the page are remembered in that browser only, as a convenience.
"""
import html
import json
import sys
from pathlib import Path

if len(sys.argv) != 3 or sys.argv[1] in ("-h", "--help"):
    print(__doc__)
    sys.exit(0 if len(sys.argv) > 1 and sys.argv[1] in ("-h", "--help") else 2)
src, out = Path(sys.argv[1]), Path(sys.argv[2])
data = json.loads(src.read_text(encoding="utf-8"))
payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
title = html.escape(f"{data.get('project', 'Project')} Asset Queue")

PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
:root{--bg:#F3F1EC;--card:#FFFFFF;--ink:#1D1B18;--muted:#6B655C;--line:#DDD8CF;--accent:#7A3FB0;--accent-ink:#fff;--done:#2E7D4F;--redo:#B5651D;--skip:#8A8A8A;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#16151A;--card:#201F26;--ink:#ECEAF0;--muted:#A19DAA;--line:#34323C;--accent:#B98BE6;--accent-ink:#17121D;--done:#6CCB93;--redo:#E39A55;--skip:#8C8A93;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:24px 16px 80px}
h1{margin:0;font-size:1.8rem}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);padding:12px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-bottom:1px solid var(--line);margin-bottom:16px}
.meter{flex:1 1 160px;height:8px;background:var(--line);border-radius:4px;overflow:hidden}.meter i{display:block;height:100%;background:var(--done);width:0}
button,select{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;padding:6px 12px;cursor:pointer}
button:hover{border-color:var(--ink)}button:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:600}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-bottom:12px;display:grid;gap:8px}
.card.flash{outline:3px solid var(--accent)}
.head{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;justify-content:space-between}
.name{font-weight:700}.meta{color:var(--muted);font-size:.85rem;font-family:ui-monospace,Menlo,Consolas,monospace}
.prompt{white-space:pre-wrap;background:var(--bg);border-radius:6px;padding:10px;font-size:.92rem}
.row{display:flex;flex-wrap:wrap;gap:6px}
.st{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.st.done{color:var(--done)}.st.redo{color:var(--redo)}.st.skip{color:var(--skip)}.st.todo{color:var(--muted)}
.card.done .prompt{opacity:.55}
details summary{cursor:pointer;color:var(--muted);font-size:.9rem}
.toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:8px 14px;border-radius:6px;opacity:0;transition:opacity .2s}
.toast.on{opacity:1}
.card.just-done{outline:3px solid var(--done)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
</style></head><body><div class="wrap">
<h1>__TITLE__</h1>
<p class="meta">Paste the style bible into a fresh ChatGPT chat once per family, then work down the list. Marks here are remembered in this browser; use "Copy status update" to send them back so the real list gets updated.</p>
<div class="bar">
  <span id="count" class="meta"></span><span class="meter"><i id="m"></i></span>
  <select id="fam" aria-label="Family"></select>
  <select id="flt" aria-label="Status"><option value="all">All</option><option value="todo" selected>To do</option><option value="redo">Redo</option><option value="done">Done</option><option value="skip">Skip</option></select>
  <button class="primary" id="next">Next up: copy it</button>
  <button id="report">Copy status update</button>
</div>
<div id="list"></div></div><div class="toast" id="toast" role="status"></div>
<script>
const DATA=__DATA__;
const KEY="asset-queue:"+(DATA.project||"");
let marks={};try{marks=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
const st=a=>marks[a.id]||a.status||"todo";
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(marks))}catch(e){}};
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const fams=[...new Set(DATA.assets.map(a=>a.family||"Other"))];
document.getElementById("fam").innerHTML='<option value="all">All families</option>'+fams.map(f=>`<option>${esc(f)}</option>`).join("");
function toast(t){const el=document.getElementById("toast");el.textContent=t;el.classList.add("on");setTimeout(()=>el.classList.remove("on"),1400)}
async function copy(t,msg){try{await navigator.clipboard.writeText(t);toast(msg)}catch(e){const ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand("copy");toast(msg)}catch(_){toast("Select and copy by hand")}ta.remove()}}
function visible(){const f=document.getElementById("fam").value,s=document.getElementById("flt").value;return DATA.assets.filter(a=>(f==="all"||(a.family||"Other")===f)&&(s==="all"||st(a)===s))}
function render(){
  const all=DATA.assets,done=all.filter(a=>["done","skip"].includes(st(a))).length;
  document.getElementById("count").textContent=`${done} / ${all.length} done`;
  document.getElementById("m").style.width=(all.length?done/all.length*100:0)+"%";
  document.getElementById("list").innerHTML=visible().map(a=>`<article class="card ${st(a)}" id="c-${esc(a.id)}">
    <div class="head"><span class="name">${esc(a.name)}</span><span class="st ${st(a)}">${st(a)}</span></div>
    <div class="meta">${esc(a.family||"")} · ${esc(a.shape||"")} · save as ${esc(a.file||"")}</div>
    <div class="prompt">${esc(a.prompt)}</div>
    ${(a.variants||[]).length?`<details><summary>${a.variants.length} alternate prompts</summary>${a.variants.map((v,i)=>`<div class="prompt">${esc(v)}</div><button data-act="cv" data-id="${esc(a.id)}" data-i="${i}">Copy alternate ${i+1}</button>`).join("")}</details>`:""}
    ${a.notes?`<div class="meta">Note: ${esc(a.notes)}</div>`:""}
    <div class="row" role="group" aria-label="${esc(a.name)}"><button class="primary" data-act="cp" data-id="${esc(a.id)}" aria-label="Copy prompt: ${esc(a.name)}">Copy prompt</button><button data-act="cf" data-id="${esc(a.id)}" aria-label="Copy file name: ${esc(a.name)}">Copy file name</button>
    <button data-act="done" data-id="${esc(a.id)}" aria-label="Mark done: ${esc(a.name)}">Done</button><button data-act="redo" data-id="${esc(a.id)}" aria-label="Mark redo: ${esc(a.name)}">Redo</button><button data-act="skip" data-id="${esc(a.id)}" aria-label="Skip: ${esc(a.name)}">Skip</button><button data-act="todo" data-id="${esc(a.id)}" aria-label="Reset: ${esc(a.name)}">Reset</button></div>
  </article>`).join("")||'<p class="meta">Nothing here. Change the filters, or the whole list is done.</p>';
}
document.addEventListener("click",e=>{const b=e.target.closest("button[data-act]");if(!b)return;const a=DATA.assets.find(x=>x.id===b.dataset.id);if(!a)return;
  const act=b.dataset.act;
  if(act==="cp")copy(a.prompt,"Prompt copied");else if(act==="cf")copy(a.file||"","File name copied");else if(act==="cv")copy(a.variants[+b.dataset.i],"Alternate copied");
  else{marks[a.id]=act;save();const c=document.getElementById("c-"+a.id);
    if(c&&act==="done"){c.classList.add("just-done");const s=c.querySelector(".st");if(s){s.textContent="done ✓";s.className="st done"}toast(`Nice: ${a.name} done`);setTimeout(render,reduce?0:900)}else render()}});
document.getElementById("fam").onchange=render;document.getElementById("flt").onchange=render;
document.getElementById("next").onclick=()=>{const f=document.getElementById("fam").value;const a=DATA.assets.find(x=>["todo","redo"].includes(st(x))&&(f==="all"||(x.family||"Other")===f));if(!a){toast("All caught up");return}
  if(!visible().includes(a)){document.getElementById("flt").value="all";render();toast("Showing all, so you can see the next one")}const c=document.getElementById("c-"+a.id);c.scrollIntoView({block:"center",behavior:reduce?"auto":"smooth"});c.classList.add("flash");setTimeout(()=>c.classList.remove("flash"),1500);copy(a.prompt,`Copied: ${a.name}`)};
document.getElementById("report").onclick=()=>{const g={};DATA.assets.forEach(a=>{if(marks[a.id]&&marks[a.id]!==(a.status||"todo"))(g[marks[a.id]]=g[marks[a.id]]||[]).push(a.id)});
  const t=Object.keys(g).length?"Asset Forge status update for "+DATA.project+": "+Object.entries(g).map(([k,v])=>k+": "+v.join(", ")).join("; "):"";t?copy(t,"Status update copied. Paste it to Claude"):toast("No changes to report")};
render();
</script></body></html>"""

out.write_text(PAGE.replace("__TITLE__", title).replace("__DATA__", payload), encoding="utf-8")
print(f"built {out} with {len(data['assets'])} assets")
