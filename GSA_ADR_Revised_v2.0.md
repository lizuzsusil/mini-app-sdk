Government Super App (GSA) — Revised Architectural Decision Records 

# **Government Super App (GSA)** 

## **Revised Architectural Decision Records** 

ADR-001 (Rev) · ADR-002 (Rev) · ADR-011 (New) · ADR-012 (New) 

|**Document Type**|Architectural Decision Records<br>(ADR)|
|---|---|
|**Project**|Government Super App (GSA)|
|**Version**|2.0 — Revised Cross-Platform Shell<br>Architecture|
|**Date**|June 2026|
|**Status**|ACCEPTED|
|**Prepared by**|Platform Architecture Team|



CONFIDENTIAL — INTERNAL USE ONLY    Page 1 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

### **0.  Purpose and Scope** 

This document revises and extends the original GSA Architectural Decision Records (v1.0, May 2026) to reflect decisions reached during the cross-platform shell architecture design session (June 2026). Four ADRs are affected: 

|**ADR**|**Title**|**Change**|
|---|---|---|
|ADR-001|Mini-App Architecture|Revised — supersedes original Dart mini-app<br>decision|
|ADR-002|SDK Bridge as Sole Interface|Revised — restates isolation model for<br>WebView context and formalises two-SDK<br>split|
|ADR-011|Cross-Platform SDK<br>Architecture|New — defnes Platform SDK, Mini-App SDK,<br>bridge protocol, and distribution model|
|ADR-012|Dedicated VC Mini-App|New — concentrates all ofine credential<br>capability in one platform-owned mini-app|



All other ADRs from v1.0 remain in force and are not repeated here. This document should be read alongside the original ADR document. 

CONFIDENTIAL — INTERNAL USE ONLY    Page 2 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

### **ADR-001 (Revised) — Mini-App Architecture for the Citizen Container Apps** 

|**Status**|**Accepted — Supersedes ADR-001 (May 2026)**|
|---|---|
|Date|June 2026|
|Deciders|Platform Architecture Team|
|Supersedes|ADR-001 v1.0 (May 2026) — Flutter Container Shell with Dart<br>Mini-Apps|



#### **Context** 

The original ADR-001 (May 2026) established a Flutter Container Shell hosting sandboxed Dart mini-apps. WebView-based mini-apps were explicitly rejected on three grounds: poor offline capability, security audit complexity, and no device API access without a custom bridge. 

Two requirements have since emerged that the original decision did not anticipate: 

- The platform must serve both a mobile app (Flutter) and a web app (Next.js PWA) as first-class delivery channels. 

- Agency teams must build one mini-app codebase that runs on both channels without duplication. 

Under the original Dart mini-app model, agencies would need to maintain two separate implementations per service — one in Dart for mobile, one in React for web. At 20 or more agencies, this doubles onboarding cost and fragments the agency developer ecosystem against the platform's stated goal of agency self-onboarding without platform team involvement. 

The three original rejection reasons are re-examined: 

|**Original**<br>**objection**|**Re-examination**|**Outcome**|
|---|---|---|
|Poor ofine<br>capability|Ofine credential capability is fully<br>concentrated in the platform-owned<br>VC Mini-App (ADR-012). Agency mini-<br>apps are explicitly online-frst. The<br>concern no longer applies to the<br>majority of mini-apps.|Resolved by ADR-012|



CONFIDENTIAL — INTERNAL USE ONLY    Page 3 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

|Security audit<br>complexity|Addressed by the WebView hardening<br>requirements defned in this ADR and<br>the two-SDK architecture formalised in<br>ADR-011. Isolation model is weaker<br>than Dart but is documentable and<br>auditable.|Mitigated|
|---|---|---|
|No device API<br>access without<br>custom bridge|The Mini-App SDK (ADR-011) provides<br>this bridge explicitly. Device capability<br>requests are proxied through the SDK<br>to the shell. Mini-apps never call device<br>APIs directly.|Resolved by ADR-011|



#### **Decision** 

The Citizen Container App on mobile is a Flutter shell hosting React mini-apps inside hardened WebViews. The Citizen Container App on web is a Next.js shell hosting the same React mini-apps inside isolated div mount points with Shadow DOM style isolation. 

Each agency builds one React mini-app that runs in both host environments without modification. The host environment is fully abstracted by the Mini-App SDK. The Flutter shell remains the mobile container — this revision changes the mini-app technology, not the shell technology. 

