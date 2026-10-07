# Eskilsminne försäljning (P2019): ett formulär, två mätare, Swish

En enkel sida med tre flikar: **Beställ** (öppnas först), **Översikt** och **Vanliga frågor**. Föräldern väljer antal kakor, beställer och får en bekräftelse med Swish-instruktioner. Under Översikt visas två mätare för hela laget (de hämtas i bakgrunden när sidan laddas):

1. **Beställt**: antal kakor mot målet 300. Beställs 300 eller fler blir det en överraskning för barnen på sista träningen före jul, och det står i mätaren.
2. **Direkt till lagkassan**: 30 kr − 14,50 kr = 15,50 kr per kaka, summerat.

Minimum 240 (vad vi behöver för att kunna beställa från Marabou) nämns bara i en fråga under Vanliga frågor, inte i mätare, formulär eller kvitto.

Tre delar, alla gratis:

- **index.html**: sidan föräldrarna ser.
- **Code.gs**: Google Apps Script som tar emot beställningen, räknar ut beloppet, sparar den i ett kalkylark och skickar ett meddelande till Telegram.
- **Hosting**: GitHub Pages direkt från det här repot (se steg 4), eller Netlify Drop / Cloudflare Pages.

Tid: ca 30 minuter första gången.

**Repot är publikt.** Allt som checkas in här kan läsas av alla, även historiken. Lägg aldrig in Telegram-token, kalkylarkets adress eller beställningsdata här. Token och chat-id ligger bara i Apps Scripts Skriptegenskaper. Swish-numret i `index.html` syns här och på sidan.

## 1. Kalkylark + Apps Script

1. Skapa ett nytt Google Kalkylark, till exempel "Beställningar P2019".
2. **Tillägg → Apps Script**. Ta bort befintlig kod, klistra in hela `Code.gs` och spara.
3. Välj funktionen `setup` och tryck **Kör**. Godkänn behörigheterna. Flikarna *Beställningar* och *Översikt* skapas.

## 2. Telegram-bot

1. I Telegram: sök **@BotFather**, skriv `/newbot`, kopiera **token**.
2. Skapa en grupp för tränarna, lägg till boten och skriv ett meddelande.
3. Öppna `https://api.telegram.org/bot<DIN_TOKEN>/getUpdates` i webbläsaren och leta upp `"chat":{"id":-123...}`. Det negativa numret är **chat-id**.
4. I Apps Script: **Projektinställningar → Skriptegenskaper**, lägg till `TELEGRAM_BOT_TOKEN` och `TELEGRAM_CHAT_ID`.
5. Kör `testTelegram`. Meddelandet ska dyka upp i gruppen.

Dela aldrig token i chatten eller i koden. Läcker den: `/revoke` hos BotFather.

## 3. Publicera som webbapp

1. **Implementera → Ny implementering → Webbapp**. *Kör som:* **Jag**. *Vem har åtkomst:* **Alla** (inte "Alla med Google-konto": då stoppas beställningarna och sidan säger "Det gick inte att skicka just nu"). Testa adressen + `?action=status&lag=P2019` i ett inkognitofönster. Svaret ska vara `{"ok":true,"bestallt":0}`, inte en inloggningssida.
2. Kopiera webbappens URL (slutar på `/exec`).
3. **Efter varje ändring i Code.gs:** Implementera → Hantera implementeringar → pennan → Version: Ny version → Implementera.

Åtkomst "Alla" betyder att vem som helst med adressen kan skicka data. Därför räknar servern själv ut beloppet, kontrollerar allt (lag, antal, mobilnummer) och har honeypot, tidsspärr och spärr per mobilnummer.

## 4. Fyll i och lägg ut sidan

Öppna `index.html` och ändra i rutan `CONFIG` högst upp:

| Inställning | Värde |
|---|---|
| `endpoint` | URL:en från steg 3 |
| `swish.nummer` | Swish-numret som pengarna ska till (nu Andreas Adelborgs nummer, se nedan) |
| `swish.namnPaKonto` | Valfritt: mottagarens namn, så föräldern ser att det stämmer |
| `swish.meddelande` | Förifylld text i Swish, följd av ordernumret. Nu: `Eskils 2019 försäljning` |
| `pris`, `inkopspris`, `minimum`, `mal` | 30, 14,5, 240, 300 |
| `belonning` | Texten om vad som händer vid 300 (`{mal}` fylls i automatiskt) |
| `faq` | Frågorna och svaren. `{pris}`, `{mal}` och `{minimum}` fylls i automatiskt |

Samma värden finns i `CFG` överst i Code.gs (`PRIS`, `INKOPSPRIS`, `MINIMUM`, `MAX_ANTAL`, `ALLOWED_LAG`). Ändrar ni i det ena, ändra i det andra.

