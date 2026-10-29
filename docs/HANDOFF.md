# TapRig — handoff

Ten plik jest punktem startowym dla każdego agenta realizującego kolejny etap. Nie zakładaj
znajomości wcześniejszych rozmów — wszystko, czego potrzebujesz, jest w repozytorium.

## 1. Stan projektu

| Pole | Wartość |
| --- | --- |
| Ostatni ukończony etap | **E3** — usunięcie chmury agent-device (NET-02, NET-03) |
| PR Etapu 3 | [rtnk/TapRig#4](https://github.com/rtnk/TapRig/pull/4) (gałąź `taprig/e3-remove-cloud`) |
| PR wcześniejszych etapów | E0: #1, E1: [#2](https://github.com/rtnk/TapRig/pull/2), E2: [#3](https://github.com/rtnk/TapRig/pull/3) — scalone |
| Następny etap | **E4a** — usunięcie providera Limrun (NET-07) |
| Repozytorium | `https://github.com/rtnk/TapRig` |
| Upstream | `https://github.com/callstack/agent-device` (remote `upstream`; procedura: `docs/upstream-sync.md`) |
| Commit bazowy (upstream `main`) | `3537dc549a5edb248f918990a137c536fc46ee50` — 2026-10-28; `package.json` → `0.21.34-dev` |
| Gałąź `main` w TapRig | commit bazowy + PR #1 (E0) + #2 (E1) + #3 (E2) + #4 (E3, po scaleniu) |
| Zmiany zachowania narzędzia | E2: brak sprawdzania aktualizacji. E3: brak komendy `auth` („Unknown command”), brak flagi `--no-login`, zmienne `AGENT_DEVICE_CLOUD_AUTH`/`AGENT_DEVICE_CLOUD_BASE_URL` nie mają znaczenia, `connect` bez providera i bez `--remote-config` → `INVALID_ARGS` „connect requires a provider” (`details.reason: "connect-provider-required"`) bez połączeń. `connect proxy`, `connect --remote-config` i providery (Limrun, BrowserStack, AWS Device Farm, TestMu) bez zmian |

## 2. Wykonane działania (E3)

1. Usunięte `src/cli/auth-session.ts`, `src/cli/cloud-response.ts`, `src/cli/browser-launch.ts`
   (`git grep browser-launch` — jedynym użytkownikiem był `auth-session.ts`),
   `src/cli/connection/cloud-profile.ts`, `src/cli/commands/auth.ts` i testy
   (`src/cli/__tests__/{auth-session,browser-launch}.test.ts`,
   `src/cli/commands/__tests__/auth.test.ts`, `src/__tests__/cloud-connect-auth.test.ts`, 5 testów
   providera `cloud` i ich helpery w `src/__tests__/cloud-connect-profile.test.ts`).
2. `src/cli.ts`: usunięte wywołanie `resolveRemoteAuthForCli` i `shouldResolveRemoteAuth`. Token
   daemona z `--daemon-auth-token`/`AGENT_DEVICE_DAEMON_AUTH_TOKEN` czyta dalej klient daemona
   (`src/daemon-client/daemon-client-lifecycle.ts`) — dla tokenu z flagi/env funkcja i tak
   zwracała flagi bez zmian.
3. `connect-provider-adapters.ts`: usunięty adapter `cloud`; bez providera (i bez skrótu `proxy`)
   typowany `AppError('INVALID_ARGS', 'connect requires a provider', { reason:
   'connect-provider-required', hint })`, zanim cokolwiek łączy się z siecią.
   `provider-policy.ts`: usunięty wyjątek `'cloud'`. `router.ts`, deskryptor `auth`
   (`packages/command-registry/src/registry.ts`), pomoc (`command-overrides.ts`: `auth`, opis
   `connect`; `cli-help.ts`: `AGENT_DEVICE_CLOUD_BASE_URL`, „Cloud profile flow”, reguła
   „connect without --remote-config…”) usunięte/poprawione.
4. Flaga `--no-login` (tylko dla logowania chmurowego) usunięta: `flag-definitions-connection.ts`,
   `CliFlags`, `command-overrides.ts`, `scripts/integration-progress-model.ts`.
5. `'cloud'` usunięte z `ROUTING_PROVIDER_IDENTITIES` (`packages/plugins/src/manifest.ts`,
   komentarz w `contract.ts`). `CLOUD_LEASE_PROVIDER` przestał być eksportowany, ale **zostaje**
   w `RUNTIME_LESS_LEASE_PROVIDERS` (`packages/contracts/src/lease-scope.ts`): to kontrakt
   dopuszczenia dzierżaw daemona (`packages/daemon/src/sessions/handlers/lease.ts`) dla zdalnych
   klientów — D-19 / E6d. Lokalny CLI nie wysyła już tej wartości.
6. Testy: nowy `src/__tests__/cli-connect-requires-provider.test.ts` — (a) `connect --json` z
   `AGENT_DEVICE_DAEMON_AUTH_TOKEN` → `INVALID_ARGS`, `details.reason`, 0 wywołań `fetch`,
   `runCmd`, `runCmdDetached` i daemona; (b) `auth login` → „Unknown command: auth”. Na kodzie
   sprzed E3 oba failują (`UNKNOWN` — `fetch` wywołany; `UNAUTHORIZED` — logowanie chmurowe).
   Testy używające `auth` jako przykładowej komendy bez flag urządzeń przeniesione na `daemon`
   (`option-schema.test.ts`, `args-parse-session.test.ts`); test pomocy `connect` sprawdza brak
   chmury. Fixture testu redakcji (`packages/host-kit/src/internal/diagnostics.test.ts`) używa
   hostów `example.com`.
7. Strażnik: usunięte 4 wpisy NET-02/NET-03 → 366 wystąpień, 167 wpisów, 77 `REMOVE`, 28 ID.
   Harness: nowy scenariusz `connect-no-provider`; przed E3 — 6 zapytań DNS, po E3 — 0 naruszeń.
8. `fallow-baselines/health.json`: usunięty wpis `src/cli/auth-session.ts`.
   `website/docs/docs/{commands,configuration}.md`: opis chmury i zmienna usunięte.
9. Dokumenty: `docs/network-audit.md` (NET-02/03 → DONE w E3, §3.2, nowy §10),
   `docs/taprig-decisions.md` (D-03: postęp), `docs/upstream-sync.md` (obszar kolizji),
   `scripts/taprig/offline-harness/README.md`, `expectations.json` (komentarz).
10. Bez aliasów i specjalnych błędów (D-02 nierozstrzygnięta). Poza zakresem (bez zmian):
    `connect proxy`, providery, tryb zdalny, pluginy, linki `agent-device.dev` w
    `README.md`/`package.json` `homepage` (rebranding E9), testy Metro z hostami
    `*.metro.agent-device.dev` (fixture'y mostu Metro — E6b).

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
2. **Update check** (NET-01): **usunięty w E2** (PR #3). Wcześniej odłączony worker pobierał
   `registry.npmjs.org/agent-device/<tag>` co 14 dni przy komendach CLI z TTY.
3. **Chmura agent-device** (NET-02/03): **usunięta w E3** (PR #4). Wcześniej `connect` bez
   argumentów logował się do `cloud.agent-device.dev` i pobierał profil połączenia.
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

E3 wykonany. E4a (D-03, ACCEPTED) nie wymaga decyzji właściciela. Usunięcie eksportu SDK
`agent-device/limrun` dotyczy D-02 — bez decyzji właściciela E4a nie dodaje aliasu ani zastępczego
modułu (eksport przestaje istnieć), tak jak E2/E3. E4b, E4c (po E4b) i E7 (w części PROPOSED) też
można realizować; E5 wymaga D-13; E6a–d wymagają D-04.

## 6. Stan testów

Środowisko E3: Linux (kontener, root), Node 22.22.0, pnpm 11.17.0, bez Xcode/Android SDK.

`pnpm test:unit` w `unshare -n` z podniesionym `lo`
(`unshare -n bash -c 'python3 -I scripts/taprig/offline-harness/lo_up.py lo && pnpm test:unit'`),
stan po E3: **1 820 plików przechodzi, 8 testów w 6 plikach nie przechodzi, 3 pliki / 65 testów
pominięte** (16 061 testów, 15 988 przechodzi). E3 usunął 4 pliki testów chmury i 5 testów
`cloud` w `cloud-connect-profile.test.ts`, dodał `cli-connect-requires-provider.test.ts` (2 testy).
Pierwszy przebieg wykrył jeden nowy błąd — asercja listy providerów z `cloud` w
`src/__tests__/remote-connection.test.ts` — poprawiony (lista bez `cloud`). Pozostałe
niepowodzenia są identyczne jak w E1/E2 — środowiskowe, występowały już w E0:

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

Pozostałe kontrole E3 (lokalnie, na gałęzi `taprig/e3-remove-cloud`): `pnpm build`,
`pnpm check:quick` (lint + typecheck), `pnpm format` / `format:check`, `pnpm check:layering`
(po commicie), `pnpm check:production-exports`, `pnpm check:package`,
`pnpm check:gate-manifest`, `pnpm check:mcp-metadata`, `pnpm check:command-docs`,
`pnpm check:bundle-owner-files`, `pnpm check:di-seams`, `pnpm check:doc-links`,
`pnpm check:agent-guidance`, `pnpm check:fallow` (to samo odziedziczone ostrzeżenie złożoności
`parseCliInputOrExit` w `src/cli.ts`, wykluczone z bramki) — OK. `pnpm taprig:network-guard` —
OK (366 wystąpień, 167 wpisów, 77 `REMOVE`, 28 ID). `pnpm taprig:offline-smoke` — **PASS,
0 naruszeń** we wszystkich 6 scenariuszach (z nowym `connect-no-provider`).
`grep -rlF agent-device.dev dist/` → brak; `git grep -nF cloud.agent-device.dev -- src packages`
→ brak.

Znane z E1: `integration-node` (2 testy w `test/integration/smoke-daemon-clean.test.ts`) failuje
w tym kontenerze także na niezmienionym `main` — środowiskowo; w E2/E3 nie uruchamiano ponownie.
Autorytatywne są joby CI w PR.

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
11. (E2) Usunięcie zmiennej `AGENT_DEVICE_NO_UPDATE_NOTIFIER` jest niewidoczne dla użytkownika
    (zmienna jest ignorowana). Skrypty/CI zewnętrzne, które ją ustawiają, działają dalej.
12. (E2) Upstream nadal rozwija update check. Merge może przywrócić `src/cli/update-check*.ts`
    i wywołanie w `src/cli.ts` bez konfliktu (typecheck tego nie wykryje). Wykrywają to strażnik
    (`registry.npmjs.org` jako `unlisted`), test `cli-no-update-check.test.ts` i harness (DNS).
13. (E3) Zapisany stan połączenia lub plik `--remote-config`/`--config` z `leaseProvider: "cloud"`
    sprzed E3 nie jest już rozpoznawany jako provider wbudowany: CLI szuka pluginu o tej nazwie
    i traktuje profil jak zwykły zdalny daemon (`remote-provider`). Daemon nadal przyjmuje
    dzierżawę `leaseProvider: "cloud"` bez runtime'u (`RUNTIME_LESS_LEASE_PROVIDERS`) — do E6d.
14. (E3) Plugin może teraz zarejestrować provider o id `cloud` (nie jest już zarezerwowany).
    System pluginów usuwa E5 (D-13).
15. (E3) Upstream rozwija chmurę (`auth-session.ts`, adapter `cloud`). Merge może przywrócić
    domyślny provider `cloud` w `connect-provider-adapters.ts` bez konfliktu w nowych plikach.
    Wykrywają to strażnik (`agent-device.dev` jako `unlisted`), test
    `cli-connect-requires-provider.test.ts` i scenariusz harnessu `connect-no-provider`.

## 8. Uruchomienie środowiska i komendy weryfikacyjne

```sh
git clone https://github.com/rtnk/TapRig && cd TapRig
git remote add upstream https://github.com/callstack/agent-device
git fetch upstream main
pnpm install --frozen-lockfile        # Node >= 22.12, pnpm 11 (packageManager w package.json)
pnpm build
pnpm check:quick                      # lint + typecheck
pnpm taprig:network-guard             # strażnik statyczny (sekundy)
pnpm taprig:offline-smoke             # harness offline (Linux, root lub sudo; ~20 s; od E2: 0 naruszeń)
pnpm test:unit                        # ~6-10 min; porównaj z baseline z §6
node bin/agent-device.mjs help commands
```

Nie uruchamiaj `pnpm test:integration:provider` ani komend `connect <provider>` z prawdziwymi
poświadczeniami — łączą się z usługami chmurowymi.

## 9. Kryteria zakończenia następnego etapu (E4a)

Zgodnie z `docs/taprig-implementation-plan.md` §3 E4a:

- [ ] Usunięte `packages/provider-limrun/`, `src/provider-limrun-*.ts`, `src/sdk/limrun*.ts`,
      `src/vendor/limrun-delta-sync-omitted.ts`, `src/cli/connection/limrun-profile.ts` i testy
      Limrun (`src/**/*limrun*`, `test/integration/limrun-public-types.test.ts`,
      `test/integration/provider-scenarios/limrun-*`).
- [ ] Brak kandydata Limrun w rejestrze daemona (`src/builtin-provider-plugins.ts`),
      `LIMRUN_ID`/`LIMRUN_CONNECTION` (`src/builtin-provider-ids.ts`), adaptera `limrun` i
      `verifyLimrun` (`connect-provider-adapters.ts`); poświadczenia Limrun w env niczego nie
      aktywują; `connect limrun` → „Unknown connect provider”.
- [ ] Brak eksportu `./limrun`, zależności `@limrun/api` i `@agent-device/provider-limrun`
      (`package.json`, `pnpm-lock.yaml` przez `pnpm install`, `pnpm-workspace.yaml`
      `minimumReleaseAgeExclude`; override `undici` tylko jeśli nieużywany), wpisów w
      `tsdown.config.ts`, `tsconfig.typecheck.json`, `examples/sdk/tsconfig.json`,
      `.fallowrc.json`, `fallow-baselines/`, `scripts/layering/*`, `scripts/capability-matrix/*`.
- [ ] Typy współdzielone zawężone (`'limrun-ios-tree'` w `packages/contracts/src/ios-snapshot.ts`,
      `packages/kernel/src/snapshot.ts`, `packages/capture-kit/src/ios-snapshot-acquisition.ts`)
      w osobnym commicie; testy lokalnych snapshotów iOS bez zmian semantyki; fixture'y z
      `limrun` jako przykładowym providerem → neutralny provider testowy.
- [ ] `git grep -il limrun -- src packages` → tylko świadomie pozostawione wpisy (lista w PR);
      `dist/` bez kodu `@limrun/api`; `pnpm check:package` i `pnpm check:production-exports`
      przechodzą.
- [ ] Allowlista bez wpisów NET-07; harness: nowy scenariusz (`devices --platform android` z
      atrapą `LIMRUN_API_KEY` w env) — 0 naruszeń; wszystkie scenariusze bez naruszeń.
- [ ] PR do `main`; aktualizacja `docs/HANDOFF.md`, `docs/network-audit.md` (NET-07 → DONE),
      `docs/taprig-decisions.md`, `docs/upstream-sync.md`.

## 10. Prompt dla agenta realizującego Etap 4a

```text
Jesteś agentem realizującym Etap 4a (E4a) projektu TapRig w repozytorium
https://github.com/rtnk/TapRig. TapRig to fork callstack/agent-device (narzędzia CLI + serwer
MCP + Node.js SDK do automatyzacji iOS/Android i innych platform dla agentów AI), który ma
stać się narzędziem local-first: bez integracji z chmurowymi dostawcami urządzeń, bez
sprawdzania aktualizacji, bez telemetrii, bez niejawnych pobrań z Internetu — przy zachowaniu
lokalnej automatyzacji oraz wywołań HTTP świadomie zapisanych przez użytkownika w skryptach
testowych (Maestro runScript http.post).

Najpierw przeczytaj (w tej kolejności): AGENTS.md, docs/HANDOFF.md,
docs/taprig-implementation-plan.md (§0, §2, §3 E4a, §4), docs/network-audit.md (§2 NET-07,
§3.3, §8, §9, §10), docs/taprig-decisions.md (D-03, D-02, D-13), docs/upstream-sync.md,
scripts/taprig/offline-harness/README.md, docs/agents/code-ownership.md,
docs/agents/test-authoring.md, docs/agents/cli-flags.md. Przed edycją modułów z wieloma
wywołującymi uruchom `pnpm depgraph affected <ścieżka>`.
Sprawdź stan Git (git status, git log -5, gałęzie). Upewnij się, że PR Etapu 3
(rtnk/TapRig#4, gałąź taprig/e3-remove-cloud) jest scalony do main; jeżeli nie — zatrzymaj
się i zapytaj właściciela. Pracuj od aktualnego main.

Zakres E4a — usunięcie providera Limrun (NET-07), bez innych zmian zachowania:
1. Usuń packages/provider-limrun/, src/provider-limrun-credentials.ts,
   src/provider-limrun-runtime.ts, src/sdk/limrun*.ts, src/vendor/limrun-delta-sync-omitted.ts,
   src/cli/connection/limrun-profile.ts, src/daemon-runtime-limrun-public-http.test.ts, testy
   src/__tests__/*limrun*, testy Limrun w src/__tests__/cloud-connect-profile*.test.ts,
   test/integration/limrun-public-types.test.ts, test/integration/provider-scenarios/limrun-*.
   Lokalizuj kod przez git grep -il limrun — numery linii w dokumentach dotyczą commita
   bazowego.
2. src/builtin-provider-plugins.ts — usuń kandydata Limrun (aktywacja z poświadczeń w env);
   src/builtin-provider-ids.ts — LIMRUN_ID, LIMRUN_CONNECTION; connect-provider-adapters.ts —
   adapter limrun i verifyLimrun. Po zmianie connect limrun kończy się standardowym błędem
   „Unknown connect provider” (bez aliasu i bez specjalnego błędu — D-02 nierozstrzygnięta).
   Nie zmieniaj connect proxy, connect --remote-config, providerów WebDriver (E4b), TestMu
   (E4c), systemu pluginów (E5) ani trybu zdalnego (E6).
3. package.json — eksport ./limrun, devDependencies @limrun/api i
   @agent-device/provider-limrun; tsdown.config.ts (wpis limrun, dropAmbientDeclarationImport
   dla @limrun/api); pnpm-workspace.yaml (minimumReleaseAgeExclude dla @limrun/api; override
   undici zostaw, jeśli undici jest nadal używany — sprawdź git grep undici); pnpm-lock.yaml
   wyłącznie przez pnpm install (nie edytuj ręcznie); tsconfig.typecheck.json,
   examples/sdk/tsconfig.json, .fallowrc.json, fallow-baselines/, scripts/layering/*,
   scripts/capability-matrix/*, scripts/__tests__/package-closure-audit.test.ts,
   test/repo-guards/package-exports.test.ts, src/sdk/host.ts (wpis limrun w captureSdkHost —
   docs/agents/code-ownership.md), pomoc (src/commands/schema/cli-help.ts, command-overrides.ts),
   website/docs (strony i wpisy Limrun, _meta.json), skills/ (jeśli opisują Limrun),
   metadane MCP (pnpm check:mcp-metadata), dokumentacja komend (bramka command-docs).
4. Typy współdzielone w osobnym commicie: zawęź 'limrun-ios-tree'
   (packages/contracts/src/ios-snapshot.ts, packages/kernel/src/snapshot.ts,
   packages/capture-kit/src/ios-snapshot-acquisition.ts) oraz pozostałe wystąpienia w
   src/commands/capture/*, src/commands/system/index.ts,
   packages/maestro/src/internal/support-matrix.ts,
   packages/daemon/src/server/request-diagnostics-http.ts. Ryzyko wysokie: przecięcia z
   lokalnymi snapshotami i alertami iOS — nie zmieniaj semantyki ścieżek lokalnych. Testy w
   packages/daemon, packages/contracts, packages/capture-kit, które używają napisu limrun jako
   przykładowego providera, przepisz na neutralny provider testowy; nie usuwaj testów
   zachowań lokalnych.
5. Testy: (a) poświadczenia Limrun w env (np. LIMRUN_API_KEY=<atrapa>) nie rejestrują żadnego
   providera w daemonie i nie powodują połączeń; (b) connect limrun → INVALID_ARGS „Unknown
   connect provider”; (c) testy lokalnych snapshotów iOS (packages/capture-kit,
   packages/platform-apple), connect proxy i connect browserstack/aws-device-farm przechodzą
   bez osłabiania. Nowy test regresyjny musi failować na kodzie sprzed E4a z właściwego powodu
   (docs/agents/test-authoring.md).
6. Strażnik: usuń z scripts/taprig/network-allowlist.json wpisy NET-07 dla usuniętych plików
   i zmniejsz count w plikach zmienionych — `pnpm taprig:network-guard` zgłosi stale/count.
   Nie dodawaj nowych wpisów.
7. Harness: dodaj scenariusz (scripts/taprig/offline-harness/run.sh, README.md), np.
   `devices --platform android` z LIMRUN_API_KEY=<atrapa> w env; oczekiwanie — 0 naruszeń.
   Sprawdź przed usunięciem kodu, czy na kodzie sprzed E4a scenariusz cokolwiek wykrywa, i
   zapisz wynik w PR (Limrun może łączyć się dopiero przy dzierżawie — wtedy opisz to).
   expectations.json ma zostać pusty. Nie osłabiaj klasyfikacji.
8. Dokumentacja: docs/network-audit.md (NET-07 → „DONE w E4a, PR #…”, nowy § ze stanem
   strażnika i harnessu), docs/taprig-decisions.md (D-03: postęp), docs/upstream-sync.md
   (obszar kolizji Limrun → usunięty).
9. Nie zmieniaj niczego poza zakresem Limrun (np. WebDriver, TestMu, pluginów, trybu
   zdalnego, rebrandingu). Jeśli diff przekroczy 2 500 linii, podziel pracę na kolejne
   commity w jednym PR (docs/agents/pull-requests.md) i opisz to.

Weryfikacja przed PR: pnpm install --frozen-lockfile && pnpm build; pnpm format;
pnpm check:quick; pnpm test:unit w `unshare -n` z podniesionym lo
(`unshare -n bash -c 'python3 -I scripts/taprig/offline-harness/lo_up.py lo && pnpm test:unit'`)
— porównaj z baseline z docs/HANDOFF.md §6; nowe błędy muszą być wyjaśnione lub naprawione,
nie ukrywaj ich; po commicie: pnpm check:layering; pnpm check:production-exports;
pnpm check:package; pnpm check:gate-manifest; pnpm check:fallow; pnpm check:mcp-metadata;
pnpm check:bundle-owner-files; pnpm taprig:network-guard; pnpm taprig:offline-smoke (raport w
PR); ręcznie: git grep -il limrun -- src packages (lista pozostałych w PR);
grep -rl "@limrun/api" dist/ → brak. Nie wyłączaj ani nie pomijaj istniejących testów/bramek.

Rezultat: gałąź taprig/e4a-remove-limrun, commity w konwencji type(scope): opis, PR do main w
rtnk/TapRig z opisem: co usunięto, zachowanie connect/daemona po zmianie, wyniki testów,
raport harnessu, diff allowlisty. Jeżeli nie możesz utworzyć PR, wypchnij gałąź i podaj
instrukcję.

Na koniec zaktualizuj docs/HANDOFF.md: stan (E4a ukończony, link do PR), wyniki testów, nowe
ryzyka, następny etap (E4b — usunięcie BrowserStack i AWS Device Farm, zgodnie z
docs/taprig-implementation-plan.md §3 E4b) oraz kompletny prompt dla agenta E4b w tym samym
formacie. Nie rozpoczynaj E4b.
```