#### **Options Considered** 

**Option A — Retain Dart Mini-Apps (original decision)** 

|**Dimension**|**Assessment**|**Rating**|**Notes**|
|---|---|---|---|
|Process isolation|Dart process<br>boundary|High|Strongest possible sandbox|
|Ofine capability|Native Flutter|High|Full ofine support per mini-<br>app|
|Agency dev cost|Dart + React =<br>two codebases|High|Doubles agency efort|
|Web delivery|Not possible|Blocked|Dart mini-apps cannot run in<br>Next.js|



Rejected. Does not satisfy the cross-platform single-codebase requirement. Web delivery is structurally impossible under this model. 

CONFIDENTIAL — INTERNAL USE ONLY    Page 4 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

**Option B — React Mini-Apps in WebView (mobile) and div Mount (web)** 

|**Dimension**|**Assessment**|**Rating**|**Notes**|
|---|---|---|---|
|Process isolation|WebView<br>boundary on<br>mobile|Medium|Weaker than Dart; mitigated<br>by hardening|
|Ofine capability|Delegated to VC<br>Mini-App|High|ADR-012 concentrates ofine<br>concern|
|Agency dev cost|One React<br>codebase per<br>agency|Low|Single implementation for<br>both channels|
|Web delivery|Same bundle<br>runs in Next.js|Full|No duplication required|



Accepted with WebView hardening requirements defined below. 

**Option C — React Native Shell Replacing Flutter** 

|**Dimension**|**Assessment**|**Rating**|**Notes**|
|---|---|---|---|
|Process isolation|Same Hermes JS<br>context|Medium|Diferent risk profle from<br>WebView|
|Ofine capability|Native|High|Full ofine support|
|Agency dev cost|One React<br>codebase|Low|Single implementation|
|Existing investment|Discards Flutter<br>shell work|High|All diagrams and decisions<br>reopened|



Rejected. Discards existing Flutter investment and reopens settled decisions without sufficient benefit over Option B. The Flutter shell is retained. 

#### **WebView Hardening Requirements (Mobile)** 

These requirements compensate for the weaker sandbox compared to the original Dart model. All are mandatory before production launch. 

|**Requirement**|**Detail**|
|---|---|
|allowFileAccess: false|Mini-apps cannot read the device flesystem|
|javaScriptCanOpenWindowsA<br>utomatically: false|No popup windows from mini-app context|



CONFIDENTIAL — INTERNAL USE ONLY    Page 5 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

|domStorageEnabled: false|localStorage and sessionStorage disabled; all storage<br>routed through Mini-App SDK|
|---|---|
|Content Security Policy|Enforced at WebView level; mini-apps may only fetch<br>from platform-approved domains|
|SDK object frozen|window.__GSA_SDK__ is frozen with Object.freeze() before<br>mini-app mount; prevents monkey-patching|
|One WebView per mini-app|Each mini-app runs in its own WebView instance; no<br>shared JS context between mini-apps on mobile|
|Security audit|WebView hardening confguration must be independently<br>audited before production launch|



#### **Web Isolation Requirements (Next.js)** 

|**Requirement**|**Detail**|
|---|---|
|div mount point|Each mini-app mounts into a dedicated div container; no<br>iframe|
|Shadow DOM|Applied to the mount container for CSS isolation; prevents<br>style leakage between mini-apps|
|Dynamic bundle loading|Mini-app bundle loaded at runtime from platform CDN;<br>not compiled into the Next.js build|
|SDK object frozen|window.__GSA_SDK__ frozen before mount|
|Content Security Policy|HTTP headers restrict mini-app network access to<br>platform-approved origins only|



#### **Trade-off Analysis** 

|**What improves**|**What weakens / costs**|
|---|---|
|Single agency codebase for mobile and web|Mobile isolation drops from Dart process<br>boundary to WebView boundary|
|Agency onboarding cost efectively halved|Platform team must maintain WebView<br>hardening confguration per Flutter release|
|Consistent React-based development<br>experience for agencies|Same-JS-context on web requires disciplined<br>CSP enforcement|
|Web channel enabled without duplicate<br>investment|Mini-apps can probe WebView environment<br>in ways Dart mini-apps structurally could<br>not|
|Ofine concern resolved cleanly by ADR-012|Platform team owns one additional platform|



CONFIDENTIAL — INTERNAL USE ONLY    Page 6 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

mini-app (VC Mini-App) 

