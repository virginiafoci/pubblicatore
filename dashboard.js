// Pubblicatore - modulo DASHBOARD (Fase 1): vista Home con il riepilogo di tutti i clienti.
// Si aggancia al pannello esistente senza modificarne la logica: legge solo i dati già caricati
// da loadAll() più la tabella "autopilot" (sola lettura).
(function () {
  // pulsante Home in testa al menu
  const nav = document.getElementById("nav");
  const b = document.createElement("button");
  b.dataset.v = "home"; b.textContent = "Home";
  b.onclick = () => { S.view = "home"; S.checked.clear(); render(); };
  nav.prepend(b);
  S.view = "home";

  const css = document.createElement("style");
  css.textContent = `
    .hm-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin-bottom:16px; }
    .hm-kpi { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px; cursor:pointer; }
    .hm-kpi b { display:block; font-size:26px; }
    .hm-kpi span { font-size:12px; color:var(--muted); }
    .hm-kpi.alert b { color:var(--warn); }
    .hm-two { display:grid; grid-template-columns:1.3fr 1fr; gap:16px; }
    .hm-row { display:grid; grid-template-columns:92px 1fr auto; gap:10px; padding:8px 0; border-bottom:1px solid var(--line); cursor:pointer; align-items:start; }
    .hm-row:last-child { border-bottom:none; }
    .hm-when { font-size:13px; color:var(--muted); }
    .hm-cap { font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:420px; }
    tr.hm-click { cursor:pointer; } tr.hm-click:hover { background:var(--soft); }
    .hm-soon { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px; }
    .hm-soon div { border:1px dashed var(--line); border-radius:10px; padding:10px; font-size:13px; color:var(--muted); }
    .hm-soon b { display:block; color:var(--ink); }
    body.hm-on aside { display:none; } body.hm-on main { grid-template-columns:1fr; }
    @media (max-width: 900px) { .hm-two { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(css);

  const dayISO = (offset) => romeDay(new Date(Date.now() + offset * 864e5).toISOString());
  const goClient = (id, view) => { S.client = id; S.view = view; S.checked.clear(); render(); };

  async function vHome() {
    const today = dayISO(0), tomorrow = dayISO(1), in7 = dayISO(7);
    const monthKey = today.slice(0, 7);
    const active = S.posts.filter(p => !["pubblicato", "errore", "pausa"].includes(p.status));
    const onDay = (d) => active.filter(p => romeDay(p.scheduled_at) === d && p.status !== "bozza").length;
    const next7 = active.filter(p => p.status === "programmato" && romeDay(p.scheduled_at) >= today && romeDay(p.scheduled_at) <= in7);
    const toApprove = S.posts.filter(p => ["da_approvare", "da_rivedere"].includes(p.status));
    const errors = S.posts.filter(p => p.status === "errore");
    const badAcc = S.accounts.filter(a => a.token_ok === false);

    const kpi = (n, label, act, alert) => `<div class="hm-kpi ${alert && n ? "alert" : ""}" data-go="${act}"><b>${n}</b><span>${label}</span></div>`;
    let h = "";
    if (badAcc.length) h += `<div class="banner">⚠️ Collegamento scaduto: ${badAcc.map(a => `${esc(clientOf(a.client_id)?.name ?? "")} · ${esc(a.page_name)}`).join(", ")}. I post non usciranno finché non ricolleghi l'account.</div>`;
    if (errors.length) h += `<div class="banner">${errors.length} post in errore. Clicca la casella “In errore” per vederli.</div>`;

    h += `<div class="hm-grid">
      ${kpi(onDay(today), "post oggi", "calendario")}
      ${kpi(onDay(tomorrow), "post domani", "calendario")}
      ${kpi(next7.length, "programmati nei prossimi 7 giorni", "elenco")}
      ${kpi(toApprove.length, "da approvare o rivedere", "approvazioni", true)}
      ${kpi(errors.length, "in errore", "errori", true)}
      ${kpi(S.comments.length, "commenti senza risposta", "commenti", true)}
    </div>`;

    const upcoming = active.filter(p => p.status !== "bozza" && new Date(p.scheduled_at) >= new Date()).slice(0, 12);
    const list = upcoming.map(p => {
      const c = clientOf(p.client_id), a = accOf(p.account_id);
      const d = romeDay(p.scheduled_at);
      const lab = d === today ? "Oggi" : d === tomorrow ? "Domani" : new Date(d + "T12:00:00").toLocaleDateString("it-IT", { weekday:"short", day:"numeric", month:"short" });
      return `<div class="hm-row" data-post="${p.id}">
        <div class="hm-when"><b>${lab}</b><br>${romeTime(p.scheduled_at)}</div>
        <div><div class="meta"><span class="dot" style="background:${esc(c?.color)}"></span> ${esc(c?.name ?? "")} · ${esc(a?.page_name ?? "")} · ${where(p)}</div>
          <div class="hm-cap">${esc((p.caption_facebook || p.caption_instagram || "").split("\n")[0])}</div></div>
        <span class="badge s-${p.status}">${STATI[p.status] ?? p.status}</span></div>`;
    }).join("") || `<p class="note">Nessun post in programma.</p>`;

    const { data: aps } = await sb.from("autopilot").select("client_id, enabled, post_time, warning");
    const apOf = (id) => (aps ?? []).find(x => x.client_id === id);
    const rows = S.clients.map(c => {
      const cp = S.posts.filter(p => p.client_id === c.id);
      const n7 = cp.filter(p => p.status === "programmato" && romeDay(p.scheduled_at) >= today && romeDay(p.scheduled_at) <= in7).length;
      const pubM = cp.filter(p => p.status === "pubblicato" && romeDay(p.scheduled_at).startsWith(monthKey)).length;
      const err = cp.filter(p => p.status === "errore").length;
      const ap = apOf(c.id);
      const left = S.assets.filter(a => a.client_id === c.id && a.kind === "immagine" && !a.used_at).length;
      const accs = S.accounts.filter(a => a.client_id === c.id);
      const conn = !accs.length ? `<span class="note">non collegato</span>` : accs.some(a => a.token_ok === false) ? `<span class="bad">scaduto</span>` : "ok";
      const apTxt = ap?.enabled ? `attivo, ore ${esc(ap.post_time)} · ${left} grafiche${left < 5 ? ' <span class="bad">quasi finite</span>' : ""}` : `<span class="note">spento</span>`;
      return `<tr class="hm-click" data-client="${c.id}"><td><span class="dot" style="background:${esc(c.color)}"></span> ${esc(c.name)}</td>
        <td class="num">${n7}</td><td class="num">${pubM}</td><td class="num">${err ? `<span class="bad">${err}</span>` : 0}</td>
        <td>${conn}</td><td>${apTxt}${ap?.warning ? `<br><span class="bad">${esc(ap.warning)}</span>` : ""}</td></tr>`;
    }).join("");

    h += `<div class="hm-two">
      <div class="card"><h3>Prossimi post</h3>${list}</div>
      <div class="card"><h3>Clienti</h3>
        <table><tr><th>Cliente</th><th class="num">7 gg</th><th class="num">Pubbl. mese</th><th class="num">Errori</th><th>Meta</th><th>Pilota</th></tr>${rows || `<tr><td colspan="6" class="note">Nessun cliente.</td></tr>`}</table>
        <p class="note">Clicca un cliente per aprire il suo calendario.</p></div>
    </div>
    <div class="card" style="margin-top:16px"><h3>In arrivo nella dashboard</h3>
      <div class="hm-soon">
        <div><b>Contratti</b>post previsti e post fatti per cliente</div>
        <div><b>Scadenze</b>siti, domini e pagamenti</div>
        <div><b>Fatture</b>da emettere ogni mese</div>
        <div><b>Lavori</b>il registro condiviso con Nico</div>
      </div></div>`;

    if (S.view !== "home") return; // l'utente ha cambiato vista mentre caricavo
    $("view").innerHTML = h;
    document.querySelectorAll("[data-post]").forEach(el => el.onclick = () => openEditor(S.posts.find(p => p.id === el.dataset.post)));
    document.querySelectorAll("[data-client]").forEach(el => el.onclick = () => goClient(el.dataset.client, "calendario"));
    document.querySelectorAll("[data-go]").forEach(el => el.onclick = () => {
      const go = el.dataset.go;
      if (go === "errori") { const p = errors[0]; if (p) S.client = p.client_id; S.listStatus = "errore"; S.view = "elenco"; render(); return; }
      const first = go === "approvazioni" ? toApprove[0] : go === "commenti" ? S.comments[0] : null;
      if (first) S.client = first.client_id;
      S.view = go; S.checked.clear(); render();
    });
  }

  const orig = render;
  render = function () {
    orig();
    document.body.classList.toggle("hm-on", S.view === "home");
    if (S.view === "home") vHome().catch(e => toast(e.message));
  };
  // se il pannello ha già caricato i dati prima di questo file, ridisegno subito sulla Home
  if (S.me && !document.getElementById("app").hidden) render();
})();
