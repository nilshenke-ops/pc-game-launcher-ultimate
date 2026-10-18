// Runs the launcher's own diagnosis ("diagnostics.run") and summarises it. Nothing is changed on the PC.
const $ = (id) => document.getElementById(id);

async function run() {
  $("run").disabled = true; $("err").textContent = ""; $("summary").textContent = "Prüfe …";
  try {
    const r = await pgl.call("diagnostics.run");
    const count = (st) => r.checks.filter((c) => c.status === st).length;
    const err = count("error"), warn = count("warn");
    $("dot").className = "dot " + (err ? "error" : warn ? "warn" : "ok");
    $("summary").textContent = err || warn ? `${err} Fehler, ${warn} Warnungen` : `Alles in Ordnung (${count("ok")} Prüfungen)`;
    $("at").textContent = `Geprüft ${new Date(r.at).toLocaleTimeString()}`;
    const order = { error: 0, warn: 1 };
    $("list").replaceChildren(...r.checks.filter((c) => c.status in order).sort((a, b) => order[a.status] - order[b.status]).slice(0, 6).map((c) => {
      const li = document.createElement("li");
      li.title = c.fix || c.detail;
      li.append(Object.assign(document.createElement("b"), { textContent: c.status === "error" ? "✖" : "⚠" }), `${c.label}: ${c.detail}`);
      return li;
    }));
    if (err) pgl.notify(`PC-Check: ${err} Fehler gefunden – Details unter „Diagnose“.`);
  } catch (e) { $("summary").textContent = "Prüfung nicht möglich"; $("err").textContent = e.message; }
  $("run").disabled = false;
}

$("run").onclick = run;