#### **Consequences** 

- Agency teams write React. No Dart knowledge is required for mini-app development. 

- Platform team owns WebView configuration and all hardening settings. This is not an agency responsibility. 

- All offline credential capability is explicitly out of scope for agency mini-apps. Delegated to the VC Mini-App (ADR-012). 

- A formal security audit of the WebView hardening configuration is required before production launch. 

- The Flutter shell binary continues to be the only artefact published to app stores. 

CONFIDENTIAL — INTERNAL USE ONLY    Page 7 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

### **ADR-002 (Revised) — SDK Bridge as the Sole Mini-App Interface** 

|**Status**|**Accepted — Supersedes ADR-002 (May 2026)**|
|---|---|
|Date|June 2026|
|Deciders|Platform Architecture Team|
|Supersedes|ADR-002 v1.0 (May 2026) — SDK Bridge with Dart-level sandbox<br>guarantee|



#### **Context** 

The original ADR-002 defined the SDK Bridge as the sole interface between mini-apps and the container shell, with a security guarantee backed by Dart process isolation: mini-apps had no DOM, no window globals, and no ability to reach outside what the SDK exposed. 

Two changes since the original decision require this ADR to be revised: 

- The move to React mini-apps (ADR-001 revised) means mini-apps running in WebViews have access to the DOM and window. The original Dart-level isolation guarantee is no longer achievable. 

- The SDK is now explicitly split into two distinct components — Platform SDK and Mini-App SDK — with separate owners, consumers, and versioning contracts. This split was not contemplated in the original ADR. 

#### **Decision** 

The SDK bridge remains the sole sanctioned interface through which mini-apps communicate with the container shell. The isolation guarantee is restated for the WebView context: 

_Mini-apps must not access platform capabilities — storage, auth tokens, device APIs, navigation, or BFF endpoints — through any channel other than the MiniApp SDK. Direct access attempts are blocked by shell configuration, WebView hardening, and CSP enforcement._ 

The SDK is split into two distinct components: 

CONFIDENTIAL — INTERNAL USE ONLY    Page 8 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

|**Component**|**Defnition**|
|---|---|
|Platform SDK|Shell-side implementation. Owned and consumed by the platform<br>team only. Implements the bridge handlers in Flutter (Dart, via<br>WebView JavaScript channel) and Next.js (TypeScript, via custom<br>events or direct JS calls). Never distributed to agency teams.|
|Mini-App SDK|Mini-app-side interface. Defnes the public API surface that agency<br>mini-apps call. Injected by the shell at runtime as<br>window.__GSA_SDK__. This is the formal contract between the<br>platform and agency developers.|



#### **Mini-App SDK Public API Surface** 

|**Method**|**Shell action**|**Auth required**|
|---|---|---|
|sdk.api.request(endpoin<br>t, payload)|Shell validates endpoint against per-miniApp<br>allowlist, injects auth token, proxies request<br>to Citizen BFF, returns response payload only|Yes — shell<br>injects; mini-<br>app never sees<br>token|
|sdk.storage.get(key)|Shell reads from encrypted SQLite (mobile)<br>or IndexedDB (web). Key is namespaced to<br>miniAppId to prevent cross-app reads.|Shell enforces<br>namespace|
|sdk.storage.set(key,<br>value)|Shell writes to encrypted storage. Same<br>namespacing as reads.|Shell enforces<br>namespace|
|sdk.navigate(intentNam<br>e, payload)|Shell validates intent against Navigation<br>Manifest, checks permittedCallers, routes to<br>target mini-app or rejects with<br>NavigationDeniedError.|Manifest<br>enforced|
|sdk.device.getLocation()|Shell requests GPS from native layer (Flutter)<br>or browser Geolocation API (web). Returns<br>coordinates only.|Shell mediates|
|sdk.device.openCamera(<br>)|Shell opens native camera (Flutter) or<br>MediaDevices API (web). Returns captured<br>media; mini-app never accesses device API<br>directly.|Shell mediates|
|sdk.emit(eventName,<br>data)|Publishes event on internal shell event bus.<br>Other shell components may listen. Mini-<br>apps cannot subscribe to each other directly.|None|
|sdk.on(eventName,<br>handler)|Subscribes to shell-published events (e.g.<br>manifest refresh, session expiry).|None|



CONFIDENTIAL — INTERNAL USE ONLY    Page 9 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

#### **Bridge Protocol** 

