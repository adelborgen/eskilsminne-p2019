/* ==========================================================================
   Eskilsminne försäljning: Google Apps Script (se README.md)
   Samma värden som CONFIG i index.html. Ändrar ni i det ena, ändra i det andra.
   Telegram-token och chat-id läggs i Skriptegenskaper, aldrig här.
   ========================================================================== */
var CFG = {
  PRIS: 30,               // kr per kaka som föräldern swishar
  INKOPSPRIS: 14.5,       // kr per kaka till Marabou
  MINIMUM: 240,           // minsta beställning till Marabou
  KARTONG: 24,            // kakor per kartong
  MAX_ANTAL: 50,          // största antal per beställning (samma som maxAntal)
  ALLOWED_LAG: ["P2019"], // lag som får beställa (samma som lag)
  MIN_TID_MS: 3000,       // snabbare än så från att sidan laddats = robot
  MAX_PER_MOBIL: 5,       // högst så många beställningar per mobilnummer ...
  SPARR_MINUTER: 10,      // ... under så här många minuter
  // Påhittade nummer som inte tas emot (exempelnumret på sidan m.fl.).
  // Nummer som bara är samma siffra efter 07 (t.ex. 0700000000) spärras också.
  SPARRADE_NUMMER: ["0701234567", "0712345678", "0731234567", "0761234567", "0721234567"]
};

var FLIK = "Beställningar";
var OVERSIKT = "Översikt";
var RUBRIKER = ["Tid", "Order-ID", "Lag", "Barn", "Mobil", "Antal", "Belopp", "Betald"];
var COL = { ANTAL: 6, BETALD: 8 }; // 1-baserade kolumner i RUBRIKER

/* ---------- Kör en gång från redigeraren ---------- */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(FLIK) || ss.insertSheet(FLIK);
  // Rubrikraden måste ligga på rad 1. Saknas den läggs den in ovanför befintliga rader.
  if (sh.getRange(1, 1).getValue() !== RUBRIKER[0]) {
    if (sh.getLastRow() > 0) sh.insertRowBefore(1);
    sh.getRange(1, 1, 1, RUBRIKER.length).setValues([RUBRIKER]);
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, RUBRIKER.length).setFontWeight("bold");
  sh.getRange("B:B").setNumberFormat("@");
  sh.getRange("E:E").setNumberFormat("@");
  sh.getRange(2, COL.BETALD, sh.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(["JA", "AVBRUTEN"], true).setAllowInvalid(false).build());

  uppdateraOversikt();
}

// Översikten räknas här i skriptet i stället för med formler, så att den fungerar
// oavsett arkets språk (svenska ark vill ha semikolon i formler, engelska komma).
// Uppdateras vid varje beställning, när någon ändrar i arket och vid Telegram-kommandon.
function uppdateraOversikt() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(FLIK);
  var rows = sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, RUBRIKER.length).getValues() : [];
  var bestallt = 0, betalt = 0, betaltKr = 0;
  rows.forEach(function (r) {
    var b = String(r[COL.BETALD - 1]).toUpperCase(), n = Number(r[COL.ANTAL - 1]) || 0;
    if (b === "AVBRUTEN") return;
    bestallt += n;
    if (b === "JA") { betalt += n; betaltKr += Number(r[6]) || 0; }
  });
  var kartonger = Math.ceil(bestallt / CFG.KARTONG);
  var faktura = kartonger * CFG.KARTONG * CFG.INKOPSPRIS;
  var rader = [
    ["Beställt (kakor)", bestallt],
    ["Betalt (kakor)", betalt],
    ["Betalt (kr)", betaltKr],
    ["Minimum till Marabou", CFG.MINIMUM],
    ["Minimum nått?", bestallt >= CFG.MINIMUM ? "JA" : "NEJ, " + (CFG.MINIMUM - bestallt) + " kvar"],
    ["Kartonger att beställa (à " + CFG.KARTONG + ")", kartonger],
    ["Kakor i kartongerna", kartonger * CFG.KARTONG],
    ["Beräknad faktura Marabou (kr)", faktura],
    ["Betalt minus faktura (kr)", betaltKr - faktura],
    ["Uppdaterad", new Date()]
  ];
  var ov = ss.getSheetByName(OVERSIKT) || ss.insertSheet(OVERSIKT);
  ov.clear();
  ov.getRange(1, 1, rader.length, 2).setValues(rader);
  ov.getRange(1, 1, rader.length, 1).setFontWeight("bold");
  ov.autoResizeColumn(1);
}

