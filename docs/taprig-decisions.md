# TapRig — rejestr decyzji architektonicznych

Statusy: **ACCEPTED** — wynika wprost z wymagań projektu TapRig (cel forka) lub z licencji;
**PROPOSED** — rekomendacja techniczna Etapu 0, do potwierdzenia w przeglądzie PR;
**NEEDS OWNER DECISION** — zmienia zakres projektu lub zależy od preferencji właściciela.
Żadna decyzja wymagająca akceptacji właściciela nie jest oznaczona jako ACCEPTED.

Identyfikatory `NET-xx` odnoszą się do `docs/network-audit.md`. Etapy `E-x` — do
`docs/taprig-implementation-plan.md`.

---

## D-01. Strategia forka i śledzenie upstream

- **Status**: PROPOSED
- **Problem**: TapRig ma być niezależny, ale korzystać z poprawek upstream (automatyzacja
  iOS/Android rozwija się szybko — baza ma ~100 commitów dziennie w `nightly`).
- **Opcje**: (a) jednorazowa kopia bez historii; (b) fork z historią i remote `upstream`,
  okresowe `git merge upstream/main`; (c) cherry-pick wybranych poprawek.
- **Rekomendacja**: (b). Gałąź `main` w `rtnk/TapRig` zaczyna się od commita bazowego
  `3537dc549a5edb248f918990a137c536fc46ee50`; remote `upstream` =
  `https://github.com/callstack/agent-device`. Synchronizacja przez merge (nie rebase) w
  dedykowanych PR „upstream sync”, z ponownym uruchomieniem strażnika sieci (D-12).
- **Uzasadnienie**: zachowuje historię i atrybucję, pozwala śledzić zmiany; merge zamiast rebase
  nie przepisuje historii opublikowanej gałęzi.
- **Konsekwencje**: im większa rozbieżność (usunięcia, rebranding), tym droższe merge'e. Dlatego
  rebranding wewnętrznych identyfikatorów jest odkładany i ograniczany (D-15, D-16). Każdy
  merge upstream może przywrócić usunięte moduły — strażnik statyczny musi to wykryć.

## D-02. Kompatybilność publicznego API i aliasy `agent-device`

- **Status**: NEEDS OWNER DECISION
- **Problem**: Usunięcie providerów i trybu zdalnego usuwa eksporty SDK (`./limrun`,
  `./plugins`, `./plugins/webdriver`, `./remote-config`), komendy CLI (`connect`, `auth`,
  `plugins`, `proxy`, `takeover`…) i flagi. Rebranding zmienia nazwę paczki, binarki, zmiennych
  środowiskowych i katalogu stanu.
- **Opcje**: (a) TapRig 0.1.0 jako nowa paczka bez gwarancji zgodności z agent-device;
  (b) jak (a) + tymczasowe aliasy: binarka `agent-device` → `taprig`, odczyt `AGENT_DEVICE_*`
  jako fallback dla `TAPRIG_*`, odczyt `~/.agent-device` gdy brak `~/.taprig`;
  (c) pełna zgodność nazw (bez rebrandingu technicznego).
- **Rekomendacja**: (b) z ograniczonym czasem życia (usunięcie aliasów w 0.3.0), z ostrzeżeniem
  przy użyciu starej nazwy. Usunięte komendy chmurowe/zdalne zwracają jasny błąd
  `UNSUPPORTED_OPERATION` z informacją, że TapRig jest local-only (zamiast „unknown command”).
- **Uzasadnienie**: ułatwia migrację istniejących skryptów i konfiguracji klientów MCP, nie
  blokując docelowej nazwy.
- **Konsekwencje**: dodatkowy kod aliasów i testy; ryzyko kolizji z równolegle zainstalowanym
  `agent-device` (rekomendacja: alias binarki tylko opcjonalnie, np. osobna paczka lub flaga
  instalacji).

## D-03. Usunięcie integracji chmurowych, update checka i chmury agent-device

- **Status**: ACCEPTED (wymaganie projektu)
- **Problem**: NET-01 – NET-07 to ruch zabroniony.
- **Opcje**: (a) usunięcie kodu; (b) wyłączenie flagą/zmienną; (c) pozostawienie z domyślnym
  wyłączeniem.