Both SDKs communicate over a versioned message envelope. The protocol version is independent of either SDK version, allowing transport to evolve separately from the API surface. 

|**Envelope feld**|**Purpose**|
|---|---|
|gsaProtocolVersion|Semver string. Both sides must agree on major version before<br>processing.|
|requestId|UUID. Links request to async response. Required because<br>multiple SDK calls may be in-fight simultaneously.|
|miniAppId|Identifes the calling mini-app. Injected by the shell; mini-app<br>cannot spoof this value.|
|capability|Dot-notation capability name e.g. api.request, storage.get,<br>device.camera.|
|payload|Capability-specifc request body. Never contains auth tokens or<br>raw credential data.|



#### **Trade-off Analysis** 

|**What improves**|**What weakens / costs**|
|---|---|
|SDK contract is explicit, versioned, and<br>documented for agency developers|Isolation is now policy-enforced (CSP,<br>hardening) rather than structurally<br>guaranteed (Dart process)|
|Two-SDK split cleanly separates platform<br>internals from public agency contract|Platform team must maintain two SDK<br>codebases and keep bridge protocol in sync<br>between them|
|Mini-App SDK versioning is independent of<br>Platform SDK — each can evolve separately|Version compatibility matrix requires active<br>management as the agency ecosystem grows|
|Auth tokens never leave the shell layer<br>under any circumstances|A compromised WebView could in principle<br>attempt to intercept postMessage trafc<br>(mitigated by hardening)|



#### **Consequences** 

- The Mini-App SDK is the only GSA artefact agency developers interact with at runtime. The Platform SDK is internal to the platform team. 

CONFIDENTIAL — INTERNAL USE ONLY    Page 10 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

- Mini-apps declare their required sdkVersion in the Service Registry. The shell injects the declared version, not the latest version, preventing silent breakage. 

- Auth tokens are injected by the shell proxy layer. Mini-apps receive only the API response payload. Tokens are never observable from mini-app code. 

- The bridge protocol version is stored in the Service Registry alongside the SDK version, enabling the shell to validate compatibility before mounting a miniapp. 

CONFIDENTIAL — INTERNAL USE ONLY    Page 11 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

### **ADR-011 (New) — Cross-Platform SDK Architecture and Distribution Model** 

|**Status**|**Accepted**|
|---|---|
|Date|June 2026|
|Deciders|Platform Architecture Team|



#### **Context** 

The decision to support React mini-apps running in both a Flutter shell (mobile) and a Next.js shell (web) requires a formal definition of how the SDK is architected, how it detects and adapts to its host environment, how it is distributed to agency developers, and how version compatibility is managed across the agency ecosystem. 

Three concerns must be resolved: 

- Agency developers need type safety and local development support without access to the production shell. 

- The platform team must be able to push security fixes to the SDK without requiring every agency to rebuild and redeploy their mini-app. 

- The SDK must work correctly in two structurally different host environments — Flutter WebView and Next.js — without modification to the mini-app. 

#### **Decision** 

##### **SDK Components** 

|**Component**|**Description**|
|---|---|
|Platform SDK|Shell-side bridge implementation. Two separate<br>implementations: Flutter (Dart) and Next.js (TypeScript).<br>Registers handlers for every capability the Mini-App SDK can<br>request. Owned entirely by the platform team. Never<br>distributed externally.|
|Mini-App SDK (runtime)|Injected by the shell as window.__GSA_SDK__ before every<br>mini-app mount. Provides the full public API surface. Version<br>controlled by the platform team. Agency mini-apps read it<br>from the global; they do not install it.|
|@gsa/mini-app-sdk-types|TypeScript type defnitions only. No runtime code. Published<br>to the platform npm registry. Agency developers install this as|



CONFIDENTIAL — INTERNAL USE ONLY    Page 12 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

||a dev dependency for IDE autocomplete and compile-time type<br>checking. Contains no logic.|
|---|---|
|Local development stub|A single script tag served from the platform developer portal.<br>Defnes window.__GSA_SDK__ with all methods routing calls to<br>the agency's own local backend. No fabricated data. No<br>platform-maintained fxtures. Removed before bundle<br>submission.|
|Platform Developer Portal|Hosted environment providing a real shell sandbox (web and<br>mobile preview), SDK call inspector, bundle upload, staging<br>BFF with seeded test citizen data, and the mini-app starter<br>template.|



##### **Host Detection** 

