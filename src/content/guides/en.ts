import type { GuideContent } from './types';
import { DESKTOP_RELEASE_VERSION, SCREENSHOT_SOURCE_VERSION } from '@/lib/desktop-release';
const content: GuideContent = {
  title: 'AioLM guides', description: 'New here? Install the app first, then follow the pictures and buttons to start a conversation on your own computer.',
  navigation: 'Guides', onPage: 'On this page', related: 'Next steps', download: 'See all download files',
  screenshotNotice: `Instructions follow the published v${DESKTOP_RELEASE_VERSION} release. Screenshots were captured from the native macOS app built from v${SCREENSHOT_SOURCE_VERSION} source, so some v${DESKTOP_RELEASE_VERSION} screens and labels differ. These images do not verify other platforms, every engine or update installation.`,
  enlarge: 'View larger', close: 'Close',
  panHint: 'Swipe sideways to see the rest of the image.',
  guides: {
    install: { title: 'Install the app', description: 'Use the command for your computer first, or choose installer files below. Follow only your Windows, Mac or Linux section.', sections: [
      { id: 'commands', title: 'Install with a command', body: ['Choose your operating system below, copy the command and run it in PowerShell on Windows or Terminal on Mac/Linux. If you prefer installer files, use the platform sections below. Linux needs the downloaded DEB first.'] },
      { id: 'windows', title: 'Install on Windows', downloads: 'windows', steps: ['For manual installation, choose x64-setup.exe. This is the usual installer file for a personal PC.', 'Double-click the downloaded file and follow the installer.', 'When it finishes, open AioLM from the Start menu.'], note: 'The Windows installer has no publisher signature, so a security warning may appear. Before installing, check the official AioLM release and its file checksum.', more: [{ title: 'When would I use MSI?', body: ['Use MSI for an organization’s deployment tools or when Windows Installer is required. For a personal installation, use the EXE above. Packages target Windows x64.'] }] },
      { id: 'macos', title: 'Install on Mac', downloads: 'macos', steps: ['Open Apple menu → About This Mac. If Chip says Apple M1, M2 or similar, choose aarch64.dmg. If Processor says Intel, choose x64.dmg.', 'Open the DMG and drag AioLM to Applications.', 'Open AioLM. If macOS blocks it, verify the official release and checksum. To continue, open System Settings → Privacy & Security → Open Anyway.'], note: 'Requires macOS 13.3+. The app is ad-hoc signed and not notarized by Apple, so macOS may show a security warning. Check the official AioLM release and file checksum before installing.' },
      { id: 'linux', title: 'Install on Linux', downloads: 'linux', body: ['For Ubuntu 24.04+ on x86_64 PCs. Choose the DEB if you are starting out.'], steps: ['Double-click the downloaded DEB to open your package installer, or use the Linux command above in the download folder.', 'After installation, open AioLM from the application menu.'], more: [{ title: 'The DEB does not open an installer', body: ['Keep only the DEB version you want in the download folder. Open a terminal there and use the Linux command in the installation tabs above.'] }, { title: 'Use AppImage without installing a package', body: ['Keep the AppImage in a permanent folder and run the commands below. If you move it, register its launcher again. AppImage does not bundle zenity, which is required for MCP tool approval dialogs; without a working approval dialog, the tool call fails.', 'For an application-menu launcher, download and verify register-linux-desktop.py from the same release, then run python3 register-linux-desktop.py --appimage <file>. Use --remove before switching to DEB. Python 3 is required.'], code: 'sudo apt install libgomp1 libfuse2t64 zenity\nchmod +x ./AioLM_*.AppImage\n./AioLM_*.AppImage' }] },
      { id: 'first-open', title: 'When the app opens', body: ['If you see the language screen below, you are ready. Choose your language and Continue. Returning users with existing settings go straight to the workspace.'], image: 'language', caption: "Choose your language, then continue with “Start your first conversation”." },
      { id: 'verify', title: 'Check the downloaded file', body: ['Use the official download files. For an extra check that the file arrived intact, expand the instructions below.'], more: [{ title: 'Check the file’s checksum', body: ['Download checksums.txt from the same release as your installer. A checksum is a file’s identifying value. Compare the full command result with the SHA-256 entry for that exact filename. Stop if they differ. A checksum does not replace a publisher signature.', 'On Windows, replace the filename below with the one you downloaded. On Mac, use shasum -a 256 followed by the file path; on Linux use sha256sum.'], code: `Get-FileHash -Algorithm SHA256 .\\AioLM_${DESKTOP_RELEASE_VERSION}_x64-setup.exe` }] },
      {"id": "updates", "title": "Application updates and background use", "body": ["At each desktop startup, AioLM checks public GitHub metadata once. A newer stable release produces a dismissible notification; View update opens Settings → General → Application updates. Check for updates is also available there. A failed check does not interrupt use.", "Save your work, choose Download and install and confirm. The download is checked against the release SHA-256 before managed tasks stop and the installer opens and AioLM exits. Reopen AioLM after completing installation. Automatic checking never installs an update. Finish the Windows installer or Linux DEB installation yourself; on Mac replace the app with the downloaded DMG copy. AppImage/manual installations use the release downloads. After a Mac update, macOS may request Keychain access again, including for benchmark sharing credentials.", "Closing the window hides AioLM in the system tray by default; it is not an app exit. Settings → Server lets you configure starting AioLM when you log in. Quit the app normally when you need its managed processes to stop.", "Replacing the app keeps conversations and settings. Back up ~/.aiolm (Windows: %USERPROFILE%\\.aiolm), or AIOLM_HOME, and model files. NSIS offers explicit data removal; MSI/DEB removal and moving the Mac app to Trash leave data. Forced termination can leave model processes running; quit normally."], "image": "updates", "caption": "Application updates in Settings. Checking for a release does not install it."},
    ] },
    'getting-started': { title: 'Start your first conversation', description: "A model is the AI data; an engine runs it. Choose an engine that fits your device and model format, then follow these steps.", sections: [
      { id: 'language', title: '1. Choose your language', body: ['Select your language and Continue. This is the first screen on a fresh installation. If you have already finished setup, skip to step 4.'], image: 'language', caption: 'Buttons and explanations switch to the language you choose.' },
      { id: 'theme', title: '2. Choose the screen colors', body: ['Pick Light, Dark or System, then Continue. You can change this later in Settings.'], image: 'theme', caption: 'Selecting a theme previews it immediately.' },
      { id: 'folder', title: '3. Choose where models are saved', body: ['Keep the default folder, or use Choose folder to pick another location. Select Start using AioLM to enter the workspace. You do not need a model file yet.'], image: 'folder', caption: 'Do not copy this example path. Choose a folder on your own computer.' },
      {"id":"engine","title":"4. Prepare the engine","body":["Open Inference engines and compare OS, device and model-format requirements before choosing an engine. Install the selected runtime if needed; for a separately installed engine, follow the external connection guide. llama.cpp PR source builds compile third-party code as your user: review the displayed provenance and trust the code before confirming. Source builds need CMake, a C/C++ toolchain and the selected backend SDK; a prebuilt PR artifact does not require that build toolchain.","llama.cpp release and PR installation and portable archive import/export run one at a time. Other install and removal actions wait until that operation finishes or is cancelled; the operation keeps its own progress and Cancel control."],"image":"llama-install","caption":"The native macOS llama.cpp Metal runtime screen shows installed builds and available updates. Check your device requirements; this is not a preferred-engine recommendation or verification of other engines.","note":"An inference engine is the engine type; a runtime is an installed execution environment. Check device compatibility and the external-engine connection guide first.","links":[{"href":"/en/guides/adapters#find","label":"External-engine connection steps"}]},
      {"id": "download", "title": "5. Search and download a small model", "body": ["Discover starts with All formats and Trending; you can also sort by downloads, likes or recent updates. Search is independent of your execution engine. Open a repository and inspect its model card, license, memory needs and available artifacts.", "Choose an HF/MLX Safetensors weight file to download that model with its required config, tokenizer and split parts, without installing other weight variants. A single Safetensors weight file is not a self-contained model. Whole data snapshots remain available for repositories with root weights. GGUF standard split sets also download together. Model selectors omit the GGUF shard counter from the display name, but retain original filenames and paths and require every shard. Other formats stay searchable without an in-app download; remote Python/model code is not downloaded for execution. Download availability is not proof of engine compatibility.", "Downloads show speed and time remaining. Pause keeps received data; paused, failed and app-interrupted transfers appear under Discover → Paused downloads. Resume keeps the original repository revision and verifies the complete file against its published digest; files without a digest restart rather than appending unverified bytes. Discard removes staged partials but keeps completed files. You can install a runtime while a model downloads.", "Browsing/downloading does not select an engine or change execution settings. After downloading, Configure and run opens settings for the current engine/runtime; check compatibility there. Closing model settings leaves downloaded files intact."], "image": "model-files", "caption": "Inspect the repository and available model files before choosing a download."},
      {"id": "library", "title": "6. Use the Library", "body": ["Library shows loaded sessions, collapsed saved sessions, the model folder, search/filter controls and local models, in that order; its engine filter is independent of execution selection. Use Browse in the always-visible folder row to change the library location. Click a model name or Model settings to preview its settings; path, copy, delete and update controls sit in a separate file-action row. Projector-only files stay in the library but cannot launch as primary models.", "Loaded sessions show their state, actual model and engine, and start/stop/cancel actions. Expand details for port, process ID, active requests and runtime log; failures show the error and runtime log in the row, error banner and Chat. Starting a saved session can be cancelled from Chat or the Library and is reported as Cancelled, not a failed request. Saved named sessions remain available while stopped; unloading preserves per-model settings.", "After a library scan, AioLM checks downloaded models for upstream updates; Check for updates refreshes the result. Update appears only when a newer file set is confirmed and shows how much will be downloaded and reused. Stop all model sessions first. Unchanged files are reused and the model path and settings are kept, but a changed single-file weight, such as one GGUF file, is downloaded in full. Updating does not load the model."], "image": "model-library", "caption": "The Library with loaded sessions and local models. Open a model to configure it before running."},
      {"id": "model", "title": "7. Configure, save and start", "body": ["Model settings follow Choose runtime → Choose profile → Adjust options: select the inference engine and installed runtime, then that engine’s profile, then the local model and supported context/memory, GPU, sampling, reasoning, projector, draft model, LoRA or advanced options. Clear selection in the runtime selector removes only that selection; it does not uninstall the runtime or clear option values. Downloading or previewing a model does not start it or stop a running server. Incomplete split models are rejected before launch.", "Each engine has its own shared profiles and an editable Default; profiles are not tied to one model. Save profile saves edits without reloading. Save profile & start/restart (or switch & start) saves before the requested operation. Request-only changes can apply to subsequent requests; server changes require reload. Finish or cancel active responses first. Close the settings dialog during loading to keep working: loading continues in the background. Use the task’s explicit Cancel action to stop it; closing is not cancellation. Check the task or global error if startup fails.", "Check VRAM, Runtime RAM, RAM Offload and SSD Offload separately. Total RAM is Runtime RAM plus RAM Offload; a combined VRAM + RAM total is omitted for shared-memory GPUs to avoid counting the same memory twice. Capacity uses physical pools, not currently free memory: system RAM is what the OS can use, integrated GPUs add only separately firmware-reserved memory, and other apps still reduce your practical budget. Reclaimable OS file cache is not permanent runtime RAM. VRAM shortfall is shown as required offload, not a promise that the runtime supports it; the preview never changes launch settings. SSD Offload describes explicit lazy placement or capacity overflow, not stored file size or ordinary memory mapping. Look for explicit overflow notes rather than treating all offload as a warning.", "Estimates apply only to supported llama.cpp configurations, including supported Qwen hybrid architectures; unsupported architectures, row/tensor splits or unmodeled allocation options show Unavailable, not zero. Stored file size in Estimate details includes all GGUF shards and auxiliary files without duplicate paths. Loading/warmup allows up to ten minutes; Request timeout does not change that deadline.", "The dialog grows with the app window. Complete option groups flow through one, two, three or four columns according to editor width, keeping each flag name, readable description and input together. Meaningful defaults, units, request-time distinctions and safety warnings remain visible without routine provenance or unknown-type filler. Narrow and short windows retain scrolling and a usable footer."], "image": "model-settings", "caption": "Historical native settings example: review the current runtime, model and grouped options before starting; v0.4.1 uses more of the available window."},
      { id: 'byte-units', title: 'Read file sizes and memory units', body: ['File sizes, memory and download amounts use binary units: B, KiB, MiB, GiB and TiB, with each step equal to 1,024 of the previous unit. Transfer rates use the same units per second. Compare these with matching units in system tools, not decimal KB/MB/GB labels.'] },
      {"id": "chat", "title": "8. Chat with a loaded session", "body": ["Choose Chat, pick the answering session in the chat header’s session selector, then send a short text question. The topbar sets the default execution target; choosing a session for a conversation does not change it. Internal chat needs no API server. Images, audio, video and tools require both model and runtime support; registering an engine alone does not enable them.", "Conversation settings hold document retrieval and optional local preprocessing: transcribe audio with a running speech session (non-WAV inputs need local ffmpeg), or extract video frames for a vision model using local ffmpeg. Frames omit the video audio track. Retrieval can use a compatible embedding session or explicit keyword search; missing capabilities are not silently supplied by a different engine.", "Selected MCP tools show Not loaded until discovered and Unavailable when discovery no longer finds them; only resolved tools are sent, and each call still needs approval. If conversation changes cannot be saved, Chat keeps them in the current session and offers Retry saving; check storage space and folder permissions.", "Maximized windows give messages and the composer more room, with status beside the conversation toolbar when space permits. Settings use two columns when wide; Projects, Discover, API/MCP and benchmarks expand their main content with bounded flexible sidebars instead of leaving large empty areas. Smaller windows keep their responsive layouts."], "image": "chat", "caption": "A real local model conversation in Chat. This text response does not verify other modalities."},
      {"id": "api", "title": "API server and model lifecycle", "body": ["Under Integrations → API server, start the external listener independently of models. Load a model from the library or session. Choose OpenAI or Anthropic examples and copy the base URL, API key and model ID shown there; both protocols share one loopback listener (initially 127.0.0.1:8080), not a separate 8081 gateway.", "The listener may run without models, but inference then returns HTTP 503; requests do not load models. Stopping it leaves internal chat/models running. Unloading a model leaves the listener/key intact. Active responses must finish or be cancelled before model replacement/unload; idle unloading considers chat and API traffic.", "Edit the global port on the API page: saving while running restarts only the listener; while stopped it applies on next start. The key lasts for the desktop app lifetime, including listener restarts/model reloads, and changes at the next app launch. Model processes use private ports/credentials. Auto-start loads a model, not the API. A real app exit stops both. On Mac, launching from Finder or the Dock does not read shell startup files. For MCP npx or tools installed through nvm/Volta/asdf, configure absolute tool paths; an /usr/bin/env node script also needs node on the app’s PATH. Official system/Homebrew paths are available, but shell-only paths are not."]},
      {"id": "personalization", "title": "Personalization and skills", "body": ["In Settings → Personalization, Instruction files to apply selects shared ~/.agents/AGENTS.md, AioLM ~/.aiolm/AGENTS.md (or AIOLM_HOME), both or neither; both start enabled. Choices save automatically and apply to the next new turn, and a disabled file is not read. When both apply, the shared file comes first and the AioLM file wins conflicts; conversation/project prompts remain more specific. Retry/tool follow-ups retain the original turn guidance. File to edit separately chooses the editor’s file: Save writes only that file, Reload asks before discarding edits and external edits are protected from overwrite. Preference backup/reset covers the application choices, not the files themselves.", "Instruction-file choices do not control skills. Put each skill in its own directory under ~/.agents/skills/ or ~/.aiolm/skills/, with SKILL.md frontmatter name and description. AioLM-specific duplicate names win. Each instruction or skill file is limited to 64 KiB; the effective catalog is limited to 128 skills. Catalog descriptions longer than 1,024 characters are shortened without removing the skill or its full readable entry point. Skipped entries are reported. Refresh after external changes; select a skill in the composer or invoke $skill-name. Explicit skill invocation works with every engine. Automatic skill discovery for the model uses the read-only aiolm_read_skill tool only when the engine declares tool-call support; otherwise the catalog and tool are omitted so plain chat remains usable. Skills add instructions, not unrestricted shell/file access or automatic script execution; MCP approvals remain. Instruction/skill text is sent to the chosen chat endpoint, not stored in the conversation system prompt or preference export."]},
      {"id":"benchmarks","title":"Benchmarks, history and optional sharing","body":["AioLM is a GUI adapter, not an inference engine. New benchmarks use the openai-chat-serving@2 fixed-output API benchmark for history, export, publishing and management: every request must produce exactly the selected number of output tokens (1k–200k, where 1k = 1,024; default 1k). The engine must declare a fixed-output control (native llama.cpp ignore_eos, supported non-Metal vLLM min_tokens, or a control a custom runtime declares) and report completion tokens; otherwise the run is blocked or fails instead of falling back to an output cap. vllm-metal and MLX have no such control. Stop loaded sessions before starting. Defaults are 4,096/16,384 UTF-8 input bytes, 1k output tokens, concurrency 1/2/4 and one repetition. Input bytes are not input tokens. Warmup is optional (on by default) and runs the same fixed workload; usage is always requested. The selected launch profile is preserved, including context, concurrency capacity, cache and thinking settings; the context is not enlarged, so it must fit the input plus the output. Client concurrency is separate. Cache stays as configured, not guaranteed cold.","Timing and text/reasoning output bytes are observed by the client. Fixed-output speed divides the engine-reported completion tokens, which must equal the target for every request, by the batch duration; an early stop, overrun or missing count fails that batch while earlier completed batches stay. Cached-token counts are engine-reported and may be unknown. First output is the first observed text or reasoning, not a token timestamp. Compare only the same method, input hashes/bytes, concurrency, output tokens and conditions. Earlier openai-chat-serving@1 results only capped output and stay in their own historical scope; legacy token/cold-method results also remain separate. Neither is the same measurement. Results do not prove answer quality or an independently verified ranking.","History retains completed trials from interrupted runs and discards cancelled in-flight trials. Validation errors, an unsupported target or cancellation before measurement starts create no failed history entry. History and copy stay in the result toolbar; Export and manage holds Excel/CSV export, profile creation and deletion. Deleting local history never deletes a publication. Create profile from recorded settings requires choosing a destination engine/runtime and confirming the preview. Only compatible recorded launch settings are imported; request settings, model files and installations are not copied. Missing or unsupported settings are reported, not reconstructed from the current profile. Reimporting preserves existing user edits.","Review and explicitly publish a result; browser verification may be requested. Local paths, prompts, credentials and machine identifiers are excluded. Manage descriptions and deletion through Shared results → Manage on website. Owner keys stay in the OS credential store; keep private recovery codes/backups, because a lost key without a backup cannot be recovered."]},
      {"id": "cli", "title": "CLI and portable runtimes", "body": ["Installers bundle aiolm-cli beside the desktop app: on Windows, aiolm-cli.exe is beside aiolm.exe; on Mac, use /Applications/AioLM.app/Contents/MacOS/aiolm-cli (or under ~/Applications). The CLI uses the configured managed runtime: runtime list, runtime select <backend> <build>, then server start/status/logs/stop. Selection validates both IDs without damaging existing settings on failure. Headless server start deliberately binds loopback without API-key authentication: use a trusted computer and never expose/forward that port. This is distinct from the desktop API server.", "runtime probe checks native and Python runtime readiness; an unavailable optional llama-bench helper does not fail native preflight and is irrelevant to Python engines. Python runtime export/import bundles pinned dependency wheels and hashes, not models; import needs compatible OS/architecture/ABI and base Python, installs into a new isolated environment and probes it. Stop the headless server first. config set provider_options replaces the entire engine option map, so preserve other engines when editing. Each config set validates the resulting configuration before saving; when both batch sizes are explicit, ubatch_size must not exceed batch_size, so lower ubatch_size first when reducing both."]},
    ] },
    compatibility: { title: 'Choose an engine for your computer', description: "Compare your OS, device, memory and model format before choosing an engine. Check installation requirements and actual verification status together.", sections: [
      { id: 'engines', title: 'Open the engine list', body: ['Select Inference engines on the left. Avoid an engine marked Unavailable on this device.'], image: 'engines', caption: 'The inference-engine screen. Check the installation and device-support status before choosing an item.' },
      {"id":"choose","title":"Which engine should I choose?","table":{"headers":["Engine","Choose it when…"],"rows":[["llama.cpp","Using GGUF with a supported Windows, Mac or Linux build"],["vLLM","You have a supported Linux accelerator setup"],["vLLM · vllm-metal","Using vLLM on an Apple silicon Mac with macOS 15+"],["MLX","Using MLX models on an Apple silicon Mac"],["External inference engine","Prepare a separately installed engine, then check its device, model and local connection requirements."]]},"note":"Intel Macs cannot use MLX or vllm-metal. Check the installation screen’s requirements first."},
      {"id": "models", "title": "Model formats and runtime requirements", "body": ["llama.cpp uses GGUF. vLLM/MLX generally need complete config/tokenizer/processor and safetensors data; supported vLLM GGUF may additionally need adjacent config/tokenizer assets. The optional companion download uses the same immutable revision and does not certify compatibility. Metal GGUF support is narrow: dense qwen2/qwen3/llama, one unsharded file, matching config/tokenizer and supported tensor types; not general GGUF support.", "Managed Linux vLLM installs CUDA dependencies; ROCm requires a separately prepared compatible environment/driver. AioLM does not install system GPU drivers. vllm-metal needs Apple silicon, macOS 15+ and native arm64 Python 3.12; Intel/Rosetta and native Windows/WSL/remote execution are not supported local runtime targets. MLX needs Apple silicon and compatible Python. Portable bundles do not make unsupported hardware compatible.", "Embedding models use embedding sessions; supported Whisper/Qwen3-ASR models use speech sessions, not ordinary text chat. Whisper supports transcription/translation, Qwen3-ASR transcription only; non-WAV inputs require local ffmpeg. Check runtime task support and dependencies, not only a model filename."], "image": "discover", "caption": "Discover searches model repositories independently of the selected execution engine."},
      { id: 'limits', title: 'What still needs checking', body: ['Images, audio, video and tools need support from both the engine and model. Registering an engine does not enable every feature.'], more: [{ title: `v${DESKTOP_RELEASE_VERSION} verification limits and known issues`, body: ['New fixed-output benchmarks run only on engines that declare an output-length control: native llama.cpp and supported non-Metal vLLM. vllm-metal, MLX and automatic external connections cannot run them; earlier results remain viewable.', 'The SmolVLM image/video content-quality failure (F09) reported in v0.3.2 has not been confirmed fixed.', 'Passing a package build does not verify inference on every device or complete Linux acceptance. The current app and public CLI do not offer numerical comparison against a CPU reference. Portable bundles retain their separate engine-specific support limits.'] }] },
    ] },
    adapters: {
      "title": "Connect an external inference engine",
      "description": "Find automatically → Choose a model → Connect, available in v0.3.3 and later. Expand the advanced guide below only when you need to configure the launch method manually.",
      "sections": [
        {
          "id": "prepare",
          "title": "Before you connect",
          "body": [
            "Automatic connection works with OpenAI-compatible v1 servers on this computer. The same connection rules apply regardless of the engine’s implementation language; other protocols are not automatically translated.",
            "The three-step flow does not ask you to create connection files or enter engine IDs. It saves only a connection verified with the selected model."
          ]
        },
        {
          "id": "find",
          "title": "1. Find automatically",
          "body": [
            "Open Inference engines → Add inference engine → Find automatically. Discovered items are candidates, not verified connections. Browsing the engine inventory does not change your execution engine.",
            "If your engine is missing, select Choose installation folder and choose the folder where it is installed. You do not need to pick an executable or configuration file. Discovery recognizes executable headers rather than filenames and excludes DLLs, shared libraries and other non-launchable support artifacts; it does not favor an engine name. On Windows, only PE programs can be launched.",
            "Discovery and registration are locked while model sessions are running, starting or stopping, or while another runtime operation is in progress. The flow names the affected sessions and offers Open Library to stop or cancel them. If a step fails, the progress indicator shows whether discovery, inspection or connection verification failed; a failed rediscovery keeps the already inspected candidate and model choice."
          ],
          "note": "Distinguish discovered candidates by source, entry-point path and listener address. Select one and choose Check selected item before choosing a model. A sole running server may be checked automatically, but a sole installation-folder item is only preselected: explicitly check it because checking runs the program. Selecting among several items does not run them. Retry Check selected item after a failed/cancelled check without rediscovery. Choose only installations you trust.",
          "image": "auto-find",
          "caption": "The automatic-discovery screen. Select a discovered item, or choose the installation folder if none is found."
        },
        {
          "id": "launch-options",
          "title": "Review launch commands and options",
          "body": [
            "If the engine documents serving subcommands, inspection reads their --help output. When several can serve a model, choose a Launch command and use Check selected command before choosing the model. Unknown or ambiguous syntax still needs your explicit confirmation or known manual configuration; AioLM does not silently invent arguments.",
            "Automatic engine labels resolve at app startup and show the documented launch command or attached server address instead of internal connection IDs or unknown binary-version/acceleration filler.",
            "For AioLM-managed installations, model settings group the selected command’s help-derived options with prominent flag names, descriptions and inputs. Use these controls or Import command for documented options. Additional launch arguments accepts separate literal tokens, including paths with spaces, without evaluating shell syntax. Duplicate flags, documented options and app-managed model, host, port and authentication bindings are rejected rather than emitted twice. An attached running server cannot be reconfigured with these launch arguments.",
            "Previously verified, unchanged models start without an extra temporary load/unload cycle. The actual serving process must still pass model identity, chat and streaming checks before readiness, including after launch options change. An explicit model compatibility probe remains separate and may load the model; changed engine/model files require fresh evidence."
          ]
        },
        {
          "id": "choose-model",
          "title": "2. Choose a model",
          "body": [
            "Under Model to use, select Choose a model and pick the model you want. For an already running server, choose from the models it reports.",
            "If no model is available, prepare a model on the running server or add a model to AioLM, then check again."
          ],
          "image": "auto-model",
          "caption": "The model-selection screen. Choose a model offered by the selected running server."
        },
        {
          "id": "connect",
          "title": "3. Connect",
          "body": [
            "Select Connect. AioLM checks an actual text response and streaming with the selected model. Connection details are saved in the app only after the checks pass; you do not need to create a settings file. When verified, select this engine and model in an execution profile to run it.",
            "Successful registration leaves existing model settings and profiles unchanged. Select the new engine/model explicitly in settings to use it. Attached running servers use an AioLM-owned local proxy; stopping the connection stops that proxy and its requests, not the original server/container. Changed external executable/script/connection files require registration again."
          ],
          "note": "A text connection check does not verify image, audio, video, tool support or answer quality. Automatic connections also do not declare the output-length control that new fixed-output benchmarks require.",
          "image": "auto-connect",
          "caption": "The connection-result screen. A completed connection is saved only after the selected model passes response and streaming checks."
        },
        {
          "id": "unconfirmed",
          "title": "If the connection cannot be verified",
          "body": [
            "A different protocol, ambiguous launch command or model identity, or a required authentication key is not marked as automatically connected. Follow the displayed reason, start the engine’s local server or use the advanced method with known settings.",
            "The flow does not install an engine or promise that every engine, device and model works. Items that have not passed the actual checks remain unverified."
          ],
          "links": [
            {
              "href": "/en/guides/adapters#files",
              "label": "Advanced manual registration files"
            }
          ],
          "more": [
            {
              "title": "What about containers?",
              "body": [
                "A container server that is already running can be connected when it provides the same local OpenAI-compatible v1 protocol.",
                "Automatically creating and managing a container or its daemon is not implemented. Finding a container does not enable that management."
              ]
            }
          ]
        },
        {
          "id": "files",
          "title": "Advanced: which files belong to manual registration?",
          "table": {
            "headers": [
              "What you have",
              "File and location"
            ],
            "rows": [
              [
                "AioLM setup package",
                "The provider prepares this input form, for example *.setup.json. Unpack the entire folder, import the setup and keep its companion programs together."
              ],
              [
                "Completed registration JSON",
                "Only use a provider/developer-prepared file in Advanced: import registration file (manifest). *.engine.json is an example filename. You do not need this file for manual registration."
              ],
              [
                "Server executable",
                "In manual registration, select the actual server, for example engine-server.exe or engine-server. Do not select an installer or app shortcut."
              ],
              [
                "Python script or module",
                "Select python.exe (Windows) or bin/python (Mac/Linux) from the environment where you installed the engine. Add the script or module as arguments below."
              ],
              [
                "Model or ordinary configuration",
                "Select .gguf/.safetensors models after registration. Select deployment.json or another engine configuration only when the adapter asks for it. These are different from both AioLM setup and registration JSON."
              ]
            ]
          },
          "note": "You do not need to create *.engine.json for manual registration. AioLM builds the registration from the completed form and saves it internally after Register succeeds; it does not export a separate .engine.json. Selecting an executable alone generates neither input JSON. Changing a JSON filename does not change its contents.",
          "body": [
            "This table is for advanced manual registration. The three-step automatic flow does not require these files."
          ]
        },
        {
          "id": "advanced",
          "title": "Advanced: manual registration",
          "body": [
            "Expand these instructions when you need to configure a known launch method manually. The historical native screenshots illustrate the advanced registration flow; current labels and layout can differ."
          ],
          "more": [
            {
              "title": "Open manual registration",
              "body": [
                "Stop running models, then select Inference engines → Add inference engine. Below automatic connection, expand Advanced: configure the launch method manually."
              ],
              "image": "adapter-add",
              "caption": "Open the advanced registration form when you need to enter the launch method yourself."
            },
            {
              "title": "Import a setup file you already received",
              "steps": [
                "Select Import AioLM connection setup (.json) and choose the AioLM *.setup.json from the unpacked folder.",
                "Fill in the requested executable, folders and files as the provider instructs. Review the command and select Check installation and continue, then check its help."
              ],
              "code": "Unpacked adapter folder/\n  engine.setup.json  ← select when importing\n  prepare.py        ← keep together\n  probe.py          ← keep together",
              "body": [
                "Ask the provider for an AioLM setup v1 JSON, companion setup/probe programs, supported OS, required runtime and model formats and the exact executable to select. If there is no adapter, a developer must implement the common connection contract."
              ]
            },
            {
              "title": "Set the launch method manually",
              "body": [
                "Under Executable or interpreter, select Browse and choose the program listed in the table above. Use Add file argument for a Python script; for a module, use Add argument to enter -m and the actual module name in separate fields.",
                "Choose a display name, an engine ID in custom.* format, such as custom.my-engine and a runtime ID such as local-1, then select Next. Ask the provider first if you do not know the model/port options or probe command.",
                "Select direct HTTP if the engine provides OpenAI-compatible HTTP/SSE. Otherwise select a separate bridge and enter its program, arguments and engine JSON argv environment variable as its provider instructs. Ordinary console input/output does not become an HTTP server automatically.",
                "If the provider’s command is “python -m vendor_engine.serve”, choose that Python and enter two separate arguments. Replace vendor_engine.serve with the real installed module."
              ],
              "image": "adapter-setup",
              "caption": "The manual-registration screen. Check the installed program and its arguments; model responses are verified separately.",
              "code": "Executable: installed environment’s python.exe or bin/python\nArgument 1: -m\nArgument 2: vendor_engine.serve"
            },
            {
              "title": "Read the program’s help",
              "body": [
                "Select Discover help to read the selected program’s options. If it fails, check the file, Python environment and required libraries. Successful help discovery does not prove model inference."
              ],
              "image": "adapter-help",
              "caption": "The help-review step in the advanced form. Seeing program options does not establish that a model can answer."
            },
            {
              "title": "Set model bindings and compatibility checks",
              "body": [
                "Match the model and port options to the provider’s instructions. Do not assume every engine uses --model and --port. Review imported values too.",
                "For Compatibility check program, select an AioLM-compatible probe. For a Python probe, select Python and add the probe.py path and placeholders such as {model} as separate arguments. An ordinary engine executable is not a substitute for a probe.",
                "The probe reports schema_version: 1, the registered engine_id/runtime_id, model path, support and capabilities as JSON. Unsupported models must remain failures. HTTP/SSE, health path and model/port/auth bindings must match the real server. A display name or renamed extension cannot replace this contract."
              ],
              "image": "adapter-check",
              "caption": "In the advanced form, review model and port bindings, compatibility and health checks, and supported model formats."
            },
            {
              "title": "Review, save and run a real model",
              "steps": [
                "Select Review registration details → Register. After it succeeds, AioLM automatically saves the connection details in the app. In model selection, choose the new engine/runtime and a supported model file or complete model folder.",
                "Run it after model compatibility checks pass. Check a short answer, cancellation followed by another question, stopping and restarting."
              ],
              "image": "adapter-review",
              "caption": "The final review in the advanced form. After saving the registration, run the model and check its response.",
              "body": []
            }
          ]
        },
        {
          "id": "trouble",
          "title": "If the connection fails",
          "more": [
            {
              "title": "Python or a file cannot be found",
              "body": [
                "Choose Python from the environment used to install the engine. Keep the complete adapter folder, rather than moving only the JSON. If a program or adapter changes or moves, import again, check help/model compatibility and register again."
              ]
            },
            {
              "title": "Registered, but the model will not run",
              "body": [
                "Check the model format, complete model files, memory and engine libraries. Inspect the compatibility result and server error log. Registration does not add unsupported image/audio/tool capabilities."
              ]
            },
            {
              "title": "Does removal delete my engine or model?",
              "body": [
                "Removing an external registration leaves the engine and model files intact; removing a managed runtime deletes only its app-owned installation. With confirmations enabled, removal first names the affected default, profile, model and saved-session selections; they stay saved but unavailable until reconfigured. Supply keys through the provider’s documented environment variables. New fixed-output benchmarks need a probe that declares capabilities.fixed_output together with streamed usage support; earlier results remain viewable. Portable bundles remain unavailable for external engines; numerical CPU-reference comparison is not offered in the app or public CLI."
              ]
            }
          ]
        },
      ]
    },
  },
};
export default content;