- **Rekomendacja**: (a) — usunięcie implementacji, rejestracji, eksportów, testów, pomocy i
  zależności (`@limrun/api`). Kolejność: update check (E2) → chmura agent-device (E3) → Limrun
  (E4a) → BrowserStack/AWS (E4b) → TestMu (E4c).
- **Uzasadnienie**: wymaganie „brak możliwości przypadkowego uruchomienia funkcji chmurowych
  przez CLI, MCP lub SDK” — flaga nie spełnia go wobec SDK i plików konfiguracji.
- **Konsekwencje**: współdzielone typy zawierają warianty providerów (np.
  `'limrun-ios-tree' | 'appium-source'` w `packages/contracts/src/ios-snapshot.ts:14-19`,
  `packages/kernel/src/snapshot.ts:583`, `packages/capture-kit/src/ios-snapshot-acquisition.ts:40-66`)
  — trzeba je zawęzić ostrożnie (osobne commity, typecheck). Zwiększa koszt merge'y upstream w
  tych plikach.

## D-04. Tryb zdalny (zdalny daemon, `proxy`, `connect proxy`, `takeover`, dzierżawy, mosty Metro)

- **Status**: NEEDS OWNER DECISION
- **Problem**: NET-10 – NET-17. Tryb zdalny nie jest dostawcą chmurowym per se — może łączyć
  się z własnym Makiem w sieci firmowej — ale wysyła dane z urządzeń poza komputer, otwiera
  nasłuch dla tuneli i jest fundamentem integracji chmurowych (`cloud`, Limrun, providery
  WebDriver korzystają z tych samych dzierżaw/profili).
- **Opcje**: (a) usunąć cały tryb zdalny; (b) zachować, ale ograniczyć do loopback/LAN z
  allowlistą hostów; (c) zachować bez zmian.
- **Rekomendacja**: (a). TapRig = narzędzie local-first; zdalny dostęp do urządzeń można
  zrealizować w przyszłości np. przez SSH na hoście z urządzeniami (TapRig uruchomiony
  lokalnie tam). Usuwamy: `packages/remote`, `packages/proxy`, komendy `connect`,
  `connection`, `disconnect`, `proxy`, `takeover`, klienta zdalnego w `src/daemon-client/*`,
  `AGENT_DEVICE_DAEMON_BASE_URL`/`--daemon-base-url`/`--daemon-auth-token`, `--remote-config`,
  mosty Metro i companion tunnel, `install-from-source --github-actions-artifact`, a w osobnym
  PR — endpointy HTTP daemona istniejące wyłącznie dla zdalnych klientów.
- **Uzasadnienie**: brak trybu zdalnego eliminuje całą klasę transferów artefaktów poza
  komputer i zamyka alternatywne ścieżki uruchamiania providerów.
- **Konsekwencje**: największy pojedynczy obszar zmian (ok. 100+ plików produkcyjnych, wiele
  testów integracyjnych); podsystem dzierżaw (`lease*`) jest częściowo wspólny z lokalnymi
  claimami — wymaga analizy w E6d. Jeżeli właściciel wybierze (b), plan E6 zamienia się w
  „RESTRICT”: walidacja hosta (loopback/RFC1918 + allowlista), brak `proxy` na
  interfejsach publicznych, brak mostów Metro.

## D-05. Ruch inicjowany przez urządzenie, aplikację lub przeglądarkę

- **Status**: PROPOSED
- **Problem**: `open <url>`, deep linki, nawigacja w przeglądarce, Metro na hoście w LAN,
  tunel CoreDevice do urządzeń Wi-Fi.
- **Rekomendacja**: PRESERVE. To ruch testowanej aplikacji/urządzenia lub świadomie wskazanych
  zasobów, nie samego TapRig. Komunikacja z Metro dozwolona wyłącznie z hostami z runtime hints
  (lokalny serwer deweloperski).
- **Konsekwencje**: harness dynamiczny musi atrybuować ruch po drzewie procesów (procesy
  symulatora/emulatora/przeglądarki to nie TapRig).

## D-06. Instalacja aplikacji z URL (`install-from-source`)