The shell injects a host descriptor before mounting the mini-app. The Mini-App SDK reads this at initialisation and routes all capability calls to the appropriate transport without any action required by the mini-app. 

|**Field**|**Values and purpose**|
|---|---|
|type|futter | web — identifes the shell host|
|version|Semver string of the shell release|
|capabilities|Array of capability strings the shell supports in this release e.g.<br>[storage, api, gps, camera]|
|sdkVersion|The Mini-App SDK version being injected, for mini-app self-<br>diagnostic use|



##### **Transport per Host** 

|**Capability**|**Flutter transport**|**Next.js transport**|
|---|---|---|
|sdk.api.request()|postMessage via WebView<br>JavaScript channel<br>Dart<br>→<br>handler<br>BFF<br>→|Direct JS call<br>Next.js shell<br>→<br>handler<br>BFF via server-side<br>→<br>fetch|
|sdk.storage.get/set()|postMessage<br>Dart<br>encrypted<br>→<br>→<br>SQLite|Direct JS call<br>Next.js shell<br>→<br>→<br>IndexedDB (Web Crypto<br>encrypted)|
|sdk.navigate()|postMessage<br>Dart Navigation<br>→<br>Engine<br>manifest check<br>→<br>→<br>WebView swap|Direct JS call<br>Next.js<br>→<br>middleware<br>manifest check<br>→<br>→<br>dynamic bundle load|
|sdk.device.getLocati|postMessage<br>Dart<br>native<br>→<br>→|Direct JS call<br>shell<br>browser<br>→<br>→|



CONFIDENTIAL — INTERNAL USE ONLY    Page 13 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

|on()|GPS|Geolocation API|
|---|---|---|
|sdk.device.openCam|postMessage<br>Dart<br>native<br>→<br>→|Direct JS call<br>shell<br>browser<br>→<br>→|
|era()|camera|MediaDevices API|



##### **SDK Version Management** 

|**Rule**|**Detail**|
|---|---|
|Version declaration|Each mini-app declares its required sdkVersion in the<br>Service Registry at bundle submission time.|
|Shell injection|The shell reads the declared sdkVersion from the Service<br>Registry and injects exactly that version. Not the latest<br>version.|
|Multiple version support|The platform CDN hosts all active SDK versions<br>simultaneously. The shell serves whichever version the<br>mini-app declared.|
|Deprecation window|Old SDK versions are supported for a minimum of 90 days<br>after a new major version is released. Agencies receive<br>advance notice via the developer portal.|
|Security fx propagation|For security-critical patches (semver patch release), the<br>shell may inject the patched version without agency<br>action. Patch releases must be backward-compatible by<br>defnition.|
|Breaking change policy|Major version increments require a migration guide<br>published to the developer portal and a formal<br>deprecation window before the old major version is<br>retired.|



##### **Agency Developer Workflow** 

|**Stage**|**What happens**|
|---|---|
|Onboarding|Platform team creates agency account on developer portal. Agency<br>receives sandbox credentials, seeded test citizen data, and the<br>mini-app starter template (plain React project, no GSA runtime<br>dependencies).|
|Local development|Agency builds React mini-app locally using standard Vite or<br>webpack tooling. Adds the platform stub script tag to their local<br>index.html. SDK calls route to their own local backend. Types from<br>@gsa/mini-app-sdk-types provide IDE support.|
|Portal testing|Agency uploads bundle to developer portal. Bundle mounts inside<br>a real shell sandbox. Agency tests against real SDK injection and<br>staging BFF. SDK call inspector shows every capability request and|



CONFIDENTIAL — INTERNAL USE ONLY    Page 14 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

||response.|
|---|---|
|Mobile preview|Developer portal provides a Flutter shell preview app (internal<br>TestFlight or Play Store track) that loads the agency bundle URL.<br>Agency tests mobile behaviour without running Flutter locally.|
|Bundle submission|Agency submits bundle via portal. Platform team reviews for CSP<br>compliance, bundle size limits, and SDK usage. Platform hosts the<br>approved bundle on the platform CDN. Service Registry is updated<br>with the bundle URL and sdkVersion.|
|Production|Flutter and Next.js shells load the bundle from the platform CDN.<br>Shell injects the declared SDK version. Agency mini-app runs<br>without any GSA npm dependencies in its production bundle.|



#### **Options Considered for SDK Distribution** 

##### **Option A — npm Package (runtime bundled inside mini-app)** 

