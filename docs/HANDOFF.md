# TapRig — handoff

Ten plik jest punktem startowym dla każdego agenta realizującego kolejny etap. Nie zakładaj
znajomości wcześniejszych rozmów — wszystko, czego potrzebujesz, jest w repozytorium.

## 1. Stan projektu

| Pole | Wartość |
| --- | --- |
| Ostatni ukończony etap | **E1** — fundament forka: atrybucja, CI forka, strażnik sieci, harness offline (bez zmian zachowania) |
| PR Etapu 1 | [rtnk/TapRig#2](https://github.com/rtnk/TapRig/pull/2) (gałąź `taprig/e1-fork-foundation`) |
| Następny etap | **E2** — usunięcie sprawdzania aktualizacji (NET-01) |
| Repozytorium | `https://github.com/rtnk/TapRig` |
| Upstream | `https://github.com/callstack/agent-device` (remote `upstream`; procedura: `docs/upstream-sync.md`) |
| Commit bazowy (upstream `main`) | `3537dc549a5edb248f918990a137c536fc46ee50` — 2026-10-28; `package.json` → `0.21.34-dev` |
| Gałąź `main` w TapRig | commit bazowy + PR #1 (dokumenty E0) + PR Etapu 1 (po scaleniu) |
| Zmiany zachowania narzędzia | **Brak.** E0 i E1 nie zmieniły `src/`, `packages/`, `bin/` |

## 2. Wykonane działania (E1)

1. `NOTICE` (pochodzenie, commit bazowy, MIT, Copyright Callstack, opis forka); `LICENSE` —
   dodana linia „Copyright (c) 2026 TapRig contributors”, treść MIT i nota Callstack bez zmian;
   baner TapRig na początku `README.md` (linki do NOTICE, LICENSE i `docs/taprig-*.md`).
2. `docs/upstream-sync.md`: remote, procedura merge w osobnych PR, kontrole po merge'u,
   obszary kolizji (E2–E9), stan CI forka.
3. CI forka (szczegóły: `docs/upstream-sync.md` §5):
   - usunięte: `release.yml`, `publish-mcp-registry.yml`, `release-android-snapshot-helper.yml`,
     `release-ios-runner.yml`, `deploy.yml`, `pr-preview-cleanup.yml`; w `pr-preview.yml`
     usunięty job `deploy-preview` (zostaje bramka `command-docs`);
   - zaparkowane na `workflow_dispatch` (usunięty `schedule`): `concurrency-torture-nightly`,
     `replays-nightly`, `xctest-nightly`, `conformance-differential`, `conformance-regenerate`,
     `mutation-weekly`, `perf-nightly`; bramki bez innego lane'u zadeklarowane w
     `scripts/gate/declarations.ts` (`MANUAL_ONLY_OWNERS`): `fuzz-parsers`,
     `maestro-differential`, `maestro-regenerate`, `mutation-check`;
   - usunięte testy usuniętych workflowów: `test/ci/release-workflow.test.ts`, test publikacji
     MCP w `test/repo-guards/npm-package-scripts.test.ts`; testy modelu bramek
     (`scripts/gate/workflows.test.ts`, `audit-coverage.test.ts`) nie czytają już
     `deploy.yml`/harmonogramu `replays-nightly.yml` (wpisane workflowy testowe);
   - `ci.yml` bez zmian (już `ubuntu-latest`, bez sekretów); nowy `.github/workflows/taprig.yml`
     (job „Network guard & offline harness”).
4. Strażnik statyczny: `scripts/taprig/network-guard.ts`, `network-allowlist.json` (baseline:
   394 wystąpienia, 174 wpisy, 84 `REMOVE`), `network-guard.test.ts` (w `unit-core`),
   `pnpm taprig:network-guard` (`--suggest` wypisuje szkielety wpisów). Opis reguł i NET-00:
   `docs/network-audit.md` §8.1.
5. Harness offline: `scripts/taprig/offline-harness/` (`run.sh`, `lo_up.py`, `check.mjs`,
   `expectations.json`, `README.md`), `pnpm taprig:offline-smoke`. Jedyne naruszenie: NET-01
   w `devices-android-tty` („expected until E2”). Opis: `docs/network-audit.md` §8.2.
6. `docs/taprig-decisions.md`: D-01, D-12, D-16 → ACCEPTED; D-10 → ACCEPTED w części
   „wyłączenie publikacji upstream”; D-18 — część E1 wykonana.

## 3. Dokumenty

| Plik | Zawartość |
| --- | --- |
| `docs/architecture.md` | Architektura bazy: CLI, daemon, MCP, SDK, platformy, pluginy/providery, przepływ komendy |
| `docs/network-audit.md` | Tabela NET-01…NET-42, mechanizmy, dowody, projekt kontroli (§7), kontrole wdrożone w E1 (§8) |
| `docs/taprig-decisions.md` | Rejestr decyzji D-01…D-19 ze statusami |
| `docs/taprig-implementation-plan.md` | Etapy E1…E11 z plikami, zadaniami, kryteriami, testami, ryzykami |
| `docs/upstream-sync.md` | Synchronizacja z upstream, obszary kolizji, CI forka |
| `scripts/taprig/offline-harness/README.md` | Harness offline: uruchomienie, scenariusze, klasyfikacja |
| `NOTICE` | Pochodzenie i atrybucja |
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

- ACCEPTED: D-01 (fork + merge), D-03 (usunięcie chmury, providerów, update checka), D-12
  (kontrola statyczna i dynamiczna), D-16 (rebranding po usunięciach), D-18 (licencja/atrybucja),
  D-10 w części „wyłączenie publikacji upstream”.
- PROPOSED: D-05, D-08, D-09, D-11 (zachowanie), D-15, D-17.
- **NEEDS OWNER DECISION**: D-02 (aliasy kompatybilności), D-04 (tryb zdalny — rekomendacja:
  usunąć), D-06 (`install-from-source` — allowlista hostów wewnętrznych), D-07 (platforma web /
  `web setup` offline), D-10 (dystrybucja 0.1.0, metadane rejestrów MCP, lane'y urządzeń
  `android.yml`/`apple.yml`/`linux.yml` w PR), D-11 (rozszerzenia `runScript`), D-13 (system
  pluginów — rekomendacja: usunąć), D-14 (`cdp`), D-19 (endpointy zdalne daemona).

E2 (D-03, ACCEPTED) nie wymaga decyzji właściciela. E3, E4a–c i E7 (w części PROPOSED) też można
realizować; E5 wymaga D-13; E6a–d wymagają D-04.

## 6. Stan testów

Środowisko E1: Linux (kontener, root), Node 22.22.0, pnpm 11.17.0, bez Xcode/Android SDK.

`pnpm test:unit` w `unshare -n` (tylko loopback), stan po E1: **1 823 pliki przechodzą,
8 testów w 6 plikach nie przechodzi, 65 pominiętych** (16 105 testów; E1 dodał 9 testów
strażnika, usunął testy usuniętych workflowów). Wszystkie niepowodzenia są środowiskowe i
występowały już w E0:

| Plik | Przyczyna |
| --- | --- |
| `packages/capture-kit/src/capture-admission/__tests__/durable-capture-resource.test.ts` | Uruchomienie jako root — test zakłada brak uprawnień zapisu |
| `packages/capture-kit/src/durable-capture/adoption.test.ts` | j.w. |
| `packages/daemon-contracts/src/device-claims-app.test.ts` (2) | j.w. |
| `packages/daemon/src/resources/__tests__/app-log-session-resource.test.ts` | j.w. („unwritable tombstone”) |
| `packages/daemon/src/server/http/daemon-session-idle-expiry.test.ts` (2) | j.w. |
| `scripts/__tests__/apple-ci-impact.test.ts` | Tylko w `unshare -n` (podpisywanie commitów przez usługę na loopbacku hosta); poza namespace przechodzi |

`scripts/__tests__/eager-closure-budgets.test.ts` przechodzi od E1 (istnieje `origin/main`).
Pięć pierwszych powinno przechodzić jako zwykły użytkownik — nadal niezweryfikowane.

`pnpm check:affected --run --head a8583dc` (fail-open → pełny zestaw, `exactCommit: true`):
`format`, `lint`, `typecheck`, `layering`, `di-seams`, `fallow`, `native-dupes`,
`native-dupes-model`, `mcp-metadata`, `build`, `package` — OK; **`integration-node` — FAIL**
(2 testy w `test/integration/smoke-daemon-clean.test.ts`: „clean daemon script stops a live
daemon…”, „forced retirement waits for a real daemon…”). Ta sama porażka odtwarza się na
niezmienionym `main` (`f8a8424`) w tym kontenerze — przyczyna środowiskowa (prawdopodobnie
root/kontener), nie zmiana E1. Kolejne kontrole za `integration-node` nie zostały uruchomione
lokalnie (runner zatrzymuje się na pierwszej porażce); autorytatywne są joby CI w PR.

Pozostałe kontrole E1: `pnpm taprig:network-guard` — OK (394 wystąpienia, 174 wpisy);
`pnpm taprig:offline-smoke` — PASS (jedyne naruszenie: NET-01, oczekiwane do E2);
`check:gate-manifest`, `check:gate-manifest:test`, `mutation:test`, `check:production-exports` — OK.

## 7. Znane ryzyka

1. Limrun i WebDriver są wplecione we współdzielone typy snapshotów/alertów iOS (D-03,
   plan §2) — ryzyko regresji lokalnego iOS przy E4a/E4b.
2. Klient daemona jest wspólny dla trybu lokalnego i zdalnego (E6c) — najwyższe ryzyko.
3. „Lease” oznacza też lokalne dzierżawy runnera Apple — nie usuwać ich w E6d.
4. Merge'e upstream mogą przywracać usunięte moduły — strażnik statyczny wykrywa je jako
   `unlisted`; procedura w `docs/upstream-sync.md` §3.
5. Ruch tła narzędzi zewnętrznych (Chromium, emulator Androida, Xcode) jest niezweryfikowany.
6. Brak weryfikacji na urządzeniach — nie deklarować zgodności offline przed E10.
7. (E1) Strażnik jest tekstowy (bez AST): nie wykryje sieci w kodzie natywnym, dynamicznych
   importów ani kodu zależności wbudowanego w `dist/` (skan `dist/` — E8). Wpisy mają dokładne
   `count`, więc zmiany upstream w plikach z allowlisty wymagają przeglądu wpisu.
8. (E1) Ścieżka harnessu z `sudo` + `setpriv` (użytkownik nie-root, jak w GitHub Actions)
   była testowana lokalnie tylko częściowo (obniżenie uprawnień do `nobody` w namespace —
   OK; pełne `sudo -n` — weryfikuje pierwszy przebieg joba `taprig.yml`). Na Ubuntu z
   `systemd-resolved` DNS idzie do `127.0.0.53:53` — harness traktuje każdy port 53 jako
   naruszenie, więc NET-01 jest wykrywany także tam.
9. (E1) Zaparkowane lane'y (nightly, mutation, conformance) nie działają same — regresje, które
   łapały w upstream (fuzz parserów, różnicowa zgodność Maestro), wykryje dopiero ręczne
   uruchomienie lub merge upstream.
10. (E1) Workflowy `android.yml`, `apple.yml`, `linux.yml`, `size.yml`, `test-app-build-cache.yml`
    nadal uruchamiają się w PR (runnery macOS, emulatory). Ograniczenie — decyzja D-10.

## 8. Uruchomienie środowiska i komendy weryfikacyjne

```sh
git clone https://github.com/rtnk/TapRig && cd TapRig
git remote add upstream https://github.com/callstack/agent-device
git fetch upstream main
pnpm install --frozen-lockfile        # Node >= 22.12, pnpm 11 (packageManager w package.json)
pnpm build
pnpm check:quick                      # lint + typecheck
pnpm taprig:network-guard             # strażnik statyczny (sekundy)
pnpm taprig:offline-smoke             # harness offline (Linux, root lub sudo; ~15 s)
pnpm test:unit                        # ~6-10 min; porównaj z baseline z §6
AGENT_DEVICE_NO_UPDATE_NOTIFIER=1 node bin/agent-device.mjs help commands
```

Nie uruchamiaj `pnpm test:integration:provider` ani komend `connect <provider>` z prawdziwymi
poświadczeniami — łączą się z usługami chmurowymi.

## 9. Kryteria zakończenia następnego etapu (E2)

Zgodnie z `docs/taprig-implementation-plan.md` §3 E2:

- [ ] Usunięte `src/cli/update-check.ts`, `src/cli/update-check-entry.ts` i ich testy; brak
      wywołania w `src/cli.ts`; brak wpisu `internal/update-check-entry` w `tsdown.config.ts`.
- [ ] Brak `registry.npmjs.org` w `src/`, `packages/`, `dist/`; brak `update-check-entry.js` w `dist/`.
- [ ] Odwołania do `AGENT_DEVICE_NO_UPDATE_NOTIFIER` usunięte (skrypty, testy, `.fallowrc.json`,
      `website/docs`).
- [ ] Allowlista bez wpisów NET-01; `expectations.json` bez NET-01; harness bez naruszeń.
- [ ] Test: `runCli` z TTY nie tworzy `update-check.json`.
- [ ] PR do `main`; aktualizacja `docs/HANDOFF.md`, `docs/network-audit.md` (NET-01 → DONE),
      `docs/taprig-decisions.md`.

## 10. Prompt dla agenta realizującego Etap 2

```text
Jesteś agentem realizującym Etap 2 (E2) projektu TapRig w repozytorium
https://github.com/rtnk/TapRig. TapRig to fork callstack/agent-device (narzędzia CLI + serwer
MCP + Node.js SDK do automatyzacji iOS/Android i innych platform dla agentów AI), który ma
stać się narzędziem local-first: bez integracji z chmurowymi dostawcami urządzeń, bez
sprawdzania aktualizacji, bez telemetrii, bez niejawnych pobrań z Internetu — przy zachowaniu
lokalnej automatyzacji oraz wywołań HTTP świadomie zapisanych przez użytkownika w skryptach
testowych (Maestro runScript http.post).

Najpierw przeczytaj (w tej kolejności): AGENTS.md, docs/HANDOFF.md,
docs/taprig-implementation-plan.md (§0, §2 wiersz update check, §3 E2),
docs/network-audit.md (§2 NET-01, §3.1, §8), docs/taprig-decisions.md (D-03, D-02),
docs/upstream-sync.md, scripts/taprig/offline-harness/README.md.
Sprawdź stan Git (git status, git log -5, gałęzie). Upewnij się, że PR Etapu 1
(gałąź taprig/e1-fork-foundation) jest scalony do main; jeżeli nie — zatrzymaj się i zapytaj
właściciela. Pracuj od aktualnego main.

Zakres E2 — usunięcie sprawdzania aktualizacji (NET-01), bez innych zmian zachowania:
1. Usuń src/cli/update-check.ts, src/cli/update-check-entry.ts,
   src/cli/__tests__/update-check.test.ts. Usuń import i wywołanie maybeRunUpgradeNotifier
   w src/cli.ts (zlokalizuj przez git grep, numery linii z dokumentów dotyczą commita
   bazowego). Usuń wpis 'internal/update-check-entry' z tsdown.config.ts.
2. Zaktualizuj oczekiwane pliki dist w scripts/check-package.ts i
   test/repo-guards/npm-package-scripts.test.ts. Usuń zmienną AGENT_DEVICE_NO_UPDATE_NOTIFIER
   z scripts/check-package.ts, scripts/check-provider-plugin.mjs,
   scripts/ios-snapshot-benchmark/*, scripts/lib/bench-host.ts,
   src/cli/commands/__tests__/plugins.test.ts, wpis w .fallowrc.json oraz z dokumentacji
   website/docs/docs/{configuration,installation,security-trust}.md (git grep
   AGENT_DEVICE_NO_UPDATE_NOTIFIER i git grep update-check). Zgodnie z D-02 (NEEDS OWNER
   DECISION) nie dodawaj obsługi zgodności dla zmiennej — po prostu przestaje mieć znaczenie;
   opisz to w PR.
3. Dodaj test: runCli z TTY na stderr i czystym state dir nie tworzy update-check.json i nie
   uruchamia procesu potomnego (możesz zastąpić usunięty test).
4. Strażnik: usuń z scripts/taprig/network-allowlist.json wszystkie wpisy src/cli/update-check.ts
   (NET-01) — `pnpm taprig:network-guard` zgłosi je jako stale. Nie dodawaj nowych wpisów.
5. Harness: usuń wpis NET-01 z scripts/taprig/offline-harness/expectations.json; scenariusz
   devices-android-tty musi przejść bez naruszeń. Nie osłabiaj klasyfikacji naruszeń.
6. Dokumentacja: docs/network-audit.md (NET-01 → „DONE w E2, PR #…”, §8 — nowy stan
   strażnika i harnessu), docs/taprig-decisions.md (D-03: postęp), docs/upstream-sync.md
   (obszar kolizji update check → usunięty).
7. Nie zmieniaj niczego poza zakresem update checka (np. chmury, providerów, rebrandingu).

Weryfikacja przed PR: pnpm install --frozen-lockfile && pnpm build; pnpm check:quick;
pnpm test:unit (porównaj z baseline z docs/HANDOFF.md §6 — nowe błędy muszą być wyjaśnione
lub naprawione, nie ukrywaj ich); pnpm check:layering; pnpm check:production-exports;
pnpm check:package; pnpm check:gate-manifest; pnpm taprig:network-guard;
pnpm taprig:offline-smoke (raport w PR); ręcznie: ls dist/src/internal | grep update-check
→ brak; git grep -n registry.npmjs.org -- src packages → brak. Nie wyłączaj ani nie pomijaj
istniejących testów/bramek.

Rezultat: gałąź taprig/e2-remove-update-check, commity w konwencji type(scope): opis, PR do
main w rtnk/TapRig z opisem: co usunięto, wyniki testów, raport harnessu, diff allowlisty.
Jeżeli nie możesz utworzyć PR, wypchnij gałąź i podaj instrukcję.

Na koniec zaktualizuj docs/HANDOFF.md: stan (E2 ukończony, link do PR), wyniki testów, nowe
ryzyka, następny etap (E3 — usunięcie chmury agent-device, zgodnie z
docs/taprig-implementation-plan.md §3 E3) oraz kompletny prompt dla agenta E3 w tym samym
formacie. Nie rozpoczynaj E3.
```