// Körs automatiskt när någon ändrar i arket för hand, till exempel skriver JA under Betald.
function onEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === FLIK) uppdateraOversikt();
}

function testTelegram() {
  telegram("Test från beställningssidan " + CFG.ALLOWED_LAG.join(", ") + ". Fungerar!");
}

/* ---------- Webbapp ---------- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === "status") {
    if (CFG.ALLOWED_LAG.indexOf(p.lag) < 0) return json({ ok: false, fel: "Okänt lag." });
    return json({ ok: true, bestallt: raknaBestallt(p.lag) });
  }
  return json({ ok: false, fel: "Okänd förfrågan." });
}

function doPost(e) {
  try {
    return hanteraBestallning(e);
  } catch (err) {
    console.error(err);
    return json({ ok: false, fel: "Tekniskt fel: " + (err && err.message ? err.message : err) + ". Hör av dig i lagets WhatsApp-grupp." });
  }
}

function hanteraBestallning(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, fel: "Felaktig förfrågan." }); }

  // Honeypot: låtsas att det gick bra, spara inget.
  if (d.website) return json({ ok: true, id: "0000", belopp: 0 });
  if (typeof d.t !== "number" || d.t < CFG.MIN_TID_MS) return json({ ok: false, fel: "Vänta några sekunder och försök igen." });

  var lag = String(d.lag || "");
  var barn = String(d.barn || "").trim();
  var mobil = normalizeMobil(d.mobil);
  var antal = Number(d.antal);
  if (CFG.ALLOWED_LAG.indexOf(lag) < 0) return json({ ok: false, fel: "Okänt lag." });
  if (!/^[\p{L}][\p{L} '\-.]{1,39}$/u.test(barn)) return json({ ok: false, fel: "Skriv barnets namn (2–40 tecken)." });
  if (!/^07\d{8}$/.test(mobil)) return json({ ok: false, fel: "Skriv ett svenskt mobilnummer, till exempel 070 123 45 67." });
  if (CFG.SPARRADE_NUMMER.indexOf(mobil) >= 0 || /^07(\d)\1{7}$/.test(mobil))
    return json({ ok: false, fel: "Skriv ditt eget mobilnummer, så att vi kan nå dig om beställningen." });
  if (!(antal >= 1 && antal <= CFG.MAX_ANTAL && antal % 1 === 0)) return json({ ok: false, fel: "Välj mellan 1 och " + CFG.MAX_ANTAL + " kakor." });
  if (d.samtycke !== true) return json({ ok: false, fel: "Du behöver godkänna för att kunna beställa." });

  // Har samma mobilnummer redan beställt? Fråga först, beställ bara om föräldern bekräftar.
  if (d.bekraftaDubblett !== true) {
    var tidigare = tidigareBestallningar(mobil, lag);
    if (tidigare.length) return json({ ok: false, dubblett: true, tidigare: tidigare });
  }

  // Spärr per mobilnummer
  var cache = CacheService.getScriptCache();
  var nyckel = "m" + mobil;
  var tidigare = Number(cache.get(nyckel) || 0);
  if (tidigare >= CFG.MAX_PER_MOBIL) return json({ ok: false, fel: "Många beställningar på kort tid. Vänta en stund eller skriv i lagets WhatsApp-grupp." });

  var belopp = antal * CFG.PRIS; // räknas alltid här, aldrig från sidan
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return json({ ok: false, fel: "Många beställer just nu. Försök igen om en stund." }); }
  var id;
  try {
    var props = PropertiesService.getScriptProperties();
    var nr = Number(props.getProperty("NASTA_ORDER") || 1);
    props.setProperty("NASTA_ORDER", String(nr + 1));
    id = ("000" + nr).slice(-4);
    var sh = SpreadsheetApp.getActive().getSheetByName(FLIK);
    if (!sh || sh.getRange(1, 1).getValue() !== RUBRIKER[0]) { setup(); sh = SpreadsheetApp.getActive().getSheetByName(FLIK); }
    sh.appendRow([new Date(), "'" + id, lag, barn, "'" + mobil, antal, belopp, ""]);
    SpreadsheetApp.flush();
    uppdateraOversikt();
  } finally {
    lock.releaseLock();
  }
  cache.put(nyckel, String(tidigare + 1), CFG.SPARR_MINUTER * 60);

  try {
    telegram("🍫 Ny beställning " + id + " (" + lag + ")\n" + barn + ": " + antal + " st = " + belopp + " kr\n" +
             "Totalt beställt: " + raknaBestallt(lag) + " kakor",
             { inline_keyboard: [[{ text: "✅ Markera betald", callback_data: "betald:" + id }]] });
  } catch (err) { /* beställningen är sparad även om Telegram inte svarar */ }

  return json({ ok: true, id: id, belopp: belopp });
}