Agency installs @gsa/mini-app-sdk as a production dependency. SDK ships inside the mini-app bundle. 

- Rejected. Agency controls SDK version at build time. Platform cannot push security fixes without requiring every agency to rebuild. Version fragmentation across agencies is structurally guaranteed over time. 

##### **Option B — Platform CDN Import (URL declared in mini-app source)** 

Mini-app imports the SDK from a platform CDN URL at build time. SDK is fetched at runtime, not bundled. 

- Rejected as primary model. Introduces a network dependency at mini-app mount time. On mobile in low-connectivity environments, a CDN fetch failure prevents the mini-app from loading. Unacceptable for a government platform. 

##### **Option C — Shell Injection with Declared Version (selected)** 

Shell injects the SDK as window.__GSA_SDK__ before mounting. Mini-app declares sdkVersion in the Service Registry. Shell serves exactly the declared version from its own CDN-backed asset store. 

- Accepted. Platform controls the runtime SDK. No network dependency at mount time on mobile (SDK is bundled with the shell or pre-cached). Version compatibility is explicit and managed by the platform. 

CONFIDENTIAL — INTERNAL USE ONLY    Page 15 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

#### **Trade-off Analysis** 

|**What improves**|**What weakens / costs**|
|---|---|
|Platform controls SDK at runtime — security<br>fxes deployable without agency action<br>(patch releases)|Platform must host and maintain all active<br>SDK versions simultaneously|
|Agency production bundles have zero GSA<br>runtime dependencies|Agency developer experience depends on<br>the quality of the portal and stub — more<br>platform investment required|
|Host environment is fully abstracted —<br>mini-app code is identical on mobile and<br>web|Two Platform SDK implementations (Flutter<br>Dart + Next.js TypeScript) must be kept in<br>sync on the bridge protocol|
|Version compatibility is explicit via Service<br>Registry sdkVersion feld|Agencies must re-submit bundles to upgrade<br>to a new major SDK version — cannot be<br>forced automatically|



#### **Consequences** 

- The @gsa/mini-app-sdk-types package is the only GSA artefact published to npm. It contains types only. 

- The developer portal becomes a first-class platform component. Its quality directly determines agency onboarding velocity, which is a stated platform success criterion. 

- The local development stub is maintained by the platform team and must be updated to reflect every SDK API addition or change. 

- The Service Registry schema must be extended to include bundleUrl, sdkVersion, and bridgeProtocolVersion fields per mini-app registration. 

- The platform CDN must enforce immutable caching per SDK version URL. SDK versions are never mutated after release; only new versions are published. 

CONFIDENTIAL — INTERNAL USE ONLY    Page 16 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

### **ADR-012 (New) — Dedicated VC Mini-App as Platform Wallet Interface** 

|**Status**|**Accepted**|
|---|---|
|Date|June 2026|
|Deciders|Platform Architecture Team|



#### **Context** 

The decision to use React mini-apps in WebViews (ADR-001 revised) raised the question of offline credential capability. The original ADR-001 rejection of WebViews cited poor offline capability as a primary concern. With agency mini-apps now running in WebViews, this concern must be resolved. 

Concurrently, the question of how agency mini-apps access the wallet (stored JWTVCs) requires a clear architectural answer. Under the original Dart model, wallet access was mediated entirely by the SDK bridge in the Flutter shell. Under the React WebView model, the same mediation is required but the threat surface is different. 

Two approaches were considered: distributing offline capability across all mini-apps, or concentrating it in one dedicated platform-owned mini-app. 

#### **Decision** 

A dedicated VC Mini-App is introduced as a platform-owned mini-app. It is the sole mini-app with access to wallet read operations and offline credential capability. All other mini-apps are explicitly online-first and access credential data only by invoking the VC Mini-App through the intent system. 

|**Classifcation**|**Detail**|
|---|---|
|Type|Platform mini-app — built and maintained by the platform team,<br>not an agency|
|miniAppId|vc-wallet|
|Ofine support|Full ofine-frst design. Aggressive service worker caching on web.<br>WebView asset caching on mobile.|
|Wallet access|The only mini-app permitted to invoke sdk.wallet.* capabilities<br>directly|



CONFIDENTIAL — INTERNAL USE ONLY    Page 17 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

|Trust level|Platform trust tier — higher than agency mini-apps; subject to<br>platform security audit|
|---|---|



#### **What the VC Mini-App Owns** 

