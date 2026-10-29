# TapRig — audyt komunikacji sieciowej (Etap 0)

| Pole | Wartość |
| --- | --- |
| Projekt bazowy | `callstack/agent-device` |
| Commit bazowy | `3537dc549a5edb248f918990a137c536fc46ee50` (`upstream/main`, 2026-10-28, `git describe`: `nightly/v0.21.34-nightly.20261028.102-12-g3537dc549`) |
| Wersja w `package.json` | `0.21.34-dev` |
| Data audytu | 2026-10-28 |
| Zakres | `src/`, `packages/*/src`, `bin/`, `apple/`, `android/`, `linux/`, `scripts/`, `.github/`, metadane dystrybucji |
| Status | Audyt statyczny zakończony; audyt dynamiczny wykonany wyrywkowo (Linux, bez urządzeń) — patrz §6 |
| Kontrole automatyczne | Od E1: strażnik statyczny i harness offline (Linux) — patrz §8. W E1 nie usunięto żadnego mechanizmu |

Numery linii odnoszą się do commita bazowego. Po zmianach w kolejnych etapach należy je
odświeżyć (`git grep` po nazwie symbolu podanego w tabeli).

## 1. Metoda

1. **Wyszukiwanie prymitywów sieciowych** w kodzie produkcyjnym (1880 plików TS/JS po
   wyłączeniu testów i fixture'ów): `fetch(`, `globalThis.fetch`, wstrzykiwane `fetchImpl`,
   `node:http`, `node:https`, `node:net`, `node:tls`, `node:dgram`, `node:dns`, `undici`,
   `WebSocket`, `transport.request`, `net.createConnection`, `server.listen`.
2. **Wyszukiwanie procesów potomnych** uruchamiających narzędzia sieciowe lub menedżery
   paczek: `npm`, `npx`, `pnpm`, `yarn`, `curl`, `wget`, `aws`, `agent-browser`, `xcodebuild`,
   `bundletool`, `sdkmanager`.
3. **Wyszukiwanie literałów URL** (`https?://…`) i nazw usług (BrowserStack, LambdaTest/TestMu,
   Limrun, AWS Device Farm, `agent-device.dev`, `registry.npmjs.org`, `github.com`, telemetria:
   Sentry, PostHog, Segment, Amplitude, OpenTelemetry).
4. **Śledzenie ścieżki wywołania** od publicznej komendy CLI / narzędzia MCP / eksportu SDK do
   miejsca połączenia (opisane w §3).
5. **Kod natywny**: Swift (`apple/`), Java (`android/`), Python (`linux/atspi-dump.py`) —
   `URLSession`, `NWListener`, `java.net.*`, `ServerSocket`.
6. **Zależności**: `package.json` publikowanej paczki nie ma sekcji `dependencies` — cały kod
   zewnętrzny (m.in. `undici`, `@limrun/api`, `ipaddr.js`, `yaml`) jest wbudowywany przez
   `tsdown` do `dist/` (`package.json` → `devDependencies`, `tsdown.config.ts`). Oznacza to, że
   kod sieciowy zależności trafia do artefaktu i musi być usuwany razem z modułami, które go
   importują.
7. **Weryfikacja dynamiczna** (prototyp, §6): uruchomienie CLI w nowej przestrzeni nazw sieci
   (`unshare -n`, tylko `lo`) pod `strace -f -e trace=execve,connect,sendto,sendmsg`.

## 2. Tabela zbiorcza

Legenda „Automatyczne?”: **TAK** — bez jawnej akcji użytkownika związanej z siecią;
**KONF.** — zależy od konfiguracji/zmiennych środowiskowych/zapisanego stanu; **NIE** — wymaga
jawnej komendy użytkownika.

### 2.1. Komunikacja zabroniona (narzędzie samo komunikuje się z usługami zewnętrznymi)

| ID | Komponent | Plik i linia | Co inicjuje połączenie | Cel połączenia | Dane | Automatyczne? | Decyzja | Uzasadnienie |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NET-01 | CLI: update notifier | `src/cli/update-check.ts:178` (fetch), `:159` (detached worker), wywołanie `src/cli.ts:198` | Prawie każda komenda CLI z TTY na stderr, poza `help`/`test`/`--json`/`--version`, gdy brak `CI`, `NODE_ENV=test`, `AGENT_DEVICE_NO_UPDATE_NOTIFIER`; raz na 14 dni | `https://registry.npmjs.org/agent-device/{latest\|nightly}` | GET; IP hosta, nagłówki undici, wersja kanału | **TAK** (potwierdzone dynamicznie, §6) | REMOVE — **DONE w E2, PR #3** | Sprawdzanie aktualizacji jest wprost zabronione; nie jest potrzebne do automatyzacji |
| NET-02 | CLI: logowanie do chmury agent-device | `src/cli/auth-session.ts:8` (`https://cloud.agent-device.dev`), `:455` (POST), `:233` (otwarcie przeglądarki), `:557` (`shouldUseCloudAuth`) | `auth login`; `connect` bez providera; każda komenda z `--daemon-base-url` w domenie `*.agent-device.dev` lub z `AGENT_DEVICE_CLOUD_AUTH`/`AGENT_DEVICE_CLOUD_BASE_URL` (odświeżanie sesji) | Control plane `cloud.agent-device.dev` (`/api/control-plane/device-auth/*`, `/cli-session/refresh`) | Kod urządzenia, refresh credential, access token (zapisywane w state dir) | **KONF.** (odświeżenie tokenu jest niejawne przy zapisanej sesji) | REMOVE | Integracja z usługą chmurową producenta |
| NET-03 | CLI: profil połączenia chmurowego | `src/cli/connection/cloud-profile.ts:75`; domyślny provider: `src/cli/connection/connect-provider-adapters.ts:128` | **`connect` bez argumentów** domyślnie wybiera providera `cloud` | `GET {cloud}/api/control-plane/connection-profile` z `Bearer` | Token, identyfikator klienta | NIE (ale domyślne zachowanie `connect`) — potwierdzone dynamicznie, §6 | REMOVE | Chmura producenta; przypadkowe uruchomienie najprostszą komendą |
| NET-04 | Provider BrowserStack | `packages/provider-webdriver/src/browserstack.ts:61-65`, `browserstack-connection-verification.ts:12-14`, transport `webdriver-transport.ts:241`, upload `webdriver-utils.ts:109,217,270` | `connect browserstack`, potem `open`/`install`/`artifacts`… ; także `leaseProvider` w SDK i w pliku konfiguracji | `hub-cloud.browserstack.com`, `api-cloud.browserstack.com` | Poświadczenia (Basic), **upload binarki aplikacji**, polecenia WebDriver, screenshoty, pobieranie artefaktów sesji | KONF./NIE | REMOVE | Dostawca chmurowy |
| NET-05 | Provider AWS Device Farm | `packages/provider-webdriver/src/aws-device-farm.ts:339` (`aws devicefarm …` jako proces potomny), artefakty `aws-device-farm-artifacts.ts`, WebDriver jak NET-04 | `connect aws-device-farm` + komendy sesji | AWS API (przez AWS CLI i łańcuch poświadczeń AWS), endpoint WebDriver sesji zdalnej | ARN-y, poświadczenia AWS (pośrednio), polecenia, artefakty | KONF./NIE | REMOVE | Dostawca chmurowy |
| NET-06 | Provider TestMu AI (LambdaTest) | `packages/provider-testmu/src/testmu.ts:27-34`, `testmu-webdriver.ts:25`; katalog `src/commands/provider-plugin-catalog.ts:8`; pomoc `src/commands/schema/cli-help.ts:584` | `plugins add @agent-device/testmu` + `connect testmu` | `manual-api.lambdatest.com`, `mobile-api.lambdatest.com`, `mobile-hub.lambdatest.com` | `LT_USERNAME`/`LT_ACCESS_KEY`, **upload aplikacji**, polecenia, artefakty | NIE | REMOVE | Dostawca chmurowy (dystrybuowany jako plugin npm) |
| NET-07 | Provider Limrun | `packages/provider-limrun/**` (klient `@limrun/api`, HTTP + WebSocket, ADB-over-WebSocket), rejestracja `src/builtin-provider-plugins.ts:67`, `src/provider-limrun-*.ts`, SDK `src/sdk/limrun*.ts` (`limrun-download-file.ts:20`), eksport `agent-device/limrun` | Wbudowany kandydat rejestrowany przy starcie daemona, **aktywny automatycznie, gdy w env są poświadczenia Limrun**; połączenia przy `connect limrun` i komendach sesji | Limrun API / instancje Limrun | Token Limrun, binarki aplikacji, screenshoty, logi, ruch ADB | KONF. | REMOVE | Dostawca chmurowy; aktywacja zależna tylko od zmiennych środowiskowych |
| NET-08 | Instalacja pluginów | `packages/plugins/src/store.ts:242` (`npm install <pakiet>`), komenda `src/cli/commands/plugins.ts:25` | `plugins add <pkg>`, `plugins update <pkg>` | Rejestr npm (lub skonfigurowany) | Nazwa paczki; pobranie i późniejsze **wykonanie kodu z Internetu** | NIE | REMOVE | Automatyczna instalacja pluginów z Internetu jest zabroniona; jedynym zastosowaniem są providery urządzeń zdalnych |
| NET-09 | Ładowanie pluginów | `src/provider-device-runtimes.ts:31` (`storePluginCandidates`), `packages/plugins/src/store.ts:104` (`import()` kodu z `~/.agent-device/plugins`) | **Każdy start daemona** oraz `connect <provider>` | Dowolny — kod pluginu | Dowolne | **TAK** (o ile plugin został zainstalowany) | REMOVE | Niekontrolowane wykonanie kodu z niezweryfikowanym zachowaniem sieciowym; alternatywna ścieżka uruchamiania providerów chmurowych |
| NET-10 | Klient zdalnego daemona | `src/daemon-client/daemon-client-lifecycle.ts:139,190` (`--daemon-base-url` / `AGENT_DEVICE_DAEMON_BASE_URL`), transport `src/daemon-client/daemon-client-transport.ts:788` | Każda komenda, gdy ustawiono zmienną/flagę, plik konfiguracji (`--config`, `AGENT_DEVICE_CONFIG`, `~/.agent-device/config.json`) lub zapisane połączenie `connect` | Dowolny host HTTP(S) | **Wszystkie polecenia i wyniki**: snapshoty, screenshoty, nagrania, tokeny | KONF. | DECISION REQUIRED (rekomendacja: REMOVE) | Tryb zdalny wysyła dane z urządzeń poza komputer; patrz D-04 |
| NET-11 | Upload artefaktów do zdalnego daemona | `packages/remote/src/upload-client.ts:267,400`, `upload-stream.ts:80` | `install`/`reinstall`/`replay` itp. przy zdalnym daemonie | Zdalny daemon | **Binarki aplikacji (.apk/.ipa/.app)** | KONF. | REMOVE (razem z NET-10) | Transfer artefaktów poza komputer |
| NET-12 | Pobieranie artefaktów ze zdalnego daemona | `packages/remote/src/artifact-download.ts:83` | `screenshot`, `record`, `artifacts` przy zdalnym daemonie | Zdalny daemon | Screenshoty, nagrania, logi | KONF. | REMOVE (razem z NET-10) | Funkcja istnieje tylko dla trybu zdalnego |
| NET-13 | Diagnostyka zdalnych żądań | `packages/remote/src/remote-request-diagnostics.ts:165` | Błąd komendy przy zdalnym daemonie | Zdalny daemon | Identyfikatory żądań, logi diagnostyczne | KONF. | REMOVE (razem z NET-10) | j.w. |
| NET-14 | Komenda `proxy` (ekspozycja daemona) | `src/cli/commands/proxy.ts:61`, `packages/proxy/src/daemon-proxy.ts:469` | `proxy [--proxy-host] [--proxy-port]` | Nasłuch HTTP (domyślnie 127.0.0.1, konfigurowalny np. `0.0.0.0`) przeznaczony do tunelowania (np. `cloudflared`) | Cały kontrakt daemona dla zdalnych klientów | NIE | DECISION REQUIRED (rekomendacja: REMOVE) | Służy wyłącznie zdalnemu dostępowi; patrz D-04 |
| NET-15 | `connect proxy`, `connection`, `disconnect`, `takeover`, profile `--remote-config` | `src/cli/connection/proxy-profile.ts:16`, `src/cli/commands/connection*.ts`, `src/cli/commands/takeover.ts`, `packages/remote/src/remote-config*.ts` | Komendy jawne + zapisany stan połączenia (kolejne komendy niejawnie trafiają do zdalnego hosta) | Zdalny daemon / proxy | j.w. NET-10 | KONF. | REMOVE (razem z NET-10) | Infrastruktura zdalnych połączeń i dzierżaw (leases) |
| NET-16 | Metro bridge (zdalny) | `packages/react-native/src/metro/client-metro.ts:491` (`{proxyBaseUrl}/api/metro/bridge`) | `metro prepare --metro-proxy-base-url …` lub profil zdalny | Zdalny serwer proxy/bridge | Token, zakres bridge | KONF. | REMOVE | Udostępnianie Metro zdalnym urządzeniom (chmura) |
| NET-17 | Metro companion tunnel (proces w tle) | `packages/react-native/src/companion/client-companion-tunnel-worker.ts:86,170,286,317,494`; uruchomienie `client-companion-tunnel.ts:405`; wpis `dist/src/internal/companion-tunnel.js` (`tsdown.config.ts:112`) | Automatycznie, gdy bridge (NET-16) jest nieosiągalny | Zdalny serwer (`register`/`unregister`, WebSocket) | **Cały ruch Metro (bundle JS, HMR)** tunelowany na zewnątrz | KONF. | REMOVE | Odłączony proces tunelujący dane lokalne na zewnątrz |
| NET-18 | `metro prepare`: instalacja zależności | `packages/react-native/src/metro/client-metro.ts:297` | `metro prepare`, gdy w projekcie brak `node_modules` (domyślnie włączone; wyłącza `--no-install-deps`) | Rejestr npm/pnpm/yarn | Lockfile projektu | **TAK** (efekt uboczny komendy) | RESTRICT | Niejawne pobieranie podczas zwykłej komendy; patrz D-08 |
| NET-19 | `metro prepare`: start przez `npx` | `packages/react-native/src/metro/client-metro.ts:369-382` | `metro prepare` | `npx expo start` / `npx react-native start` — **npx pobiera paczkę, gdy nie ma jej lokalnie** (w trybie nieinteraktywnym bez pytania) | Nazwa paczki | **TAK** (warunkowo) | RESTRICT | Wymusić `--no-install` / lokalny binarny plik; patrz D-08 |
| NET-20 | `cdp` (helper agent-cdp) | `src/cli/commands/agent-cdp.ts:28` (`npm exec --yes --package agent-cdp@1.6.1`), `:86` | `cdp …` | Rejestr npm (pierwsze uruchomienie) | Nazwa i wersja paczki | **TAK** przy pierwszym użyciu | DECISION REQUIRED (rekomendacja: REPLACE — wymagać preinstalowanego `agent-cdp`, bez `--yes`) | Pobieranie narzędzia podczas zwykłej komendy |
| NET-21 | `web setup` (backend przeglądarki) | `packages/platform-web/src/agent-browser-install.ts:39` (`npm install agent-browser@0.39.0`), `packages/platform-web/src/agent-browser-tool.ts:101` (`agent-browser install` → pobranie przeglądarki) | Jawna komenda `web setup` | Rejestr npm + źródła binariów przeglądarki | Brak danych użytkownika | NIE | DECISION REQUIRED (rekomendacja: RESTRICT) | Jawna instalacja narzędzia; w środowisku korporacyjnym potrzebna ścieżka offline (D-07) |
| NET-22 | `install-from-source <url>` | `packages/provision-kit/src/install-source.ts:104` (pobranie), `install-source-network.ts:25` (blokada adresów prywatnych/loopback) | Jawna komenda (CLI, MCP, SDK) | URL podany przez użytkownika — **tylko publiczne adresy** | Opcjonalne nagłówki (np. token) podane przez użytkownika | NIE | DECISION REQUIRED (rekomendacja: RESTRICT) | Jawna akcja użytkownika; obecna blokada adresów prywatnych utrudnia użycie wewnętrznych repozytoriów artefaktów (D-06) |
| NET-23 | `install-from-source --github-actions-artifact` | `packages/provision-kit/src/install-source-config.ts:6`; lokalnie odrzucane: `packages/daemon/src/sessions/install-source-resolution.ts:41` | Jawna komenda | GitHub API (tylko przez zdalny daemon) | Token GitHub (po stronie zdalnej) | NIE | REMOVE | Lokalnie nieobsługiwane — martwy kod po usunięciu trybu zdalnego (D-06) |

### 2.2. Komunikacja dozwolona (lokalna lub świadomie inicjowana przez użytkownika)

| ID | Komponent | Plik i linia | Co inicjuje połączenie | Cel połączenia | Dane | Automatyczne? | Decyzja | Uzasadnienie |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NET-24 | iOS: `xcodebuild -allowProvisioningUpdates` | `packages/platform-apple/src/runner/runner-artifact.ts:892` | Budowa runnera XCTest dla **fizycznego** urządzenia iOS | Usługi Apple Developer (przez Xcode) | Identyfikatory urządzenia/zespołu (obsługuje Xcode) | TAK (dla urządzeń fizycznych) | PRESERVE (+ opcjonalny opt-out, D-09) | Wymagane przez narzędzia Apple do podpisu na urządzeniu; to część dozwolonej „obsługi urządzeń fizycznych narzędziami Apple” |
| NET-25 | Maestro `runScript` — `http.post` (tryb lokalny) | `packages/maestro/src/daemon-port/run-script-http.ts:35`; wykonanie w procesie potomnym `run-script-execution.ts:72,108`; wpis `dist/src/internal/run-script-http-child.js` | Skrypt JS użytkownika w przepływie Maestro (`replay`/`test`) | Dowolny URL ze skryptu (także localhost) | Dane ze skryptu | NIE (skrypt użytkownika) | **PRESERVE** | Wymóg projektu: HTTP w skryptach użytkownika musi działać. Uwaga: obecnie dostępne jest tylko `http.post` |
| NET-26 | Maestro `runScript` — tryb „public only” | `packages/maestro/src/daemon-port/run-script-http.ts:51`; flaga ustawiana dla żądań HTTP z hookiem autoryzacji `packages/daemon/src/server/http/http-authorization.ts:83` | j.w., ale gdy żądanie przyszło od zdalnego klienta | Tylko adresy publiczne, z re-walidacją przekierowań | j.w. | NIE | PRESERVE | Warstwa ochronna SSRF; po usunięciu trybu zdalnego ścieżka staje się nieużywana, ale nie szkodzi (porządki: D-04) |
| NET-27 | `open <url>`, deep linki | Platformy (`simctl openurl`, `adb shell am start`, `hdc`) | Jawna komenda | Urządzenie/aplikacja otwiera URL | URL podany przez użytkownika | NIE | PRESERVE | Ruch generuje urządzenie/testowana aplikacja, nie TapRig (D-05) |
| NET-28 | Platforma web (agent-browser + Chromium) | `packages/platform-web/src/agent-browser-provider.ts`, `agent-browser-tool.ts` | `open <url> --platform web` i komendy sesji web | Strony wskazane przez użytkownika; **ruch tła przeglądarki** (aktualizacje, Safe Browsing itp.) niezweryfikowany | Dane stron | NIE (nawigacja) / do weryfikacji (tło przeglądarki) | PRESERVE (+ weryfikacja dynamiczna) | Automatyzacja przeglądarki to funkcja lokalna; ruch stron jest ruchem testu (D-07) |
| NET-29 | Metro / React DevTools / doctor | `packages/daemon/src/sessions/handlers/session-doctor-metro.ts:24`, `packages/react-native/src/metro/client-metro.ts:335`, `packages/react-native/src/react-devtools/metro-inspector.ts:31,219` | `doctor`, `metro prepare`, `metro reload`, `react-devtools` | Lokalny serwer deweloperski (host z runtime hints — zwykle localhost/LAN) | Status, inspektor JS | NIE | PRESERVE | Integracja z lokalnym serwerem deweloperskim (D-05) |
| NET-30 | IPC CLI ↔ daemon | Serwer: `packages/daemon/src/server/http/transport.ts:150` (`127.0.0.1`, port losowy); klient: `src/daemon-client/daemon-client-transport.ts:212,616`, `daemon-client-liveness-probe.ts:131` | Każda komenda | `127.0.0.1` + token z pliku stanu | Polecenia i wyniki | TAK (lokalnie) | PRESERVE | Wymagana komunikacja lokalna |
| NET-31 | iOS runner (XCTest) | `packages/platform-apple/src/runner/runner-transport.ts:142` (fetch do runnera, `redirect: 'error'`), `runner-usbmux-protocol.ts:105` (`/var/run/usbmuxd`), `runner-usbmux.ts:106`; strona runnera: `apple/runner/RUNNER_PROTOCOL.md` §„Listener binding” | Komendy na iOS/macOS/tvOS | Symulator: `127.0.0.1`; urządzenie: usbmux lub tunel CoreDevice (`utun`), token per uruchomienie | Polecenia UI, snapshoty | TAK (lokalnie) | PRESERVE | Sterowanie urządzeniem przez lokalne mechanizmy Apple |
| NET-32 | Android snapshot/IME helper | `packages/platform-android/src/snapshot-helper-session-protocol.ts:26`; helper na urządzeniu `android/snapshot-helper/.../SnapshotInstrumentation.java:181` (`127.0.0.1`) | Komendy na Androidzie | Loopback hosta + `adb forward` | Drzewo UI | TAK (lokalnie) | PRESERVE | Lokalny mechanizm ADB |
| NET-33 | Narzędzia platformowe jako procesy | `adb`, `emulator`, `xcrun simctl`, `devicectl`, `xcodebuild`, `hdc`, `vega`, `atspi-dump.py`, `bundletool` (`packages/platform-*/src/**`) | Komendy urządzeń | Lokalne demony narzędzi (adb server, CoreSimulator, usbmuxd) | Polecenia urządzenia | TAK (lokalnie) | PRESERVE | `adb connect/pair/start-server` są zablokowane dla komend zarządzanych: `packages/platform-android/src/adb-transport.ts:247-258` |
| NET-34 | Apple snapshot-source | `packages/platform-apple/src/snapshot-source/host.ts:106` (gniazdo UNIX) | Snapshot na Apple | Lokalny helper | Drzewo AX | TAK (lokalnie) | PRESERVE | Lokalne IPC |
| NET-35 | Serwer MCP | `src/mcp/server.ts:15-34,167` (stdio), wejście `src/cli/entry.ts:36,72` | `agent-device mcp` | stdin/stdout klienta MCP | Wywołania narzędzi | — | PRESERVE | MCP nie otwiera gniazd; nie uruchamia też update notifiera (omija `runCli`) |
| NET-36 | „Telemetria” nagrań | `packages/capture-kit/src/recording/telemetry.ts:18-20` | `record` | Plik lokalny `*.gesture-telemetry.json` | Zdarzenia gestów | — | PRESERVE | Mimo nazwy — wyłącznie zapis lokalny. **Nie znaleziono telemetrii ani raportowania błędów wysyłanych na zewnątrz** |
| NET-37 | Manifest helpera Android (`apkUrl`) | `packages/platform-android/src/helper-artifacts.ts:28`, `snapshot-helper-artifact.ts:26`; generacja `scripts/package-android-helper.sh:81` | — | Metadana (URL wydania GitHub) | — | — | PRESERVE (wyczyścić URL przy rebrandingu) | Pole jest tylko parsowane; APK pochodzi z paczki npm (`package.json` → `files`: `android/*/dist`). Brak pobierania w runtime |
| NET-38 | Eksport `agent-device/ai-sdk` | `src/ai-sdk/index.ts` | Kod użytkownika SDK | — | — | — | PRESERVE | Adapter narzędzi dla Vercel AI SDK; nie wykonuje własnych połączeń (peer dependency `ai` opcjonalna) |

### 2.3. Budowanie, CI/CD i dystrybucja (poza runtime)

| ID | Komponent | Plik i linia | Co inicjuje połączenie | Cel połączenia | Dane | Automatyczne? | Decyzja | Uzasadnienie |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NET-39 | Instalacja zależności deweloperskich | `pnpm-lock.yaml`, `pnpm-workspace.yaml` (`allowBuilds: fallow`) | `pnpm install` (deweloper/CI) | Rejestr npm | — | Build-time | PRESERVE (lockfile, `--frozen-lockfile`); po Etapie 4 usunąć `@limrun/api` | Ruch budowania, nie runtime. Publikowana paczka nie ma `dependencies` ani skryptów `postinstall` |
| NET-40 | Workflowy upstream | `.github/workflows/release.yml` (npm publish), `publish-mcp-registry.yml:63-101` (curl `mcp-publisher`, publikacja w MCP Registry), `deploy.yml`/`pr-preview.yml` (GitHub Pages), `conformance-differential.yml:112` (`curl https://get.maestro.mobile.dev \| bash`), nightly | Zdarzenia GitHub | npm, MCP Registry, GitHub Pages, Maestro | Artefakty wydania | CI | REPLACE | Workflowy publikują pod nazwą upstream; fork musi mieć własne (D-10) |
| NET-41 | Skrypty pakujące | `scripts/package-android-helper.sh:81`, `scripts/package-ios-simulator-runner.sh:105` | Budowanie wydania | Wstawiają URL-e `github.com/<repo>/releases/download/...` do manifestów | — | Build-time | REPLACE | Zależność od wydań GitHub upstream |
| NET-42 | Metadane rejestrów MCP | `server.json`, `smithery.yaml`, `glama.json` | Rejestry MCP | Konfiguracja `npx agent-device mcp` — **npx pobiera paczkę przy każdym starcie klienta MCP**, jeśli nie jest zainstalowana | — | Dystrybucja | REPLACE (dokumentować lokalną instalację; brak publikacji w rejestrach) | Pobieranie podczas uruchamiania MCP |

### 2.4. Przypadki wymagające decyzji (zestawienie z §3.C zadania)

| Przypadek | Powiązane ID | Proponowana polityka | Rejestr decyzji |
| --- | --- | --- | --- |
| Otwieranie adresów HTTPS na polecenie użytkownika | NET-27, NET-28 | PRESERVE — ruch urządzenia/przeglądarki, nie TapRig | D-05 |
| Deep linki | NET-27 | PRESERVE | D-05 |
| Instalowanie aplikacji ze wskazanego URL | NET-22 | RESTRICT — jawne, z możliwością allowlisty hostów wewnętrznych | D-06 (pytanie do właściciela) |
| Automatyzacja przeglądarki | NET-21, NET-28 | PRESERVE automatyzację; RESTRICT instalację (`web setup`) | D-07 (pytanie do właściciela) |
| Pobieranie zależności podczas budowania | NET-39 | PRESERVE (build-time, lockfile) | D-10 |
| Pobieranie natywnych helperów | NET-37, NET-41 | Helpery już są w paczce — PRESERVE; usunąć URL-e upstream | D-10 |
| Urządzenia w sieci lokalnej | NET-31 (tunel CoreDevice), NET-33 | PRESERVE mechanizmy narzędzi Apple/ADB; nie dodawać zdalnego daemona | D-04, D-05 |
| Lokalne serwery deweloperskie (Metro) | NET-29, NET-18, NET-19 | PRESERVE komunikację z Metro; RESTRICT instalację zależności i `npx` | D-08 |
| Pobieranie artefaktów z CI | NET-23 | REMOVE (lokalnie i tak nieobsługiwane) | D-06 |

## 3. Szczegółowy opis mechanizmów

### 3.1. NET-01 — sprawdzanie aktualizacji (potwierdzone w kodzie i dynamicznie)

> **Stan: usunięte w E2 (PR #3).** Opis poniżej dotyczy commita bazowego.

Ścieżka: `bin/agent-device.mjs` → `dist/src/internal/bin.js` (`src/bin.ts`) → `runEntry`
(`src/cli/entry.ts:36-64`) → `runCli` → `runCliOnHost` (`src/cli.ts:146`) →
`maybeRunUpgradeNotifier` (`src/cli.ts:198`, wywołane **przed** `resolveRemoteContext` i przed
wykonaniem komendy) → `shouldStartBackgroundCheck` (`src/cli/update-check.ts:107`) →
`spawnBackgroundUpdateCheck` (`:156`) uruchamia **odłączony proces Node**
(`runCmdDetached`, wpis `dist/src/internal/update-check-entry.js` z `tsdown.config.ts:116`) z
argumentem `--agent-device-run-update-check` → `runUpdateCheckWorker` (`:60`) →
`fetchLatestPackageVersion` (`:177-188`) → `GET https://registry.npmjs.org/agent-device/<tag>`.
Wynik zapisywany jest do `<stateDir>/update-check.json`; przy kolejnej komendzie wypisywany jest
komunikat `npm install -g agent-device@…`.

Warunki: `src/cli/update-check.ts:90-98` — wyłączone dla `help`, `test`, `--help`, `--version`,
`--json`, gdy ustawione `CI`, `NODE_ENV=test` lub `AGENT_DEVICE_NO_UPDATE_NOTIFIER`, oraz gdy
stderr nie jest TTY. MCP (`src/cli/entry.ts:36`) i SDK nie przechodzą przez `runCli`, więc ich
nie dotyczy.

Usunięcie: pliki `src/cli/update-check.ts`, `src/cli/update-check-entry.ts`, wpis
`internal/update-check-entry` w `tsdown.config.ts`, wywołanie w `src/cli.ts`, testy
(`git grep -l update-check -- src test`), zmienna `AGENT_DEVICE_NO_UPDATE_NOTIFIER` w
dokumentacji. Test: brak połączeń innych niż loopback w harnessie z §6 dla komendy uruchomionej
z TTY i czystym state dir; brak pliku `update-check.json`.

### 3.2. NET-02/03 — chmura agent-device (control plane)

`connect` bez providera: `src/cli/commands/connection.ts` → `resolveConnectProviderProfile`
(`src/cli/connection/connect-provider-adapters.ts:101-142`) → `provider = options.provider ??
(shouldUseProxyConnectShortcut(...) ? 'proxy' : 'cloud')` (`:128`) → adapter `cloud`
(`:57-67`) → `resolveCloudConnectProfile` (`src/cli/connection/cloud-profile.ts:20`) →
`resolveCloudAccessForConnect` (`src/cli/auth-session.ts`) → przepływ *device authorization*
(`/api/control-plane/device-auth/start`, `/poll`), otwarcie przeglądarki (`:233`,
`src/cli/browser-launch.ts`), zapis „CLI session” w state dir → `GET
/api/control-plane/connection-profile` → zapis wygenerowanego profilu zdalnego daemona
(`src/cli/connection/generated-config.ts`). Kolejne komendy trafiają do zdalnego daemona
(NET-10), a przy każdej komendzie z daemonem w domenie `agent-device.dev` sesja jest odświeżana
(`resolveRemoteAuth`, `src/cli/auth-session.ts:93-142`, wywołane z `src/cli.ts:436`).

Dane wrażliwe: refresh credential i access token zapisywane lokalnie (rekord `CliSessionRecord`,
`src/cli/auth-session.ts:18-28`), token przesyłany w nagłówku `Authorization`.

Usunięcie: `src/cli/auth-session.ts`, `src/cli/cloud-response.ts`,
`src/cli/connection/cloud-profile.ts`, `src/cli/commands/auth.ts` (rejestracja w
`src/cli/commands/router.ts:16`), adapter `cloud` i wartość domyślna w
`connect-provider-adapters.ts`, `ROUTING_PROVIDER_IDENTITIES` `'cloud'`
(`packages/plugins/src/manifest.ts:7`), `CLOUD_LEASE_PROVIDER` (`packages/contracts/src/lease-scope*`),
zmienne `AGENT_DEVICE_CLOUD_AUTH`, `AGENT_DEVICE_CLOUD_BASE_URL`, pomoc (`cli-help.ts` „Cloud
profile flow”, opis `auth`). `connect` bez argumentów musi zwracać błąd `INVALID_ARGS`.

### 3.3. NET-04/05/06/07 — providery chmurowe

Rejestracja:

- **Wbudowane** (`BUILTIN_PROVIDER_IDS`, `src/builtin-provider-ids.ts:18-21`): `browserstack`,
  `aws-device-farm` (z `CLOUD_WEBDRIVER_PROVIDER_DECLARATIONS`,
  `packages/provider-webdriver/src/providers.ts:39-52`) oraz `limrun`.
- **Kandydaci rejestru** (`src/builtin-provider-plugins.ts:20-30`): ładowani przy starcie daemona
  przez `createEmbeddedProviderRuntimeComposition` (`src/provider-device-runtimes.ts:36-49`) i
  `startProviderRegistry` (`packages/plugins/src/registry.ts`). Limrun staje się aktywny, gdy
  `readLimrunCredentials(host.env)` znajdzie poświadczenia (`src/builtin-provider-plugins.ts:67-77`).
- **Pluginy** (`@agent-device/testmu` i dowolne inne) — NET-08/09.
- **Routing CLI**: `connect <provider>` (`connect-provider-adapters.ts:90-142`), polityka
  `src/cli/connection/provider-policy.ts`, `src/provider-plugin-policy.ts`.
- **SDK**: `createAgentDeviceClient({ leaseProvider, … })` omija zapisany stan `connect`
  (`cli-help.ts`: „JavaScript can skip persisted connect state…”); eksporty
  `agent-device/limrun`, `agent-device/plugins`, `agent-device/plugins/webdriver`,
  `agent-device/remote-config` (`package.json` → `exports`, `tsdown.config.ts:96-116`).
- **MCP**: nie udostępnia `connect`/`disconnect` (komendy klienta CLI nie są w rejestrze MCP),
  ale narzędzia (`open`, `apps`, `artifacts`, `install`…) **działają na zapisanym połączeniu**
  z tego samego state dir oraz na `leaseProvider` z pliku konfiguracji operatora
  (`AGENT_DEVICE_CONFIG`). Usunięcie samej komendy `connect` nie wystarczy — trzeba usunąć
  providery, profil połączenia i obsługę `leaseProvider` dla providerów zdalnych.

Alternatywne ścieżki, które muszą zostać zamknięte, aby provider był nieosiągalny:
`connect`, zapisany profil (`~/.agent-device/…/connection`), plik `--config`/`AGENT_DEVICE_CONFIG`
z `leaseProvider`, `--remote-config`, flagi `--lease-provider`/`--provider-*`, SDK
`leaseProvider`, `startAgentDevice({ providerCandidates })` (SDK embed, `src/sdk/index.ts:7`),
plugin store, zmienne środowiskowe Limrun.

### 3.4. NET-08/09 — system pluginów

`plugins add|update` uruchamia `npm install --ignore-scripts … <pakiet>@<wersja|latest>` w
`~/.agent-device/plugins/<uuid>` (`packages/plugins/src/store.ts:227-256`), zapisuje wybór w
`config.json`. Daemon przy każdym starcie wykonuje `import()` modułu pluginu
(`store.ts:77-104`) — kod pluginu działa w procesie daemona z pełnym dostępem do sieci i
poświadczeń. Jedynym udokumentowanym przeznaczeniem pluginów są providery urządzeń
(`packages/plugins/src/contract.ts`, katalog `src/commands/provider-plugin-catalog.ts`).

### 3.5. NET-10…17 — tryb zdalny

Tryb zdalny składa się z: klienta zdalnego daemona (`src/daemon-client/*` gałęzie
`baseUrl`/`isRemoteDaemon`), pakietu `packages/remote` (konfiguracja profili, upload, download,
diagnostyka), pakietu `packages/proxy` + komendy `proxy`, komend `connect`/`connection`/
`disconnect`/`takeover`, dzierżaw (`lease*`) po stronie daemona, endpointów HTTP daemona dla
zdalnych klientów (`packages/daemon/src/server/upload-http.ts`, `resumable-upload*.ts`,
`downloadable-artifact-http.ts`, `host-lease-http.ts`, `human-control-http.ts`,
`request-diagnostics-http.ts`) oraz mostów Metro (NET-16/17). Serwer daemona słucha wyłącznie
na `127.0.0.1` (`packages/daemon/src/server/http/transport.ts:150`) — na zewnątrz wystawia go
dopiero `proxy` lub zewnętrzny tunel. Rekomendacja (D-04): usunąć klienta zdalnego, `proxy`,
`connect*`, `takeover`, mosty Metro; endpointy HTTP daemona dla zdalnych klientów usunąć w
osobnym PR po potwierdzeniu, że lokalny klient ich nie używa.

### 3.6. NET-18/19/20/21 — pobieranie narzędzi podczas pracy

- `metro prepare` (`packages/react-native/src/metro/client-metro.ts:287-305`) instaluje
  zależności projektu, gdy brakuje `node_modules`. To efekt uboczny, którego użytkownik może nie
  oczekiwać. Rekomendacja: odwrócić domyślność (instalacja tylko z jawną flagą).
- Start Metro przez `npx` (`:361-384`): dodać `--no-install` (lub uruchamiać
  `node_modules/.bin/...`), aby `npx` nie pobierał paczek.
- `cdp` (`src/cli/commands/agent-cdp.ts:7-28,86`): `npm exec --yes --package agent-cdp@1.6.1`.
- `web setup`: jawna instalacja `agent-browser` i przeglądarki.

### 3.7. NET-25/26 — HTTP w skryptach użytkownika (zachować)

`runScript` w przepływach Maestro: `packages/maestro/src/daemon-port/run-script-execution.ts`
wykonuje plik skryptu w `vm.runInNewContext` z globalami `output`, `json`, `http.post`
(`:60-73`). `http.post` wywołuje synchronicznie proces potomny Node
(`run-script-http-child`) z żądaniem w stdin (`:104-130`). W trybie lokalnym
(`publicNetworkOnly: false`) używany jest globalny `fetch` bez ograniczeń hosta
(`run-script-http.ts:31-37`) — działa także dla `localhost`. W trybie „public only” (żądania
od zdalnych klientów przez HTTP z hookiem autoryzacji) używany jest `undici` z walidacją DNS i
przekierowań oraz obsługą `HTTP(S)_PROXY` (`:39-63`, `resolveProxyForUrl`).

Obserwacje:

- Obecnie istnieje tylko `http.post` (brak `http.get/put/delete/request` znanych z Maestro).
- Lokalna ścieżka używa globalnego `fetch` Node 22, który **nie respektuje** `HTTPS_PROXY`
  (chyba że `NODE_USE_ENV_PROXY=1`). W sieci korporacyjnej z obowiązkowym proxy skrypty
  użytkownika mogą nie dosięgnąć celu — temat do decyzji (D-11), nie do usuwania.
- Polityka local-only **nie może** blokować tej ścieżki globalnie (np. przez nadpisanie
  `globalThis.fetch` w daemonie) — proces potomny dziedziczy środowisko.

Istniejące testy (przechodzą offline, §6): `packages/maestro/src/daemon-port/__tests__/
run-script-http.test.ts` („keeps local requests on the existing Fetch path”),
`run-script-execution.test.ts`, `run-script-http-child.test.ts`,
`packages/daemon/src/sessions/__tests__/replay-maestro/session-replay-runtime-maestro-run-script.test.ts`.

## 4. Klasyfikacja dowodów

### 4.1. Połączenia potwierdzone w kodzie

NET-01 – NET-08, NET-10 – NET-22, NET-24 – NET-35 (ścieżki opisane w §2–3).

### 4.2. Połączenia zależne od konfiguracji

NET-02 (sesja chmurowa), NET-07 (poświadczenia Limrun w env), NET-09 (zainstalowane pluginy),
NET-10 – NET-17 (`AGENT_DEVICE_DAEMON_BASE_URL`, `--config`, `AGENT_DEVICE_CONFIG`,
`~/.agent-device/config.json`, zapisany profil `connect`, `--remote-config`), NET-24 (tylko
urządzenia fizyczne iOS).

Pliki konfiguracji: `~/.agent-device/config.json` (lub `$AGENT_DEVICE_HOME/config.json`) i
`./agent-device.json`; konfiguracja projektu nie może wybierać endpointów ani poświadczeń
(komunikat pomocy „Configuration”).

### 4.3. Możliwe wywołania przez zależności (wymagają weryfikacji dynamicznej)

- `@limrun/api` (wbudowany w `dist/`) — klient HTTP/WebSocket; znika z Etapem 4.
- `undici` (wbudowany) — używany przez `run-script-http.ts` i
  `packages/provision-kit/src/install-source-network-transport.ts`; sam z siebie nie łączy się.
- `agent-browser` i pobrana przez niego przeglądarka — ruch tła Chromium (aktualizacje,
  Safe Browsing, metryki) **niezweryfikowany**.
- `xcodebuild`, `devicectl`, `simctl` — mogą kontaktować się z usługami Apple (provisioning,
  pobieranie runtime'ów symulatorów na żądanie Xcode) — poza kontrolą TapRig.
- `adb`/emulator Androida — emulator może mieć własny ruch (np. sprawdzanie aktualizacji
  emulatora przy uruchomieniu przez `emulator`), **niezweryfikowane**.
- `npx`/`npm` uruchamiane przez Metro/`cdp`/`web setup` (NET-18 – NET-21).

### 4.4. Obszary wymagające weryfikacji dynamicznej

1. Pełny przebieg sesji iOS (symulator i urządzenie) na macOS pod monitorem ruchu.
2. Pełny przebieg sesji Android (emulator) — w tym ruch samego emulatora.
3. Sesja web (`open https://… --platform web`) — ruch tła przeglądarki.
4. `metro prepare` w projekcie RN bez `node_modules` i bez lokalnego `react-native`.
5. Start daemona z zainstalowanym pluginem (przed Etapem 5) i z poświadczeniami Limrun w env.

## 5. Brak telemetrii

W kodzie produkcyjnym nie znaleziono: SDK telemetrii/raportowania błędów (Sentry, PostHog,
Segment, Amplitude, Mixpanel, OpenTelemetry), wysyłki logów diagnostycznych na zewnątrz ani
uploadu screenshotów poza trybem zdalnym/providerami. Logi diagnostyczne są zapisywane lokalnie
(`packages/host-kit/src/internal/diagnostics.ts:256`, `~/.agent-device/logs/…`) i ścieżka jest
wypisywana użytkownikowi (`Diagnostics Log: …`). Wysyłka danych poza komputer występuje
wyłącznie w mechanizmach NET-01 – NET-17.

## 6. Weryfikacja dynamiczna wykonana w Etapie 0

Środowisko: Linux (kontener), Node 22.22.0, pnpm 11.17.0, brak `adb`/Xcode — komendy
urządzeń kończą się `TOOL_MISSING`, ale ścieżki CLI → daemon → platforma są wykonywane.

Harness (do przeniesienia do repozytorium w Etapie 1, D-12):

```sh
# lo_up.py podnosi interfejs lo w nowej przestrzeni nazw sieci (ioctl SIOCSIFFLAGS).
unshare -n bash -c 'python3 -I lo_up.py && exec strace -f -qq \
  -e trace=execve,connect,sendto,sendmsg -o trace.log -- node bin/agent-device.mjs <komenda>'
# Naruszenie = connect/sendto do rodziny AF_INET/AF_INET6 na adres inny niż 127.0.0.0/8 i ::1.
```

| Scenariusz | Wynik |
| --- | --- |
| `devices --platform android`, TTY (przez `script`), czysty state dir | Proces potomny `node …/update-check-entry.js --agent-device-run-update-check …` wykonał zapytania DNS (`connect` do `8.8.8.8:53`, `8.8.4.4:53`); poza tym tylko `127.0.0.1` (daemon). Powstał `update-check.json`. **Potwierdza NET-01.** |
| j.w. z `AGENT_DEVICE_NO_UPDATE_NOTIFIER=1` | 0 połączeń poza loopback. |
| `connect` bez argumentów, bez TTY | Błąd `UNAUTHORIZED … cannot perform interactive login`; brak połączeń. |
| `connect` z `AGENT_DEVICE_DAEMON_AUTH_TOKEN=<atrapa>` | Zapytania DNS (rozwiązywanie `cloud.agent-device.dev`), błąd `fetch failed`. **Potwierdza NET-03.** |
| Testy `runScript` HTTP (4 pliki, 20 testów) w `unshare -n` | Wszystkie przechodzą — HTTP do lokalnego serwera testowego działa bez Internetu. |
| `pnpm test:unit` w `unshare -n` | Patrz `docs/HANDOFF.md` §„Stan testów”. |

Nie deklarujemy zgodności offline całego narzędzia: brak przebiegów na urządzeniach iOS/Android
i brak weryfikacji ruchu narzędzi zewnętrznych (§4.3–4.4).

## 7. Projekt kontroli (statycznej i dynamicznej)

### 7.1. Audyt statyczny (automatyczny, w CI)

1. **Strażnik prymitywów sieciowych** (`scripts/taprig/network-guard.ts` + test): skanuje pliki
   produkcyjne (te same reguły co §1) i porównuje listę miejsc z zatwierdzoną allowlistą
   `scripts/taprig/network-allowlist.json` (ścieżka + symbol + ID z tego audytu + uzasadnienie).
   Nowe miejsce lub nowy literał URL poza allowlistą = błąd. Allowlista kurczy się w kolejnych
   etapach; usunięte ID nie mogą wrócić.
2. **Strażnik literałów hostów**: lista zakazanych domen (`agent-device.dev`,
   `registry.npmjs.org`, `browserstack.com`, `lambdatest.com`, `limrun`, `amazonaws.com`,
   `devicefarm`) w `src/`, `packages/*/src`, `dist/` (po buildzie) — z wyjątkiem komentarzy z
   linkami do upstream oznaczonych w allowliście.
3. **Strażnik procesów potomnych**: zakaz `npm`, `npx`, `pnpm`, `yarn`, `curl`, `wget`, `aws`
   w wywołaniach `runCmd*` poza allowlistą (po Etapie 7: tylko jawne `web setup` i opt-in
   instalacji zależności Metro).
4. **Strażnik rejestrów**: test, że `BUILTIN_PROVIDER_IDS` jest pusty, `connect`/`plugins`/`auth`/
   `proxy` nie istnieją w katalogu komend, `listMcpCommandMetadata()` nie zawiera komend
   zdalnych, `package.json` → `exports` nie zawiera `./limrun`, `./plugins*`, `./remote-config`.
5. **Kontrola artefaktu**: `pnpm build` + skan `dist/` (strażnik 2) + `npm pack --dry-run` lista
   plików bez `companion-tunnel`, `update-check-entry`, katalogów providerów.
6. **Kod natywny**: grep `URLSession|NWConnection|HttpURLConnection|java.net.URL` w
   `apple/`, `android/` z allowlistą (obecnie: tylko listener runnera i `ServerSocket` na
   `127.0.0.1`).

### 7.2. Audyt dynamiczny

1. **Linux (CI, każdy PR)**: harness z §6 przeniesiony do `scripts/taprig/offline-harness/`.
   Zestaw komend: `--version`, `help`, `devices`, `doctor`, `mcp` (sekwencja
   `initialize`/`tools/list`/`tools/call devices` na stdin), `replay` przepływu Maestro z
   `runScript`, `daemon status/stop`. Asercja: zero `connect`/`sendto` do adresów spoza
   `127.0.0.0/8`/`::1` (w tym zero zapytań DNS — port 53) dla procesów TapRig; dopuszczalne
   gniazda UNIX. Uruchamiać z TTY (`script`) oraz bez, z czystym i „starym” state dir.
2. **Test pozytywny HTTP użytkownika**: przepływ Maestro z `runScript`, który robi
   `http.post('http://127.0.0.1:<port>/…')` do serwera testowego uruchomionego w tej samej
   przestrzeni nazw; asercja: serwer otrzymał żądanie, `output.*` ma odpowiedź. Wariant z
   adresem „zewnętrznym”: drugi namespace/veth z serwerem pod adresem spoza loopback i
   **jawnie dopuszczonym** w teście — połączenie jest oczekiwane i oznaczone jako „ruch skryptu
   użytkownika” (atrybucja po PID procesu `run-script-http-child`).
3. **macOS (ręcznie/self-hosted, Etap 10)**: `sandbox-exec` z profilem `deny network-outbound`
   poza `localhost` i gniazdami UNIX, lub Little Snitch/`pfctl` + `nettop -P -L 0` dla drzewa
   procesów TapRig; przebieg: symulator iOS (open, snapshot, click, screenshot, record),
   urządzenie fizyczne (z dopuszczonym ruchem `xcodebuild`/CoreDevice — atrybucja po nazwie
   procesu), emulator Androida.
4. **Atrybucja ruchu**: TapRig = drzewo procesów `node` CLI/daemona/workerów; skrypt
   użytkownika = proces `run-script-http-child`; testowana aplikacja = procesy
   symulatora/emulatora/urządzenia (poza drzewem TapRig); budowanie = `pnpm install`/`xcodebuild
   build-for-testing` uruchamiane osobno, poza harnessem.
5. **Kryterium**: raport z harnessu dołączany do PR Etapu 8 i 10; bez tych raportów nie wolno
   deklarować zgodności z polityką local-only.

## 8. Kontrole wdrożone w Etapie 1

E1 nie usunął żadnego mechanizmu z tabeli §2 — wszystkie NET-xx pozostają w stanie bazowym.
E1 dodał dwie kontrole, które pilnują tego stanu i wymuszają aktualizację w kolejnych etapach.

### 8.1. Strażnik statyczny

- Pliki: `scripts/taprig/network-guard.ts`, `scripts/taprig/network-allowlist.json`,
  test `scripts/taprig/network-guard.test.ts` (projekt Vitest `unit-core`, czyli
  `pnpm test:unit` i lane Coverage w CI), komenda `pnpm taprig:network-guard`, job
  `TapRig / Network guard & offline harness` (`.github/workflows/taprig.yml`).
- Zakres: `git ls-files src packages bin`, rozszerzenia TS/JS, bez testów i fixture'ów
  (`__tests__/`, `__fixtures__/`, `__mocks__/`, `fixtures/`, `test/`, `tests/`, `test-utils/`,
  `test-support/`, `testing/`, `*.test.*`, `*.spec.*`, `*.fixture(s).*`, `*.bench.*`, `*.d.ts`)
  oraz bez `packages/test-kit/` (pakiet tylko dla testów, nie trafia do `dist/`). Stan bazowy:
  1 903 pliki.
- Reguły (`rule` w allowliście):

  | Reguła | Wykrywa |
  | --- | --- |
  | `fetch` | `fetch(`, `.fetch(`, `globalThis.fetch`, `fetchImpl` |
  | `node-net-module` | import/require `node:http`, `https`, `http2`, `net`, `tls`, `dgram`, `dns` (także `/promises`) |
  | `http-client-module` | import `undici`, `ws`, `axios`, `node-fetch`, `got` |
  | `websocket` | `WebSocket` |
  | `transport-request` | `transport.request` |
  | `socket-connect` | `net.createConnection(`, `net.connect(`, `tls.connect(`, `createConnection(` |
  | `listen` | `listen(` |
  | `url-literal` | literały `http(s)://`, `ws(s)://` (token: schemat + host bez portu) |
  | `net-tool-command` | literał tekstowy `npm`, `npx`, `pnpm`, `yarn`, `curl`, `wget`, `aws` (argument `runCmd*`/`spawn` lub zmienna z nazwą komendy) |
  | `forbidden-marker` | domeny `agent-device.dev`, `registry.npmjs.org`, `browserstack.com`, `lambdatest.com`, `amazonaws.com` w dowolnym miejscu linii; `limrun`, `devicefarm` w literałach tekstowych |

- Wpis allowlisty: `file`, `rule`, `token`, `count` (dokładna liczba wystąpień), `ids`
  (NET-xx), `decision` (`REMOVE`, `RESTRICT`, `REPLACE`, `PRESERVE`, `DECISION REQUIRED`,
  `IGNORE`), `reason`. Strażnik failuje dla: miejsca spoza allowlisty (`unlisted`), innej
  liczby wystąpień (`count`), wpisu bez dopasowania (`stale`), wpisu niepoprawnego (`invalid`
  — brak ID/uzasadnienia, zakazana domena bez `REMOVE`).
- **NET-00** — identyfikator wpisów, które nie otwierają połączenia: linki do dokumentacji i
  zgłoszeń upstream w komentarzach i komunikatach, przykładowe URL-e w pomocy CLI, bazowy URL
  przekazywany tylko do parsera `URL`, słowo „fetch” w komentarzu. Decyzja: `IGNORE`. Każdy
  taki literał ma osobny wpis — nie ma globalnej reguły ignorowania komentarzy.
- Baseline E1: 394 wystąpienia w 174 wpisach (84 `REMOVE`), 31 identyfikatorów. Wpisy
  `REMOVE` obejmują wszystkie wystąpienia zakazanych domen i markerów (NET-01 – NET-08,
  NET-11 – NET-13, NET-17, typy współdzielone z `limrun`).
- Ograniczenia: wykrywanie tekstowe (bez AST). Nie wykrywa połączeń z kodu natywnego
  (`apple/`, `android/` — §7.1 p.6, poza zakresem E1), dynamicznie budowanych nazw modułów ani
  sieci w zależnościach wbudowywanych w `dist/` (§7.1 p.5 — skan `dist/` planowany w E8).
  Mechanizmy bez prymitywu sieciowego w kodzie TS (NET-09 `import()` pluginów, NET-10 wybór
  zdalnego daemona, NET-24 `-allowProvisioningUpdates`, NET-27/28/33/35–37) nie mają wpisów.

### 8.2. Harness offline

- Pliki: `scripts/taprig/offline-harness/` (`run.sh`, `lo_up.py`, `check.mjs`,
  `expectations.json`, `README.md`), komenda `pnpm taprig:offline-smoke`, job CI w
  `.github/workflows/taprig.yml` (`ubuntu-latest`, `sudo unshare`, instalacja `strace` przez
  `apt-get` — ruch budowania).
- Metoda: nowa przestrzeń nazw sieci (`unshare -n`, tylko `lo`), proces jako użytkownik
  wywołujący (`setpriv`), czyste środowisko (nowy `HOME` i `AGENT_DEVICE_STATE_DIR`, bez `CI` i
  zmiennych proxy), `strace -f -e trace=execve,connect,sendto,sendmsg` (+ `clone*`/`fork` do
  atrybucji wątków i procesów). Po scenariuszu: `daemon stop` z tym samym state dir.
- Naruszenie: `connect`/`sendto`/`sendmsg` do `AF_INET`/`AF_INET6` spoza `127.0.0.0/8` i `::1`,
  każde żądanie na port 53 (także do lokalnego resolvera, np. `127.0.0.53` na Ubuntu), połączenie
  z gniazdem resolvera (`/run/systemd/resolve/*`, D-Bus system bus).
- Scenariusze: `--version`, `help commands`, `devices --platform android` z TTY (`script -qec`) i
  bez TTY, `mcp` (`initialize`, `notifications/initialized`, `tools/list`).
- Wynik E1 (kontener Linux, Node 22.22.0, bez `adb`): jedyne naruszenia to zapytania DNS
  (`8.8.8.8:53`, `8.8.4.4:53`) procesu `update-check-entry.js --agent-device-run-update-check`
  w scenariuszu `devices-android-tty` — **NET-01, „expected until E2”**. Pozostałe scenariusze:
  wyłącznie `127.0.0.1` (IPC z daemonem) lub brak gniazd. `tools/list` zwraca narzędzia bez
  żadnego połączenia.
- Harness failuje przy nowym naruszeniu i gdy oczekiwane naruszenie zniknie — E2 musi usunąć
  wpis NET-01 z `expectations.json`.

## 9. Stan po Etapie 2

E2 (PR #3) usunął NET-01: `src/cli/update-check.ts`, `src/cli/update-check-entry.ts`, ich
testy, wywołanie w `src/cli.ts`, wpis `internal/update-check-entry` w `tsdown.config.ts` i
zmienną `AGENT_DEVICE_NO_UPDATE_NOTIFIER` (skrypty, testy, `.fallowrc.json`, `website/docs`).
Brak `registry.npmjs.org` w `src/`, `packages/` i `dist/`; brak `update-check-entry.js` w
`dist/`. Test `src/__tests__/cli-no-update-check.test.ts`: `runCli` z TTY na stderr i czystym
state dir nie uruchamia odłączonego procesu i nie tworzy `update-check.json`.

- Strażnik statyczny: usunięte 3 wpisy NET-01 (`src/cli/update-check.ts`: `fetch`,
  `forbidden-marker`, `url-literal`). Stan: **391 wystąpień w 171 wpisach (81 `REMOVE`),
  30 identyfikatorów**. Nowych wpisów brak.
- Harness offline: `expectations.json` jest pusty. Wszystkie scenariusze (`version`,
  `help-commands`, `devices-android-tty`, `devices-android-no-tty`, `mcp`) — **0 naruszeń**,
  wynik PASS. W `devices-android-tty` jedynymi zdarzeniami gniazd są połączenia z daemonem na
  `127.0.0.1`.
- Poza `src/`/`packages/`: `scripts/release-plan.mjs` nadal odpytuje `registry.npmjs.org` —
  to narzędzie wydań upstream (workflow `release.yml` usunięty w E1), nie runtime; zakres E11.