- **Status**: NEEDS OWNER DECISION
- **Problem**: NET-22 — jawna akcja, ale obecnie dozwolone są **tylko publiczne adresy**
  (`packages/provision-kit/src/install-source-network.ts:25,72-89`), co w sieci korporacyjnej
  wyklucza wewnętrzne repozytoria artefaktów (Artifactory, Nexus, wewnętrzne CI). NET-23 (GitHub
  Actions) działa tylko przez zdalny daemon.
- **Opcje**: (a) usunąć `install-from-source` całkowicie (zostaje `install <path>`);
  (b) zachować; dodać konfigurowalną allowlistę hostów (także prywatnych) w konfiguracji
  operatora, domyślnie pustą = komenda wyłączona; (c) zachować bez zmian.
- **Rekomendacja**: (b) + usunięcie `--github-actions-artifact` (REMOVE). Komenda pozostaje
  jawna; bez konfiguracji zwraca błąd z instrukcją. Dla MCP — dostępna tylko, gdy operator
  skonfigurował allowlistę.
- **Konsekwencje**: zmiana w `provision-kit` i komendzie `install-from-source`; testy SSRF
  muszą nadal przechodzić dla hostów spoza allowlisty.

## D-07. Platforma web i `web setup`

- **Status**: NEEDS OWNER DECISION
- **Problem**: NET-21, NET-28. `web setup` pobiera `agent-browser@0.39.0` z npm i przeglądarkę.
  Sama automatyzacja przeglądarki jest lokalna, ale Chromium ma własny ruch tła.
- **Opcje**: (a) usunąć platformę web; (b) zachować; `web setup` jako jedyna jawna komenda
  instalacyjna + tryb offline (wskazanie lokalnego tarballa/ścieżki `agent-browser` i
  przeglądarki); flagi Chromium ograniczające ruch tła; (c) bez zmian.
- **Rekomendacja**: (b). Weryfikacja dynamiczna ruchu tła przeglądarki przed wydaniem.
- **Konsekwencje**: wymaga zmian w `packages/platform-web/src/agent-browser-*.ts` i w
  dokumentacji instalacji.

## D-08. Metro: instalacja zależności i `npx`

- **Status**: PROPOSED
- **Problem**: NET-18 (instalacja zależności domyślnie włączona), NET-19 (`npx` może pobrać
  paczkę).
- **Rekomendacja**: RESTRICT — instalacja zależności tylko z jawną flagą (np.
  `--install-deps`; obecne `--no-install-deps` staje się domyślne), uruchamianie Metro przez
  `npx --no-install …` lub bezpośrednio `node_modules/.bin/…`; błąd z instrukcją, gdy brak
  lokalnej instalacji.
- **Konsekwencje**: zmiana zachowania `metro prepare` (dokumentacja, pomoc, testy
  `packages/react-native`).

## D-09. Provisioning Apple (`xcodebuild -allowProvisioningUpdates`)

- **Status**: PROPOSED
- **Problem**: NET-24 — dla urządzeń fizycznych Xcode kontaktuje się z Apple.
- **Rekomendacja**: PRESERVE domyślnie (bez tego automatyczne podpisywanie runnera na
  urządzeniu nie działa), dodać opt-out (zmienna np. `TAPRIG_APPLE_NO_PROVISIONING_UPDATES=1`)
  dla środowisk z ręcznie zainstalowanymi profilami. Udokumentować jako ruch narzędzi Apple.
- **Konsekwencje**: mała zmiana w `packages/platform-apple/src/runner/runner-artifact.ts:892`.

## D-10. CI/CD, dystrybucja i metadane rejestrów

- **Status**: NEEDS OWNER DECISION
- **Problem**: NET-40 – NET-42. Workflowy upstream publikują `agent-device` na npm, w MCP
  Registry i na GitHub Pages; manifest helpera Android i runnera iOS wskazują wydania GitHub
  upstream; `server.json`/`smithery.yaml`/`glama.json` konfigurują `npx agent-device mcp`.
- **Opcje dystrybucji**: (a) publiczny npm `taprig`; (b) prywatny rejestr npm firmy;
  (c) tarball (`npm pack`) w wydaniach GitHub + instalacja offline; (d) kombinacja (b)+(c).
