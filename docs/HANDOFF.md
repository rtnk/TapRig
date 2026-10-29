# TapRig — handoff

Ten plik jest punktem startowym dla każdego agenta realizującego kolejny etap. Nie zakładaj
znajomości wcześniejszych rozmów — wszystko, czego potrzebujesz, jest w repozytorium.

## 1. Stan projektu

| Pole | Wartość |
| --- | --- |
| Ostatni ukończony etap | **E4a** — usunięcie providera Limrun (NET-07) |
| PR Etapu 4a | [rtnk/TapRig#5](https://github.com/rtnk/TapRig/pull/5) (gałąź `taprig/e4a-remove-limrun`) |
| PR wcześniejszych etapów | E0: #1, E1: [#2](https://github.com/rtnk/TapRig/pull/2), E2: [#3](https://github.com/rtnk/TapRig/pull/3), E3: [#4](https://github.com/rtnk/TapRig/pull/4) — scalone |
| Następny etap | **E4b** — usunięcie BrowserStack i AWS Device Farm (`provider-webdriver`, NET-04/05) |
| Repozytorium | `https://github.com/rtnk/TapRig` |
| Upstream | `https://github.com/callstack/agent-device` (remote `upstream`; procedura: `docs/upstream-sync.md`) |
| Commit bazowy (upstream `main`) | `3537dc549a5edb248f918990a137c536fc46ee50` — 2026-10-28; `package.json` → `0.21.34-dev` |
| Gałąź `main` w TapRig | commit bazowy + PR #1 (E0) + #2 (E1) + #3 (E2) + #4 (E3) + #5 (E4a, po scaleniu) |
| Zmiany zachowania narzędzia | E2: brak sprawdzania aktualizacji. E3: brak komendy `auth`, brak `--no-login`, `connect` bez providera → `INVALID_ARGS` (`connect-provider-required`). E4a: brak providera Limrun — `LIMRUN_API_KEY`/`LIM_*_INSTANCE_*` w env niczego nie aktywują (`daemon status` pokazuje tylko `browserstack`, `aws-device-farm` i pluginy), `connect limrun` → `INVALID_ARGS` „Unknown connect provider: limrun”, brak eksportu SDK `agent-device/limrun`. `connect proxy`, `connect --remote-config`, BrowserStack, AWS Device Farm, TestMu AI (plugin) bez zmian |

## 2. Wykonane działania (E4a)

PR #5 ma 5 commitów (diff ~17,6 tys. usuniętych linii, ~0,5 tys. dodanych; podział zgodnie z
`docs/agents/pull-requests.md`):

1. `feat(provider)!: remove the Limrun provider and the agent-device/limrun export` — usunięte
   `packages/provider-limrun/`, `src/provider-limrun-{credentials,runtime}.ts` (+ test),
   `src/sdk/limrun*.ts`, `src/vendor/limrun-delta-sync-omitted.ts`,
   `src/cli/connection/limrun-profile.ts`, `src/daemon-runtime-limrun-public-http.test.ts`,
   `src/__tests__/*limrun*`, `src/provider-device-runtimes.test.ts` (jedyny test był Limrun),
   `src/__tests__/lease-provider-profile-fields.test.ts` (tylko Limrun),
   `test/integration/limrun-public-types.test.ts`, `test/integration/provider-scenarios/limrun-*`,
   `website/docs/docs/limrun.md`. Zmienione: `src/builtin-provider-plugins.ts` (bez
   `limrunCandidate`; `builtinProviderCandidates()` bez parametru `host`),
   `src/builtin-provider-ids.ts`, `connect-provider-adapters.ts` (adapter `limrun`,
   `verifyLimrun`), `package.json` (eksport `./limrun`, `@limrun/api`,
   `@agent-device/provider-limrun`), `pnpm-lock.yaml` (przez `pnpm install`),
   `pnpm-workspace.yaml` (`minimumReleaseAgeExclude`; override `undici@7` zostaje — używany
   bezpośrednio i przez `@ai-sdk/provider-utils`, komentarz poprawiony), `tsdown.config.ts`
   (wejście `limrun`, plugin `dropAmbientDeclarationImport`, `dts.neverBundle`, alias
   `@limrun/xdelta3-wasm`, 11 pozycji `deps.onlyBundle` wbudowywanych tylko przez `@limrun/api`),
   `tsconfig.typecheck.json`, `examples/sdk/tsconfig.json`, `.fallowrc.json`,
   `scripts/layering/*` (strefa `vendor`, moduły root, testy granic pakietów),
   `scripts/capability-matrix/*` (kolumny Limrun, stub SDK; `website/docs/docs/capabilities.md`
   wygenerowany ponownie), `scripts/__tests__/package-closure-audit.test.ts`,
   `test/repo-guards/package-exports.test.ts`, `test/integration/installed-package-metro.test.ts`,
   pomoc (`cli-help.ts`, `command-overrides`-zależne opisy w `alert.ts`, `settings.ts`,
   `system/index.ts`, `flag-definitions-action.ts`, `settings-catalog.ts`,
   `maestro/support-matrix.ts`), `website/docs/**`, `README.md`, `docs/agents/code-ownership.md`
   (wpis `limrun` dla `captureSdkHost`).