/* ---------- Hjälpfunktioner ---------- */
function raknaBestallt(lag) {
  var sh = SpreadsheetApp.getActive().getSheetByName(FLIK);
  if (!sh || sh.getLastRow() < 2) return 0;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, RUBRIKER.length).getValues();
  var sum = 0;
  rows.forEach(function (r) {
    if (r[2] === lag && String(r[COL.BETALD - 1]).toUpperCase() !== "AVBRUTEN") sum += Number(r[COL.ANTAL - 1]) || 0;
  });
  return sum;
}

// Aktiva beställningar (inte AVBRUTEN) från ett mobilnummer. Bara ordernummer och antal
// skickas tillbaka, inga namn, så att ingen kan slå upp andras uppgifter.
function tidigareBestallningar(mobil, lag) {
  var sh = SpreadsheetApp.getActive().getSheetByName(FLIK);
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, RUBRIKER.length).getValues();
  var ut = [];
  rows.forEach(function (r) {
    if (String(r[4]).replace(/^'/, "") === mobil && r[2] === lag && String(r[COL.BETALD - 1]).toUpperCase() !== "AVBRUTEN")
      ut.push({ id: ("000" + parseInt(r[1], 10)).slice(-4), antal: Number(r[COL.ANTAL - 1]) || 0 });
  });
  return ut;
}

function normalizeMobil(s) {
  s = String(s || "").replace(/[\s\-().]/g, "");
  if (s.indexOf("+46") === 0) s = "0" + s.slice(3); else if (s.indexOf("0046") === 0) s = "0" + s.slice(4);
  return s;
}

function telegram(text, knappar) {
  var payload = { chat_id: tg().chat, text: text };
  if (knappar) payload.reply_markup = JSON.stringify(knappar);
  return tgApi("sendMessage", payload);
}

function tg() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("TELEGRAM_BOT_TOKEN"), chat = props.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chat) throw new Error("TELEGRAM_BOT_TOKEN eller TELEGRAM_CHAT_ID saknas i Skriptegenskaper.");
  return { token: token, chat: String(chat).trim() };
}

function tgApi(metod, payload) {
  var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + tg().token + "/" + metod, {
    method: "post", payload: payload, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error("Telegram svarade " + res.getResponseCode() + ": " + res.getContentText());
  return JSON.parse(res.getContentText()).result;
}

/* ---------- Betalningar via Telegram ----------
   Kör startaTelegramKoll en gång från redigeraren. Sedan läser skriptet varje minut
   vad du har tryckt eller skrivit till boten:
     knappen "✅ Markera betald" under en beställning
     betald 0001     avbruten 0001     ångra 0001     status
   Bara meddelanden från TELEGRAM_CHAT_ID räknas. */
function startaTelegramKoll() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "kollaTelegram") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("kollaTelegram").timeBased().everyMinutes(1).create();
  telegram("Klart! Tryck på ✅ under en beställning, eller skriv till exempel \"betald 0001\", \"avbruten 0001\", \"ångra 0001\" eller \"status\".");
}

function stoppaTelegramKoll() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "kollaTelegram") ScriptApp.deleteTrigger(t);
  });
}

