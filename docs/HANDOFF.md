# TapRig — handoff

Ten plik jest punktem startowym dla każdego agenta realizującego kolejny etap. Nie zakładaj
znajomości wcześniejszych rozmów — wszystko, czego potrzebujesz, jest w repozytorium.

## 1. Stan projektu

| Pole | Wartość |
| --- | --- |
| Ostatni ukończony etap | **E0** — eksploracja, audyt sieci, plan, handoff |
| Następny etap | **E1** — fundament forka i zabezpieczenia (bez zmian zachowania) |
| Repozytorium | `https://github.com/rtnk/TapRig` |
| Upstream | `https://github.com/callstack/agent-device` (remote `upstream`) |
| Commit bazowy (upstream `main`) | `3537dc549a5edb248f918990a137c536fc46ee50` — 2026-10-28, „fix(open): refuse --launch-console on a provider-owned device before the relaunch close (#3938)”; `git describe`: `nightly/v0.21.34-nightly.20261028.102-12-g3537dc549`; `package.json` → `0.21.34-dev` |
| Gałąź `main` w TapRig | = commit bazowy (czysty import historii upstream, bez zmian) |
| Gałąź Etapu 0 | `taprig/e0-audit-plan` (tylko dokumenty w `docs/`) |
| Zmiany w kodzie | **Brak.** E0 nie zmieniał zachowania narzędzia |

## 2. Wykonane działania (E0)

1. Repozytorium `rtnk/TapRig` było puste. Dodano remote `upstream`, pobrano pełną historię,
   `main` utworzono z `upstream/main` i wypchnięto do `origin` (bez tagów i gałęzi upstream).
2. Przeczytano `AGENTS.md`, `CONTEXT.md`, `docs/adr/*` (indeks), `package.json`,
   `tsdown.config.ts`, `pnpm-workspace.yaml`.
3. `pnpm install --frozen-lockfile` i `pnpm build` — sukces (build ~15 s).
4. Statyczny audyt komunikacji sieciowej (kod TS, natywny Swift/Java, skrypty, CI) —
   `docs/network-audit.md`.
5. Prototyp audytu dynamicznego (`unshare -n` + `strace`) — potwierdził NET-01 (update check)
   i NET-03 (`connect` → chmura); `runScript` HTTP działa offline.
6. `pnpm test:unit` w izolacji sieciowej — wyniki w §6.
7. Dokumenty: architektura, audyt, rejestr decyzji, plan, handoff.

## 3. Dokumenty

| Plik | Zawartość |
| --- | --- |
| `docs/architecture.md` | Architektura bazy: CLI, daemon, MCP, SDK, platformy, pluginy/providery, przepływ komendy |
| `docs/network-audit.md` | Tabela NET-01…NET-42, opisy mechanizmów, dowody, projekt kontroli statycznej i dynamicznej |
| `docs/taprig-decisions.md` | Rejestr decyzji D-01…D-19 ze statusami |
| `docs/taprig-implementation-plan.md` | Etapy E1…E11 z plikami, zadaniami, kryteriami, testami, ryzykami |
| `docs/HANDOFF.md` | Ten plik |

Dokumenty upstream (zasady pracy, które nadal obowiązują): `AGENTS.md`, `docs/agents/*.md`,
`docs/adr/*.md`, `CONTEXT.md`, `CONTRIBUTING.md`.

## 4. Kluczowe ustalenia

1. CLI, MCP (stdio) i SDK są klientami jednego lokalnego daemona, który słucha **tylko na
   `127.0.0.1`** z tokenem (`packages/daemon/src/server/http/transport.ts:150`).
2. **Update check** (NET-01): odłączony worker pobiera `registry.npmjs.org/agent-device/<tag>`
   co 14 dni przy większości komend CLI z TTY (`src/cli/update-check.ts:178`, `src/cli.ts:198`).
3. **`connect` bez argumentów** łączy się z chmurą `cloud.agent-device.dev` (device auth,
   otwarcie przeglądarki, profil połączenia) — `connect-provider-adapters.ts:128`,
   `src/cli/auth-session.ts`, `src/cli/connection/cloud-profile.ts`.
4. Providery chmurowe: BrowserStack i AWS Device Farm (`packages/provider-webdriver`, AWS przez
   proces `aws`), Limrun (`packages/provider-limrun`, aktywny automatycznie przy poświadczeniach
   w env), TestMu AI (`packages/provider-testmu`, plugin npm).
5. System pluginów: `plugins add` = `npm install` z Internetu; daemon importuje kod pluginów
   przy każdym starcie.
6. Tryb zdalny (zdalny daemon, `proxy`, `connect proxy`, upload/download artefaktów,
   `takeover`, mosty Metro, companion tunnel) — wysyła dane z urządzeń poza komputer.
7. Niejawne pobrania: `metro prepare` (instalacja zależności, `npx`), `cdp` (`npm exec --yes`);
   jawne: `web setup`, `install-from-source <url>` (tylko publiczne URL-e).
8. **Brak telemetrii** i raportowania błędów na zewnątrz.
9. Helpery Android i runner iOS są w paczce/budowane lokalnie — brak pobierania w runtime.
10. Maestro `runScript` → `http.post` (proces potomny, globalny `fetch`) — **musi zostać**;
    testy przechodzą offline.
11. Publikowana paczka nie ma `dependencies` — kod zależności (np. `@limrun/api`, `undici`) jest
    wbudowany w `dist/`.
12. Nazwa `agent-device`: 18 698 wystąpień w 3 809 plikach — rebranding odłożony (D-16).

## 5. Decyzje i pytania otwarte

- ACCEPTED: D-03 (usunięcie chmury, providerów, update checka), D-18 (licencja/atrybucja).
- PROPOSED: D-01, D-05, D-08, D-09, D-11 (zachowanie), D-12, D-15, D-16, D-17.
- **NEEDS OWNER DECISION**: D-02 (aliasy kompatybilności), D-04 (tryb zdalny — rekomendacja:
  usunąć), D-06 (`install-from-source` — allowlista hostów wewnętrznych), D-07 (platforma web /
  `web setup` offline), D-10 (dystrybucja i CI), D-11 (rozszerzenia `runScript`), D-13 (system
  pluginów — rekomendacja: usunąć), D-14 (`cdp`), D-19 (endpointy zdalne daemona).

E1, E2, E3, E4a–c i E7 (w części PROPOSED) można realizować bez decyzji właściciela poza
D-10 w zakresie wyłączenia publikacji upstream (bezpieczne: niczego nie publikuje). E5 wymaga
D-13; E6a–d wymagają D-04.

## 6. Stan testów (baseline)

Środowisko E0: Linux (kontener, root), Node 22.22.0, pnpm 11.17.0, bez Xcode/Android SDK.

`pnpm test:unit` w `unshare -n` (tylko loopback): **1822 pliki / 15 170 testów przechodzi,
8 testów w 7 plikach nie przechodzi, 65 pominiętych**. Wszystkie niepowodzenia są
środowiskowe:

| Plik | Przyczyna |
| --- | --- |
| `packages/capture-kit/src/capture-admission/__tests__/durable-capture-resource.test.ts` | Uruchomienie jako root — test zakłada brak uprawnień zapisu (nie przechodzi też online) |
| `packages/capture-kit/src/durable-capture/adoption.test.ts` | j.w. |
| `packages/daemon-contracts/src/device-claims-app.test.ts` (2) | j.w. (błąd odczytu nie występuje dla roota) |
| `packages/daemon/src/resources/__tests__/app-log-session-resource.test.ts` | j.w. („unwritable tombstone”) |
| `packages/daemon/src/server/http/daemon-session-idle-expiry.test.ts` (2) | j.w. |
| `scripts/__tests__/apple-ci-impact.test.ts` | Tylko offline: podpisywanie commitów w kontenerze używa usługi na loopback hosta, niedostępnej w nowym namespace |
| `scripts/__tests__/eager-closure-budgets.test.ts` | Wymaga `origin/main` (w E0 jeszcze nie istniał; po wypchnięciu `main` należy sprawdzić ponownie) |

Na macOS/Linux jako zwykły użytkownik pięć pierwszych powinno przechodzić — zweryfikuj w E1.

## 7. Znane ryzyka

1. Limrun i WebDriver są wplecione we współdzielone typy snapshotów/alertów iOS (D-03,
   plan §2) — ryzyko regresji lokalnego iOS przy E4a/E4b.
2. Klient daemona jest wspólny dla trybu lokalnego i zdalnego (E6c) — najwyższe ryzyko.
3. „Lease” oznacza też lokalne dzierżawy runnera Apple — nie usuwać ich w E6d.
4. Merge'e upstream mogą przywracać usunięte moduły — strażnik statyczny (E1) musi to wykryć.
5. Ruch tła narzędzi zewnętrznych (Chromium, emulator Androida, Xcode) jest niezweryfikowany.
6. Brak weryfikacji na urządzeniach w E0 — nie deklarować zgodności offline przed E10.

## 8. Uruchomienie środowiska i komendy weryfikacyjne

```sh
git clone https://github.com/rtnk/TapRig && cd TapRig
git remote add upstream https://github.com/callstack/agent-device
git fetch upstream main
pnpm install --frozen-lockfile        # Node >= 22.12, pnpm 11 (packageManager w package.json)
pnpm build
pnpm check:quick                      # lint + typecheck
pnpm test:unit                        # ~6 min; porównaj z baseline z §6
AGENT_DEVICE_NO_UPDATE_NOTIFIER=1 node bin/agent-device.mjs help commands
```

Prototyp harnessu offline (Linux, root lub `sudo`) — opis w `docs/network-audit.md` §6; w E1
trafia do `scripts/taprig/offline-harness/`.

Nie uruchamiaj `pnpm test:integration:provider` ani komend `connect <provider>` z prawdziwymi
poświadczeniami — łączą się z usługami chmurowymi.

## 9. Kryteria zakończenia następnego etapu (E1)

Zgodnie z `docs/taprig-implementation-plan.md` §3 E1:

- [ ] `NOTICE`, aktualizacja `LICENSE` (nota Callstack zachowana), baner w `README.md`.
- [ ] `docs/upstream-sync.md`.
- [ ] Workflowy publikujące/wdrażające upstream wyłączone; `ci.yml` działa w forku.
- [ ] Strażnik statyczny + allowlista baseline (NET-xx) + test w `pnpm test:unit`.
- [ ] Harness offline + job CI; jedyne oczekiwane naruszenie: NET-01 (TTY).
- [ ] Brak zmian zachowania (`src/`, `packages/`, `bin/` bez zmian funkcjonalnych).
- [ ] PR do `main`; aktualizacja `docs/HANDOFF.md` (stan, prompt dla E2).

## 10. Prompt dla agenta realizującego Etap 1

```text
Jesteś agentem realizującym Etap 1 (E1) projektu TapRig w repozytorium
https://github.com/rtnk/TapRig. TapRig to fork callstack/agent-device (narzędzia CLI + serwer
MCP + Node.js SDK do automatyzacji iOS/Android i innych platform dla agentów AI), który ma
stać się narzędziem local-first: bez integracji z chmurowymi dostawcami urządzeń, bez
sprawdzania aktualizacji, bez telemetrii, bez niejawnych pobrań z Internetu — przy zachowaniu
lokalnej automatyzacji oraz wywołań HTTP świadomie zapisanych przez użytkownika w skryptach
testowych (Maestro runScript http.post).

Najpierw przeczytaj (w tej kolejności): AGENTS.md, docs/HANDOFF.md,
docs/taprig-implementation-plan.md (§0 i §3 E1), docs/network-audit.md (§1, §2, §6, §7),
docs/taprig-decisions.md (D-01, D-10, D-12, D-16, D-18), docs/architecture.md.
Sprawdź stan Git (git status, git log -3, gałęzie). Commit bazowy upstream:
3537dc549a5edb248f918990a137c536fc46ee50. Jeżeli main zawiera już zmiany, uwzględnij je.

Zakres E1 — fundament forka BEZ zmiany zachowania narzędzia:
1. NOTICE (pochodzenie: callstack/agent-device, commit bazowy, licencja MIT, Copyright
   Callstack; opis forka TapRig). LICENSE: zachowaj treść MIT i notę Callstack, dodaj linię
   copyright TapRig. README.md: baner na górze informujący, że to TapRig — fork
   agent-device w trakcie migracji do local-first, z linkami do NOTICE i docs/taprig-*.md.
   Nie zmieniaj jeszcze nazw paczki, binarki ani zmiennych (rebranding to E9, D-16).
2. docs/upstream-sync.md: remote upstream, procedura synchronizacji przez merge w osobnych PR,
   obowiązkowe kontrole po merge'u (strażnik + harness), obszary kolizji (moduły usuwane w E2–E6).
3. CI forka (.github/workflows): wyłącz workflowy publikujące i wdrażające upstream oraz
   harmonogramy nightly (release.yml, publish-mcp-registry.yml,
   release-android-snapshot-helper.yml, release-ios-runner.yml, deploy.yml, pr-preview.yml,
   pr-preview-cleanup.yml, *-nightly.yml, conformance-*.yml, mutation-weekly.yml,
   perf-nightly.yml) — usuń je lub ogranicz do workflow_dispatch bez kroków publikacji;
   opisz wybór w PR. Zachowaj i w razie potrzeby dostosuj ci.yml (lint, typecheck, unit,
   build) do ubuntu-latest bez sekretów.
4. Strażnik statyczny: scripts/taprig/network-guard.ts + scripts/taprig/network-allowlist.json
   + test uruchamiany przez `pnpm test:unit` (sprawdź vitest.config.ts, które ścieżki obejmuje
   projekt unit-core) + skrypt `pnpm taprig:network-guard`. Skanuje pliki produkcyjne
   (git ls-files src packages bin bez testów/fixture'ów) pod kątem: fetch/fetchImpl,
   node:http/https/net/tls/dgram/dns, undici, WebSocket, transport.request,
   net.createConnection, listen(, literałów http(s)://, wywołań runCmd*/spawn z npm, npx,
   pnpm, yarn, curl, wget, aws. Każde znalezione miejsce musi mieć wpis w allowliście
   (plik, wzorzec/symbol, ID NET-xx z docs/network-audit.md, decyzja, uzasadnienie). Test
   failuje dla miejsca spoza allowlisty ORAZ dla nieaktualnego wpisu allowlisty. Baseline:
   stan obecny (wszystkie NET-xx). Zakazane domeny (agent-device.dev, registry.npmjs.org,
   browserstack.com, lambdatest.com, limrun, amazonaws, devicefarm) oznacz w allowliście
   decyzją REMOVE, aby kolejne etapy je usuwały.
5. Harness offline: scripts/taprig/offline-harness/ (lo_up.py podnoszący lo przez ioctl,
   run.sh: `unshare -n` + `strace -f -e trace=execve,connect,sendto,sendmsg`, check.mjs
   klasyfikujący naruszenia = AF_INET/AF_INET6 poza 127.0.0.0/8 i ::1, w tym DNS na :53).
   Scenariusze: --version, help commands, `devices --platform android` z TTY (przez `script
   -qec`) i bez TTY na czystym state dir (AGENT_DEVICE_STATE_DIR w katalogu tymczasowym),
   `mcp` (initialize + tools/list na stdin). Uwaga: daemon jest odłączony i żyje pod strace —
   po scenariuszu zatrzymaj go (`node bin/agent-device.mjs daemon stop` z tym samym state dir)
   albo użyj timeoutu. Oczekiwany wynik w E1: dokładnie jedno znane naruszenie NET-01
   (worker update-check w scenariuszu TTY) zapisane jako „expected until E2”; harness failuje
   przy innym naruszeniu i gdy oczekiwane zniknie. Skrypt `pnpm taprig:offline-smoke`
   i job CI na ubuntu-latest (sudo unshare, instalacja strace jest dozwolonym ruchem budowania).
6. Nie zmieniaj zachowania narzędzia: żadnych zmian funkcjonalnych w src/, packages/, bin/.

Weryfikacja przed PR: pnpm install --frozen-lockfile && pnpm build; pnpm check:quick;
pnpm test:unit (porównaj z baseline z docs/HANDOFF.md §6 — nowe błędy muszą być wyjaśnione
lub naprawione, nie ukrywaj ich); pnpm taprig:network-guard; pnpm taprig:offline-smoke;
ręcznie: tymczasowy fetch('https://example.com') w pliku src/ musi zostać wykryty przez
strażnika (nie commituj go). Nie wyłączaj ani nie pomijaj istniejących testów/bramek.

Rezultat: gałąź taprig/e1-fork-foundation, commity w konwencji type(scope): opis, PR do main
w rtnk/TapRig z opisem: co zrobiono, co wyłączono w CI i dlaczego, wyniki testów, raport
harnessu. Jeżeli nie możesz utworzyć PR, wypchnij gałąź i podaj instrukcję.

Na koniec zaktualizuj docs/HANDOFF.md: stan (E1 ukończony, link do PR), wyniki testów,
nowe ryzyka, następny etap (E2 — usunięcie update checka, zgodnie z
docs/taprig-implementation-plan.md §3 E2) oraz kompletny prompt dla agenta E2 w tym samym
formacie. Zaktualizuj docs/taprig-decisions.md (statusy, jeśli właściciel coś rozstrzygnął)
i docs/network-audit.md (nic nie zostało usunięte w E1 — dopisz tylko informację o strażniku
i harnessie). Nie rozpoczynaj E2.
```