**Publicera med GitHub Pages:** i repot, **Settings → Pages → Build and deployment**, välj *Deploy from a branch*, gren `main`, mapp `/ (root)`, och spara. Efter någon minut ligger sidan på `https://adelborgen.github.io/eskilsminne-p2019/`. Varje ändring som hamnar på `main` publiceras automatiskt. (Alternativ: dra mappen till Netlify Drop, app.netlify.com/drop.)

Gör en testbeställning och radera testraden i arket.

## Hantera betalningar

- Varje beställning blir en rad i *Beställningar* med Order-ID (löpnummer 0001, 0002 …), antal och belopp.
- Swish-meddelandet blir `Eskils 2019 försäljning <Order-ID>`. Kassören matchar på Order-ID och sätter kolumnen **Betald** till `JA`.
- Sätt `AVBRUTEN` i samma kolumn för en beställning som ska bort. Den räknas då inte i mätaren.
- **Via Telegram:** kör `startaTelegramKoll` en gång i Apps Script. Därefter har varje ny beställning knappen **✅ Markera betald**, och du kan skriva till boten: `betald 0001`, `avbruten 0001`, `ångra 0001` eller `status` (visar obetalda). Skriptet läser Telegram en gång i minuten, så svaret kan dröja upp till en minut. Bara meddelanden från `TELEGRAM_CHAT_ID` räknas. `stoppaTelegramKoll` stänger av det.
- Mätaren visar **beställda** kakor, inte bara betalda, så den rör sig direkt.
- Fliken *Översikt* räknar beställt, betalt, kartonger att beställa (à 24), beräknad faktura till Marabou och betalt minus faktura.

## Innan ni går live: besluta

0. **Belöningen vid 300.** Beslutat: beställs 300 eller fler blir det en mindre överraskning för barnen på sista träningen före jul. Vid 300 kakor kommer 4 650 kr in direkt till lagkassan. Texten finns i `belonning`, i FAQ-frågan "Vad händer om vi når 300 kakor?" och i mätaren.

1. **Swish-nummer.** Andreas Adelborg tar emot betalningarna på sitt privata nummer 073 028 18 22. Mottagarens namn visas i bekräftelsen så att föräldrarna känner igen det i Swish. Byt till klubbens eget nummer om ett sådant kommer (`swish.nummer` och `swish.namnPaKonto` i `CONFIG`).
2. **Återbetalning.** Beslutat: nås inte 240 betalar Andreas Adelborg tillbaka varje Swish. Det står på sidan och i Vanliga frågor.
3. **Inköpspriset 14,50 kr.** Bekräftat: 14,50 kr per kaka inklusive moms och frakt. Mätaren för lagkassan räknar på det (15,50 kr per kaka till laget).
4. **Kartonger.** Marabou levererar i kartonger om 24. Minimum 240 är 10 kartonger. 300 kakor blir 12,5, alltså 13 kartonger (312 kakor).
5. **Personuppgifter.** Sidan samlar barnets förnamn och ett mobilnummer. Klubben är personuppgiftsansvarig, så stäm av med dem vem som får se arket.
6. **Ingen "Öppna Swish"-knapp.** Vi testade sex länkformat på iPhone (`https://app.swish.nu/1/p/sw/…` som i Swish QR-koder, `intent://` och tre varianter av `swish://payment?data=…`). Alla gav "Felaktig länk" eller öppnade inte appen, så knappen är borttagen. Föräldrarna kopierar nummer, belopp och meddelande med kopiera-knapparna. Testsidan ligger kvar i `swish-test.html` om någon vill prova igen.

## Färger och logga

- Blått `#174297` och gult `#faeb1e` kommer från en tredjepartssida som samlar klubbloggor, inte från klubben. Bekräfta mot klubbens grafiska profil. Byts i början av `<style>` (`--brand`, `--yellow`).
- Loggan är klubbens varumärke och är inte inlagd. Be klubben om en fil och skriv filnamnet i `CONFIG.logo`.

## Nästa årskull

Kopiera mappen (eller gör ett nytt repo från det här), byt `lag`, `swish` och `ALLOWED_LAG`, och skapa ett eget kalkylark och en egen Telegram-grupp.

## Flera lag

En prototyp för en klubbsida med laglista, adminvy för lagens kassörer och ett Swish-nummer per lag ligger i mappen `klubb/`. Pengarna går direkt till lagets eget nummer och systemet rör aldrig pengar. Se `klubb/README.md`. Sidan som ligger ute, `index.html` och `Code.gs` i roten, påverkas inte.

## Arbeta i GitHub

- `main` är det som ligger ute (om GitHub Pages används). Ändra gärna i en egen gren och slå ihop via en pull request, så att en annan förälder eller tränare kan titta först.
- Ändringar i `Code.gs` här uppdaterar **inte** Apps Script. Klistra in filen i Apps Script och gör en ny version av distributionen (steg 3).
