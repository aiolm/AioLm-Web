import type { GuideContent } from './types';
import { DESKTOP_RELEASE_VERSION } from '@/lib/desktop-release';
const content: GuideContent = {
  title: 'AioLM guides', description: 'New here? Install the app first, then follow the pictures and buttons to start a conversation on your own computer.',
  navigation: 'Guides', onPage: 'On this page', related: 'Next steps', download: 'See all download files',
  screenshotNotice: "These real Linux screenshots were captured in v0.3.2 and development builds; version labels describe the capture time. They do not verify Windows, Mac, every engine or update installation.",
  enlarge: 'View larger', close: 'Close',
  panHint: 'Swipe sideways to see the rest of the image.',
  guides: {
    install: { title: 'Install the app', description: 'Use the command for your computer first, or choose installer files below. Follow only your Windows, Mac or Linux section.', sections: [
      { id: 'commands', title: 'Install with a command', body: ['Choose your operating system below, copy the command and run it in PowerShell on Windows or Terminal on Mac/Linux. If you prefer installer files, use the platform sections below. Linux needs the downloaded DEB first.'] },
      { id: 'windows', title: 'Install on Windows', downloads: 'windows', steps: ['For manual installation, choose x64-setup.exe. This is the usual installer file for a personal PC.', 'Double-click the downloaded file and follow the installer.', 'When it finishes, open AioLM from the Start menu.'], note: 'The Windows installer has no publisher signature, so a security warning may appear. Before installing, check the official AioLM release and its file checksum.', more: [{ title: 'When would I use MSI?', body: ['Use MSI for an organization’s deployment tools or when Windows Installer is required. For a personal installation, use the EXE above. Packages target Windows x64.'] }] },
      { id: 'macos', title: 'Install on Mac', downloads: 'macos', steps: ['Open Apple menu → About This Mac. If Chip says Apple M1, M2 or similar, choose aarch64.dmg. If Processor says Intel, choose x64.dmg.', 'Open the DMG and drag AioLM to Applications.', 'Open AioLM. If macOS blocks it, verify the official release and checksum. To continue, open System Settings → Privacy & Security → Open Anyway.'], note: 'Requires macOS 13.3+. The app is ad-hoc signed and not notarized by Apple, so macOS may show a security warning. Check the official AioLM release and file checksum before installing.' },
      { id: 'linux', title: 'Install on Linux', downloads: 'linux', body: ['For Ubuntu 24.04+ on x86_64 PCs. Choose the DEB if you are starting out.'], steps: ['Double-click the downloaded DEB to open your package installer, or use the Linux command above in the download folder.', 'After installation, open AioLM from the application menu.'], more: [{ title: 'The DEB does not open an installer', body: ['Keep only the DEB version you want in the download folder. Open a terminal there and use the Linux command in the installation tabs above.'] }, { title: 'Use AppImage without installing a package', body: ['Keep the AppImage in a permanent folder and run the commands below. If you move it, register its launcher again.', 'For an application-menu launcher, download and verify register-linux-desktop.py from the same release, then run python3 register-linux-desktop.py --appimage <file>. Use --remove before switching to DEB. Python 3 is required.'], code: 'sudo apt install libgomp1 libfuse2t64\nchmod +x ./AioLM_*.AppImage\n./AioLM_*.AppImage' }] },
      { id: 'first-open', title: 'When the app opens', body: ['If you see the language screen below, you are ready. Choose your language and Continue. Returning users with existing settings go straight to the workspace.'], image: 'language', caption: 'A fresh installation starts in English. Continue in “Start your first conversation” after choosing your language.' },
      { id: 'verify', title: 'Check the downloaded file', body: ['Use the official download files. For an extra check that the file arrived intact, expand the instructions below.'], more: [{ title: 'Check the file’s checksum', body: ['Download checksums.txt from the same release as your installer. A checksum is a file’s identifying value. Compare the full command result with the SHA-256 entry for that exact filename. Stop if they differ. A checksum does not replace a publisher signature.', 'On Windows, replace the filename below with the one you downloaded. On Mac, use shasum -a 256 followed by the file path; on Linux use sha256sum.'], code: `Get-FileHash -Algorithm SHA256 .\\AioLM_${DESKTOP_RELEASE_VERSION}_x64-setup.exe` }] },
      { id: 'updates', title: 'Update later', body: ['Open Settings → General and select Check for updates. If a new version is available, save your work and choose Download and install. Finish the system installer, then reopen AioLM.'], image: 'updates', caption: 'The application-update area in Settings. This example is already on v0.3.2.', more: [{ title: 'Backups, removal and manual updates', body: ['For a Mac DMG, replace the existing app. AppImage and manual installations use the download page. Replacing the app keeps existing conversations and settings.', 'Data lives in ~/.aiolm on Mac/Linux or %USERPROFILE%\\.aiolm on Windows, unless AIOLM_HOME selects another folder. Back up that folder and your model files.', 'The Windows EXE (NSIS) uninstaller can explicitly delete app data. MSI and DEB removal, or moving the Mac app to Trash, leave data in place.'] }, { title: 'What update testing has covered', body: ['v0.3.2 package checks passed. Actual v0.3.1 → v0.3.2 update installation and device UI acceptance are still pending.'] }] },
    ] },
    'getting-started': { title: 'Start your first conversation', description: "A model is the AI data; an engine runs it. Choose an engine that fits your device and model format, then follow these steps.", sections: [
      { id: 'language', title: '1. Choose your language', body: ['Select your language and Continue. This is the first screen on a fresh installation. If you have already finished setup, skip to step 4.'], image: 'language', caption: 'Buttons and explanations switch to the language you choose.' },
      { id: 'theme', title: '2. Choose the screen colors', body: ['Pick Light, Dark or System, then Continue. You can change this later in Settings.'], image: 'theme', caption: 'Selecting a theme previews it immediately.' },
      { id: 'folder', title: '3. Choose where models are saved', body: ['Keep the default folder, or use Choose folder to pick another location. Select Start using AioLM to enter the workspace. You do not need a model file yet.'], image: 'folder', caption: 'Do not copy this example path. Choose a folder on your own computer.' },
      {"id":"engine","title":"4. Prepare the engine","body":["Open Inference engines and compare OS, device and model-format requirements before choosing an engine. Install the selected runtime if needed; for a separately installed engine, follow the external connection guide."],"image":"llama-install","caption":"The llama.cpp CPU screen illustrates where the Install button is. It is not a preferred-engine recommendation or verification of other engines.","note":"A runtime is an installed copy of an engine. Check device compatibility and the external-engine connection guide first.","links":[{"href":"/en/guides/adapters#find","label":"External-engine connection steps"}]},
      {"id":"download","title":"5. Download one small model","body":["Open Discover, select a format supported by your chosen engine and search for a model. Open a repository to see its files. Check whether the engine needs one file or a complete model folder.","Start with a small text model. Select Download next to a file and wait until it finishes. Check the model’s license and memory requirements too."],"image":"model-files","caption":"A GGUF example showing model search and download controls. Download the format and complete files required by your selected engine."},
      { id: 'library', title: '6. Find the downloaded file', body: ['Open Run a model on the left. Select your downloaded filename to open its settings. If it is missing, check that Models directory points to your download folder, then Rescan.'], image: 'model-library', caption: 'Select your own downloaded filename in the model list, rather than copying the example name.' },
      { id: 'model', title: '7. Select the downloaded model', body: ['Open Run a model and select the downloaded file. In Model & settings, choose your installed engine and runtime, then follow Choose profile and Adjust options. A profile is a saved group of settings; start with Default.', 'Keep the defaults to begin with. Review required items and select the run action. If something is not ready, follow the explanation in the window first.'], image: 'model-settings', caption: 'Select step 1, Choose runtime, at the top. Choose the runtime you installed on the right.', more: [{ title: 'The model does not load', body: ['Check that the model matches the engine and fits in your computer’s memory. Read the readiness message and engine log first. Avoid changing unfamiliar options at random.', 'Context is how much conversation the AI can consider at once. Setting it too high can exhaust memory. Changing context, parallelism or launch options requires restarting the model.'] }] },
      { id: 'chat', title: '8. Send a short message', body: ['After loading the model, select Chat on the left. Type a short question in the box below and select Send message.', 'Check text chat first. Images, audio, video and tools work only when both the model and engine support them.'], image: 'chat', caption: 'After running the model, send a short question from the message box. Its answer appears in the conversation above.', more: [{ title: 'Measure speed or share a result', body: ['A benchmark measures processing speed. Compare the same method and workload; a high score does not verify answer quality or every device feature.', 'Sharing is optional and requires browser verification. Review the public data first. Keep your recovery code or backup file private so you can manage the record without an account. Open Manage from the app or use this site’s Manage page.'] }] },
    ] },
    compatibility: { title: 'Choose an engine for your computer', description: "Compare your OS, device, memory and model format before choosing an engine. Check installation requirements and actual verification status together.", sections: [
      { id: 'engines', title: 'Open the engine list', body: ['Select Inference engines on the left. Avoid an engine marked Unavailable on this device.'], image: 'engines', caption: 'The inference-engine screen. Check the installation and device-support status before choosing an item.' },
      {"id":"choose","title":"Which engine should I choose?","table":{"headers":["Engine","Choose it when…"],"rows":[["llama.cpp","Using GGUF with a supported Windows, Mac or Linux build"],["vLLM","You have a supported Linux accelerator setup"],["vLLM · vllm-metal","Using vLLM on an Apple silicon Mac with macOS 15+"],["MLX","Using MLX models on an Apple silicon Mac"],["External inference engine","Prepare a separately installed engine, then check its device, model and local connection requirements."]]},"note":"Intel Macs cannot use MLX or vllm-metal. Check the installation screen’s requirements first."},
      { id: 'models', title: 'Download the right model type', body: ['llama.cpp uses GGUF files. vLLM and MLX usually need a complete model folder with weights, settings and tokenizer files. Do not copy just one file; choose the right format in Discover.', 'If memory is limited, try a smaller model. For images or audio, check both the model description and the support shown in the app.'], image: 'discover', caption: 'Choose the engine and model format at the top of Discover first.', more: [{ title: 'Detailed vLLM and MLX requirements', body: ['Managed Linux vLLM installs CUDA dependencies. AMD ROCm needs a separately prepared compatible Python environment and driver. AioLM does not install system GPU drivers.', 'vllm-metal needs Apple silicon, macOS 15+ and native arm64 Python 3.12; Intel and Rosetta Python are not supported. MLX also needs Apple silicon and a compatible Python environment.', 'Native Windows vLLM, WSL and remote servers are not local runtime targets here. Python models need a complete safetensors or supported MLX snapshot. vllm-metal supports only a subset of GGUF files, not all ordinary GGUF models.'] }] },
      { id: 'limits', title: 'What still needs checking', body: ['Images, audio, video and tools need support from both the engine and model. Registering an engine does not enable every feature.'], more: [{ title: 'v0.3.2 verification limits and known issues', body: ['The SmolVLM image/video content-quality failure (F09) is unresolved.', 'Passing a package build does not verify inference on every device. Overall Linux acceptance and real v0.3.1 → v0.3.2 update installation/UI acceptance are not complete.', 'Benchmarks, deep verification and portable bundles have engine-specific support. External inference engines (custom.*) are not accepted by the current public benchmark-sharing contract.'] }] },
    ] },
    adapters: {
      "title": "Connect an external inference engine",
      "description": "Find automatically → Choose a model → Connect, available in v0.3.3 and later. For v0.3.2, see the advanced manual-registration guide below.",
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
            "Open Inference engines → Add inference engine and select Find automatically. Select an item under Discovered items. Running local servers appear only after they return a real model list.",
            "If your engine is missing, select Choose installation folder and choose the folder where it is installed. You do not need to pick an executable or configuration file."
          ],
          "note": "A discovered item is a candidate, not a verified connection. Installation discovery can continue only when the launch method is clear.",
          "image": "auto-find",
          "caption": "The automatic-discovery screen. Select a discovered item, or choose the installation folder if none is found."
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
            "Connecting to an already running server leaves that server under its original owner’s control. Disconnecting in AioLM does not stop it. An engine started by AioLM is managed by AioLM."
          ],
          "note": "A text connection check does not verify image, audio, video, tool support or answer quality.",
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
            "This table is for advanced manual registration, including v0.3.2. The three-step automatic flow does not require these files."
          ]
        },
        {
          "id": "advanced",
          "title": "Advanced: manual registration",
          "body": [
            "Expand these instructions if you use v0.3.2 or need to configure a known launch method manually. The pictures show the advanced registration form. Differences in v0.3.2 button names are explained below."
          ],
          "more": [
            {
              "title": "Open manual registration",
              "body": [
                "Stop running models, then select Inference engines → Add inference engine. In v0.3.2, use the manual registration form. In v0.3.3 and later, expand Advanced: configure the launch method manually below automatic connection."
              ],
              "image": "adapter-add",
              "caption": "Open the advanced registration form when you need to enter the launch method yourself."
            },
            {
              "title": "Import a setup file you already received",
              "steps": [
                "In v0.3.2, select Import adapter setup; in v0.3.3 and later, select Import AioLM connection setup (.json). Choose the AioLM *.setup.json from the unpacked folder.",
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
                "Removing a registration leaves external engine/model files intact. Supply keys through the provider’s documented environment variables. Public benchmark sharing, deep validation and portable bundles require separate support for external engines."
              ]
            }
          ]
        },
        {
          "id": "verified",
          "title": "What has actually been verified",
          "body": [
            "2026-10-28: registered external CPU llama-server b11669 as custom.independent-cpu through the public v0.3.2 CLI with a fixed Qwen2.5-0.5B model. Verified a real “5” response, token usage, stream cancellation, restart, removal/re-registration and closed ports after shutdown.",
            "This historical record covers that Linux CPU CLI combination. The app captures have separate records; neither establishes other engine or device combinations, overall Linux acceptance, or actual update installation."
          ],
          "more": [
            {
              "title": "Reproduction details",
              "report": {
                "href": "/verification/external-cpu-2026-10-28.json",
                "label": "View execution evidence (JSON)"
              },
              "body": [
                "Server: ggml-org/llama.cpp b11669. Model revision: 9217f5db79a29953eb74d5343926648285ec7e67. Verified official archive/model SHA-256 and 41 model/dependency files, including that external files stayed unchanged. All A01–A09 checks passed under normal process reaping. The initial container reaping failure remains recorded separately. F09 is still unresolved."
              ]
            },
            {
              "title": "Additional fixed CPU CLI checks",
              "body": [
                "Mistral.rs 0.9.5 with Qwen2.5-0.5B and vllm.cpp 0.0.2 with Qwen3.5-0.8B also passed the recorded Linux CPU CLI checks. These used validation-only probes for the exact model/build combinations; they are not general adapters or proof of automatic configuration.",
                "The records retain the initial failures and stricter reruns. They do not establish GPU, native UI or all-engine support."
              ],
              "links": [
                {
                  "href": "/verification/mistralrs-cpu-2026-10-28.json",
                  "label": "Mistral.rs 0.9.5 · CPU CLI execution record"
                },
                {
                  "href": "/verification/vllm-cpp-cpu-2026-10-28.json",
                  "label": "vllm.cpp 0.0.2 · CPU CLI execution record"
                }
              ]
            }
          ]
        }
      ]
    },
  },
};
export default content;
