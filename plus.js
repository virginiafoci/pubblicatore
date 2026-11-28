// Pubblicatore - modulo PLUS: calendario dinamico (tutti i clienti, mese/settimana, filtri canale),
// grafici nelle Statistiche e LinkedIn nell'editor (solo per i clienti abilitati).
// Si aggancia al pannello esistente: sostituisce vCalendar, estende vStats, openEditor, validate e save.
(function () {
  const LI_CLIENTS = /social pronto/i;          // LinkedIn attivo solo per questi clienti
  const C_FB = "#3a6ea5", C_IG = "#c2410c";     // coppia validata (CVD ok)
  const SEQ = ["#eef4ef", "#cfe3d5", "#9cc7aa", "#5f9e77", "#2f6f4f", "#1d4a34"];

  const css = document.createElement("style");
  css.textContent = `
    .px-seg { display:inline-flex; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    .px-seg button { border:none; border-radius:0; padding:5px 10px; font-size:13px; }
    .px-seg button.on { background:var(--soft); font-weight:600; }
    .px-ch { font-size:10px; font-weight:700; padding:0 4px; border-radius:4px; color:#fff; flex:none; }
    .px-fb { background:${C_FB}; } .px-ig { background:${C_IG}; } .px-li { background:#0a66c2; }
    .px-more { font-size:12px; color:var(--muted); margin-top:3px; cursor:pointer; text-decoration:underline; }
    .px-week { display:grid; grid-template-columns:repeat(7, minmax(0,1fr)); gap:8px; }
    .px-col { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:8px; min-height:360px; }
    .px-col.today { border:2px solid var(--accent); } .px-col.over { background:var(--soft); }
    .px-col .hd { font-size:12px; color:var(--muted); text-transform:capitalize; margin-bottom:6px; display:flex; justify-content:space-between; }
    .px-card { border:1px solid var(--line); border-left:4px solid; border-radius:8px; padding:6px; margin-bottom:6px; background:#fff; cursor:grab; font-size:12px; }
    .px-card img, .px-card video { width:100%; aspect-ratio:4/5; object-fit:cover; border-radius:5px; display:block; margin:4px 0; background:#eee; }
    .px-card .t { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
    .px-card .cl { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .px-card .cp { color:var(--muted); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .px-legend { display:flex; gap:10px; flex-wrap:wrap; font-size:12px; color:var(--muted); margin:8px 0 0; }
    .px-legend span { display:inline-flex; gap:5px; align-items:center; }
    .px-charts { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
    .px-charts .wide { grid-column:1 / -1; }
    .px-charts svg { width:100%; height:auto; display:block; overflow:visible; }
    .px-charts .ax { font-size:11px; fill:var(--muted); }
    .px-charts .grid line { stroke:var(--line); }
    .px-delta { font-size:12px; font-weight:600; margin-left:4px; }
    .px-up { color:var(--accent); } .px-down { color:var(--warn); }
    .px-tip { position:fixed; z-index:9999; pointer-events:none; background:#26221c; color:#fff; font-size:12px; padding:6px 9px; border-radius:6px; display:none; max-width:240px; line-height:1.35; }
    .px-heat td { padding:0; } .px-heat td div { height:30px; border-radius:4px; margin:1px; }
    .px-heat th { font-size:11px; color:var(--muted); font-weight:400; padding:2px 6px; text-align:left; }
    @media (max-width: 900px) { .px-week { grid-template-columns:1fr; } .px-charts { grid-template-columns:1fr; } .px-col { min-height:0; } }
  `;
  document.head.appendChild(css);

  const tip = document.createElement("div"); tip.className = "px-tip"; document.body.appendChild(tip);
  const showTip = (e, html) => { tip.innerHTML = html; tip.style.display = "block"; tip.style.left = Math.min(e.clientX + 14, innerWidth - 250) + "px"; tip.style.top = (e.clientY + 14) + "px"; };
  const hideTip = () => tip.style.display = "none";
  const bindTips = (root) => root.querySelectorAll("[data-tip]").forEach(el => { el.onmousemove = (e) => showTip(e, el.dataset.tip); el.onmouseleave = hideTip; });

  S.calMode ??= "mese"; S.calAll ??= false; S.calCh ??= { fb:true, ig:true, li:true };
  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const chans = (p) => [p.to_facebook && "fb", p.to_instagram && "ig", p.to_linkedin && "li"].filter(Boolean);
  const chTags = (p) => chans(p).map(c => `<span class="px-ch px-${c}">${{ fb:"FB", ig:"IG", li:"in" }[c]}</span>`).join("");
  const capOf = (p) => p.caption_facebook || p.caption_instagram || p.caption_linkedin || "";
  const visible = () => (S.calAll ? S.posts : S.posts.filter(p => p.client_id === S.client))
    .filter(p => chans(p).some(c => S.calCh[c]) || !chans(p).length);
  const colorOf = (p) => esc(clientOf(p.client_id)?.color ?? "#2f6f4f");

  async function movePost(id, day) {
    const p = S.posts.find(x => x.id === id);
    if (!p || LOCKED.includes(p.status)) return;
    const iso = romeToISO(`${day}T${romeTime(p.scheduled_at)}`);
    if (new Date(iso) < new Date()) return toast("Non puoi spostarlo nel passato");
    const { error } = await sb.from("posts").update({ scheduled_at: iso, ...(p.status === "errore" ? { status:"programmato", error:null } : {}) }).eq("id", p.id);
    if (error) return toast(error.message);
    toast("Post spostato"); loadAll();
  }
  function bindDnD(sel, dropSel, overCls) {
    document.querySelectorAll(sel).forEach(c => {
      c.onclick = (e) => { e.stopPropagation(); openEditor(S.posts.find(p => p.id === c.dataset.post)); };
      c.ondragstart = (e) => { hideTip(); e.dataTransfer.setData("text/plain", c.dataset.post); };
    });
    document.querySelectorAll(dropSel).forEach(cell => {
      cell.onclick = (e) => { if (e.target.closest("[data-more]")) return; openEditor(null, `${cell.dataset.day}T09:30`); };
      cell.ondragover = (e) => { e.preventDefault(); cell.classList.add(overCls); };
      cell.ondragleave = () => cell.classList.remove(overCls);
      cell.ondrop = (e) => { e.preventDefault(); cell.classList.remove(overCls); movePost(e.dataTransfer.getData("text/plain"), cell.dataset.day); };
    });
  }
  const postTip = (p) => esc(`${clientOf(p.client_id)?.name ?? ""} · ${romeTime(p.scheduled_at)} · ${STATI[p.status]}${p.error ? " · " + p.error.slice(0, 80) : ""}`);

  // --- CALENDARIO ---
  vCalendar = function () {
    const today = romeDay(new Date().toISOString());
    const byDay = {}; for (const p of visible()) (byDay[romeDay(p.scheduled_at)] ??= []).push(p);
    Object.values(byDay).forEach(l => l.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)));
    let label, body;
    if (S.calMode === "settimana") {
      const base = S.weekStart ?? (() => { const n = new Date(); n.setHours(0, 0, 0, 0); n.setDate(n.getDate() - ((n.getDay() + 6) % 7)); return n; })();
      S.weekStart = base;
      const end = new Date(base); end.setDate(base.getDate() + 6);
      label = `${base.toLocaleDateString("it-IT", { day:"numeric", month:"short" })} – ${end.toLocaleDateString("it-IT", { day:"numeric", month:"short", year:"numeric" })}`;
      body = `<div class="px-week">` + [...Array(7)].map((_, i) => {
        const d = new Date(base); d.setDate(base.getDate() + i); const k = keyOf(d);
        const list = byDay[k] ?? [];
        return `<div class="px-col ${k === today ? "today" : ""}" data-day="${k}"><div class="hd"><span>${d.toLocaleDateString("it-IT", { weekday:"short", day:"numeric" })}</span><span>${list.length || ""}</span></div>
          ${list.map(p => `<div class="px-card s-${p.status}" style="border-left-color:${colorOf(p)}" draggable="${!LOCKED.includes(p.status)}" data-post="${p.id}" data-tip="${postTip(p)}">
            <div class="t"><b>${romeTime(p.scheduled_at)}</b>${chTags(p)}<span class="badge s-${p.status}">${esc(STATI[p.status])}</span></div>
            ${S.calAll ? `<div class="cl">${esc(clientOf(p.client_id)?.name ?? "")}</div>` : ""}
            ${p.images?.[0] ? (isVideo(p.images[0]) ? `<video src="${pub(p.images[0])}" muted></video>` : `<img src="${pub(p.images[0])}" loading="lazy">`) : ""}
            <div class="cp">${esc(capOf(p).slice(0, 120))}</div></div>`).join("")}</div>`;
      }).join("") + `</div>`;
    } else {
      const m = S.month, y = m.getFullYear(), mo = m.getMonth();
      const first = new Date(y, mo, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
      label = first.toLocaleDateString("it-IT", { month:"long", year:"numeric" });
      const MAX = S.calAll ? 4 : 6;
      let cells = "";
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i); const k = keyOf(d);
        const list = byDay[k] ?? [];
        const chips = list.slice(0, MAX).map(p => `<div class="chip s-${p.status}" style="border-color:${colorOf(p)}" draggable="${!LOCKED.includes(p.status)}" data-post="${p.id}" data-tip="${postTip(p)}">
          ${p.images?.[0] && !isVideo(p.images[0]) ? `<img src="${pub(p.images[0])}" loading="lazy">` : (p.media_kind === "video" ? "🎬" : "")}
          <b>${romeTime(p.scheduled_at)}</b>${chTags(p)} ${esc((S.calAll ? (clientOf(p.client_id)?.name ?? "") : capOf(p)).slice(0, 34))}</div>`).join("");
        const more = list.length > MAX ? `<div class="px-more" data-more="${k}">+${list.length - MAX} altri</div>` : "";
        cells += `<div class="cell ${d.getMonth() !== mo ? "out" : ""} ${k === today ? "today" : ""}" data-day="${k}"><div class="n">${d.getDate()}</div>${chips}${more}</div>`;
      }
      body = `<div class="cal">${["lun","mar","mer","gio","ven","sab","dom"].map(d => `<div class="h">${d}</div>`).join("")}${cells}</div>`;
    }
    const vis = visible().filter(p => S.calMode === "settimana" || romeDay(p.scheduled_at).slice(0, 7) === keyOf(S.month).slice(0, 7));
    const cnt = (s) => vis.filter(p => p.status === s).length;
    const legend = S.calAll ? `<div class="px-legend">${[...new Set(vis.map(p => p.client_id))].map(id => `<span><span class="dot" style="background:${esc(clientOf(id)?.color ?? "#999")}"></span>${esc(clientOf(id)?.name ?? "")}</span>`).join("")}</div>` : "";
    $("view").innerHTML = (S.calAll ? "" : banner()) + `<div class="toolbar">
        <button id="mPrev">‹</button><h3 style="margin:0;min-width:190px;text-align:center;text-transform:capitalize">${label}</h3><button id="mNext">›</button><button id="mToday" class="sm">Oggi</button>
        <span class="px-seg"><button data-mode="mese" class="${S.calMode === "mese" ? "on" : ""}">Mese</button><button data-mode="settimana" class="${S.calMode === "settimana" ? "on" : ""}">Settimana</button></span>
        <span class="px-seg"><button data-all="0" class="${!S.calAll ? "on" : ""}">Questo cliente</button><button data-all="1" class="${S.calAll ? "on" : ""}">Tutti i clienti</button></span>
        <span class="row" style="gap:10px">${["fb","ig","li"].map(c => `<label style="margin:0"><input type="checkbox" data-ch="${c}" ${S.calCh[c] ? "checked" : ""}> ${{ fb:"Facebook", ig:"Instagram", li:"LinkedIn" }[c]}</label>`).join("")}</span>
      </div>
      <p class="note" style="margin:-6px 0 10px">${vis.length} post · ${cnt("programmato")} programmati · ${cnt("pubblicato")} pubblicati${cnt("da_approvare") ? ` · ${cnt("da_approvare")} da approvare` : ""}${cnt("errore") ? ` · <span class="bad">${cnt("errore")} in errore</span>` : ""}. Trascina un post su un altro giorno per spostarlo, clic su un giorno per crearne uno.</p>
      ${body}${legend}`;
    const step = (dir) => {
      if (S.calMode === "settimana") { const d = new Date(S.weekStart); d.setDate(d.getDate() + 7 * dir); S.weekStart = d; }
      else S.month = new Date(S.month.getFullYear(), S.month.getMonth() + dir, 1);
      render();
    };
    $("mPrev").onclick = () => step(-1); $("mNext").onclick = () => step(1);
    $("mToday").onclick = () => { const n = new Date(); S.month = new Date(n.getFullYear(), n.getMonth(), 1); S.weekStart = null; render(); };
    document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { S.calMode = b.dataset.mode; if (S.calMode === "settimana" && !S.weekStart) { const d = new Date(S.month); const n = new Date(); if (d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()) S.weekStart = null; else { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); S.weekStart = d; } } render(); });
    document.querySelectorAll("[data-all]").forEach(b => b.onclick = () => { S.calAll = b.dataset.all === "1"; render(); });
    document.querySelectorAll("[data-ch]").forEach(b => b.onchange = () => { S.calCh[b.dataset.ch] = b.checked; render(); });
    document.querySelectorAll("[data-more]").forEach(b => b.onclick = (e) => { e.stopPropagation(); const d = new Date(b.dataset.more + "T12:00"); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); S.weekStart = d; S.calMode = "settimana"; render(); });
    bindDnD(S.calMode === "settimana" ? ".px-card" : ".chip", S.calMode === "settimana" ? ".px-col" : ".cell", S.calMode === "settimana" ? "over" : "over");
    bindTips($("view"));
  };

  // --- STATISTICHE: grafici in testa ---
  const nf = (n) => Math.round(n).toLocaleString("it-IT");
  const metricsOf = (p) => {
    const ms = S.pm.filter(x => x.post_id === p.id), s = (k) => ms.reduce((a, x) => a + (x[k] ?? 0), 0);
    return { reach: s("reach"), inter: s("likes") + s("comments") + s("shares") + s("saves") };
  };
  const pubIn = (posts, from, to) => posts.filter(p => p.status === "pubblicato" && p.published_at && new Date(p.published_at) >= from && new Date(p.published_at) < to);
  const delta = (a, b) => { if (!b) return ""; const d = (a - b) / b * 100; return `<span class="px-delta ${d >= 0 ? "px-up" : "px-down"}">${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(0)}%</span>`; };

  function barChart(days, vals, tips) {
    const W = 640, H = 200, L = 40, B = 22, T = 10, max = Math.max(1, ...vals), n = days.length;
    const bw = (W - L) / n, scale = (v) => (H - B - T) * v / max;
    const ticks = [0, max / 2, max].map(v => Math.round(v));
    return `<svg viewBox="0 0 ${W} ${H}" role="img"><g class="grid">${ticks.map(t => `<line x1="${L}" x2="${W}" y1="${H - B - scale(t)}" y2="${H - B - scale(t)}"/>`).join("")}</g>
      ${ticks.map(t => `<text class="ax" x="${L - 6}" y="${H - B - scale(t) + 4}" text-anchor="end">${nf(t)}</text>`).join("")}
      ${vals.map((v, i) => { const h = scale(v), x = L + i * bw + 1; return `<g data-tip="${esc(tips[i])}"><rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - B - T}" fill="transparent"/>${v ? `<rect x="${x}" y="${H - B - h}" width="${Math.max(2, bw - 2)}" height="${h}" rx="${Math.min(4, (bw - 2) / 2)}" fill="#2f6f4f"/>` : ""}</g>`; }).join("")}
      ${days.map((d, i) => (i % 5 === 0 || i === n - 1) ? `<text class="ax" x="${L + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${d}</text>` : "").join("")}</svg>`;
  }
  function lineChart(series) { // series: [{name,color,pts:[{x:label,v}]}]
    const W = 640, H = 200, L = 52, B = 22, T = 12, R = 70;
    const all = series.flatMap(s => s.pts.map(p => p.v)); if (!all.length) return `<p class="note">Ancora nessun dato sui follower per questo mese.</p>`;
    let mn = Math.min(...all), mx = Math.max(...all); if (mn === mx) { mn -= 1; mx += 1; } const padv = (mx - mn) * .1; mn -= padv; mx += padv;
    const xs = series[0].pts.length > 1 ? series[0].pts.length : 2;
    const X = (i, len) => L + (W - L - R) * i / Math.max(1, len - 1), Y = (v) => T + (H - B - T) * (1 - (v - mn) / (mx - mn));
    const ticks = [mn, (mn + mx) / 2, mx];
    return `<svg viewBox="0 0 ${W} ${H}" role="img"><g class="grid">${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/>`).join("")}</g>
      ${ticks.map(t => `<text class="ax" x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${nf(t)}</text>`).join("")}
      ${series.map(s => { const n = s.pts.length; const d = s.pts.map((p, i) => `${i ? "L" : "M"}${X(i, n).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" "); const last = s.pts.at(-1);
        return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>
          ${s.pts.map((p, i) => `<circle cx="${X(i, n)}" cy="${Y(p.v)}" r="8" fill="transparent" data-tip="${esc(`${s.name} · ${p.x}: ${nf(p.v)}`)}"/>`).join("")}
          <circle cx="${X(n - 1, n)}" cy="${Y(last.v)}" r="4" fill="${s.color}" stroke="#fff" stroke-width="2"/>
          <text class="ax" x="${X(n - 1, n) + 8}" y="${Y(last.v) + 4}" style="fill:var(--ink)">${s.name} ${nf(last.v)}</text>`; }).join("")}
      <text class="ax" x="${L}" y="${H - 6}">${series[0].pts[0]?.x ?? ""}</text><text class="ax" x="${W - R}" y="${H - 6}" text-anchor="end">${series[0].pts.at(-1)?.x ?? ""}</text></svg>`;
  }
  function heatmap(posts) {
    const days = ["lun","mar","mer","gio","ven","sab","dom"], slots = [[6,9],[9,12],[12,15],[15,18],[18,21],[21,24]];
    const g = days.map(() => slots.map(() => ({ n:0, s:0 })));
    for (const p of posts) {
      const loc = isoToRome(p.published_at), d = (new Date(loc.slice(0, 10) + "T12:00").getDay() + 6) % 7, h = +loc.slice(11, 13);
      const j = slots.findIndex(([a, b]) => h >= a && h < b); if (j < 0) continue;
      g[d][j].n++; g[d][j].s += metricsOf(p).inter;
    }
    const avgs = g.flat().filter(c => c.n).map(c => c.s / c.n), mx = Math.max(1, ...avgs);
    if (!avgs.length) return `<p class="note">Servono post pubblicati con dati Meta per calcolare gli orari migliori.</p>`;
    return `<table class="px-heat" style="width:100%"><tr><th></th>${slots.map(([a, b]) => `<th>${a}–${b}</th>`).join("")}</tr>
      ${days.map((dn, i) => `<tr><th>${dn}</th>${slots.map((sl, j) => { const c = g[i][j], v = c.n ? c.s / c.n : null;
        const col = v == null ? "#f6f4ef" : SEQ[Math.min(SEQ.length - 1, 1 + Math.floor((v / mx) * (SEQ.length - 1.01)))];
        return `<td><div style="background:${col}" data-tip="${esc(v == null ? `${dn} ${sl[0]}–${sl[1]}: nessun post` : `${dn} ${sl[0]}–${sl[1]}: ${nf(v)} interazioni medie su ${c.n} post`)}"></div></td>`; }).join("")}</tr>`).join("")}</table>
      <div class="px-legend"><span>meno</span>${SEQ.slice(1).map(c => `<span style="width:18px;height:10px;background:${c};border-radius:2px"></span>`).join("")}<span>più interazioni</span></div>`;
  }

  const origStats = vStats;
  vStats = function () {
    origStats();
    const ym = S.statMonth ?? new Date().toISOString().slice(0, 7), [y, m] = ym.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1)), to = new Date(Date.UTC(y, m, 1)), pFrom = new Date(Date.UTC(y, m - 2, 1));
    const cp = clientPosts(), cur = pubIn(cp, from, to), prev = pubIn(cp, pFrom, from);
    const sum = (l, k) => l.reduce((a, p) => a + metricsOf(p)[k], 0);
    const nDays = new Date(y, m, 0).getDate(), labels = [...Array(nDays)].map((_, i) => String(i + 1));
    const perDay = labels.map(() => ({ n:0, inter:0, reach:0 }));
    for (const p of cur) { const d = +isoToRome(p.published_at).slice(8, 10) - 1; const mt = metricsOf(p); perDay[d].n++; perDay[d].inter += mt.inter; perDay[d].reach += mt.reach; }
    const accs = S.accounts.filter(a => a.client_id === S.client).map(a => a.id);
    const am = S.am.filter(x => accs.includes(x.account_id) && x.day >= from.toISOString().slice(0, 10) && x.day < to.toISOString().slice(0, 10));
    const byD = {}; for (const r of am) { const o = (byD[r.day] ??= { fb:null, ig:null }); if (r.fb_followers != null) o.fb = (o.fb ?? 0) + r.fb_followers; if (r.ig_followers != null) o.ig = (o.ig ?? 0) + r.ig_followers; }
    const ds = Object.keys(byD).sort(), fmt = (d) => new Date(d + "T12:00").toLocaleDateString("it-IT", { day:"numeric", month:"short" });
    const series = [
      { name:"Facebook", color:C_FB, pts: ds.filter(d => byD[d].fb != null).map(d => ({ x:fmt(d), v:byD[d].fb })) },
      { name:"Instagram", color:C_IG, pts: ds.filter(d => byD[d].ig != null).map(d => ({ x:fmt(d), v:byD[d].ig })) },
    ].filter(s => s.pts.length);
    const hist = cp.filter(p => p.status === "pubblicato" && p.published_at && new Date(p.published_at) > new Date(Date.now() - 120 * 864e5));
    const box = document.createElement("div");
    box.innerHTML = `<div class="kpis">
        <div class="kpi"><b>${cur.length}${delta(cur.length, prev.length)}</b><span>post pubblicati rispetto al mese prima (${prev.length})</span></div>
        <div class="kpi"><b>${nf(sum(cur, "reach"))}${delta(sum(cur, "reach"), sum(prev, "reach"))}</b><span>copertura rispetto al mese prima</span></div>
        <div class="kpi"><b>${nf(sum(cur, "inter"))}${delta(sum(cur, "inter"), sum(prev, "inter"))}</b><span>interazioni rispetto al mese prima</span></div>
      </div>
      <div class="px-charts">
        <div class="card wide"><h2>Interazioni per giorno</h2>${barChart(labels, perDay.map(d => d.inter), perDay.map((d, i) => `${i + 1}/${m}: ${d.n} post · ${nf(d.inter)} interazioni · ${nf(d.reach)} copertura`))}</div>
        <div class="card"><h2>Follower nel mese</h2>${series.length ? lineChart(series) : `<p class="note">Ancora nessun dato sui follower per questo mese.</p>`}
          ${series.length > 1 ? `<div class="px-legend">${series.map(s => `<span><span class="dot" style="background:${s.color}"></span>${s.name}</span>`).join("")}</div>` : ""}</div>
        <div class="card"><h2>Quando funzionano meglio (ultimi 4 mesi)</h2>${heatmap(hist)}</div>
      </div>`;
    const tb = document.querySelector("#view .toolbar");
    tb?.after(box);
    bindTips(box);
  };

  // --- EDITOR: LinkedIn ---
  const igBox = $("pIg").closest("label");
  igBox.insertAdjacentHTML("afterend", `<label style="margin:0" id="pLiWrap"><input type="checkbox" id="pLi"> LinkedIn</label>`);
  $("pFirst").previousElementSibling.insertAdjacentHTML("beforebegin", `<div id="pLiBox"><label>Testo LinkedIn <span class="note">(se vuoto uso quello di Facebook)</span></label><textarea id="pCapLi"></textarea><div class="count" id="cLi"></div></div>`);
  const liAllowed = () => LI_CLIENTS.test(clientOf(accOf($("pAccount").value)?.client_id)?.name ?? "");
  const liSync = () => { const ok = liAllowed(); $("pLiWrap").style.display = ok ? "" : "none"; $("pLiBox").style.display = ok && $("pLi").checked ? "" : "none"; if (!ok) $("pLi").checked = false; $("cLi").textContent = `${$("pCapLi").value.length} / 3000 caratteri`; };
  $("pAccount").addEventListener("change", liSync); $("pLi").addEventListener("change", liSync); $("pCapLi").addEventListener("input", liSync);

  const origOpen = openEditor;
  openEditor = function (p, whenLocal) {
    origOpen(p, whenLocal);
    $("pLi").checked = !!p?.to_linkedin; $("pCapLi").value = p?.caption_linkedin ?? "";
    liSync();
  };
  validate = function (row) {
    const vids = row.images.filter(isVideo);
    if (vids.length && row.images.length > 1) return "Un reel può avere un solo video, senza immagini";
    if (row.images.length > 10) return "Massimo 10 immagini per carosello";
    if (row.to_instagram && !row.images.length) return "Instagram richiede almeno un'immagine o un video";
    if (!row.to_facebook && !row.to_instagram && !row.to_linkedin) return "Scegli almeno un social";
    if (row.to_linkedin && !(row.caption_linkedin || row.caption_facebook)) return "Scrivi il testo LinkedIn (o quello Facebook)";
    if ((row.caption_linkedin ?? "").length > 3000) return "Testo LinkedIn oltre 3000 caratteri";
    if (row.caption_instagram.length > 2200) return "Testo Instagram oltre 2200 caratteri";
    if (nTags(row.caption_instagram) + nTags(row.first_comment) > 30) return "Instagram accetta al massimo 30 hashtag";
    if (row.status !== "bozza" && new Date(row.scheduled_at) < new Date(Date.now() - 60000)) return "L'orario è nel passato";
    return null;
  };
  save = async function (asCopy = false) {
    const acc = accOf($("pAccount").value);
    if (!acc) return toast("Collega prima un account per questo cliente");
    const L = $("pLower").checked ? lowerTags : (s) => s;
    const li = liAllowed() && $("pLi").checked;
    const row = {
      client_id: acc.client_id, account_id: acc.id, scheduled_at: romeToISO($("pWhen").value),
      to_facebook: $("pFb").checked, to_instagram: $("pIg").checked, to_linkedin: li, status: $("pStatus").value,
      caption_facebook: L($("pCapFb").value), caption_instagram: L($("pCapIg").value), first_comment: L($("pFirst").value),
      caption_linkedin: li ? (L($("pCapLi").value) || null) : null,
      rubrica: $("pRubrica").value.trim() || null, images: [...S.sel], media_kind: S.sel.some(isVideo) ? "video" : "immagini",
      error: null, ig_container_id: null,
    };
    if (asCopy) { row.status = "bozza"; row.scheduled_at = new Date(new Date(row.scheduled_at).getTime() + 7 * 864e5).toISOString(); }
    const bad = validate(row); if (bad && !asCopy) return toast(bad);
    if (!asCopy && S.editing && S.editing.status === "da_rivedere" && row.status === "programmato" && !confirm("Il cliente aveva chiesto modifiche. Programmarlo comunque senza nuova approvazione?")) return;
    $("btnSave").disabled = true;
    const r = S.editing && !asCopy ? await sb.from("posts").update({ ...row, client_note: row.status === "da_approvare" ? null : S.editing.client_note }).eq("id", S.editing.id)
                                   : await sb.from("posts").insert(row);
    $("btnSave").disabled = false;
    if (r.error) return toast(r.error.message);
    $("dlg").close(); toast(asCopy ? "Copia creata come bozza tra 7 giorni" : row.status === "programmato" ? "Post programmato" : row.status === "da_approvare" ? "In attesa di approvazione del cliente" : "Bozza salvata"); loadAll();
  };

  if (S.me && !document.getElementById("app").hidden) render();
})();
