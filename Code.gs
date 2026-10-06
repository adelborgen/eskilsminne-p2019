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
  SPARR_MINUTER: 10       // ... under så här många minuter
};

var FLIK = "Beställningar";
var OVERSIKT = "Översikt";
var RUBRIKER = ["Tid", "Order-ID", "Lag", "Barn", "Mobil", "Antal", "Belopp", "Betald"];
var COL = { ANTAL: 6, BETALD: 8 }; // 1-baserade kolumner i RUBRIKER

/* ---------- Kör en gång från redigeraren ---------- */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(FLIK) || ss.insertSheet(FLIK);
  if (sh.getLastRow() === 0) sh.appendRow(RUBRIKER);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, RUBRIKER.length).setFontWeight("bold");
  sh.getRange("E:E").setNumberFormat("@");
  sh.getRange(2, COL.BETALD, sh.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(["JA", "AVBRUTEN"], true).setAllowInvalid(false).build());

  var ov = ss.getSheetByName(OVERSIKT) || ss.insertSheet(OVERSIKT);
  ov.clear();
  var B = "'" + FLIK + "'!";
  var rader = [
    ["Beställt (kakor)", "=SUMIF(" + B + "H2:H,\"<>AVBRUTEN\"," + B + "F2:F)"],
    ["Betalt (kakor)", "=SUMIF(" + B + "H2:H,\"JA\"," + B + "F2:F)"],
    ["Betalt (kr)", "=SUMIF(" + B + "H2:H,\"JA\"," + B + "G2:G)"],
    ["Minimum till Marabou", CFG.MINIMUM],
    ["Minimum nått?", "=IF(B1>=B4,\"JA\",\"NEJ, \"&(B4-B1)&\" kvar\")"],
    ["Kartonger att beställa (à " + CFG.KARTONG + ")", "=CEILING(B1/" + CFG.KARTONG + ",1)"],
    ["Kakor i kartongerna", "=B6*" + CFG.KARTONG],
    ["Beräknad faktura Marabou (kr)", "=B7*" + CFG.INKOPSPRIS],
    ["Betalt minus faktura (kr)", "=B3-B8"]
  ];
  ov.getRange(1, 1, rader.length, 2).setValues(rader);
  ov.getRange(1, 1, rader.length, 1).setFontWeight("bold");
  ov.autoResizeColumn(1);
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
  if (!(antal >= 1 && antal <= CFG.MAX_ANTAL && antal % 1 === 0)) return json({ ok: false, fel: "Välj mellan 1 och " + CFG.MAX_ANTAL + " kakor." });
  if (d.samtycke !== true) return json({ ok: false, fel: "Du behöver godkänna för att kunna beställa." });

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
    sh.appendRow([new Date(), id, lag, barn, "'" + mobil, antal, belopp, ""]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  cache.put(nyckel, String(tidigare + 1), CFG.SPARR_MINUTER * 60);

  try {
    telegram("🍫 Ny beställning " + id + " (" + lag + ")\n" + barn + ": " + antal + " st = " + belopp + " kr\n" +
             "Totalt beställt: " + raknaBestallt(lag) + " kakor");
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

function normalizeMobil(s) {
  s = String(s || "").replace(/[\s\-().]/g, "");
  if (s.indexOf("+46") === 0) s = "0" + s.slice(3); else if (s.indexOf("0046") === 0) s = "0" + s.slice(4);
  return s;
}

function telegram(text) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("TELEGRAM_BOT_TOKEN"), chat = props.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chat) throw new Error("TELEGRAM_BOT_TOKEN eller TELEGRAM_CHAT_ID saknas i Skriptegenskaper.");
  var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post", payload: { chat_id: chat, text: text }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error("Telegram svarade " + res.getResponseCode() + ": " + res.getContentText());
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
