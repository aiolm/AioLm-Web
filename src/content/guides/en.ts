import type { GuideContent } from './types';
const content: GuideContent = {
  title: 'AioLM guides', description: 'New here? Install the app first, then follow the pictures and buttons to start a conversation on your own computer.',
  navigation: 'Guides', onPage: 'Jump to', related: 'Next steps', download: 'See all download files',
  screenshotNotice: 'Most pictures show the released v0.3.2 interface. The first manual-registration screen previews an unreleased source update. All use example data; none records a real installation or model run.',
  enlarge: 'View larger', close: 'Close',
  panHint: 'Swipe sideways to see the rest of the image.',
  guides: {
    install: { title: 'Install the app', description: 'Follow only the section for your computer: Windows, Mac or Linux. You can skip the other two.', sections: [
      { id: 'windows', title: 'Install on Windows', downloads: 'windows', steps: ['Download the x64-setup.exe file below. This is the usual choice for a personal PC.', 'Double-click the downloaded file and follow the installer.', 'When it finishes, open AioLM from the Start menu.'], note: 'The installer has no publisher signature, so Windows may show a security warning. Check that the file is from the official AioLM release before continuing.', more: [{ title: 'When would I use MSI?', body: ['Use MSI for an organization’s deployment tools or when Windows Installer is required. For a personal installation, use the EXE above. Packages target Windows x64.'] }] },
      { id: 'macos', title: 'Install on Mac', downloads: 'macos', steps: ['Open Apple menu → About This Mac. If Chip says Apple M1, M2 or similar, choose aarch64.dmg. If Processor says Intel, choose x64.dmg.', 'Open the DMG and drag AioLM to Applications.', 'Open AioLM. If macOS blocks it, try opening once, then go to System Settings → Privacy & Security → Open Anyway.'], note: 'Requires macOS 13.3+. The app is ad-hoc signed and not notarized by Apple. On macOS 13–14, Control-click → Open is also available.' },
      { id: 'linux', title: 'Install on Linux', downloads: 'linux', body: ['For Ubuntu 24.04+ on x86_64 PCs. Choose the DEB if you are starting out.'], steps: ['Double-click the downloaded DEB to open your package installer. If no installer is associated with it, use the command below.', 'After installation, open AioLM from the application menu.'], more: [{ title: 'The DEB does not open an installer', body: ['Open a terminal in the download folder. Keep only the DEB version you want to install in that folder, then run:'], code: 'sudo apt install ./AioLM_*_amd64.deb' }, { title: 'Use AppImage without installing a package', body: ['Keep the AppImage in a permanent folder and run the commands below. If you move it, register its launcher again.', 'For an application-menu launcher, download and verify register-linux-desktop.py from the same release, then run python3 register-linux-desktop.py --appimage <file>. Use --remove before switching to DEB. Python 3 is required.'], code: 'sudo apt install libgomp1 libfuse2t64\nchmod +x ./AioLM_*.AppImage\n./AioLM_*.AppImage' }] },
      { id: 'first-open', title: 'When the app opens', body: ['If you see the language screen below, you are ready. Choose your language and Continue. Returning users with existing settings go straight to the workspace.'], image: 'language', caption: 'A fresh installation starts in English. Continue in “Start your first conversation” after choosing your language.' },
      { id: 'verify', title: 'Check the downloaded file', body: ['Use the official download files. For an extra check that the file arrived intact, expand the instructions below.'], more: [{ title: 'Check the file’s checksum', body: ['Download checksums.txt from the same release as your installer. A checksum is a file’s identifying value. Compare the full command result with the SHA-256 entry for that exact filename. Stop if they differ. A checksum does not replace a publisher signature.', 'On Windows, replace the filename below with the one you downloaded. On Mac, use shasum -a 256 followed by the file path; on Linux use sha256sum.'], code: 'Get-FileHash -Algorithm SHA256 .\\AioLM_0.3.2_x64-setup.exe' }] },
      { id: 'updates', title: 'Update later', body: ['Open Settings → General and select Check for updates. If a new version is available, save your work and choose Download and install. Finish the system installer, then reopen AioLM.'], image: 'updates', caption: 'The application-update area in Settings. This example is already on v0.3.2.', more: [{ title: 'Backups, removal and manual updates', body: ['For a Mac DMG, replace the existing app. AppImage and manual installations use the download page. Replacing the app keeps existing conversations and settings.', 'Data lives in ~/.aiolm on Mac/Linux or %USERPROFILE%\\.aiolm on Windows, unless AIOLM_HOME selects another folder. Back up that folder and your model files.', 'The Windows EXE (NSIS) uninstaller can explicitly delete app data. MSI and DEB removal, or moving the Mac app to Trash, leave data in place.'] }, { title: 'What update testing has covered', body: ['v0.3.2 package checks passed. Actual v0.3.1 → v0.3.2 update installation and device UI acceptance are still pending.'] }] },
    ] },
    'getting-started': { title: 'Start your first conversation', description: "A model is the AI data; an engine runs it. Choose an engine that fits your device and model format, then follow these steps.", sections: [
      { id: 'language', title: '1. Choose your language', body: ['Select your language and Continue. This is the first screen on a fresh installation. If you have already finished setup, skip to step 4.'], image: 'language', caption: 'Buttons and explanations switch to the language you choose.' },
      { id: 'theme', title: '2. Choose the screen colors', body: ['Pick Light, Dark or System, then Continue. You can change this later in Settings.'], image: 'theme', caption: 'Selecting a theme previews it immediately.' },
      { id: 'folder', title: '3. Choose where models are saved', body: ['Keep the default folder, or use Choose folder to pick another location. Select Start using AioLM to enter the workspace. You do not need a model file yet.'], image: 'folder', caption: 'Do not copy this example path. Choose a folder on your own computer.' },
      {"id":"engine","title":"4. Prepare the engine","body":["Open Inference engines and compare OS, device and model-format requirements before choosing an engine. Install the selected runtime if needed; for a separately installed engine, follow the external connection guide."],"image":"llama-install","caption":"The llama.cpp CPU screen illustrates where the Install button is. It is not a preferred-engine recommendation or verification of other engines.","note":"A runtime is an installed copy of an engine. Check “Choose an engine for your computer” and “Find the files for your engine” first."},
      {"id":"download","title":"5. Download one small model","body":["Open Discover, select a format supported by your chosen engine and search for a model. Open a repository to see its files. Check whether the engine needs one file or a complete model folder.","Start with a small text model. Select Download next to a file and wait until it finishes. Check the model’s license and memory requirements too."],"image":"model-files","caption":"A GGUF example showing model search and download controls. Download the format and complete files required by your selected engine."},
      { id: 'library', title: '6. Find the downloaded file', body: ['Open Run a model on the left. Select your downloaded filename to open its settings. If it is missing, check that Models directory points to your download folder, then Rescan.'], image: 'model-library', caption: 'Select your own downloaded filename in the model list, rather than copying the example name.' },
      { id: 'model', title: '7. Select the downloaded model', body: ['Open Run a model and select the downloaded file. In Model & settings, choose your installed engine and runtime, then follow Choose profile and Adjust options. A profile is a saved group of settings; start with Default.', 'Keep the defaults to begin with. Review required items and select the run action. If something is not ready, follow the explanation in the window first.'], image: 'model-settings', caption: 'Select step 1, Choose runtime, at the top to open this view. Choose your installed item on the right. The displayed installation state is illustrative.', more: [{ title: 'The model does not load', body: ['Check that the model matches the engine and fits in your computer’s memory. Read the readiness message and engine log first. Avoid changing unfamiliar options at random.', 'Context is how much conversation the AI can consider at once. Setting it too high can exhaust memory. Changing context, parallelism or launch options requires restarting the model.'] }] },
      { id: 'chat', title: '8. Send a short message', body: ['After loading the model, select Chat on the left. Type a short question in the box below and select Send message.', 'Check text chat first. Images, audio, video and tools work only when both the model and engine support them.'], image: 'chat', caption: 'This shows the message box before a model is loaded, so sending is disabled. Run your model in step 7 first.', more: [{ title: 'Measure speed or share a result', body: ['A benchmark measures processing speed. Compare the same method and workload; a high score does not verify answer quality or every device feature.', 'Sharing is optional and requires browser verification. Review the public data first. Keep your recovery code or backup file private so you can manage the record without an account. Open Manage from the app or use this site’s Manage page.'] }] },
    ] },
    compatibility: { title: 'Choose an engine for your computer', description: "Compare your OS, device, memory and model format before choosing an engine. Check installation requirements and actual verification status together.", sections: [
      { id: 'engines', title: 'Open the engine list', body: ['Select Inference engines on the left. Avoid an engine marked Unavailable on this device.'], image: 'engines', caption: 'Built-in engines still need to be installed. An item appearing in this list does not mean it is installed.' },
      {"id":"choose","title":"Which engine should I choose?","table":{"headers":["Engine","Choose it when…"],"rows":[["llama.cpp","Using GGUF with a supported Windows, Mac or Linux build"],["vLLM","You have a supported Linux accelerator setup"],["vLLM · vllm-metal","Using vLLM on an Apple silicon Mac with macOS 15+"],["MLX","Using MLX models on an Apple silicon Mac"],["External inference engine","Examples: Strata, TensorFold. Prepare a separately installed engine and a compatible adapter."]]},"note":"Intel Macs cannot use MLX or vllm-metal. Check the installation screen’s requirements first."},
      { id: 'models', title: 'Download the right model type', body: ['llama.cpp uses GGUF files. vLLM and MLX usually need a complete model folder with weights, settings and tokenizer files. Do not copy just one file; choose the right format in Discover.', 'If memory is limited, try a smaller model. For images or audio, check both the model description and the support shown in the app.'], image: 'discover', caption: 'Choose the engine and model format at the top of Discover first.', more: [{ title: 'Detailed vLLM and MLX requirements', body: ['Managed Linux vLLM installs CUDA dependencies. AMD ROCm needs a separately prepared compatible Python environment and driver. AioLM does not install system GPU drivers.', 'vllm-metal needs Apple silicon, macOS 15+ and native arm64 Python 3.12; Intel and Rosetta Python are not supported. MLX also needs Apple silicon and a compatible Python environment.', 'Native Windows vLLM, WSL and remote servers are not local runtime targets here. Python models need a complete safetensors or supported MLX snapshot. vllm-metal supports only a subset of GGUF files, not all ordinary GGUF models.'] }] },
      { id: 'limits', title: 'What still needs checking', body: ['Images, audio, video and tools need support from both the engine and model. Registering an engine does not enable every feature.'], more: [{ title: 'v0.3.2 verification limits and known issues', body: ['The SmolVLM image/video content-quality failure (F09) is unresolved.', 'Passing a package build does not verify inference on every device. Overall Linux acceptance and real v0.3.1 → v0.3.2 update installation/UI acceptance are not complete.', 'Benchmarks, deep verification and portable bundles have engine-specific support. External inference engines (custom.*) are not accepted by the current public benchmark-sharing contract.'] }] },
    ] },
    adapters: {
      "title": "Connect an external inference engine",
      "description": "External inference engines are programs you install separately and connect to AioLM. Strata and TensorFold are examples, subject to the same setup and compatibility checks as any other external engine. They are not built in or installed automatically.",
      "sections": [
        {
          "id": "prepare",
          "links": [{"href": "/en/guides/external-engines", "label": "Find the files for your engine"}],
          "title": "Check what the connection needs",
          "body": [
            "Prepare the engine and its AioLM adapter. The adapter lets AioLM start the engine, check the selected model and exchange messages.",
            "The engine or a bridge must provide OpenAI-compatible HTTP/SSE and respond to an AioLM model compatibility probe. Engines meeting this contract do not need their names added to the app. Selecting an arbitrary executable does not make it compatible."
          ]
        },
        {
          "id": "files",
          "title": "Which file should I choose?",
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
                "In manual registration, select the actual server, for example llama-server.exe or llama-server. Do not select an installer or app shortcut."
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
          "note": "You do not need to create *.engine.json for manual registration. AioLM builds the registration from the completed form and saves it internally after Register succeeds; it does not export a separate .engine.json. Selecting an executable alone generates neither input JSON. Changing a JSON filename does not change its contents."
        },
        {
          "id": "add",
          "title": "1. Add an inference engine",
          "body": [
            "Stop running models, then select Inference engines → Add inference engine. Continue to step 2 if you have a setup file, or step 3 otherwise."
          ],
          "image": "adapter-add",
          "caption": "Add a new external engine here. No vendor selection is required."
        },
        {
          "id": "setup",
          "title": "2. Import a connection setup, if available",
          "steps": [
            "Select Import AioLM connection setup (.json) and choose the AioLM *.setup.json from the unpacked folder.",
            "Fill in the requested executable, folders and files as the provider instructs. Review the command and select Check installation and continue. Continue to step 4."
          ],
          "code": "Unpacked adapter folder/\n  engine.setup.json  ← select when importing\n  prepare.py        ← keep together\n  probe.py          ← keep together",
          "more": [
            {
              "title": "What if I did not receive a setup file?",
              "body": [
                "Ask the provider for an AioLM setup v1 JSON, companion setup/probe programs, supported OS/Python/model formats and the exact executable to select. If there is no adapter, a developer must implement the common connection contract. The same requirement applies to Strata and TensorFold."
              ]
            }
          ]
        },
        {
          "id": "manual",
          "title": "3. Register manually without a setup file",
          "body": [
            "Under Executable or interpreter, select Browse and choose the program listed in the table above. Use Add file argument for a Python script; for a module, use Add argument to enter -m and the actual module name in separate fields.",
            "Choose a display name, an engine ID in custom.* format, such as custom.my-engine and a runtime ID such as local-1, then select Next. Ask the provider first if you do not know the model/port options or probe command."
          ],
          "image": "adapter-setup",
          "caption": "Preview of the manual-registration form in an unreleased source update. Example Engine and its paths are illustrative; select your actual files. This is not an inference result.",
          "more": [
            {
              "title": "Direct server or bridge?",
              "body": [
                "Select direct HTTP if the engine provides OpenAI-compatible HTTP/SSE. Otherwise select a separate bridge and enter its program, arguments and engine JSON argv environment variable as its provider instructs. Ordinary console input/output does not become an HTTP server automatically."
              ]
            },
            {
              "title": "Example: starting a Python module",
              "body": [
                "If the provider’s command is “python -m vendor_engine.serve”, choose that Python and enter two separate arguments. Replace vendor_engine.serve with the real installed module."
              ],
              "code": "Executable: installed environment’s python.exe or bin/python\nArgument 1: -m\nArgument 2: vendor_engine.serve"
            }
          ]
        },
        {
          "id": "help",
          "title": "4. Check the launch command",
          "body": [
            "Select Discover help to read the selected program’s options. If it fails, check the file, Python environment and required libraries. Successful help discovery does not prove model inference."
          ],
          "image": "adapter-help",
          "caption": "Review help for the selected command. This screenshot is not evidence of successful execution."
        },
        {
          "id": "check",
          "title": "5. Check model bindings and the probe",
          "body": [
            "Match the model and port options to the provider’s instructions. Do not assume every engine uses --model and --port. Review imported values too.",
            "For Compatibility check program, select an AioLM-compatible probe. For a Python probe, select Python and add the probe.py path and placeholders such as {model} as separate arguments. An ordinary engine executable is not a substitute for a probe."
          ],
          "image": "adapter-check",
          "caption": "Model/port bindings are above; probe, health checks and model formats are below. The example probe.py is not a bundled file.",
          "more": [
            {
              "title": "The common contract for developers",
              "body": [
                "The probe reports schema_version: 1, the registered engine_id/runtime_id, model path, support and capabilities as JSON. Unsupported models must remain failures. HTTP/SSE, health path and model/port/auth bindings must match the real server. A display name or renamed extension cannot replace this contract."
              ]
            }
          ]
        },
        {
          "id": "review",
          "title": "6. Register and run a real model",
          "steps": [
            "Select Review registration details → Register. After it succeeds, AioLM automatically saves the connection details in the app. In model selection, choose the new engine/runtime and a supported model file or complete model folder.",
            "Run it after model compatibility checks pass. Check a short answer, cancellation followed by another question, stopping and restarting."
          ],
          "image": "adapter-review",
          "caption": "Review the common registration details. Successful registration and successful inference are separate checks."
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
            "This is CLI evidence for that Linux CPU combination. It does not establish actual Strata/TensorFold inference or compatibility with every external engine. Screenshots use example data. Native app UI, actual update installation and overall Linux acceptance were not completed by this check."
          ],
          "more": [
            {
              "title": "Reproduction details",
              "report": {"href": "/verification/external-cpu-2026-10-28.json", "label": "View execution evidence (JSON)"},
              "body": [
                "Server: ggml-org/llama.cpp b11669. Model revision: 9217f5db79a29953eb74d5343926648285ec7e67. Verified official archive/model SHA-256 and 41 model/dependency files, including that external files stayed unchanged. All A01–A09 checks passed under normal process reaping. The initial container reaping failure remains recorded separately. F09 is still unresolved."
              ]
            }
          ]
        }
      ]
    },
    'external-engines': {
      "title": "Find the files for your engine",
      "description": "These 16 engines are required connection targets. This does not mean they are installed or all verified. Expand your engine to find the relevant program and model files.",
      "sections": [
        {
          "id": "choose",
          "title": "Select your engine",
          "body": [
            "This is not an installation menu. Every external engine must meet the same connection contract and actual execution checks, including Strata and TensorFold.",
            "Command examples below explain launch order. In AioLM registration, set model/host/port through their dedicated bindings rather than duplicating these options and values in fixed arguments."
          ],
          "more": [
            {
              "title": "1. Halogen",
              "body": [
                "Requirements: Strix Halo · Linux · ROCm",
                "Executable to select: podman / docker + Halogen image",
                "Model files: The model-specific weight/tokenizer/auxiliary package; do not assume ordinary GGUF compatibility",
                "The executable inside a container cannot be selected in a normal host file picker. A lifecycle adapter must manage the image, GPU devices, model mounts and container shutdown; no such package is provided yet.",
                "Current verification: Actual inference unverified here; not complete support"
              ],
              "links": [
                {
                  "href": "https://github.com/peonist-ai/halogen-server",
                  "label": "Official project · peonist-ai/halogen-server"
                },
                {
                  "href": "https://github.com/peonist-ai/halogen-flash-server",
                  "label": "Official project · peonist-ai/halogen-flash-server"
                }
              ]
            },
            {
              "title": "2. Strixite",
              "body": [
                "Requirements: Strix Halo · Linux",
                "Executable to select: build/strix/strix_server",
                "Model files: The model-specific weight/tokenizer/auxiliary package; do not assume ordinary GGUF compatibility",
                "Requires launch/model/port bindings and an AioLM probe. Arguments below illustrate placement; replace MODEL/HOST/PORT with selected values.",
                "Current verification: Actual inference unverified here; not complete support"
              ],
              "links": [
                {
                  "href": "https://github.com/shawnshekari/strixite",
                  "label": "Official project · shawnshekari/strixite"
                }
              ],
              "code": "Entry point example: --config DEDICATED_CONFIG"
            },
            {
              "title": "3. MLX (mlx-lm / MLX-VLM)",
              "body": [
                "Requirements: Apple Silicon · macOS",
                "Executable to select: Python from the selected server’s environment",
                "Model files: Complete local checkpoint with weights, configuration and tokenizer",
                "Requires launch/model/port bindings and an AioLM probe. Arguments below illustrate placement; replace MODEL/HOST/PORT with selected values.",
                "Current verification: Actual inference unverified here; not complete support",
                "mlx-lm and MLX-VLM use different server modules. Validate text/image support for the specific model and module.",
                "Use only the alternative matching the server you installed. Do not put both module names into one command."
              ],
              "links": [
                {
                  "href": "https://github.com/ml-explore/mlx-lm",
                  "label": "Official project · ml-explore/mlx-lm"
                },
                {
                  "href": "https://github.com/Blaizzy/mlx-vlm",
                  "label": "Official project · Blaizzy/mlx-vlm"
                }
              ],
              "code": "Python + mlx-lm:\n-m\nmlx_lm.server\n\nPython + MLX-VLM:\n-m\nmlx_vlm.server"
            },
            {
              "title": "4. ExLlamaV3 (ExLlamaV2)",
              "body": [
                "Requirements: NVIDIA GPU · supported CUDA environment",
                "Executable to select: TabbyAPI environment Python + main.py",
                "Model files: Complete EXL3 folder for V3, or EXL2/other supported formats for V2",
                "Use the server rather than a desktop app or library. A matching adapter must connect configuration, model/port choices and process ownership; no general connection package is provided yet.",
                "Current verification: Actual inference unverified here; not complete support",
                "TabbyAPI is the officially recommended server. Do not select an exllamav3/exllamav2 library file or CUDA DLL as the executable."
              ],
              "links": [
                {
                  "href": "https://github.com/turboderp-org/exllamav3",
                  "label": "Official project · turboderp-org/exllamav3"
                },
                {
                  "href": "https://github.com/turboderp-org/exllamav2",
                  "label": "Official project · turboderp-org/exllamav2"
                },
                {
                  "href": "https://github.com/theroyallab/tabbyAPI",
                  "label": "Official project · theroyallab/tabbyAPI"
                }
              ],
              "code": "Entry point example: main.py"
            },
            {
              "title": "5. Rulith Inference",
              "body": [
                "Requirements: Strix Halo · Windows 11; Linux build is separate",
                "Executable to select: bin/hip/llama-server.exe",
                "Model files: A GGUF file supported by that engine and any required companion files",
                "Use the server rather than a desktop app or library. A matching adapter must connect configuration, model/port choices and process ownership; no general connection package is provided yet.",
                "Current verification: Actual inference unverified here; not complete support",
                "Use the patched server, rather than the Rulith desktop EXE. Its ROCm DLLs, environment and model layout must also match."
              ],
              "links": [
                {
                  "href": "https://github.com/rulith-dev/rulith-inference",
                  "label": "Official project · rulith-dev/rulith-inference"
                }
              ]
            },
            {
              "title": "6. SGLang",
              "body": [
                "Requirements: supported SGLang device/build · Linux",
                "Executable to select: installed Python",
                "Model files: Complete local checkpoint with weights, configuration and tokenizer",
                "Requires launch/model/port bindings and an AioLM probe. Arguments below illustrate placement; replace MODEL/HOST/PORT with selected values.",
                "Current verification: Actual inference unverified here; not complete support"
              ],
              "links": [
                {
                  "href": "https://github.com/sgl-project/sglang",
                  "label": "Official project · sgl-project/sglang"
                }
              ],
              "code": "Entry point example: -m sglang.launch_server"
            },
            {
              "title": "7. vLLM",
              "body": [
                "Requirements: supported vLLM device/build · Linux; vllm-metal is separate",
                "Executable to select: vllm / Python from the selected server’s environment",
                "Model files: Complete local checkpoint with weights, configuration and tokenizer",
                "Requires launch/model/port bindings and an AioLM probe. Arguments below illustrate placement; replace MODEL/HOST/PORT with selected values.",
                "Current verification: Actual inference unverified here; not complete support",
                "Use the alternative matching the selected executable. Replace MODEL with the actual model path; the Python route requires the -m module arguments."
              ],
              "links": [
                {
                  "href": "https://github.com/vllm-project/vllm",
                  "label": "Official project · vllm-project/vllm"
                }
              ],
              "code": "vllm:\nserve\nMODEL\n\nPython:\n-m\nvllm.entrypoints.openai.api_server\n--model\nMODEL"
            },
            {
              "title": "8. Strata",
              "body": [
                "Requirements: supported Windows/Linux engine build",
                "Executable to select: installed Python + matching adapter",
                "Model files: A dedicated deployment JSON for the reviewed revision and all files it references",
                "Use the server rather than a desktop app or library. A matching adapter must connect configuration, model/port choices and process ownership; no general connection package is provided yet.",
                "Current verification: Actual inference unverified here; not complete support",
                "The existing SDK example is limited to source 296b59d2f73c8f04a805df29c2fa97655adace78. This is not support for the current Strata launch command."
              ],
              "links": [
                {
                  "href": "https://github.com/Niko1221/Strata",
                  "label": "Official project · Niko1221/Strata"
                }
              ],
              "code": "Entry point example: -m serve.server"
            },
            {
              "title": "9. TensorFold",
              "body": [
                "Requirements: supported Metal / CUDA / Vulkan build",
                "Executable to select: tensorfold",
                "Model files: Complete local checkpoint with weights, configuration and tokenizer",
                "Requires launch/model/port bindings and an AioLM probe. Arguments below illustrate placement; replace MODEL/HOST/PORT with selected values.",
                "Current verification: Actual inference unverified here; not complete support"
              ],
              "links": [
                {
                  "href": "https://github.com/ashhart/TensorFold",
                  "label": "Official project · ashhart/TensorFold"
                }
              ],
              "code": "Entry point example: serve MODEL"
            },
            {
              "title": "10. vllm.cpp",
              "body": [
                "Requirements: matching CPU / CUDA / Metal / Vulkan / ROCm build",
                "Executable to select: bin/vllm-server",
                "Model files: Supported GGUF or full checkpoint; check quantization and model architecture too",
                "Requires launch/model/port bindings and an AioLM probe. Arguments below illustrate placement; replace MODEL/HOST/PORT with selected values.",
                "Current verification: One pinned Linux CPU/model CLI lifecycle passed; not a general adapter release or all-device validation",
                "v0.0.2 CPU passed with Qwen3.5-0.8B Q8_0 and an explicit official tokenizer_config.json via --tokenizer-config. Qwen2.5 loader failures remain failures. The malformed repeating answer without a template was not accepted."
              ],
              "links": [
                {
                  "href": "https://github.com/localai-org/vllm.cpp",
                  "label": "Official project · localai-org/vllm.cpp"
                },
                {
                  "href": "/verification/vllm-cpp-cpu-2026-10-28.json",
                  "label": "View execution evidence"
                }
              ],
              "code": "Entry point example: --model MODEL"
            },
            {
              "title": "11. Mistral.rs",
              "body": [
                "Requirements: matching CPU / CUDA / Metal build",
                "Executable to select: mistralrs",
                "Model files: Supported GGUF or full checkpoint; check quantization and model architecture too",
                "Requires launch/model/port bindings and an AioLM probe. Arguments below illustrate placement; replace MODEL/HOST/PORT with selected values.",
                "Current verification: One pinned Linux CPU/model CLI lifecycle passed; not a general adapter release or all-device validation"
              ],
              "links": [
                {
                  "href": "https://github.com/EricLBuehler/mistral.rs",
                  "label": "Official project · EricLBuehler/mistral.rs"
                },
                {
                  "href": "/verification/mistralrs-cpu-2026-10-28.json",
                  "label": "View execution evidence"
                }
              ],
              "code": "Entry point example: serve"
            },
            {
              "title": "12. KTransformers",
              "body": [
                "Requirements: supported CPU + accelerator combination",
                "Executable to select: installed Python + SGLang/kt-kernel",
                "Model files: Full SGLang model plus kt-kernel expert weights and configuration",
                "Requires launch/model/port bindings and an AioLM probe. Arguments below illustrate placement; replace MODEL/HOST/PORT with selected values.",
                "Current verification: Actual inference unverified here; not complete support"
              ],
              "links": [
                {
                  "href": "https://github.com/kvcache-ai/ktransformers",
                  "label": "Official project · kvcache-ai/ktransformers"
                }
              ],
              "code": "Entry point example: -m sglang.launch_server"
            },
            {
              "title": "13. ik_llama.cpp",
              "body": [
                "Requirements: matching CPU / CUDA / Vulkan build",
                "Executable to select: build/bin/llama-server",
                "Model files: A GGUF file supported by that engine and any required companion files",
                "Requires launch/model/port bindings and an AioLM probe. Arguments below illustrate placement; replace MODEL/HOST/PORT with selected values.",
                "Current verification: Actual inference unverified here; not complete support"
              ],
              "links": [
                {
                  "href": "https://github.com/ikawrakow/ik_llama.cpp",
                  "label": "Official project · ikawrakow/ik_llama.cpp"
                }
              ]
            },
            {
              "title": "14. Mullama",
              "body": [
                "Requirements: matching CPU / GPU build",
                "Executable to select: mullama",
                "Model files: A GGUF file supported by that engine and any required companion files",
                "Requires launch/model/port bindings and an AioLM probe. Arguments below illustrate placement; replace MODEL/HOST/PORT with selected values.",
                "Current verification: Actual inference unverified here; not complete support"
              ],
              "links": [
                {
                  "href": "https://github.com/cognisoc/mullama",
                  "label": "Official project · cognisoc/mullama"
                }
              ],
              "code": "Entry point example: serve --model MODEL"
            },
            {
              "title": "15. llama.cpp",
              "body": [
                "Requirements: matching Windows / macOS / Linux build",
                "Executable to select: llama-server.exe / llama-server",
                "Model files: A GGUF file supported by that engine and any required companion files",
                "Requires launch/model/port bindings and an AioLM probe. Arguments below illustrate placement; replace MODEL/HOST/PORT with selected values.",
                "Current verification: One pinned Linux CPU/model CLI lifecycle passed; not a general adapter release or all-device validation"
              ],
              "links": [
                {
                  "href": "https://github.com/ggml-org/llama.cpp",
                  "label": "Official project · ggml-org/llama.cpp"
                },
                {
                  "href": "/verification/external-cpu-2026-10-28.json",
                  "label": "View execution evidence"
                }
              ]
            },
            {
              "title": "16. Gufo",
              "body": [
                "Requirements: Strix Halo · Linux x86_64",
                "Executable to select: gufo",
                "Model files: A GGUF file supported by that engine and any required companion files",
                "Requires launch/model/port bindings and an AioLM probe. Arguments below illustrate placement; replace MODEL/HOST/PORT with selected values.",
                "Current verification: Actual inference unverified here; not complete support",
                "Host/port belong to serve; model belongs to llm. A manifest or bridge must preserve that order."
              ],
              "links": [
                {
                  "href": "https://github.com/gufo-org/gufo",
                  "label": "Official project · gufo-org/gufo"
                }
              ],
              "code": "Entry point example: serve --host HOST --port PORT llm --model MODEL"
            }
          ]
        },
        {
          "id": "rules",
          "title": "A listed engine is not automatically ready",
          "body": [
            "Executables, configurations and models have different roles. Do not select an arbitrary library or installer. Entries without a compatible adapter first need AioLM setup/probe programs, any required bridge, and validation."
          ]
        },
        {
          "id": "verification",
          "title": "What counts as complete support?",
          "body": [
            "Check registration, actual help and exact arguments, the selected-model probe, real HTTP/SSE output and usage, cancellation followed by another question, stop/restart, removal/re-registration, and process/port cleanup. Dedicated GPU configurations that have not been executed stay unverified."
          ]
        }
      ]
    },
  },
};
export default content;
