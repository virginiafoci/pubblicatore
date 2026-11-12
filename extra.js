// Pubblicatore - modulo PILOTA AUTOMATICO (si aggancia alla vista Libreria)
(function () {
  const RUB_DEFAULT = ["Consiglio ai genitori", "Aulì racconta", "Domanda della settimana", "Dietro le quinte", "Idea per Natale"];
  async function pilotCard() {
    if (!S.client) return;
    const { data: ap } = await sb.from("autopilot").select("*").eq("client_id", S.client).maybeSingle();
    const accs = S.accounts.filter(a => a.client_id === S.client);
    const left = S.assets.filter(a => a.client_id === S.client && a.kind === "immagine" && !a.used_at).length;
    const v = ap ?? { enabled: false, account_id: accs[0]?.id, post_time: "09:30", mode: "programmato", rubriche: RUB_DEFAULT, to_facebook: true, to_instagram: true };
    const box = document.createElement("div");
    box.className = "card"; box.style.marginBottom = "16px";
    box.innerHTML = `<h3>🤖 Pilota automatico · ${esc(clientOf(S.client)?.name ?? "")}</h3>
      <p class="note">Ogni sera il server prende la prossima grafica <b>non ancora usata</b> di questa libreria, scrive la didascalia con l'AI (tono di voce del cliente + rubrica del giorno) e programma il post per il giorno dopo. Grafiche ancora da usare: <b>${left}</b>.</p>
      ${ap?.warning ? `<div class="banner">${esc(ap.warning)}</div>` : ""}
      <div class="row">
        <label style="margin:0"><input type="checkbox" id="apOn" ${v.enabled ? "checked" : ""}> <b>Attivo</b></label>
        <select id="apAcc" style="width:auto">${accs.map(a => `<option value="${a.id}" ${a.id === v.account_id ? "selected" : ""}>${esc(a.page_name)}${a.ig_username ? " + @" + esc(a.ig_username) : ""}</option>`).join("")}</select>
        <span class="note">ore</span><input id="apTime" type="time" value="${esc(v.post_time)}" style="width:auto">
        <select id="apMode" style="width:auto"><option value="programmato" ${v.mode === "programmato" ? "selected" : ""}>esce da solo</option><option value="da_approvare" ${v.mode === "da_approvare" ? "selected" : ""}>prima lo approvo io</option></select>
        <label style="margin:0"><input type="checkbox" id="apFb" ${v.to_facebook ? "checked" : ""}> Facebook</label>
        <label style="margin:0"><input type="checkbox" id="apIg" ${v.to_instagram ? "checked" : ""}> Instagram</label>
      </div>
      <label>Rubriche a rotazione (una per riga)</label>
      <textarea id="apRub" style="min-height:90px">${esc((v.rubriche ?? []).join("\n"))}</textarea>
      <p class="row"><button class="primary" id="apSave">Salva</button><button id="apNow">Prepara subito il post di domani</button>
      <span class="note">${ap?.last_run ? `Ultimo giro: ${esc(ap.last_run)}` : ""}</span></p>`;
    const view = document.getElementById("view");
    view.prepend(box);
    const save = async () => {
      const row = { client_id: S.client, enabled: $("apOn").checked, account_id: $("apAcc").value || null, post_time: $("apTime").value || "09:30",
        mode: $("apMode").value, to_facebook: $("apFb").checked, to_instagram: $("apIg").checked,
        rubriche: $("apRub").value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 30), updated_at: new Date().toISOString() };
      const { error } = await sb.from("autopilot").upsert(row);
      if (error) { toast(error.message); return false; }
      toast(row.enabled ? "Pilota automatico attivo" : "Pilota automatico spento"); return true;
    };
    $("apSave").onclick = save;
    $("apNow").onclick = async () => {
      if (!(await save())) return;
      $("apNow").disabled = true; toast("Preparo il post…");
      try { const r = await fn("autopilota", { client_id: S.client }); toast(Object.values(r.report ?? {})[0] ?? "Fatto"); await loadAll(); }
      catch (e) { toast(e.message); $("apNow").disabled = false; }
    };
  }
  const orig = vLibrary;
  vLibrary = function () { orig(); pilotCard(); };
})();