function kollaTelegram() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var offset = Number(props.getProperty("TG_OFFSET") || 0);
    var chat = tg().chat;
    var updates = tgApi("getUpdates", { offset: String(offset), timeout: "0", allowed_updates: JSON.stringify(["message", "callback_query"]) });
    if (!updates.length) return;
    // Kvittera direkt hos Telegram, innan något behandlas, så att samma meddelande
    // aldrig kommer tillbaka nästa minut (även om något nedan skulle gå fel).
    var nasta = updates[updates.length - 1].update_id + 1;
    props.setProperty("TG_OFFSET", String(nasta));
    tgApi("getUpdates", { offset: String(nasta), limit: "1", timeout: "0" });
    // Extra skydd: hoppa över uppdateringar som redan har behandlats.
    var cache = CacheService.getScriptCache();
    updates.forEach(function (u) {
      var nyckel = "tg" + u.update_id;
      if (cache.get(nyckel)) return;
      cache.put(nyckel, "1", 21600);
      try {
        if (u.callback_query) {
          var cq = u.callback_query, m = cq.message;
          if (!m || String(m.chat.id) !== chat) return;
          var id = String(cq.data || "").replace(/^betald:/, "");
          var r = satStatus(id, "JA");
          tgApi("answerCallbackQuery", { callback_query_id: cq.id, text: r ? "Order " + r.id + " markerad som betald" : "Hittar inte order " + id });
          if (r) tgApi("editMessageText", { chat_id: chat, message_id: m.message_id, text: m.text + "\n\n✅ Betald" });
        } else if (u.message && u.message.text && String(u.message.chat.id) === chat) {
          telegram(svaraPaKommando(u.message.text));
        }
      } catch (err) { console.error(err); }
    });
  } finally {
    lock.releaseLock();
  }
}

function svaraPaKommando(text) {
  var t = String(text).trim().toLowerCase();
  var m = t.match(/^(betald|betalt|avbruten|avbryt|ångra|angra)\s+#?(\d+)$/);
  if (m) {
    var varde = /^betal/.test(m[1]) ? "JA" : /^avbr/.test(m[1]) ? "AVBRUTEN" : "";
    var r = satStatus(m[2], varde);
    if (!r) return "Hittar ingen order " + m[2] + ".";
    return "Order " + r.id + " (" + r.barn + ", " + r.antal + " st, " + r.belopp + " kr): " +
      (varde === "JA" ? "✅ betald" : varde === "AVBRUTEN" ? "❌ avbruten" : "↩️ obetald igen");
  }
  if (t === "status" || t === "/status") return statusText();
  return "Skriv till exempel \"betald 0001\", \"avbruten 0001\", \"ångra 0001\" eller \"status\".";
}

// Sätter kolumnen Betald för en order. Returnerar orderns uppgifter, eller null om den inte finns.
function satStatus(id, varde) {
  var nr = parseInt(id, 10);
  var sh = SpreadsheetApp.getActive().getSheetByName(FLIK);
  if (!sh || isNaN(nr) || sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, RUBRIKER.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (parseInt(rows[i][1], 10) === nr) {
      sh.getRange(i + 2, COL.BETALD).setValue(varde);
      uppdateraOversikt();
      return { id: ("000" + nr).slice(-4), barn: rows[i][3], antal: rows[i][COL.ANTAL - 1], belopp: rows[i][6] };
    }
  }
  return null;
}

function statusText() {
  var sh = SpreadsheetApp.getActive().getSheetByName(FLIK);
  var rows = sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, RUBRIKER.length).getValues() : [];
  var bestallt = 0, betalt = 0, obetalda = [];
  rows.forEach(function (r) {
    var b = String(r[COL.BETALD - 1]).toUpperCase(), n = Number(r[COL.ANTAL - 1]) || 0;
    if (b === "AVBRUTEN") return;
    bestallt += n;
    if (b === "JA") betalt += n;
    else obetalda.push(("000" + parseInt(r[1], 10)).slice(-4) + " " + r[3] + " (" + r[6] + " kr)");
  });
  return "Beställt: " + bestallt + " kakor\nBetalt: " + betalt + " kakor\n" +
    (obetalda.length ? "Obetalda:\n" + obetalda.join("\n") : "Alla är betalda 🎉");
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