|**Responsibility**|**In scope**|**Notes**|
|---|---|---|
|VC display|Yes|Renders all stored JWT-VCs from the citizen wallet|
|QR code generation|Yes|Generates QR from an assembled Verifable<br>Presentation|
|VP assembly|Yes|Selects VCs and assembles VP based on presentation<br>request|
|Status List caching|Yes|Caches Status List 2021 bitstring for ofine<br>revocation check|
|Ofine sig verifcation|Yes|Verifes JWT-VC signatures using Web Crypto (web)<br>or platform crypto (mobile)|
|Credential expiry UI|Yes|Displays expiry warnings and renewal prompts|
|VC issuance pipeline|No|Issuance is backend-only (Kafka<br>HSM<br>→<br>→<br>vc.issued). Not a mini-app concern.|
|Auth|No|Auth remains the shell responsibility|
|Agency service fows|No|Fine payment, renewal, booking — remain in their<br>respective agency mini-apps|
|Wallet storage<br>primitives|No|Encrypted SQLite (mobile) and IndexedDB (web)<br>are shell responsibilities mediated by the SDK|



#### **Platform Intent Contracts** 

Agency mini-apps invoke the VC Mini-App exclusively through the intent system. They never access the wallet or credential data directly. Two platform intents are defined: 

|**Intent**|**Defnition**|
|---|---|
|VIEW_CREDENTIAL|targetMiniAppId: vc-wallet | targetRoute: /wallet/view |<br>permittedCallers: * | payloadSchema: { credentialType: string } |<br>resultSchema: {}|
|PRESENT_CREDENTIAL|targetMiniAppId: vc-wallet | targetRoute: /wallet/present |<br>permittedCallers: * | payloadSchema: { credentialType: string,<br>requestedBy: string } | resultSchema: { presented: boolean,|



CONFIDENTIAL — INTERNAL USE ONLY    Page 18 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

vpToken: string } 

The permittedCallers wildcard designates these as platform-level intents available to all registered mini-apps. They are defined in the Navigation Manifest alongside agency intents and enforced by the same Navigation Engine. 

#### **Mini-App Trust Tiers** 

|**Tier**|**Examples**|**Characteristics**|
|---|---|---|
|Platform mini-app|VC Mini-App|Built by platform team. Full ofine<br>support. Direct wallet access via SDK.<br>Subject to platform security audit. Higher<br>trust designation in Navigation Manifest.|
|Agency mini-app|License, Emission,<br>Insurance, Revenue|Built by agency teams. Online-frst. No<br>direct wallet access. Credential data<br>accessed only via VC Mini-App intents.<br>Standard trust designation.|



#### **How This Resolves the ADR-001 Offline Concern** 

The original ADR-001 rejected WebViews partly because of poor offline capability. That concern assumed offline capability was needed by all mini-apps. This ADR establishes that: 

- Agency mini-apps are explicitly online-first. They are not required to function without connectivity. 

- The VC Mini-App is platform-owned and can be designed and hardened specifically for offline use, without imposing that complexity on agency teams. 

- The offline problem is solved once, in one place, by the platform team. It is not distributed across 20 or more agency implementations. 

This directly addresses the offline objection in ADR-001 and removes it as a blocker for the WebView-based mini-app model. 

#### **SDK Bridge Constraint for Offline Operation** 

The VC Mini-App's offline capability depends on one critical constraint: the SDK bridge wallet channel must operate without network connectivity on both platforms. 

|**Platform**|**Ofine wallet access mechanism**|
|---|---|



CONFIDENTIAL — INTERNAL USE ONLY    Page 19 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

|Mobile|sdk.wallet.getVC() routes via postMessage to Dart layer, which reads<br>from encrypted SQLite. SQLite is local. The postMessage channel<br>requires no network. Ofine operation is guaranteed.|
|---|---|
|Web|sdk.wallet.getVC() routes via direct JS call to Next.js shell, which<br>reads from IndexedDB. IndexedDB is local. No network required.<br>Ofine operation is guaranteed subject to prior sync having<br>occurred.|



This constraint must be documented in the VC Mini-App integration spec and validated during the platform security audit. 

#### **Trade-off Analysis** 