2. `refactor(contracts): narrow iOS snapshot producers after the Limrun removal` — usunięty
   producent `'limrun-ios-tree'` z `IosSnapshotProducer`, `IosProviderAcquisitionProducer`,
   `SnapshotProvenance` (kernel), tabel `ios-snapshot-acquisition.ts`, `stable-capture.ts`,
   `snapshot-assembly-presentation-policy.ts`; komentarze o Limrun w kontraktach alertów,
   klawiatury, przycisków, ustawień. Wartości lokalnych producentów (`apple-runner`,
   `simulator-ax-bridge`) i `appium-source` bez zmian. 37 plików testów używających `limrun` jako
   przykładowego providera → neutralne id (`example-provider`, w `packages/plugins` —
   `builtin-provider`); `http-server-limrun-uploaded-apps.test.ts` →
   `http-server-public-network-marking.test.ts` (czysty rename + neutralny provider).
3. `chore(taprig): drop NET-07 …` — 49 wpisów allowlisty (wszystkie NET-07), scenariusz harnessu
   `devices-android-limrun-env`, README harnessu, komentarz `expectations.json`.
4. `refactor(capture-kit): drop the JPEG transcode and provider app-log helpers only Limrun used` —
   wykryte przez `pnpm check:production-exports`/`check:fallow`: `transcodeScreenshotToPngAsync`
   (+ zadanie workera `jpeg-to-png`, `transcodeScreenshotToPng`), `provider-app-log.ts` i
   `provider-app-log-poller.ts` (+ eksport `./provider-app-log`), fasada
   `@agent-device/platform-apple/simctl-settings`, re-eksport `readIosBundleInfo`;
   `detectScreenshotImageFormat` nieeksportowany. `decodeScreenshotImage` (JPEG/PNG) zostaje —
   test „truncated JPEG” przepisany na niego.
5. `docs(taprig): …` — ten plik, `docs/network-audit.md` (NET-07 → DONE, §11),
   `docs/taprig-decisions.md` (D-03), `docs/upstream-sync.md` (obszar kolizji Limrun).

Testy regresyjne (oba failują na `6e51f9b` z właściwego powodu, sprawdzone w osobnym worktree):
`src/__tests__/provider-device-runtimes.test.ts` — „Limrun credentials in the environment register
no provider and open no connection” (przed E4a: `limrun` w rejestrze);
`src/__tests__/cli-connect-unknown-provider.test.ts` — `connect limrun --platform android --json`
z `LIMRUN_API_KEY` → `INVALID_ARGS` „Unknown connect provider”, 0 wywołań `fetch`, `runCmd`,
`runCmdDetached` i daemona (przed E4a: `COMMAND_FAILED` po próbie `fetch`). Testy ogólnych
mechanizmów, które używały Limrun (weryfikacja nieudana przy `connect`, odcisk poświadczeń,
odcisk per backend), przeniesione na BrowserStack albo neutralny wpis inwentarza
`example-backends` z `byBackend`.

`git grep -il limrun -- src packages` — pozostawione świadomie tylko 3 testy:
`src/__tests__/cli-connect-unknown-provider.test.ts`, `src/__tests__/provider-device-runtimes.test.ts`
(testy regresyjne) i `src/commands/schema/cli-help-topics.test.ts` (asercja braku `limrun` w
pomocy). Poza `src`/`packages` zostaje: marker `limrun` w strażniku
(`scripts/taprig/network-guard*.ts`), historia w `scripts/layering/ios-snapshot-engine-policy.ts`,
ADR-y (`docs/adr/*` — zapis historyczny upstream), `docs/architecture.md` (opis bazy), `NOTICE`.

