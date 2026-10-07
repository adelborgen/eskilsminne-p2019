# Klubbsidan: flera lag, ett Swish-nummer per lag (prototyp)

En klubbsida där föräldern först väljer lag i en lista och sedan beställer, precis som på den publicerade P2019-sidan. **Mappen är en prototyp. Rotens `index.html` (P2019-sidan som ligger ute) är inte ändrad.**

## Principen

- **Pengarna går direkt till lagets eget Swish-nummer.** Sidan tar aldrig emot en betalning.
- **Sidan sparar ingen beställningsdata.** Varje lag har sitt eget kalkylark, sitt eget Apps Script och sin egen Telegram-grupp, enligt steg 1–3 i `../README.md`. Föräldrarnas namn och mobilnummer ligger därför hos lagets kassör.
- **Det enda som är gemensamt är listan över lag** och beställningssidan som läser lagets inställningar.

## Filer

| Fil | Innehåll |
|---|---|
| `index.html` | Skalet. `?lag=p2019` visar ett lag, utan `?lag` visas listan. |
| `lag.js` | **Laglistan.** Klubbens standardvärden (`KLUBB.standard`) och ett block per lag (`LAG`). Här läggs lag till. |
| `app.js` | Listan, routern och beställningssidan (samma som `../index.html`, men styrd av lagets inställningar). Behöver inte ändras när ett lag läggs till. |
| `style.css` | Utseendet. Samma som `../index.html` plus lagkort. |
| `nytt-lag.html` | Hjälp för kassören: fyll i uppgifter, få färdiga rader till `lag.js` och till lagets `Code.gs`. Inget skickas. |

## Lägg till ett lag

1. Öppna `nytt-lag.html`, fyll i lagets namn, Swish-nummer, pris med mera. Du får två textbitar.
2. Lagets kassör gör steg 1–3 i `../README.md` (kalkylark, Telegram, webbapp) och klistrar in raderna för `Code.gs` (`PRIS`, `INKOPSPRIS`, `MINIMUM`, `ALLOWED_LAG`). Kassören skickar webbapp-adressen (slutar på `/exec`).
3. Lägg blocket i listan `LAG` i `lag.js` och fyll i `endpoint`. Gör det gärna via en pull request så att någon kan titta först.

Ett lag kan sälja något annat än kakor. Skriv över `produkt`, `pris`, `intro`, `faq` med mera i lagets block (se P2018 i `lag.js`). `status: "snart"` visar laget i listan utan att det går att öppna. Utan `endpoint` körs laget i demoläge och inget skickas.

## Prova

Öppna `klubb/index.html` i webbläsaren, eller kör `python3 -m http.server` i repots rot och gå till `http://localhost:8000/klubb/`.

P2019 i listan använder **samma endpoint och Swish-nummer som den publicerade sidan**, så en beställning via `klubb/?lag=p2019` hamnar i det riktiga arket. Radera testraden efteråt. De andra lagen (F2017, P2018, F2016) är exempel utan endpoint, märkta "Exempel" i listan, och skickar ingenting.

## Publicera

- **Som mapp i det här repot:** när grenen slås ihop med `main` ligger sidan på `https://adelborgen.github.io/eskilsminne-p2019/klubb/`. P2019-sidan i roten ligger kvar oförändrad.
- **Med egen domän:** lägg mappens innehåll i roten av ett nytt repo (gärna under en GitHub-organisation), slå på Pages och ange domänen under *Settings → Pages → Custom domain* med en CNAME-post hos registratorn.
- När försäljningen för P2019 är klar kan rotens `index.html` ersättas med en omdirigering till `klubb/?lag=p2019`, så att de gamla länkarna fortsätter fungera.

## Vad som är prototyp

- Ingen inloggning och ingen adminvy. Hanteringen sker i lagets eget kalkylark och Telegram-grupp.
- Betalningar matchas fortfarande för hand (Order-ID i Swish-meddelandet). Automatisk matchning kräver Swish Handel med API eller en betalleverantör.
- `lag.js` och alla endpoints är publika, eftersom repot är publikt.
- Beställningskoden finns i två exemplar (`../index.html` och `app.js`) tills P2019 har flyttats hit.

## Att bestämma innan ni går live

1. **Namn.** "Lagförsäljning" är en platshållare. Välj ett namn som inte krockar med någon annan tjänst (kolla domän och varumärke).
2. **Klubbens godkännande** för namn, logga och färger. Färgerna är de som redan används på P2019-sidan (se `../README.md`).
3. **Eget Swish-nummer per lag**, helst Swish Handel via föreningens bank, inte ett privat nummer.
4. **Vem betalar tillbaka** om minimum inte nås. Idag gör Andreas Adelborg det personligen för P2019.
5. **Personuppgifter.** Klubben är personuppgiftsansvarig. Stäm av med klubben vem som får se varje lags kalkylark.
6. **Ta bort exempellagen** (`demo: true`) ur `lag.js`.