- **Rekomendacja**: E1 wyłącza workflowy publikujące i wdrażające upstream (release,
  publish-mcp-registry, release-android-snapshot-helper, release-ios-runner, deploy,
  pr-preview*, nightly z zewnętrznymi pobraniami), zostawia CI lint/typecheck/unit/build.
  Dystrybucja 0.1.0: (d) — do decyzji właściciela. Usunąć `server.json`, `smithery.yaml`,
  `glama.json` lub zastąpić dokumentacją lokalnej konfiguracji MCP (`taprig mcp` z PATH, bez
  `npx`).
- **Konsekwencje**: wpływa na E1 i E11.

## D-11. HTTP w skryptach użytkownika (Maestro `runScript`)

- **Status**: PROPOSED (zachowanie) / NEEDS OWNER DECISION (rozszerzenia)
- **Problem**: NET-25 musi pozostać. Obecnie dostępne jest tylko `http.post`; lokalna ścieżka
  używa globalnego `fetch` Node, który nie respektuje `HTTPS_PROXY`.
- **Rekomendacja**: PRESERVE bez zmian funkcjonalnych w ramach migracji; dodać test regresji
  (E8). Rozszerzenia (`http.get/put/delete/request`, obsługa proxy korporacyjnego w ścieżce
  lokalnej) — osobna decyzja właściciela, poza zakresem migracji.
- **Konsekwencje**: strażnik statyczny ma wpis allowlisty dla `run-script-http.ts`; harness
  dynamiczny atrybuuje ruch procesu `run-script-http-child` jako ruch użytkownika.

## D-12. Kontrola polityki sieciowej (statyczna + dynamiczna)

- **Status**: PROPOSED
- **Problem**: trzeba udowodnić brak zabronionego ruchu i zapobiec regresjom (także po merge'ach
  upstream).
- **Rekomendacja**: (1) strażnik statyczny z allowlistą miejsc sieciowych powiązanych z ID z
  audytu — test w `pnpm test:unit`; (2) harness `unshare -n` + `strace` w CI Linux; (3)
  przebiegi ręczne macOS z profilem `sandbox-exec`/monitorowaniem ruchu przed wydaniem.
  Szczegóły: `docs/network-audit.md` §7.
- **Uzasadnienie**: dwa niezależne rodzaje kontroli wymagane przez projekt; prototyp harnessu
  wykrył NET-01 i NET-03 w Etapie 0.
- **Konsekwencje**: CI wymaga `unshare` (na runnerach GitHub `ubuntu-*` przez `sudo`).

## D-13. System pluginów

- **Status**: NEEDS OWNER DECISION
- **Problem**: NET-08/09. Jedynym zastosowaniem pluginów są providery urządzeń zdalnych;
  `plugins add` pobiera i wykonuje kod z npm; daemon ładuje pluginy przy każdym starcie.
- **Opcje**: (a) usunąć system pluginów (komenda, store, loader, eksport `./plugins*`);
  (b) zachować loader tylko dla lokalnych katalogów (bez `npm install`), np. dla własnych
  providerów firmowych; (c) bez zmian.
- **Rekomendacja**: (a). Jeżeli właściciel przewiduje własne providery lokalne — (b) w
  przyszłym etapie, z jawną allowlistą ścieżek.
- **Konsekwencje**: rejestr providerów (`packages/plugins/src/registry.ts`) może zostać
  zredukowany lub usunięty, gdy nie ma żadnych kandydatów — zależy od kodu współdzielonego z
  daemonem (E5).

## D-14. Komenda `cdp` (agent-cdp przez `npm exec`)

- **Status**: NEEDS OWNER DECISION
- **Problem**: NET-20 — pierwsze uruchomienie pobiera `agent-cdp@1.6.1`.
- **Opcje**: (a) usunąć komendę; (b) wymagać preinstalowanego `agent-cdp` (PATH lub zmienna
  ze ścieżką), bez `--yes`/pobierania; (c) wbudować zależność w paczkę TapRig.
- **Rekomendacja**: (b); jeżeli licencja i rozmiar pozwalają — rozważyć (c).
- **Konsekwencje**: zmiana `src/cli/commands/agent-cdp.ts`, pomocy `cdp`.