## 3. Dokumenty

| Plik | Zawartość |
| --- | --- |
| `docs/architecture.md` | Architektura bazy: CLI, daemon, MCP, SDK, platformy, pluginy/providery, przepływ komendy |
| `docs/network-audit.md` | Tabela NET-01…NET-42, mechanizmy, dowody, projekt kontroli (§7), kontrole E1 (§8), stan po E2/E3/E4a (§9–§11) |
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
   `127.0.0.1`** z tokenem (`packages/daemon/src/server/http/transport.ts`).
2. **Update check** (NET-01): **usunięty w E2** (PR #3).
3. **Chmura agent-device** (NET-02/03): **usunięta w E3** (PR #4).
4. **Limrun** (NET-07): **usunięty w E4a** (PR #5). Pozostałe providery chmurowe: BrowserStack i
   AWS Device Farm (`packages/provider-webdriver`, AWS przez proces `aws`; wbudowane, zawsze
   `active` w `daemon status`), TestMu AI (`packages/provider-testmu`, plugin npm, importuje
   `@agent-device/provider-webdriver`).
5. System pluginów: `plugins add` = `npm install` z Internetu; daemon importuje kod pluginów
   przy każdym starcie.
6. Tryb zdalny (zdalny daemon, `proxy`, `connect proxy`, upload/download artefaktów,
   `takeover`, mosty Metro, companion tunnel) — wysyła dane z urządzeń poza komputer.
7. Niejawne pobrania: `metro prepare` (instalacja zależności, `npx`), `cdp` (`npm exec --yes`);
   jawne: `web setup`, `install-from-source <url>` (tylko publiczne URL-e).
8. **Brak telemetrii** i raportowania błędów na zewnątrz.
9. Helpery Android i runner iOS są w paczce/budowane lokalnie — brak pobierania w runtime.
10. Maestro `runScript` → `http.post` (proces potomny, `undici`) — **musi zostać**.
11. Publikowana paczka nie ma `dependencies` (poza `ai` jako peer) — kod zależności jest
    wbudowany w `dist/` (`tsdown.config.ts` → `deps.onlyBundle`).
12. Nazwa `agent-device`: rebranding odłożony (D-16).

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

E4a wykonany. E4b (D-03, ACCEPTED) nie wymaga decyzji właściciela. Usunięcie eksportu
`agent-device/plugins/webdriver` dotyczy D-02 — bez decyzji właściciela E4b nie dodaje aliasu ani
zastępczego modułu, tak jak E2/E3/E4a. E5 wymaga D-13; E6a–d wymagają D-04; E7 (część PROPOSED)
można realizować równolegle.

## 6. Stan testów

Środowisko E4a: Linux (kontener, root), Node 22.22.0, pnpm 11.17.0, bez Xcode/Android SDK.

`pnpm test:unit` w `unshare -n` z podniesionym `lo`
(`unshare -n bash -c 'python3 -I scripts/taprig/offline-harness/lo_up.py lo && pnpm test:unit'`),
stan po E4a (HEAD gałęzi przed commitem dokumentacji): **1 776 plików przechodzi, 8 testów w 6 plikach nie przechodzi, 3 pliki / 65 testów pominięte** (15 697 testów, 15 624 przechodzi; w E3: 16 061 testów — różnica to usunięte testy Limrun i jego pomocników). Niepowodzenia są
identyczne jak w E1–E3 — środowiskowe, występowały już w E0; nowych brak:

| Plik | Przyczyna |
| --- | --- |
| `packages/capture-kit/src/capture-admission/__tests__/durable-capture-resource.test.ts` | Uruchomienie jako root — test zakłada brak uprawnień zapisu |
| `packages/capture-kit/src/durable-capture/adoption.test.ts` | j.w. |
| `packages/daemon-contracts/src/device-claims-app.test.ts` (2) | j.w. |
| `packages/daemon/src/resources/__tests__/app-log-session-resource.test.ts` | j.w. („unwritable tombstone”) |
| `packages/daemon/src/server/http/daemon-session-idle-expiry.test.ts` (2) | j.w. |
| `scripts/__tests__/apple-ci-impact.test.ts` | Tylko w `unshare -n` (podpisywanie commitów przez usługę na loopbacku hosta); poza namespace przechodzi |

Pierwszy przebieg (po commicie 1, przed poprawkami) wykrył 4 nowe błędy, wszystkie naprawione:
strażnik (wpisy stale), `cloud-connect-profile.test.ts` (brak `--provider-os-version` w teście
przeniesionym na BrowserStack), `capability-matrix.test.ts` (strona do regeneracji),
`client-api-examples-drift.test.ts` (wejście `agent-device/limrun` w
`website/docs/docs/build-an-integration.md`).

Pozostałe kontrole E4a (lokalnie, na gałęzi `taprig/e4a-remove-limrun`, po commitach):
`pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm typecheck` (z `examples/sdk`),
`pnpm format` / `format:check`, `pnpm check:layering`, `pnpm check:production-exports`,
`pnpm check:package` (14 wejść, zamknięcie zależności: `ai`), `pnpm check:gate-manifest`,
`pnpm check:fallow` (0 problemów w zmienionych plikach), `pnpm check:mcp-metadata`,
`pnpm check:bundle-owner-files`, `pnpm check:command-docs`, `pnpm check:di-seams`,
`pnpm check:doc-links`, `pnpm check:agent-guidance`, `pnpm check:capabilities-matrix` — OK.
`pnpm taprig:network-guard` — OK (183 wystąpienia, 118 wpisów, 28 `REMOVE`, 27 ID).
`pnpm taprig:offline-smoke` — **PASS, 0 naruszeń** we wszystkich 7 scenariuszach.
`grep -rl "@limrun/api" dist/` i `grep -rli limrun dist/` → brak.
`pnpm check:daemon-wire-compat` — nie uruchomiony: wymaga pełnej historii i tagów
(`git fetch --unshallow --tags`), kontener ma płytki klon. Integracja (`test:integration`) —
nie uruchamiana, jak w E2/E3. Autorytatywne są joby CI w PR.

## 7. Znane ryzyka

1. Klient daemona jest wspólny dla trybu lokalnego i zdalnego (E6c) — najwyższe ryzyko.
2. „Lease” oznacza też lokalne dzierżawy runnera Apple — nie usuwać ich w E6d.
3. Merge'e upstream mogą przywracać usunięte moduły — strażnik statyczny wykrywa je jako
   `unlisted`; procedura w `docs/upstream-sync.md` §3.
4. Ruch tła narzędzi zewnętrznych (Chromium, emulator Androida, Xcode) jest niezweryfikowany.
5. Brak weryfikacji na urządzeniach — nie deklarować zgodności offline przed E10.
6. (E1) Strażnik jest tekstowy (bez AST): nie wykryje sieci w kodzie natywnym, dynamicznych
   importów ani kodu zależności wbudowanego w `dist/` (skan `dist/` — E8).
7. (E1) Ścieżka harnessu z `sudo` + `setpriv` (użytkownik nie-root) testowana lokalnie częściowo;
   pełne `sudo -n` weryfikuje job `taprig.yml`.
8. (E1) Zaparkowane lane'y (nightly, mutation, conformance) nie działają same.
9. (E1) Workflowy `android.yml`, `apple.yml`, `linux.yml`, `size.yml`, `test-app-build-cache.yml`
   nadal uruchamiają się w PR. Ograniczenie — decyzja D-10.
10. (E2/E3) Upstream rozwija update check i chmurę — merge może je przywrócić bez konfliktu;
    wykrywają to strażnik, testy `cli-no-update-check.test.ts`,
    `cli-connect-requires-provider.test.ts` i harness.
11. (E3) Zapisany stan połączenia z `leaseProvider: "cloud"` traktowany jak zdalny daemon;
    daemon nadal przyjmuje dzierżawę `cloud` bez runtime'u (`RUNTIME_LESS_LEASE_PROVIDERS`) — E6d.
12. (E3, wykryte w E4a) Pomoc `help remote` nadal ma linię „Cloud: agent-device connect or
    agent-device connect cloud discovers the agent-device cloud profile.”
    (`src/commands/schema/cli-help.ts`) i asercję w `cli-help-topics.test.ts`. Zachowanie jest
    inne (`connect` bez providera → `INVALID_ARGS`; `connect cloud` → „Unknown connect provider”).
    E4a tego nie zmienia (poza zakresem Limrun) — do poprawy w osobnym PR lub w E4b przy pomocy
    `connect`.
13. (E4a) Zapisany stan połączenia lub `--remote-config` z `leaseProvider: "limrun"` sprzed E4a
    nie jest już providerem wbudowanym: CLI szuka pluginu o tej nazwie albo traktuje profil jak
    zdalny daemon. Lokalny daemon odrzuca dzierżawę `limrun` (`provider-not-registered`).
14. (E4a) `'limrun'` nie jest zarezerwowanym id — plugin może zarejestrować provider `limrun`
    (system pluginów usuwa E5).
15. (E4a) Typy snapshotów iOS: usunięcie `'limrun-ios-tree'` jest zmianą kontraktu SDK
    (`SnapshotProvenance`, `IosSnapshotProducer`). Upstream rozwija te typy — merge może
    przywrócić wartość w tabelach `satisfies Record<…>`; typecheck wskaże brakujące/zbędne klucze.
16. (E4a, naprawione w PR #6) Lockfile: `pnpm install` po usunięciu `@limrun/api` rozwiązał
    opcjonalny peer `vite` → `@types/node` w `packages/daemon` na `26.2.0`. Powstała druga kopia
    `vitest` i job CI „Integration Tests” (bramka `concurrency-torture`, `node --test`) failował
    z „Vitest failed to access its internal state”; `pnpm test:unit` tego nie wykrywa. Poprawka:
    `@types/node` (zakres roota) w devDependencies `packages/daemon`. Po każdej zmianie
    lockfile'a sprawdź `ls node_modules/.pnpm | grep '^vitest@'` (jedna kopia) i uruchom
    `pnpm test:concurrency-torture`.
17. (E4a) Mechanizm `supportsDeferredAppSelection` (odroczony wybór aplikacji, „open
    <uploaded-asset-name>”) nie ma już wbudowanego providera; zostaje dla pluginów, a jego test
    CLI (był na Limrun) usunięto. Usuwa go E5.

## 8. Uruchomienie środowiska i komendy weryfikacyjne

```sh
git clone https://github.com/rtnk/TapRig && cd TapRig
git remote add upstream https://github.com/callstack/agent-device
git fetch upstream main
pnpm install --frozen-lockfile        # Node >= 22.12, pnpm 11 (packageManager w package.json)
pnpm build
pnpm check:quick                      # lint + typecheck
pnpm taprig:network-guard             # strażnik statyczny (sekundy)
pnpm taprig:offline-smoke             # harness offline (Linux, root lub sudo; ~25 s; 0 naruszeń)
pnpm test:unit                        # ~6-10 min; porównaj z baseline z §6
node bin/agent-device.mjs help commands
```

Nie uruchamiaj `pnpm test:integration:provider` ani komend `connect <provider>` z prawdziwymi
poświadczeniami — łączą się z usługami chmurowymi.

## 9. Kryteria zakończenia następnego etapu (E4b)

Zgodnie z `docs/taprig-implementation-plan.md` §3 E4b:

- [ ] Usunięte `packages/provider-webdriver/`, `src/provider-webdriver.ts` (+ test),
      `src/sdk/plugin-webdriver.ts` (eksport `./plugins/webdriver`),
      `test/integration/provider-scenarios/cloud-webdriver-*`, `bundled-cloud-webdriver-runtimes.ts`,
      część webdriver w `test/integration/smoke-provider-cli-disconnect.test.ts`,
      `test/integration/support/provider-disconnect-fetch.mjs`, testy BrowserStack/AWS.
- [ ] `packages/provider-testmu` (importuje `@agent-device/provider-webdriver`) — usunięty w tym
      samym PR jako osobne commity (zakres E4c) **albo** E4b zatrzymany z pytaniem do właściciela;
      wybór i uzasadnienie w PR.
- [ ] `BUILTIN_PROVIDER_IDS` puste lub usunięte (`src/builtin-provider-ids.ts`,
      `src/builtin-provider-plugins.ts`); `connect browserstack`/`connect aws-device-farm` →
      „Unknown connect provider” bez połączeń; brak wywołań `aws` w `runCmd*`.
- [ ] Flagi `--provider-*`/`--aws-*` używane wyłącznie przez usunięte providery usunięte
      (`packages/command-registry/src/flag-definitions-connection.ts`, `timeout-policy.ts`, pomoc,
      `docs/agents/cli-flags.md`); lokalna funkcja `artifacts` zachowana.
- [ ] Typ `'appium-source'` zawężony w osobnym commicie, gdy nie ma już producentów; testy
      lokalnych snapshotów iOS/Android bez zmian semantyki.
- [ ] Brak `browserstack.com`, `amazonaws`, `devicefarm` w kodzie produkcyjnym i `dist/`;
      `pnpm check:package`, `check:production-exports`, `check:fallow` przechodzą.
- [ ] Allowlista bez wpisów NET-04/NET-05 (i NET-06, jeśli TestMu usunięty); harness: nowy
      scenariusz `connect browserstack` z fikcyjnymi poświadczeniami — 0 naruszeń.
- [ ] PR do `main`; aktualizacja `docs/HANDOFF.md`, `docs/network-audit.md`,
      `docs/taprig-decisions.md`, `docs/upstream-sync.md`.

## 10. Prompt dla agenta realizującego Etap 4b

```text
Jesteś agentem realizującym Etap 4b (E4b) projektu TapRig w repozytorium
https://github.com/rtnk/TapRig. TapRig to fork callstack/agent-device (narzędzia CLI + serwer
MCP + Node.js SDK do automatyzacji iOS/Android i innych platform dla agentów AI), który ma
stać się narzędziem local-first: bez integracji z chmurowymi dostawcami urządzeń, bez
sprawdzania aktualizacji, bez telemetrii, bez niejawnych pobrań z Internetu — przy zachowaniu
lokalnej automatyzacji oraz wywołań HTTP świadomie zapisanych przez użytkownika w skryptach
testowych (Maestro runScript http.post).

Najpierw przeczytaj (w tej kolejności): AGENTS.md, docs/HANDOFF.md,
docs/taprig-implementation-plan.md (§0, §2, §3 E4b i E4c, §4), docs/network-audit.md (§2
NET-04/05/06, §3.3, §8, §9–§11), docs/taprig-decisions.md (D-03, D-02, D-13),
docs/upstream-sync.md, scripts/taprig/offline-harness/README.md, docs/agents/code-ownership.md,
docs/agents/test-authoring.md, docs/agents/cli-flags.md, docs/agents/pull-requests.md. Przed
edycją modułów z wieloma wywołującymi uruchom `pnpm depgraph affected <ścieżka>`.
Sprawdź stan Git (git status, git log -5, gałęzie). Upewnij się, że PR Etapu 4a
(rtnk/TapRig#5, gałąź taprig/e4a-remove-limrun) jest scalony do main; jeżeli nie — zatrzymaj
się i zapytaj właściciela. Pracuj od aktualnego main.

Zakres E4b — usunięcie wbudowanych providerów BrowserStack i AWS Device Farm (NET-04, NET-05),
bez innych zmian zachowania:
1. packages/provider-testmu importuje @agent-device/provider-webdriver. Plan (§3 E4b „Uwaga”)
   dopuszcza usunięcie TestMu w tym samym PR. Zrób to jako pierwsze, osobne commity w zakresie
   E4c (docs/taprig-implementation-plan.md §3 E4c: packages/provider-testmu/,
   src/commands/provider-plugin-catalog.ts, pomoc „TestMu AI … flow”, testy cloud-connect-testmu,
   scripts/check-provider-plugin.mjs, scripts/capability-matrix/*, scripts/layering/*,
   .fallowrc.json, tsconfig.typecheck.json, examples/sdk/tsconfig.json, NET-06 w allowliście).
   Jeżeli okaże się, że TestMu wymaga zmian poza tym zakresem (np. systemu pluginów — E5),
   zatrzymaj się i zapytaj właściciela.
2. Usuń packages/provider-webdriver/, src/provider-webdriver.ts (+ test),
   src/sdk/plugin-webdriver.ts (eksport ./plugins/webdriver), testy
   test/integration/provider-scenarios/cloud-webdriver-*, bundled-cloud-webdriver-runtimes.ts,
   część webdriver w test/integration/smoke-provider-cli-disconnect.test.ts,
   test/integration/support/provider-disconnect-fetch.mjs. Lokalizuj kod przez
   git grep -il -e browserstack -e devicefarm -e aws-device-farm -e provider-webdriver —
   numery linii w dokumentach dotyczą commita bazowego.
3. src/builtin-provider-ids.ts i src/builtin-provider-plugins.ts — bez kandydatów WebDriver
   (BUILTIN_PROVIDER_IDS puste lub usunięte); src/provider-plugin-policy.ts, src/sdk/plugins.ts,
   packages/contracts/src/device-provider.ts, packages/contracts/src/provider-connection.ts,
   src/cli/connection/provider-policy.ts, src/cli/commands/connection-presentation.ts,
   connection-runtime.ts, connect-provider-adapters.ts (withProviderConnection bez
   bundledCloudWebDriverConnection). Po zmianie connect browserstack i connect aws-device-farm
   kończą się standardowym „Unknown connect provider” (bez aliasu i bez specjalnego błędu —
   D-02 nierozstrzygnięta). Nie zmieniaj connect proxy, connect --remote-config, systemu
   pluginów (E5) ani trybu zdalnego (E6).
4. Flagi: usuń --provider-*/--aws-* używane wyłącznie przez usunięte providery
   (packages/command-registry/src/flag-definitions-connection.ts, CliFlags, timeout-policy.ts,
   command-overrides, pomoc, scripts/help-conformance-*, docs/agents/cli-flags.md). Flagi
   współdzielone z mechanizmem dzierżaw lub pluginami zostaw i opisz w PR.
   src/commands/management/artifacts.ts: usuń tylko artefakty sesji providera; lokalna funkcja
   artefaktów daemona zostaje.
5. package.json (eksport ./plugins/webdriver, devDependencies @agent-device/provider-webdriver i
   @agent-device/testmu), pnpm-lock.yaml wyłącznie przez pnpm install, tsdown.config.ts (wejście
   plugins/webdriver; deps.onlyBundle — usuń pozycje, które build zgłasza jako „not used”),
   tsconfig.typecheck.json, examples/sdk/tsconfig.json, .fallowrc.json, fallow-baselines/,
   scripts/layering/*, scripts/capability-matrix/* (kolumny providerów; potem
   pnpm generate:capabilities), test/repo-guards/package-exports.test.ts,
   test/integration/installed-package-metro.test.ts (smoke ./plugins/webdriver; fixture
   „plugin z id wbudowanym” używa teraz 'browserstack' — po E4b nie ma id wbudowanych, przepisz
   ten przypadek), website/docs (browserstack.md, aws-device-farm.md, testmu.md,
   device-clouds.md, _meta.json, client-api.md, build-an-integration.md), README.md.
6. Typ 'appium-source' (producent snapshotu z WebDriver, iOS i Android) zawęź w osobnym commicie
   dopiero, gdy nie ma żadnego producenta (packages/kernel/src/snapshot.ts SnapshotProvenance,
   packages/contracts/src/ios-snapshot.ts, packages/capture-kit/src/ios-snapshot-acquisition.ts,
   stable-capture.ts, tap-keyboard-occlusion.ts, snapshot-assembly-presentation-policy.ts).
   Ryzyko wysokie: nie zmieniaj semantyki lokalnych ścieżek iOS/Android. E4a przeniósł kilka
   testów ogólnych mechanizmów na BrowserStack (src/__tests__/cloud-connect-profile.test.ts
   „verification fails”, src/daemon-client/__tests__/daemon-client-provider-credentials.test.ts,
   src/provider-credential-fingerprint.test.ts, src/__tests__/provider-device-runtimes.test.ts,
   src/__tests__/snapshot-desktop-surface.test.ts z producentem appium-source) — przenieś je na
   neutralnego providera (plugin testowy lub wpis inwentarza), nie usuwaj testów mechanizmów,
   które zostają.
7. Po usunięciu kodu uruchom pnpm check:production-exports i pnpm check:fallow: helpery
   używane tylko przez WebDriver usuń razem z testami (jak w E4a commit 4), w osobnym commicie.
8. Testy: (a) connect browserstack i connect aws-device-farm z fikcyjnymi poświadczeniami →
   INVALID_ARGS „Unknown connect provider”, 0 wywołań fetch/runCmd/runCmdDetached/daemona;
   (b) daemon z BROWSERSTACK_*/AWS_* w env nie rejestruje żadnego providera wbudowanego;
   (c) testy lokalnych snapshotów (packages/capture-kit, packages/platform-apple,
   packages/platform-android), connect proxy i connect --remote-config przechodzą bez
   osłabiania. Nowy test regresyjny musi failować na kodzie sprzed E4b z właściwego powodu —
   sprawdź w osobnym worktree (git worktree add w katalogu tymczasowym, pnpm install
   --frozen-lockfile, potem git worktree remove).
9. Strażnik: usuń z scripts/taprig/network-allowlist.json wpisy NET-04/NET-05 (i NET-06) dla
   usuniętych plików i zmniejsz count w zmienionych — pnpm taprig:network-guard zgłosi
   stale/count. Nie dodawaj nowych wpisów. Markery browserstack.com/amazonaws.com/devicefarm/
   lambdatest.com w regułach strażnika zostają.
10. Harness: dodaj scenariusz (scripts/taprig/offline-harness/run.sh, README.md)
   `connect browserstack --platform android --device "Google Pixel 8" --provider-os-version 14.0
   --provider-app bs://app-id` z BROWSERSTACK_USERNAME/BROWSERSTACK_ACCESS_KEY=<atrapa> w env.
   Sprawdź przed usunięciem kodu, co scenariusz wykrywa (oczekiwane: DNS do api.browserstack.com),
   i zapisz wynik w PR. Po E4b oczekiwanie — 0 naruszeń; expectations.json ma zostać pusty.
   Nie osłabiaj klasyfikacji.
11. Dokumentacja: docs/network-audit.md (NET-04/05/06 → „DONE w E4b, PR #…”, nowy § ze stanem
   strażnika i harnessu), docs/taprig-decisions.md (D-03: postęp), docs/upstream-sync.md
   (obszary kolizji WebDriver i TestMu → usunięte). Znane z E4a (docs/HANDOFF.md §7 p.12):
   pomoc `help remote` ma przestarzałą linię „Cloud: agent-device connect …” — popraw ją przy
   zmianach pomocy connect, z testem w cli-help-topics.test.ts.
12. Nie zmieniaj niczego poza zakresem (pluginy, tryb zdalny, rebranding, E7). Diff przekroczy
   2 500 linii — podziel pracę na kolejne commity w jednym PR (docs/agents/pull-requests.md) i
   opisz to.

Weryfikacja przed PR: pnpm install --frozen-lockfile && pnpm build; pnpm format;
pnpm check:quick; pnpm test:unit w `unshare -n` z podniesionym lo
(`unshare -n bash -c 'python3 -I scripts/taprig/offline-harness/lo_up.py lo && pnpm test:unit'`)
— porównaj z baseline z docs/HANDOFF.md §6; nowe błędy muszą być wyjaśnione lub naprawione,
nie ukrywaj ich; po commicie: pnpm check:layering; pnpm check:production-exports;
pnpm check:package; pnpm check:gate-manifest; pnpm check:fallow; pnpm check:mcp-metadata;
pnpm check:bundle-owner-files; pnpm check:command-docs; pnpm check:capabilities-matrix;
pnpm check:agent-guidance; pnpm taprig:network-guard; pnpm taprig:offline-smoke (raport w PR);
ręcznie: git grep -il -e browserstack -e devicefarm -e testmu -- src packages (lista
pozostałych w PR); grep -rliE "browserstack|devicefarm|lambdatest" dist/ → brak. Nie
wyłączaj ani nie pomijaj istniejących testów/bramek.

Rezultat: gałąź taprig/e4b-remove-webdriver-providers, commity w konwencji type(scope): opis,
PR do main w rtnk/TapRig z opisem: co usunięto, zachowanie connect/daemona po zmianie, wyniki
testów, raport harnessu, diff allowlisty. Jeżeli nie możesz utworzyć PR, wypchnij gałąź i
podaj instrukcję.

Na koniec zaktualizuj docs/HANDOFF.md: stan (E4b ukończony, link do PR), wyniki testów, nowe
ryzyka, następny etap (E4c, jeśli TestMu nie został usunięty; w przeciwnym razie E5 — wymaga
decyzji D-13 — albo E7, zgodnie z docs/taprig-implementation-plan.md) oraz kompletny prompt dla
agenta tego etapu w tym samym formacie. Nie rozpoczynaj kolejnego etapu.
```