|**What improves**|**What weakens / costs**|
|---|---|
|Ofine concern solved once by platform<br>team; agency teams are unafected|Platform team takes on ownership of an<br>additional mini-app|
|Wallet access concentrated in one auditable<br>surface|All credential presentation fows depend on<br>the VC Mini-App being available and<br>correctly loaded|
|Agency mini-apps cannot access wallet<br>directly — blast radius of compromise<br>reduced|Intent round-trip adds latency to credential<br>display fows vs direct wallet access|
|Consistent credential UX across all agency<br>mini-apps via shared VC Mini-App|Platform team must keep VC Mini-App<br>updated as credential formats and schemas<br>evolve|



#### **Consequences** 

- The Navigation Manifest must include a platform-tier designation for the VC Mini-App, distinct from agency mini-app entries. 

- The Service Registry must include the VC Mini-App as a registered mini-app with bundleUrl and sdkVersion, managed by the platform team. 

- The sdk.wallet.* capability group in the Mini-App SDK is restricted to the vcwallet miniAppId only. Calls from any other miniAppId return PERMISSION_DENIED without reaching the shell wallet layer. 

- The VC Mini-App is the first mini-app built by the platform team and serves as the reference implementation for the agency developer portal starter template. 

- Offline behaviour, VC sync architecture, and Status List caching strategy are deferred to a subsequent ADR focused specifically on the VC Mini-App design. 

CONFIDENTIAL — INTERNAL USE ONLY    Page 20 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

CONFIDENTIAL — INTERNAL USE ONLY    Page 21 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

### **Decision Summary Matrix** 

All decisions across both the original ADR document (v1.0) and this revised document (v2.0). 

|**ADR**|**Decision**|**Status**|
|---|---|---|
|ADR-001<br>(Rev)|Flutter shell (mobile) + Next.js shell (web) hosting<br>React mini-apps. One mini-app codebase per agency.|Accepted June 2026|
|ADR-002<br>(Rev)|Two-SDK model. Platform SDK (internal) + Mini-App<br>SDK (public). SDK bridge remains sole mini-app<br>interface.|Accepted June 2026|
|ADR-003|Ofine-frst design with encrypted SQLite wallet and<br>Status List 2021 caching.|Accepted May 2026<br>— unchanged|
|ADR-004|Agency plugin microservice model. Each agency owns<br>an independently deployed plugin.|Accepted May 2026<br>— unchanged|
|ADR-005|API Gateway scoped to external boundary only. BFF<br>resolves plugin URLs via Service Registry.|Accepted May 2026<br>— unchanged|
|ADR-006|W3C VC 2.0 JWT-VC format with HSM signing via<br>asynchronous Kafka pipeline.|Accepted May 2026<br>— unchanged|
|ADR-007|Service Registry: PostgreSQL source of truth, Redis<br>cache-aside, Kafka cache invalidation.|Accepted May 2026<br>— unchanged|
|ADR-008|Kafka selected over RabbitMQ as platform message<br>broker.|Accepted May 2026<br>— unchanged|
|ADR-009|Multi-tenant back ofce: shared database with row-<br>level security.|Accepted May 2026<br>— unchanged|
|ADR-010|Three dedicated BFFs: Citizen BFF, Ofcer BFF, Admin<br>BFF.|Accepted May 2026<br>— unchanged|
|ADR-011<br>(New)|Cross-platform SDK architecture: shell injection,<br>types-only npm package, portal-based dev<br>environment.|Accepted June 2026|
|ADR-012<br>(New)|Dedicated VC Mini-App as platform wallet interface.<br>Agency mini-apps are online-frst.|Accepted June 2026|



### **Open Decisions** 

The following decisions are deferred and require a subsequent ADR session: 

CONFIDENTIAL — INTERNAL USE ONLY    Page 22 of 23 

Government Super App (GSA) — Revised Architectural Decision Records 

|**Topic**|**Deferred because**|
|---|---|
|VC Mini-App ofine<br>architecture|Depends on ADR-012 being settled frst. Covers Status List<br>caching strategy, sync frequency, and ofine VP verifcation<br>fow.|
|Citizen BFF scaling model|Deferred pending load projections. Current model is active<br>orchestrator; scaling path is materialized views fed by<br>Kafka.|
|Per-agency Kafka topic<br>migration|Current single vc.issuance topic is acceptable below 20–30<br>agencies. Migration path to per-agency topics is documented<br>but not yet formally decided.|
|Back ofce mini-app model|Whether the back ofce (Next.js) adopts the same mini-app<br>shell model or remains a standard Next.js app. Pending back<br>ofce requirements.|



CONFIDENTIAL — INTERNAL USE ONLY    Page 23 of 23 

