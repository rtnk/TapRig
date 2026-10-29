# TapRig — handoff

Ten plik jest punktem startowym dla każdego agenta realizującego kolejny etap. Nie zakładaj
znajomości wcześniejszych rozmów — wszystko, czego potrzebujesz, jest w repozytorium.

## 1. Stan projektu

| Pole | Wartość |
| --- | --- |
| Ostatni ukończony etap | **E2** — usunięcie sprawdzania aktualizacji (NET-01) |
| PR Etapu 2 | [rtnk/TapRig#3](https://github.com/rtnk/TapRig/pull/3) (gałąź `taprig/e2-remove-update-check`) |
| PR wcześniejszych etapów | E0: #1, E1: [#2](https://github.com/rtnk/TapRig/pull/2) — scalone |
| Następny etap | **E3** — usunięcie chmury agent-device (NET-02, NET-03) |
| Repozytorium | `https://github.com/rtnk/TapRig` |
| Upstream | `https://github.com/callstack/agent-device` (remote `upstream`; procedura: `docs/upstream-sync.md`) |
| Commit bazowy (upstream `main`) | `3537dc549a5edb248f918990a137c536fc46ee50` — 2026-10-28; `package.json` → `0.21.34-dev` |
| Gałąź `main` w TapRig | commit bazowy + PR #1 (E0) + PR #2 (E1) + PR #3 (E2, po scaleniu) |
| Zmiany zachowania narzędzia | E2: CLI nie sprawdza aktualizacji, nie uruchamia workera i nie wypisuje komunikatu „Update available”; `AGENT_DEVICE_NO_UPDATE_NOTIFIER` nie ma znaczenia. Poza tym bez zmian |

## 2. Wykonane działania (E2)

1. Usunięte `src/cli/update-check.ts`, `src/cli/update-check-entry.ts`,
   `src/cli/__tests__/update-check.test.ts`; import i wywołanie `maybeRunUpgradeNotifier` w
   `src/cli.ts`; wpis `internal/update-check-entry` w `tsdown.config.ts`; wpis
   `src/cli/update-check-entry.ts` w `.fallowrc.json` (`entry`).
2. Nowy test `src/__tests__/cli-no-update-check.test.ts`: `runCli` (`devices --platform android`)
   z TTY na stderr, bez `CI`/`NODE_ENV` i z czystym state dir nie wywołuje `runCmdDetached`, nie
   tworzy `update-check.json` i nie wypisuje „Update available”. Na kodzie sprzed E2 test
   failuje (`runCmdDetached` wywołany raz).
3. `AGENT_DEVICE_NO_UPDATE_NOTIFIER` usunięte z `scripts/check-package.ts`,
   `scripts/check-provider-plugin.mjs`, `scripts/ios-snapshot-benchmark/{cli-process,lifecycle,proxy-process}.ts`,
   `scripts/lib/bench-host.ts`, `src/cli/commands/__tests__/plugins.test.ts`; usunięty test
   `test/repo-guards/npm-package-scripts.test.ts` „the package gate disables the detached update
   notifier…” (niezmiennik przestał istnieć). Bez aliasu zgodności (D-02).
4. `website/docs/docs/{configuration,installation,security-trust}.md`: zmienna usunięta; tekst
   „The CLI does not check for newer releases”.
5. Strażnik: usunięte 3 wpisy NET-01 → 391 wystąpień, 171 wpisów, 81 `REMOVE`, 30 ID.
   Harness: `expectations.json` pusty; wszystkie scenariusze bez naruszeń.
6. Dokumenty: `docs/network-audit.md` (NET-01 → DONE w E2, §3.1, nowy §9),
   `docs/taprig-decisions.md` (D-03: postęp), `docs/upstream-sync.md` (obszar kolizji),
   `scripts/taprig/offline-harness/README.md`.
7. Poza zakresem (świadomie bez zmian): `scripts/release-plan.mjs` odpytuje
   `registry.npmjs.org` — narzędzie wydań upstream, nie runtime (E11). Nazwa `agent-device` w
   tekstach (`npm install -g agent-device@latest`) — rebranding E9.

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

E2 wykonany. E3 (D-03, ACCEPTED) nie wymaga decyzji właściciela, z jednym zastrzeżeniem: zachowanie
usuniętej komendy `auth` zależy od D-02 — bez decyzji właściciela E3 nie dodaje aliasu ani
specjalnego błędu (zostaje standardowa „unknown command”), tak jak E2 nie dodał aliasu zmiennej.
E4a–c i E7 (w części PROPOSED) też można realizować; E5 wymaga D-13; E6a–d wymagają D-04.

## 6. Stan testów

Środowisko E2: Linux (kontener, root), Node 22.22.0, pnpm 11.17.0, bez Xcode/Android SDK.

`pnpm test:unit` w `unshare -n` (tylko loopback), stan po E2: **1 823 pliki przechodzą,
8 testów w 6 plikach nie przechodzi, 65 pominiętych** (16 097 testów, 16 024 przechodzą; E2
usunął `update-check.test.ts` i test bramki paczki dla zmiennej opt-out, dodał
`cli-no-update-check.test.ts`). Niepowodzenia są identyczne jak w E1 — środowiskowe,
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

Pozostałe kontrole E2 (lokalnie, na gałęzi `taprig/e2-remove-update-check`): `pnpm build`,
`pnpm check:quick` (lint + typecheck), `pnpm format`, `pnpm check:layering` (po commicie),
`pnpm check:production-exports`, `pnpm check:package`, `pnpm check:gate-manifest`,
`pnpm check:fallow` (jedno odziedziczone ostrzeżenie złożoności `parseCliInputOrExit` w
`src/cli.ts`, wykluczone z bramki) — OK. `pnpm taprig:network-guard` — OK (391 wystąpień,
171 wpisów, 81 `REMOVE`). `pnpm taprig:offline-smoke` — **PASS, 0 naruszeń** we wszystkich
scenariuszach. `ls dist/src/internal | grep update-check` → brak;
`git grep -n registry.npmjs.org -- src packages` → brak; `grep -rl registry.npmjs.org dist/` → brak.

Znane z E1: `integration-node` (2 testy w `test/integration/smoke-daemon-clean.test.ts`) failuje
w tym kontenerze także na niezmienionym `main` — środowiskowo; w E2 nie uruchamiano ponownie.
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

## 8. Uruchomienie środowiska i komendy weryfikacyjne

```sh
git clone https://github.com/rtnk/TapRig && cd TapRig
git remote add upstream https://github.com/callstack/agent-device
git fetch upstream main
pnpm install --frozen-lockfile        # Node >= 22.12, pnpm 11 (packageManager w package.json)
pnpm build
pnpm check:quick                      # lint + typecheck
pnpm taprig:network-guard             # strażnik statyczny (sekundy)
pnpm taprig:offline-smoke             # harness offline (Linux, root lub sudo; ~15 s; od E2: 0 naruszeń)
pnpm test:unit                        # ~6-10 min; porównaj z baseline z §6
node bin/agent-device.mjs help commands
```

Nie uruchamiaj `pnpm test:integration:provider` ani komend `connect <provider>` z prawdziwymi
poświadczeniami — łączą się z usługami chmurowymi.

## 9. Kryteria zakończenia następnego etapu (E3)

Zgodnie z `docs/taprig-implementation-plan.md` §3 E3:

- [ ] Usunięte `src/cli/auth-session.ts`, `src/cli/cloud-response.ts`,
      `src/cli/connection/cloud-profile.ts`, `src/cli/commands/auth.ts` i ich testy;
      `src/cli/browser-launch.ts` usunięty, jeśli nie ma innych użytkowników.
- [ ] `connect` bez providera (także z `AGENT_DEVICE_DAEMON_AUTH_TOKEN` w env) kończy się błędem
      `INVALID_ARGS` bez żadnego połączenia; adapter `cloud` usunięty; `connect proxy` i
      providery (Limrun, WebDriver, TestMu) działają jak przed E3.
- [ ] `agent-device auth` → standardowa „unknown command” (bez aliasu — D-02 nierozstrzygnięta).
- [ ] Brak `agent-device.dev` (`cloud.agent-device.dev`) w kodzie produkcyjnym `src/`,
      `packages/` i w `dist/`, poza linkami dokumentacyjnymi `NET-00` w allowliście.
- [ ] Usunięte `AGENT_DEVICE_CLOUD_AUTH`, `AGENT_DEVICE_CLOUD_BASE_URL`, `'cloud'` z
      `ROUTING_PROVIDER_IDENTITIES`, `CLOUD_LEASE_PROVIDER` (jeśli bez innych użyć), pomoc „Cloud
      profile flow”, dokumentacja `website/docs`.
- [ ] Allowlista bez wpisów NET-02/NET-03; harness: nowy scenariusz `connect` (token-atrapa
      w env) — 0 naruszeń; wszystkie scenariusze bez naruszeń.
- [ ] PR do `main`; aktualizacja `docs/HANDOFF.md`, `docs/network-audit.md` (NET-02/03 → DONE),
      `docs/taprig-decisions.md`, `docs/upstream-sync.md`.

## 10. Prompt dla agenta realizującego Etap 3

```text
Jesteś agentem realizującym Etap 3 (E3) projektu TapRig w repozytorium
https://github.com/rtnk/TapRig. TapRig to fork callstack/agent-device (narzędzia CLI + serwer
MCP + Node.js SDK do automatyzacji iOS/Android i innych platform dla agentów AI), który ma
stać się narzędziem local-first: bez integracji z chmurowymi dostawcami urządzeń, bez
sprawdzania aktualizacji, bez telemetrii, bez niejawnych pobrań z Internetu — przy zachowaniu
lokalnej automatyzacji oraz wywołań HTTP świadomie zapisanych przez użytkownika w skryptach
testowych (Maestro runScript http.post).

Najpierw przeczytaj (w tej kolejności): AGENTS.md, docs/HANDOFF.md,
docs/taprig-implementation-plan.md (§0, §2, §3 E3), docs/network-audit.md (§2 NET-02,
NET-03, NET-10, §3.2, §6, §8, §9), docs/taprig-decisions.md (D-03, D-02, D-04, D-19),
docs/upstream-sync.md, scripts/taprig/offline-harness/README.md,
docs/agents/code-ownership.md, docs/agents/test-authoring.md, docs/agents/cli-flags.md.
Sprawdź stan Git (git status, git log -5, gałęzie). Upewnij się, że PR Etapu 2
(rtnk/TapRig#3, gałąź taprig/e2-remove-update-check) jest scalony do main; jeżeli nie —
zatrzymaj się i zapytaj właściciela. Pracuj od aktualnego main.

Zakres E3 — usunięcie chmury agent-device (NET-02, NET-03), bez innych zmian zachowania:
1. Usuń src/cli/auth-session.ts, src/cli/cloud-response.ts,
   src/cli/connection/cloud-profile.ts, src/cli/commands/auth.ts i ich testy
   (src/cli/__tests__/auth-session.test.ts, src/cli/commands/__tests__/auth.test.ts,
   src/__tests__/cloud-connect-auth.test.ts, części src/__tests__/cloud-connect-profile*.test.ts
   dotyczące providera cloud). src/cli/browser-launch.ts i jego test usuń tylko wtedy, gdy
   git grep browser-launch nie pokaże innych użytkowników. Lokalizuj kod przez git grep —
   numery linii w dokumentach dotyczą commita bazowego.
2. src/cli.ts: resolveRemoteAuthForCli — usuń odświeżanie sesji chmurowej; zostaw token
   daemona z flagi/env (tryb zdalny usuwa dopiero E6c, D-04). src/cli/commands/router.ts —
   usuń komendę auth. src/cli/connection/connect-provider-adapters.ts — usuń adapter cloud;
   connect bez providera (i bez skrótu proxy) zwraca typowany błąd INVALID_ARGS
   („connect requires a provider”) z details.reason, zanim cokolwiek połączy się z siecią.
   Nie zmieniaj ścieżek connect proxy ani providerów Limrun/WebDriver/TestMu (E4a–c, E6).
3. Usuń 'cloud' z ROUTING_PROVIDER_IDENTITIES (packages/plugins/src/manifest.ts),
   CLOUD_LEASE_PROVIDER (packages/contracts/src/lease-scope*) — najpierw sprawdź wszystkie
   użycia; jeżeli wartość jest częścią wspólnego kontraktu dzierżaw używanego lokalnie,
   opisz to w PR zamiast zgadywać. Sprawdź packages/remote/src/remote-connection-state.ts,
   descriptor auth w packages/command-registry, pomoc (src/commands/schema/cli-help.ts
   „Cloud profile flow”, command-overrides.ts), zmienne AGENT_DEVICE_CLOUD_AUTH i
   AGENT_DEVICE_CLOUD_BASE_URL (kod, testy, website/docs/docs/{commands,configuration}.md),
   wpisy w fallow-baselines/ i .fallowrc.json, reguły warstw (scripts/layering/*), macierz
   możliwości (scripts/capability-matrix/*), metadane MCP (pnpm check:mcp-metadata) i
   dokumentację komend (bramka command-docs). Zgodnie z D-02 (NEEDS OWNER DECISION) nie
   dodawaj aliasów ani specjalnego błędu dla komendy auth i zmiennych — przestają istnieć;
   opisz to w PR.
4. Testy: (a) connect bez argumentów z AGENT_DEVICE_DAEMON_AUTH_TOKEN w env kończy się
   INVALID_ARGS i nie wywołuje fetch ani nie otwiera przeglądarki; (b) agent-device auth →
   unknown command; (c) connect proxy i connect <provider> zachowują dotychczasowe wyniki
   (istniejące testy muszą przejść bez osłabiania). Nowy test regresyjny musi failować na
   kodzie sprzed E3 z właściwego powodu (docs/agents/test-authoring.md).
5. Strażnik: usuń z scripts/taprig/network-allowlist.json wpisy NET-02/NET-03 dla usuniętych
   plików i zmniejsz count we wpisach plików zmienionych — `pnpm taprig:network-guard`
   zgłosi stale/count. Nie dodawaj nowych wpisów poza NET-00 dla linków dokumentacyjnych,
   które już były w allowliście.
6. Harness: dodaj scenariusz `connect` (scripts/taprig/offline-harness/run.sh, README.md):
   `agent-device connect` z AGENT_DEVICE_DAEMON_AUTH_TOKEN=<atrapa> w env; oczekiwanie —
   0 naruszeń (na kodzie sprzed E3 scenariusz wykrywa DNS cloud.agent-device.dev — sprawdź
   to przed usunięciem kodu). expectations.json ma zostać pusty. Nie osłabiaj klasyfikacji.
7. Dokumentacja: docs/network-audit.md (NET-02, NET-03 → „DONE w E3, PR #…”, nowy § ze stanem
   strażnika i harnessu), docs/taprig-decisions.md (D-03: postęp), docs/upstream-sync.md
   (obszar kolizji chmury → usunięty).
8. Nie zmieniaj niczego poza zakresem chmury agent-device (np. providerów, trybu zdalnego,
   pluginów, rebrandingu).

Weryfikacja przed PR: pnpm install --frozen-lockfile && pnpm build; pnpm format;
pnpm check:quick; pnpm test:unit w `unshare -n` (porównaj z baseline z docs/HANDOFF.md §6 —
nowe błędy muszą być wyjaśnione lub naprawione, nie ukrywaj ich); po commicie:
pnpm check:layering (test „committed enumeration at HEAD” wymaga commita);
pnpm check:production-exports; pnpm check:package; pnpm check:gate-manifest;
pnpm check:fallow; pnpm check:mcp-metadata; pnpm taprig:network-guard;
pnpm taprig:offline-smoke (raport w PR); ręcznie: grep -rl agent-device.dev dist/ → tylko
linki dokumentacyjne; git grep -n "cloud.agent-device.dev" -- src packages → brak.
Nie wyłączaj ani nie pomijaj istniejących testów/bramek.

Rezultat: gałąź taprig/e3-remove-cloud, commity w konwencji type(scope): opis, PR do main w
rtnk/TapRig z opisem: co usunięto, zachowanie connect po zmianie, wyniki testów, raport
harnessu, diff allowlisty. Jeżeli nie możesz utworzyć PR, wypchnij gałąź i podaj instrukcję.

Na koniec zaktualizuj docs/HANDOFF.md: stan (E3 ukończony, link do PR), wyniki testów, nowe
ryzyka, następny etap (E4a — usunięcie providera Limrun, zgodnie z
docs/taprig-implementation-plan.md §3 E4a) oraz kompletny prompt dla agenta E4a w tym samym
formacie. Nie rozpoczynaj E4a.
```