## D-15. Zakres i sposób rebrandingu

- **Status**: PROPOSED (szczegóły aliasów: D-02)
- **Problem**: nazwa `agent-device` występuje 18 698 razy w 3 809 plikach; zakres
  `@agent-device/` — 12 402 razy; 109 zmiennych `AGENT_DEVICE_*`; identyfikatory natywne
  (`com.callstack.agentdevice.*`).
- **Rekomendacja**: rebranding warstwowy: (E9a) tożsamość publiczna — nazwa paczki `taprig`,
  binarka `taprig`, nazwa serwera MCP, teksty pomocy, README, `package.json` (repo, homepage,
  author/contributors), LICENSE/NOTICE; (E9b) zmienne `TAPRIG_*` z fallbackiem
  `AGENT_DEVICE_*`, katalog stanu `~/.taprig` z fallbackiem odczytu; (E9c) dokumentacja,
  `skills/`, `website/`; (E9d — opcjonalnie) identyfikatory natywne i nazwy klas Swift/Java.
  **Nie** zmieniamy prywatnego zakresu workspace `@agent-device/*` (nie jest publikowany —
  pakiety są wbudowywane w `dist/`), aby nie utrudniać merge'y upstream.
- **Konsekwencje**: wewnętrzne nazwy pozostają widoczne w kodzie źródłowym; jest to
  akceptowalne dla forka z atrybucją.

## D-16. Kolejność: usuwanie przed rebrandingiem

- **Status**: PROPOSED
- **Problem**: sugerowana kolejność zakładała rebranding w Etapie 1.
- **Rekomendacja**: Etap 1 = fundament forka (atrybucja, CI, strażnik sieci, harness) bez
  zmiany nazw; usunięcia w E2–E7; rebranding w E9.
- **Uzasadnienie**: rebranding na początku zmienia tysiące plików, które w kolejnych etapach
  i tak zostaną usunięte (providery, tryb zdalny), wydłuża przeglądy każdego PR i utrudnia
  merge upstream w trakcie migracji. Zasada „minimalnej ingerencji”.
- **Konsekwencje**: do E9 narzędzie nazywa się technicznie `agent-device`; README i NOTICE od
  E1 informują, że to TapRig (fork). Właściciel może zażądać wcześniejszego rebrandingu
  tożsamości publicznej (E9a) — da się go przesunąć zaraz po E1 bez zmian w pozostałych etapach.

## D-17. Platformy inne niż iOS/Android

- **Status**: PROPOSED
- **Problem**: baza obsługuje też macOS, tvOS/visionOS, HarmonyOS, Vega, Linux, web.
- **Rekomendacja**: zachować (wszystkie działają lokalnie). Ewentualne przycinanie to osobna
  decyzja właściciela poza zakresem local-only.

## D-18. Licencja i atrybucja

- **Status**: ACCEPTED (wymóg licencji MIT)
- **Problem**: kod upstream jest na licencji MIT (`LICENSE`, „Copyright (c) 2026 Callstack”);
  zależności wbudowywane w `dist/` mają własne licencje.
- **Rekomendacja**: zachować `LICENSE` z notą Callstack, dodać linię praw autorskich TapRig i
  plik `NOTICE` (pochodzenie, commit bazowy, zmiany). Przy wydaniu dołączyć zestawienie licencji
  wbudowanych zależności (np. generowane z `pnpm licenses list --prod` / analiza `dist`).
- **Konsekwencje**: E1 (NOTICE), E11 (licencje zależności).

## D-19. Endpointy HTTP daemona dla zdalnych klientów

- **Status**: NEEDS OWNER DECISION (pochodna D-04)
- **Problem**: daemon (`packages/daemon/src/server/*`) udostępnia na loopback trasy upload/
  download/leases/human-control/diagnostics i hook autoryzacji dla zdalnych klientów.
- **Rekomendacja**: jeśli D-04 = (a) — usunąć w osobnym PR (E6d) po potwierdzeniu, że lokalny
  klient z nich nie korzysta (np. upload przy lokalnym daemonie). Do tego czasu ryzyko jest
  niskie: nasłuch wyłącznie na `127.0.0.1` z tokenem.
