# TapRig — synchronizacja z upstream

TapRig jest forkiem `callstack/agent-device` z zachowaną historią (decyzja D-01). Ten dokument
opisuje, jak przenosić zmiany upstream do TapRig bez przywracania usuniętych mechanizmów
sieciowych.

| Pole | Wartość |
| --- | --- |
| Upstream | `https://github.com/callstack/agent-device` (remote `upstream`, gałąź `main`) |
| Commit bazowy | `3537dc549a5edb248f918990a137c536fc46ee50` (2026-10-28, `0.21.34-dev`) |
| Strategia | merge (nie rebase, nie cherry-pick) w osobnym PR „upstream sync” |
| Kontrole obowiązkowe | strażnik sieci (`pnpm taprig:network-guard`), harness offline (`pnpm taprig:offline-smoke`), `pnpm test:unit` |

## 1. Konfiguracja remote

```sh
git remote add upstream https://github.com/callstack/agent-device   # jednorazowo
git fetch upstream main
git log --oneline main..upstream/main | wc -l                         # liczba nowych commitów
```

Nie pobieraj tagów ani gałęzi upstream do `origin` (`git push` tylko gałęzi synchronizacji).

## 2. Procedura synchronizacji

1. Utwórz gałąź od aktualnego `main` TapRig: `git switch -c taprig/upstream-sync-<RRRR-MM-DD> main`.
2. Wybierz commit upstream, zwykle `upstream/main`. Zapisz jego SHA w opisie PR.
3. `git merge --no-ff upstream/main` (lub `<sha>`). Nie używaj rebase: `main` jest gałęzią
   opublikowaną.
4. Rozwiąż konflikty według §4. Jeżeli plik usunięty w TapRig został zmieniony w upstream
   (konflikt *modify/delete*), zachowaj usunięcie: `git rm <plik>`.
5. `pnpm install --frozen-lockfile`. Jeżeli lockfile jest niespójny po merge'u, wygeneruj go
   narzędziem (`pnpm install`), nie edytuj ręcznie.
6. Wykonaj kontrole z §3. Każde nowe miejsce sieciowe przypisz do ID w
   `docs/network-audit.md` albo usuń.
7. Otwórz PR „upstream sync: `<sha>`” do `main`. Opis: zakres commitów (`main..<sha>`), konflikty
   i sposób ich rozwiązania, wynik strażnika i raport harnessu, nowe wpisy allowlisty z
   uzasadnieniem.
8. Nie łącz synchronizacji z pracą etapową (E2–E11). Jeden PR = jeden cel.

## 3. Kontrole po merge'u (obowiązkowe)

```sh
pnpm install --frozen-lockfile && pnpm build
pnpm check:quick                 # lint + typecheck
pnpm taprig:network-guard        # strażnik statyczny
pnpm taprig:offline-smoke        # harness offline (Linux, root lub sudo)
pnpm test:unit                   # zawiera test strażnika (scripts/taprig/network-guard.test.ts)
pnpm check:gate-manifest         # gdy merge zmienił .github/workflows lub scripts/check-affected
```

Interpretacja wyników:

| Wynik strażnika | Znaczenie | Działanie |
| --- | --- | --- |
| `unlisted` | Upstream dodał nowe miejsce sieciowe lub literał URL | Przypisz ID z audytu i decyzję; miejsce zakazane usuń w tym PR lub zaplanuj usunięcie (REMOVE) i opisz w PR |
| `count` | Zmieniła się liczba wystąpień w pliku z allowlisty | Sprawdź nowe wystąpienia; zaktualizuj `count` tylko po przeglądzie |
| `stale` | Upstream usunął kod z wpisu | Usuń wpis z allowlisty |
| `invalid` | Wpis bez ID, uzasadnienia lub z zakazaną domeną bez REMOVE | Popraw wpis |

