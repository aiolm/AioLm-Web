import type { GuideContent } from './types';
import { DESKTOP_RELEASE_VERSION, SCREENSHOT_SOURCE_VERSION } from '@/lib/desktop-release';

const content: GuideContent = {
  title: 'AioLM guides',
  description: 'Install AioLM, prepare an inference engine, and run your first local conversation.',
  navigation: 'Guides',
  onPage: 'On this page',
  related: 'Next steps',
  download: 'See all download files',
  screenshotNotice: `Instructions follow v${DESKTOP_RELEASE_VERSION}. Screenshots come from v${SCREENSHOT_SOURCE_VERSION} macOS builds, so some labels and layouts differ.`,
  enlarge: 'View larger',
  close: 'Close',
  panHint: 'Swipe sideways to see the rest of the image.',
  guides: {
    install: {
      title: 'Install the app',
      description: 'Verify the download checksum and install AioLM on Windows, Mac, or Linux.',
      sections: [
        {
          id: 'commands',
          title: 'Quick install overview',
          diagram: 'install-flow',
          body: ['Pick your OS below to install via quick command or verified file download.'],
          points: [
            'Windows/Mac quick commands verify the installer’s SHA-256, though the script itself runs before pre-verification.',
            'For full manual verification first, download the installer and checksums.txt in your OS section below.',
            'Linux requires downloading the DEB package before running the install command.',
          ],
        },
        {
          id: 'windows',
          title: 'Install on Windows',
          downloads: 'windows',
          steps: [
            'Download x64-setup.exe (or MSI) and checksums.txt from the same release.',
            'Compare the SHA-256 checksum, then run the installer.',
            'Launch AioLM from the Start menu.',
          ],
          note: 'Windows installers are unsigned, so Windows may show a warning. Verify the official release and SHA-256 first.',
          more: [{
            title: 'MSI & silent installer notes',
            body: ['Use MSI for organization deployment tools on Windows x64; personal PCs should use EXE. In install.ps1, MSI exit codes 3010 (reboot required) and 1641 (reboot started) count as success.'],
          }],
        },
        {
          id: 'macos',
          title: 'Install on Mac',
          downloads: 'macos',
          steps: [
            'Check Apple menu → About This Mac: choose aarch64.dmg for Apple silicon, or x64.dmg for Intel.',
            'Download the DMG and checksums.txt, verify shasum -a 256, then drag AioLM to Applications.',
            'Open AioLM. If blocked, allow it in System Settings → Privacy & Security → Open Anyway (Control-click → Open on macOS 13–14).',
          ],
          note: 'Requires macOS 13.3+. Not notarized by Apple; verify the release SHA-256 before opening.',
        },
        {
          id: 'linux',
          title: 'Install on Linux',
          downloads: 'linux',
          body: ['For Ubuntu 24.04+ on x86_64. Start with the DEB package for desktop integration.'],
          steps: [
            'Download the DEB and checksums.txt, check sha256sum, then double-click the DEB or run sudo apt install ./AioLM_*_amd64.deb.',
            'Open AioLM from your application menu.',
          ],
          more: [
            {
              title: 'DEB fails to open an installer',
              body: ['Keep only one version of the DEB in your downloads folder, open a terminal there, and run the apt command above.'],
            },
            {
              title: 'Use AppImage instead of DEB',
              body: [
                'Keep the AppImage in a permanent folder, verify its checksum, and install libgomp1, libfuse2t64, and zenity (needed for MCP approval dialogs).',
                'To add an app-menu shortcut, download and verify register-linux-desktop.py, then run python3 register-linux-desktop.py --appimage <file> (--remove before switching to DEB).',
              ],
              code: 'sudo apt install libgomp1 libfuse2t64 zenity\nchmod +x ./AioLM_*.AppImage\n./AioLM_*.AppImage',
            },
          ],
        },
        {
          id: 'first-open',
          title: 'First launch',
          body: ['New installs start with language, theme, and model-folder setup; existing configs open the workspace directly.'],
          image: 'language',
          caption: 'First-run language screen.',
        },
        {
          id: 'verify',
          title: 'Verify file checksums',
          body: ['Compare your downloaded installer against checksums.txt from the exact same release before running it.'],
          more: [{
            title: 'SHA-256 check commands',
            body: ['Windows: PowerShell Get-FileHash below. Mac: shasum -a 256 <file>. Linux: sha256sum <file>. Stop if the hash differs.'],
            code: `Get-FileHash -Algorithm SHA256 .\\AioLM_${DESKTOP_RELEASE_VERSION}_x64-setup.exe`,
          }],
        },
        {
          id: 'updates',
          title: 'Updates & background tray',
          points: [
            'Startup checks GitHub releases once and notifies without auto-installing; manual checks live in Settings → General → Application updates.',
            'Download and install verifies the release SHA-256 before stopping tasks and opening the installer (AppImage updates are manual).',
            'Closing the window hides AioLM to the system tray; use Quit to stop managed model processes. Data stays in ~/.aiolm (%USERPROFILE%\\.aiolm on Windows) or AIOLM_HOME.',
          ],
          image: 'updates',
          caption: 'Application updates in Settings.',
          more: [{
            title: 'Uninstall & data retention details',
            body: ['NSIS offers optional data removal; MSI, DEB, and moving the Mac app to Trash keep conversations and settings. After a Mac update, macOS may re-prompt for Keychain access.'],
          }],
        },
      ],
    },
    'getting-started': {
      title: 'Start your first conversation',
      description: 'Pick a theme and folder, prepare an engine, download a model, and start chatting.',
      sections: [
        {
          id: 'language',
          title: '1. Choose language & setup',
          diagram: 'setup-flow',
          body: ['Select your language and Continue. Returning users skip directly to step 4.'],
          image: 'language',
          caption: 'Interface labels switch immediately to your selected language.',
        },
        {
          id: 'theme',
          title: '2. Choose screen theme',
          body: ['Pick Light, Dark, or System—previewed live and changeable later in Settings.'],
          image: 'theme',
          caption: 'Theme preview during initial setup.',
        },
        {
          id: 'folder',
          title: '3. Choose model folder',
          body: ['Keep the default folder or pick another location, then click Start using AioLM.'],
          image: 'folder',
          caption: 'Choose a folder on your own computer.',
        },
        {
          id: 'engine',
          title: '4. Prepare an engine',
          body: ['Open Inference engines to check OS/hardware support and install or connect a runtime.'],
          points: [
            'The inventory displays actual installed or registered versions and runs executable checks automatically (no manual Check button).',
            'If automatic vLLM or MLX installation is unavailable for your setup, prepare your own Python environment and register it.',
            'Desktop help execution requires native OS approval for the exact program, arguments, directory, and environment; PR source builds compile third-party code as your user.',
          ],
          image: 'llama-install',
          caption: 'Native llama.cpp Metal runtime screen.',
          links: [{ href: '/en/guides/adapters#find', label: 'External-engine connection steps' }],
        },
        {
          id: 'download',
          title: '5. Search & download a model',
          body: ['Discover searches all Hugging Face formats (Trending by default) independently of your selected engine.'],
          points: [
            'Choose an HF/MLX Safetensors weight file to pull its required config, tokenizer, and splits without other weight variants; GGUF split sets download together too.',
            'Pause, resume from Paused downloads, and verify full-file digests; failed repository file reads offer per-item Retry.',
            'You can install an engine runtime while a model downloads.',
          ],
          image: 'model-files',
          caption: 'Inspect repository files and memory needs before downloading.',
          more: [{
            title: 'Download & transfer safeguards',
            body: ['Remote Python/model code is never executed automatically. GitHub and Hugging Face transfers enforce HTTPS and trusted hosts across redirects (up to 10 hops). Files without a digest restart on resume rather than appending unverified bytes.'],
          }],
        },
        {
          id: 'library',
          title: '6. Manage sessions in the Library',
          body: ['Use the header and Chat for the default session, and Library → Saved sessions for named sessions and local model files.'],
          points: [
            'Click a model or Model settings to preview; delete, copy, and update actions sit in the file-action row.',
            'If search matches only hidden supporting files, click Show supporting files while keeping your filters.',
            'Upstream model updates reuse unchanged files (stop all sessions first; single-file GGUF updates re-download in full).',
          ],
          image: 'model-library',
          caption: 'Library view with saved sessions and local models.',
        },
        {
          id: 'model',
          title: '7. Configure, save & launch',
          diagram: 'memory-pools',
          body: ['Model settings follow Choose runtime → Choose profile → Adjust options, auto-picking the first available runtime if none is selected.'],
          points: [
            'Save profile & start saves and closes the editor automatically while running checks and loading in the background with Cancel and failure recovery.',
            'Option titles show the primary CLI flag or JSON key (full signature on hover); simple controls use multi-column grids while complex editors stay full width.',
            'Check VRAM, Runtime RAM, RAM Offload, and SSD Offload separately; shared-memory GPUs omit combined totals so RAM is not counted twice.',
          ],
          image: 'model-settings',
          caption: `Historical v${SCREENSHOT_SOURCE_VERSION} settings view; v${DESKTOP_RELEASE_VERSION} expands options across wider windows.`,
          more: [{
            title: 'Memory estimates, stale help & timeouts',
            body: [
              'llama.cpp estimates cover supported architectures (including supported Qwen hybrids) and show Unavailable instead of zero when unsupported. Reclaimable OS file cache is never treated as permanent RAM.',
              'For non-llama.cpp engines, stale option info offers Recheck options (plus Retry on load errors). Startup/warmup allows up to 10 minutes; Windows early exits surface missing or damaged DLL errors.',
            ],
          }],
        },
        {
          id: 'chat',
          title: '8. Chat with a loaded session',
          body: ['Open Chat, pick an answering session in the chat header, and send a message (no API server needed).'],
          points: [
            'Tool approvals, progress, and errors stay scoped to the owning conversation, with a return button when viewing another chat.',
            'Conversation settings hold document retrieval and optional local ffmpeg audio/video preprocessing; project document links ask for native permission once.',
            'MCP servers require native OS approval on first launch (editing commands preserves whitespace and warns before discarding drafts).',
          ],
          image: 'chat',
          caption: 'Local model conversation in Chat.',
        },
        {
          id: 'api',
          title: 'Local API server',
          body: ['Start Integrations → API server independently of models; both OpenAI (including Responses tools) and Anthropic Messages share 127.0.0.1:8080.'],
          points: [
            'Requests require a loopback Host header (421 otherwise), obey a 64-connection cap, and return 503 if no model is loaded.',
            'Function tools translate to Chat Completions when the loaded engine supports function calling; unsupported built-in Responses tools are rejected.',
          ],
          more: [{
            title: 'API key lifetime & macOS Dock PATH',
            body: ['The API key stays valid until the app quits; stopping the listener keeps internal chat running. On Mac, apps launched from Finder/Dock do not read shell startup files—configure absolute paths for nvm/Volta/asdf MCP tools.'],
          }],
        },
        {
          id: 'personalization',
          title: 'Personalization & skills',
          body: ['Configure shared ~/.agents/AGENTS.md and AioLM ~/.aiolm/AGENTS.md instructions and local skills under Settings → Personalization.'],
          points: [
            'AioLM-specific instruction and skill files win conflicts; explicit $skill-name selection works across every engine.',
            'Automatic skill reading (aiolm_read_skill) is exposed only when the engine declares tool-call support.',
          ],
          more: [{
            title: 'File limits & editor behavior',
            body: ['Files are capped at 64 KiB and 128 active skills (catalog descriptions over 1,024 chars are shortened). Instruction/skill text is sent to the chat endpoint, not saved in preference exports.'],
          }],
        },
        {
          id: 'benchmarks',
          title: 'Benchmarks & sharing',
          body: ['New benchmarks run fixed-output API tests on engines that support output-length control (native llama.cpp or supported non-Metal vLLM).'],
          points: [
            'vllm-metal, MLX, and automatic external connections cannot run fixed-output benchmarks; older output-cap and token results stay separate.',
            'Stop running sessions first; accepting refreshed Key settings repeats only the target support check without auto-starting.',
            'Manage publications via Shared results → Manage on website (copied recovery codes auto-clear from the clipboard after 60s).',
          ],
          more: [{
            title: 'Measurement & profile import details',
            body: ['Timing and output bytes are client-observed, and every request must match the target token count. Creating a profile from a result imports compatible launch settings only and never downloads models or runtimes.'],
          }],
        },
        {
          id: 'cli',
          title: 'CLI & portable runtimes',
          body: ['aiolm-cli ships beside the desktop app for headless server control, runtime management, and portable Python bundles.'],
          code: 'aiolm-cli runtime list\naiolm-cli runtime select <backend> <build>\naiolm-cli server start|status|logs|stop\naiolm-cli runtime discover [folder]\naiolm-cli runtime connect <candidate-id> <model-id> [folder]',
          more: [{
            title: 'CLI configuration, logs & bundles',
            body: [
              'Headless server start binds loopback without API-key auth—use only on trusted machines. server logs keeps the newest tail.',
              'config set validates settings before saving. Managed Python installs use prebuilt packages only; runtime export/import bundles dependencies without models.',
            ],
          }],
        },
      ],
    },
    compatibility: {
      title: 'Choose an engine for your computer',
      description: 'Compare OS, accelerator, model format, and benchmark support at a glance.',
      sections: [
        {
          id: 'engines',
          title: 'Check the engine list',
          body: ['Open Inference engines in the sidebar and skip any runtime marked Unavailable for your device.'],
          image: 'engines',
          caption: 'Inference engines inventory showing support and installation status.',
        },
        {
          id: 'choose',
          title: 'Engine compatibility matrix',
          table: {
            headers: ['Engine', 'Platforms, Formats & Fixed-Output Benchmarks'],
            rows: [
              ['llama.cpp', 'Windows · macOS · Linux · GGUF · Fixed-output supported'],
              ['vLLM', 'Supported Linux CUDA/ROCm · Safetensors · Fixed-output supported (non-Metal)'],
              ['vLLM · vllm-metal', 'Apple silicon macOS 15+ · Safetensors / limited GGUF · Not supported'],
              ['MLX', 'Apple silicon macOS · MLX Safetensors · Not supported'],
              ['External engine', 'Local OpenAI-compatible v1 server or folder · Chat verified · Not supported'],
            ],
          },
          note: 'Intel Macs use CPU llama.cpp only—MLX and vllm-metal are unavailable.',
        },
        {
          id: 'models',
          title: 'Model formats & Python environments',
          points: [
            'llama.cpp runs GGUF; vLLM and MLX require complete config, tokenizer, processor, and safetensors files.',
            'Automatic vLLM and MLX installs only use prebuilt packages; if none match your system, prepare a Python environment yourself and register it.',
            'Embedding models use embedding sessions; Whisper and Qwen3-ASR use speech sessions (non-WAV audio requires local ffmpeg).',
          ],
          image: 'discover',
          caption: 'Discover searches model repositories independently of the active engine.',
        },
        {
          id: 'limits',
          title: 'Verification limits & known issues',
          body: ['Images, audio, video, and tools require both engine and model support.'],
          more: [{
            title: `v${DESKTOP_RELEASE_VERSION} limits & known issues`,
            body: [
              'Fixed-output benchmarks require declared output-length control (native llama.cpp and supported non-Metal vLLM).',
              'SmolVLM image/video quality issue (F09) reported in v0.3.2 remains unconfirmed fixed.',
              'Desktop and CLI builds do not include numerical CPU-reference verification.',
            ],
          }],
        },
      ],
    },
    adapters: {
      title: 'Connect an external inference engine',
      description: 'Find automatically → Check selected item → Pick model → Connect.',
      sections: [
        {
          id: 'prepare',
          title: 'Overview',
          diagram: 'adapter-flow',
          body: ['Connect any local OpenAI-compatible v1 server or install folder without editing JSON files.'],
        },
        {
          id: 'find',
          title: '1. Find & approve',
          body: ['Open Inference engines → Add inference engine → Find automatically, or click Choose installation folder.'],
          points: [
            'Folder discovery scans for launchable programs (excluding libraries like DLLs) without favoring engine names.',
            'A sole running server may auto-check; installation folders always require clicking Check selected item.',
            'Desktop help execution requires native OS approval for the exact command, arguments, directory, and environment (cancelling withdraws pending prompts).',
          ],
          note: 'Discovery locks while model sessions are running or another runtime operation is active.',
          image: 'auto-find',
          caption: 'Automatic discovery screen.',
        },
        {
          id: 'choose-model',
          title: '2. Choose a model',
          body: ['Pick a model reported by the running server or a local catalog model for folder installations.'],
          points: ['If an engine exposes serving subcommands, choose one under Launch command and click Check selected command.'],
          image: 'auto-model',
          caption: 'Model selection for an external engine.',
        },
        {
          id: 'connect',
          title: '3. Connect & verify',
          body: ['Click Connect to run live chat and streaming checks before saving the connection inside AioLM.'],
          points: [
            'Running servers connect via an AioLM-owned local proxy; stopping the connection stops only the proxy, not your server.',
            'Automatic connections do not declare fixed-output benchmark control and do not verify multimodal/tool quality.',
          ],
          image: 'auto-connect',
          caption: 'Connection verified and saved.',
        },
        {
          id: 'launch-options',
          title: 'Options & help rechecking',
          body: ['Managed connections build grouped option controls directly from the command’s help output.'],
          points: [
            'Simple controls use multi-column layouts while JSON, token lists, paths, and repeated editors stay full width alongside Command and help tools.',
            'If reviewed help no longer matches runtime identity (ignoring host env like PATH), launch re-runs the reviewed help command once and continues if parsed options are identical. Help execution skips the native confirmation prompt only when the exact program path, arguments, effective working directory and environment were previously approved; changing any of those execution inputs requires renewed native approval.',
            'Save profile & start closes settings and runs checks/loading in the background with Cancel and Review saved model settings on failure (including Windows DLL errors).',
          ],
          more: [{
            title: 'Additional launch arguments & attached servers',
            body: ['Additional launch arguments accepts literal tokens without shell evaluation and blocks duplicate or app-managed flags. Attached running servers keep their own launch settings outside AioLM.'],
          }],
        },
        {
          id: 'unconfirmed',
          title: 'When automatic connection fails',
          body: ['Incompatible protocols, missing auth keys, or ambiguous commands stay unverified with an explicit reason.'],
          links: [{ href: '/en/guides/adapters#files', label: 'Advanced manual registration files' }],
          more: [{
            title: 'Containers',
            body: ['Already-running container servers can connect over local OpenAI v1; AioLM does not create or manage containers automatically.'],
          }],
        },
        {
          id: 'files',
          title: 'Advanced: manual registration files',
          body: ['Only needed when configuring an adapter manually instead of using automatic discovery.'],
          table: {
            headers: ['Item', 'Role'],
            rows: [
              ['*.setup.json', 'Provider input recipe imported with its companion scripts'],
              ['Manifest JSON (*.engine.json)', 'Optional completed registration file for advanced import'],
              ['Server executable', 'Actual server binary (never an installer or shortcut)'],
              ['Python interpreter', 'python.exe or bin/python from the engine environment'],
              ['Model / engine config', 'Selected after registration (e.g. .gguf, .safetensors, deployment.json)'],
            ],
          },
          note: 'Manual registration saves internally; you do not need to author a .engine.json file.',
        },
        {
          id: 'advanced',
          title: 'Advanced: manual setup walkthrough',
          body: ['Expand only when you must register an explicit executable, bridge, or probe script manually.'],
          more: [
            {
              title: '1. Open manual registration & security grants',
              body: ['Stop models → Inference engines → Add inference engine → Advanced. Picking a manifest via the native file picker grants it for the session; typed paths require native confirmation showing probe and launch commands.'],
              image: 'adapter-add',
              caption: 'Advanced registration entry.',
            },
            {
              title: '2. Import a setup recipe (*.setup.json)',
              steps: ['Select Import AioLM connection setup (.json) (bound to the native-picker session token).', 'Fill in paths and click Check installation and continue.'],
              code: 'Unpacked folder/\n  engine.setup.json\n  prepare.py\n  probe.py',
              body: ['Keep companion scripts in the same unpacked folder.'],
            },
            {
              title: '3. Set executable & arguments',
              body: ['Pick the executable or Python interpreter, enter custom.<engine> and runtime ID, and choose direct HTTP or a separate bridge.'],
              image: 'adapter-setup',
              caption: 'Manual executable and arguments form.',
              code: 'Executable: bin/python\nArg 1: -m\nArg 2: vendor_engine.serve',
            },
            {
              title: '4. Discover help & probes',
              body: ['Run Discover help, then set model/port bindings and an AioLM JSON probe (schema_version: 1).'],
              image: 'adapter-help',
              caption: 'Help discovery step.',
            },
            {
              title: '5. Verify bindings & review',
              body: ['Verify probe JSON, health path, and HTTP/SSE support, then save registration and test a real model.'],
              image: 'adapter-check',
              caption: 'Bindings and compatibility probe check.',
            },
            {
              title: '6. Save & test',
              steps: ['Click Review registration details → Register.', 'Select the new engine/runtime and verify chat, cancel, and restart.'],
              image: 'adapter-review',
              caption: 'Final registration review.',
              body: [],
            },
          ],
        },
        {
          id: 'trouble',
          title: 'Troubleshooting',
          more: [
            { title: 'Missing Python or moved files', body: ['Pick the Python interpreter from the engine’s own environment and keep the full adapter folder together.'] },
            { title: 'Registered, but model fails to run', body: ['Check model format, complete weight files, memory, and server logs.'] },
            { title: 'Removing a registration', body: ['External removal deletes only AioLM’s registration record, never your engine or model files.'] },
          ],
        },
      ],
    },
  },
};

export default content;