Jeżeli merge przywraca moduł usunięty w etapach E2–E6 (np. nowy plik w
`packages/provider-limrun/`), strażnik zgłosi go jako `unlisted`. Nie dodawaj go do allowlisty —
usuń plik. `pnpm taprig:network-guard --suggest` wypisuje szkielety wpisów do przeglądu.

Harness failuje, gdy pojawi się nowe naruszenie albo gdy zniknie naruszenie oczekiwane
(`scripts/taprig/offline-harness/expectations.json`). Raport: `report.md` w katalogu roboczym
(`TAPRIG_HARNESS_WORK`).

## 4. Obszary kolizji

Moduły, które TapRig usuwa lub zmienia w kolejnych etapach. Konflikty w tych obszarach
rozwiązuj na korzyść TapRig (zachowaj usunięcie), a zmiany upstream w kodzie wspólnym
przenoś ręcznie.

| Obszar | Pliki (stan bazowy) | Etap | Uwagi |
| --- | --- | --- | --- |
| Update check | `src/cli/update-check*.ts`, wywołanie w `src/cli.ts`, wpis `internal/update-check-entry` w `tsdown.config.ts`, `AGENT_DEVICE_NO_UPDATE_NOTIFIER` | E2 — **usunięty** (PR #3) | Merge przywracający te pliki lub wywołanie: usuń je ponownie; strażnik zgłosi `registry.npmjs.org` jako `unlisted` |
| Chmura agent-device | `src/cli/auth-session.ts`, `src/cli/cloud-response.ts`, `src/cli/browser-launch.ts`, `src/cli/connection/cloud-profile.ts`, `src/cli/commands/auth.ts`, adapter `cloud` w `connect-provider-adapters.ts`, deskryptor `auth` w `packages/command-registry/src/registry.ts`, flaga `--no-login`, `AGENT_DEVICE_CLOUD_*` | E3 — **usunięta** (PR #4) | Merge przywracający te pliki, adapter lub wywołanie `resolveRemoteAuthForCli` w `src/cli.ts` (`resolveRemoteContext`): usuń je ponownie; strażnik zgłosi `agent-device.dev` jako `unlisted`, test `cli-connect-requires-provider.test.ts` i scenariusz harnessu `connect-no-provider` wykryją domyślny `connect` |
| Limrun | `packages/provider-limrun/`, `src/provider-limrun-*.ts`, `src/sdk/limrun*.ts`, `src/vendor/limrun-*.ts`, typy `'limrun-ios-tree'` | E4a | Typy snapshotów iOS są wspólne z lokalnym iOS |
| WebDriver (BrowserStack, AWS DF) | `packages/provider-webdriver/`, `src/provider-webdriver.ts`, `src/sdk/plugin-webdriver.ts`, flagi `--provider-*`/`--aws-*` | E4b | |
| TestMu AI | `packages/provider-testmu/`, `src/commands/provider-plugin-catalog.ts` | E4c | |
| Pluginy | `packages/plugins/`, `src/cli/commands/plugins.ts`, `src/provider-device-runtimes.ts`, `src/builtin-provider-*.ts` | E5 | D-13 |
| Tryb zdalny | `packages/proxy/`, `packages/remote/`, `packages/react-native/src/companion/`, `src/cli/commands/{proxy,connection*,takeover,remote-bridge}.ts`, `src/cli/connection/`, `src/daemon-client/*` (gałęzie zdalne), endpointy `packages/daemon/src/server/*` dla zdalnych klientów | E6a–E6d | D-04, D-19; klient daemona jest wspólny |
| Niejawne pobrania | `packages/react-native/src/metro/client-metro.ts`, `src/cli/commands/agent-cdp.ts`, `packages/platform-web/src/agent-browser-*.ts`, `packages/provision-kit/src/install-source*.ts` | E7 | |
| Rebranding | `package.json`, `bin/`, `src/mcp/*`, pomoc CLI, `README.md`, `website/`, `skills/` | E9 | Po E9 konflikty w tekstach pomocy będą częste |
| CI forka | `.github/workflows/*` (§5), `scripts/gate/declarations.ts` (`MANUAL_ONLY_OWNERS`) | E1 | |
| Polityka sieci TapRig | `scripts/taprig/**`, `docs/taprig-*.md`, `docs/network-audit.md`, `docs/upstream-sync.md`, `NOTICE` | E1+ | Upstream ich nie zna — brak konfliktów |

## 5. CI forka

Stan po E1 (D-10, wariant „wyłącz publikację upstream”):

| Workflow upstream | Stan w TapRig | Powód |
| --- | --- | --- |
| `release.yml` | usunięty | Publikacja na npm pod nazwą `agent-device` (OIDC, nightly z harmonogramu) |
| `publish-mcp-registry.yml` | usunięty | Publikacja `server.json` w MCP Registry; pobiera `mcp-publisher` |
| `release-android-snapshot-helper.yml`, `release-ios-runner.yml` | usunięte | Wgrywanie artefaktów do wydań GitHub upstream |
| `deploy.yml` | usunięty | Wdrożenie dokumentacji na GitHub Pages (`gh-pages`) |
| `pr-preview-cleanup.yml` | usunięty | Sprzątanie podglądów na `gh-pages` |
| `pr-preview.yml` | zostaje tylko job `command-docs-gate` | Job `deploy-preview` (publikacja podglądu na `gh-pages`) usunięty; bramka `command-docs` musi działać dla PR z samą dokumentacją |
| `concurrency-torture-nightly.yml`, `replays-nightly.yml`, `xctest-nightly.yml`, `conformance-differential.yml`, `conformance-regenerate.yml`, `mutation-weekly.yml`, `perf-nightly.yml` | tylko `workflow_dispatch` (usunięty `schedule`) | Fork nie uruchamia harmonogramów upstream (koszt runnerów macOS, pobrania zewnętrzne, np. Maestro CLI). Lane'y można uruchomić ręcznie |
| `ci.yml` | bez zmian | Lint, typecheck, unit (Coverage), build, integracja; `ubuntu-latest`, bez sekretów |
| `taprig.yml` (nowy) | PR, push do `main`, ręcznie | Strażnik sieci i harness offline (`sudo unshare`, `apt-get install strace` — ruch budowania) |

Bramki, których jedyny lane stał się ręczny, są zadeklarowane w
`scripts/gate/declarations.ts` (`MANUAL_ONLY_OWNERS`): `fuzz-parsers`, `maestro-differential`,
`maestro-regenerate`, `mutation-check`. `pnpm check:gate-manifest` failuje, gdy lane wróci na
harmonogram, a deklaracja zostanie. Testy, które opisywały usunięte workflowy
(`test/ci/release-workflow.test.ts`, test publikacji MCP w
`test/repo-guards/npm-package-scripts.test.ts`), usunięto razem z nimi; testy modelu bramek,
które czytały `deploy.yml` i harmonogram `replays-nightly.yml`, używają teraz wpisanych
workflowów testowych.

Wpisy `paths-ignore` w `ci.yml`, `android.yml`, `apple.yml`, `linux.yml` i `size.yml` nadal
wymieniają usunięte pliki (`deploy.yml`, `pr-preview-cleanup.yml`). Nie mają wpływu na
działanie; zostają, aby nie powodować konfliktów przy merge'ach. Workflowy `android.yml`,
`apple.yml` i `linux.yml` uruchamiają się w PR (runnery macOS i emulatory) — ich ograniczenie
to decyzja właściciela (D-10).

Przy merge'u upstream:

- zmiany w usuniętych workflowach (*modify/delete*) — zachowaj usunięcie;
- nowy workflow upstream z `schedule`, publikacją (`npm publish`, `gh release`, Pages, MCP
  Registry) lub sekretami — usuń go albo ogranicz do `workflow_dispatch` w tym samym PR i
  dopisz do tabeli powyżej;
- przywrócony `schedule` w zaparkowanym workflowie — usuń go ponownie.
