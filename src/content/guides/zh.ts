import type { GuideContent } from './types';
const content: GuideContent = {
  title: 'AioLM 使用指南', description: '第一次使用？先安装应用，再对照图片逐个点击按钮，在自己的电脑上开始 AI 对话。',
  navigation: '使用指南', onPage: '跳转到', related: '接着看', download: '查看全部下载文件',
  screenshotNotice: '图片使用 v0.3.2 的真实界面和示例数据。名称、路径和安装状态仅供说明，不是实际安装或模型运行的验证记录。',
  enlarge: '放大查看', close: '关闭',
  panHint: '左右滑动可查看图片其他部分。',
  guides: {
    install: { title: '安装应用', description: '只需按照自己电脑的 Windows、Mac 或 Linux 部分操作，其他两部分可以跳过。', sections: [
      { id: 'windows', title: '在 Windows 上安装', downloads: 'windows', steps: ['下载下方的 x64-setup.exe。个人电脑通常选择这个文件。', '双击下载的文件，按安装窗口提示完成操作。', '完成后从开始菜单打开 AioLM。'], note: '安装程序没有发布者签名，Windows 可能显示安全警告。确认文件来自 AioLM 官方发布后再继续。', more: [{ title: '什么时候使用 MSI？', body: ['公司或学校的部署工具、Windows Installer 有要求时才使用 MSI。个人安装请选择上方 EXE。安装包适用于 Windows x64。'] }] },
      { id: 'macos', title: '在 Mac 上安装', downloads: 'macos', steps: ['打开 Apple 菜单 → 关于本机。芯片显示 Apple M1、M2 等时选择 aarch64.dmg；处理器显示 Intel 时选择 x64.dmg。', '打开 DMG，将 AioLM 拖到“应用程序”文件夹。', '打开 AioLM。如果被阻止，先尝试打开一次，再前往系统设置 → 隐私与安全性 → 仍要打开。'], note: '需要 macOS 13.3 或更新版本。应用采用 ad-hoc 签名，未经 Apple 公证。macOS 13–14 还可按住 Control 点按应用 → 打开。' },
      { id: 'linux', title: '在 Linux 上安装', downloads: 'linux', body: ['适用于 Ubuntu 24.04+ 的 x86_64 电脑。第一次使用建议选择 DEB。'], steps: ['双击下载的 DEB，打开系统的软件包安装窗口。如果没有关联的安装程序，请使用下方命令。', '完成后从应用菜单打开 AioLM。'], more: [{ title: '点击 DEB 后没有安装窗口', body: ['在下载目录打开终端。目录中只保留要安装的那一个版本的 DEB，然后运行：'], code: 'sudo apt install ./AioLM_*_amd64.deb' }, { title: '使用 AppImage，不安装软件包', body: ['将 AppImage 放在固定目录，运行下方命令。移动文件后需要重新注册菜单入口。', '如需菜单入口，从同一版本下载并验证 register-linux-desktop.py，然后运行 python3 register-linux-desktop.py --appimage <文件>。切换到 DEB 前用 --remove 移除入口。需要 Python 3。'], code: 'sudo apt install libgomp1 libfuse2t64\nchmod +x ./AioLM_*.AppImage\n./AioLM_*.AppImage' }] },
      { id: 'first-open', title: '应用打开后', body: ['看到下方语言选择界面就准备好了。选择简体中文并点击继续。已有设置的用户会直接进入工作区。'], image: 'language', caption: '首次打开默认是 English。选择语言后，接着阅读“开始第一次对话”。' },
      { id: 'verify', title: '检查下载文件', body: ['请使用官方下载文件。如需进一步确认文件没有损坏，可展开下面的方法。'], more: [{ title: '用校验和检查文件', body: ['从安装包所在的同一版本下载 checksums.txt。校验和是文件的识别值。将命令的完整结果与相同文件名的 SHA-256 比较；不一致就停止安装。校验和不能代替发布者签名。', 'Windows 请将下方文件名换成实际下载的名称。Mac 使用 shasum -a 256 加文件路径，Linux 使用 sha256sum。'], code: 'Get-FileHash -Algorithm SHA256 .\\AioLM_0.3.2_x64-setup.exe' }] },
      { id: 'updates', title: '以后如何更新', body: ['打开左侧设置 → 常规，点击检查更新。如有新版本，先保存工作，再选择下载并安装。完成系统安装程序后重新打开 AioLM。'], image: 'updates', caption: '设置中的应用更新区域。此示例已经在使用 v0.3.2。', more: [{ title: '备份、卸载和手动更新', body: ['Mac DMG 请替换原来的应用。AppImage 和手动安装请使用下载页面。替换应用会保留对话和设置。', '数据位于 Mac/Linux 的 ~/.aiolm、Windows 的 %USERPROFILE%\\.aiolm，或 AIOLM_HOME 指定的位置。请备份该目录及模型文件。', 'Windows EXE（NSIS）卸载程序可明确选择删除应用数据。MSI、DEB 卸载和将 Mac 应用移到废纸篓会保留数据。'] }, { title: '更新验证范围', body: ['v0.3.2 安装包检查已通过。真实的 v0.3.1 → v0.3.2 更新安装和设备 UI 验收尚未完成。'] }] },
    ] },
    'getting-started': { title: '开始第一次对话', description: '模型是用来对话的 AI 文件，引擎是运行它的程序。第一次使用可从 llama.cpp 和一个小型文本模型开始。', sections: [
      { id: 'language', title: '1. 选择语言', body: ['选择简体中文并点击继续。首次安装会从这里开始；已经完成设置的用户可跳到第 4 步。'], image: 'language', caption: '按钮和说明会随所选语言一起切换。' },
      { id: 'theme', title: '2. 选择界面颜色', body: ['选择浅色、深色或跟随系统，然后继续。以后可以在设置中更改。'], image: 'theme', caption: '选中主题后可立即预览。' },
      { id: 'folder', title: '3. 选择模型保存位置', body: ['保留默认目录，或点击选择文件夹换一个位置。点击开始使用 AioLM 进入工作区。现在还没有模型文件也没关系。'], image: 'folder', caption: '不要照抄示例路径，请选择自己电脑上的目录。' },
      { id: 'engine', title: '4. 准备运行 AI 的引擎', body: ['点击左侧推理引擎，再选择 llama.cpp。找到适合电脑的推荐项，点击安装并等待完成。'], image: 'llama-install', caption: '示例是不用显卡的 CPU 选项。你的电脑可能显示不同的推荐项和版本。', note: '运行时指已安装的引擎程序。想使用 vLLM 或 MLX，请先阅读“选择适合电脑的引擎”。' },
      { id: 'download', title: '5. 下载一个小模型', body: ['打开左侧模型搜索页面，选择 llama.cpp 和 GGUF 后搜索。点击一个仓库，右侧会出现文件列表。', '先选择较小的文本模型，点击文件旁的下载并等待完成。同时检查模型的使用许可和内存要求。'], image: 'model-files', caption: '此处演示搜索和下载的位置，不代表图中模型的兼容性或回答质量已经验证。' },
      { id: 'library', title: '6. 找到下载的文件', body: ['打开左侧模型运行页面，点击下载的文件名进入设置。找不到时，请确认模型目录是下载保存的位置，再重新扫描。'], image: 'model-library', caption: '在模型列表中点击自己下载的文件名，不要照抄示例名称。' },
      { id: 'model', title: '7. 选择下载的模型', body: ['在模型运行页面点击下载的文件。在模型选择与设置中选择已安装的引擎和运行时，再按选择预设、调整选项的顺序继续。预设是一组保存的设置，第一次选择默认即可。', '先保留默认值。检查必填项后点击运行。如果有尚未就绪的项目，请先按窗口显示的原因解决。'], image: 'model-settings', caption: '点击顶部第 1 步的运行时选择打开此窗口，在右侧选择已安装的项目。图中的安装状态仅供说明。', more: [{ title: '模型无法加载怎么办？', body: ['检查模型是否适合所选引擎、内存是否足够。先读就绪提示和引擎日志，不要随意更改不熟悉的选项。', '上下文是 AI 一次可以参考的对话量，设置过大会耗尽内存。更改上下文、并行数或启动选项后需要重启模型。'] }] },
      { id: 'chat', title: '8. 发送一句简短的话', body: ['模型加载后点击左侧聊天，在下方输入框写一个简短问题并发送。', '先确认文本对话正常。图片、音频、视频和工具必须同时得到模型和引擎的支持。'], image: 'chat', caption: '此图用于定位输入框。模型尚未加载，发送处于禁用状态；请先完成第 7 步。', more: [{ title: '想测量速度或分享结果', body: ['基准测试测的是处理速度，请比较相同测量方法和任务的结果。分数高不代表回答质量或所有设备功能已经验证。', '分享是可选操作，需要浏览器验证。先检查公开内容，私下保管恢复码或备份文件，以便不注册账户也能管理记录。从应用打开管理页面，或使用本站的管理页面。'] }] },
    ] },
    compatibility: { title: '选择适合电脑的引擎', description: '拿不准就从 llama.cpp 开始。vLLM、MLX 和其他引擎会根据电脑与模型要求不同的准备。', sections: [
      { id: 'engines', title: '打开引擎列表', body: ['点击左侧推理引擎。标有“此设备不可用”的引擎不要选择。'], image: 'engines', caption: '内置引擎也需要先安装。出现在列表中并不表示已经安装。' },
      { id: 'choose', title: '应该选哪一个？', table: { headers: ['引擎', '适用情况'], rows: [['llama.cpp', '在 Windows、Mac 或 Linux 上从 GGUF 开始'], ['vLLM', '已经准备好受支持的 Linux 加速器环境'], ['vLLM · vllm-metal', '在 Apple 芯片 Mac、macOS 15+ 上使用 vLLM'], ['MLX', '在 Apple 芯片 Mac 上使用 MLX 模型'], ["外部推理引擎", '例如 Strata、TensorFold。先单独安装引擎并准备兼容适配器']] }, note: 'Intel Mac 无法使用 MLX 或 vllm-metal，请先检查安装界面的要求。' },
      { id: 'models', title: '下载匹配格式的模型', body: ['llama.cpp 使用 GGUF 文件。vLLM 和 MLX 通常需要包含模型、配置和 tokenizer 的完整目录。不要只复制一个文件，请在搜索页面选择正确格式。', '内存不足时尝试更小的模型。需要图片或音频时，同时检查模型说明和应用显示的支持情况。'], image: 'discover', caption: '先在搜索页面顶部选择引擎和模型格式。', more: [{ title: 'vLLM 和 MLX 的详细条件', body: ['Linux 托管 vLLM 安装 CUDA 依赖。AMD ROCm 需要另外准备与驱动匹配的 Python 环境并注册。AioLM 不安装系统显卡驱动。', 'vllm-metal 需要 Apple 芯片、macOS 15+ 和原生 arm64 Python 3.12，不支持 Intel 和 Rosetta Python。MLX 也需要 Apple 芯片及兼容 Python 环境。', '原生 Windows vLLM、WSL 和远程服务器不是此应用的本地运行目标。Python 模型需要完整 safetensors 或受支持的 MLX 快照。vllm-metal 只支持部分 GGUF，不能等同于普通 GGUF 支持。'] }] },
      { id: 'limits', title: '仍需确认的地方', body: ['图片、音频、视频和工具需要模型与引擎同时支持。注册引擎不会自动启用所有功能。'], more: [{ title: 'v0.3.2 验证范围与已知问题', body: ['SmolVLM 图片、视频内容质量问题（F09）尚未解决。', '安装包构建通过，不表示所有设备上的推理都已验证。Linux 整体验证及真实的 v0.3.1 → v0.3.2 更新安装、UI 验收也尚未完成。', '基准、深度验证和便携包因引擎而异。外部推論エンジン custom.* 引擎目前不属于公开基准分享对象。'] }] },
    ] },
    adapters: {
      "title": "连接外部推理引擎",
      "description": "外部推理引擎是自行安装并连接到AioLM的程序。Strata和TensorFold也是此类示例，与其他外部引擎需要相同的连接设置和兼容性检查。它们不是内置或自动安装的引擎。",
      "sections": [
        {
          "id": "prepare",
          "links": [{"href": "/zh/guides/external-engines", "label": "各引擎的连接文件"}],
          "title": "先确认连接条件",
          "body": [
            "准备引擎和对应的AioLM适配器。适配器负责连接引擎启动、模型检查和消息收发。",
            "引擎本身或bridge必须提供OpenAI兼容HTTP/SSE，并响应AioLM模型兼容性检查（probe）。满足此通用约定即可，无需预先将引擎名称加入应用。选择任意可执行文件不代表自动兼容。"
          ]
        },
        {
          "id": "files",
          "title": "应该选择哪个文件？",
          "table": {
            "headers": [
              "已有内容",
              "选择文件与位置"
            ],
            "rows": [
              [
                "AioLM连接设置包",
                "先解压整个文件夹，在导入设置中选择*.setup.json，并保留所有配套文件。"
              ],
              [
                "服务器可执行程序",
                "在手动注册中选择真正的服务器，如llama-server.exe或llama-server。不要选择安装程序或应用快捷方式。"
              ],
              [
                "Python脚本或模块",
                "选择安装引擎所用环境中的python.exe（Windows）或bin/python（Mac/Linux），再在下方添加脚本或模块参数。"
              ],
              [
                "模型或普通配置",
                ".gguf、.safetensors模型在注册后的模型选择中指定。deployment.json等普通配置仅在适配器单独要求时选择；它不是AioLM连接设置。"
              ]
            ]
          },
          "note": "*.setup.json只是文件命名示例，内容必须符合AioLM setup v1格式。给普通JSON改名无法完成转换。"
        },
        {
          "id": "add",
          "title": "1. 添加推理引擎",
          "body": [
            "停止正在运行的模型，选择左侧推理引擎 → 添加推理引擎。有设置文件时继续第2步，否则跳到第3步。"
          ],
          "image": "adapter-add",
          "caption": "在此添加新的外部引擎，无需选择特定提供方。"
        },
        {
          "id": "setup",
          "title": "2. 有连接设置时导入",
          "steps": [
            "点击导入适配器设置，选择解压文件夹中的AioLM专用*.setup.json。",
            "按提供方说明指定程序、文件夹和文件，检查命令后点击检查安装并继续，然后进入第4步。"
          ],
          "code": "解压后的适配器文件夹/\n  engine.setup.json  ← 导入时选择\n  prepare.py        ← 一起保留\n  probe.py          ← 一起保留",
          "note": "v0.3.2的“查看随附适配器”只打开旧的Strata设置示例，不会搜索已安装引擎或安装引擎，也不是连接所必需的按钮。",
          "more": [
            {
              "title": "没有收到设置文件怎么办？",
              "body": [
                "向提供方索取AioLM setup v1 JSON、配套设置/probe程序、支持的OS/Python/模型格式及应选择的可执行文件。没有适配器时，需要开发者按通用约定实现连接。Strata和TensorFold也遵循相同条件。"
              ]
            }
          ]
        },
        {
          "id": "manual",
          "title": "3. 没有设置时手动注册",
          "body": [
            "在可执行文件或解释器 → 浏览中按上表选择程序。Python脚本使用添加文件参数；模块使用添加参数，将-m和实际模块名称分别填入两个参数栏。",
            "填写显示名称、引擎ID（custom.*格式，如custom.my-engine）和运行时ID（如local-1），然后点击下一步。不清楚模型/端口选项或probe时，请先向提供方确认。"
          ],
          "image": "adapter-setup",
          "caption": "已发布v0.3.2的通用手动注册界面。Example Engine和路径仅作示例，请选择实际文件。",
          "more": [
            {
              "title": "选择直接服务器还是bridge？",
              "body": [
                "引擎提供OpenAI兼容HTTP/SSE时选择直接提供，否则需要转换格式的bridge。选择独立bridge，并按提供方说明设置程序、参数和引擎JSON argv环境变量。普通控制台输入输出不会自动变成HTTP服务器。"
              ]
            },
            {
              "title": "Python模块启动示例",
              "body": [
                "若提供方命令为“python -m vendor_engine.serve”，选择对应Python，将参数分别填写。请将示例模块名替换为实际安装的模块。"
              ],
              "code": "可执行文件：环境中的python.exe或bin/python\n参数1：-m\n参数2：vendor_engine.serve"
            }
          ]
        },
        {
          "id": "help",
          "title": "4. 确认启动命令",
          "body": [
            "点击发现帮助以读取所选程序的选项。失败时检查文件、Python环境和必需依赖。帮助显示成功不等于模型推理成功。"
          ],
          "image": "adapter-help",
          "caption": "检查所选命令的帮助。此截图不是运行成功的证据。"
        },
        {
          "id": "check",
          "title": "5. 确认模型连接和兼容性检查",
          "body": [
            "按提供方说明设置模型和端口选项，不要假设所有引擎都使用--model和--port。导入的值也应检查。",
            "兼容性检查程序请选择AioLM专用probe。Python probe应选择Python，再将probe.py路径、{model}等分别添加为参数。普通引擎可执行文件不能代替probe。"
          ],
          "image": "adapter-check",
          "caption": "上方是模型/端口连接，下方是probe、健康检查和模型格式。示例probe.py不是应用附带文件。",
          "more": [
            {
              "title": "开发者需要满足的通用约定",
              "body": [
                "probe以JSON返回schema_version: 1、已注册的engine_id/runtime_id、模型路径、支持状态与能力。不支持的模型必须保持失败状态。HTTP/SSE、健康检查路径及模型/端口/认证传递方法须匹配实际服务器，不能通过显示名称或修改扩展名代替。"
              ]
            }
          ]
        },
        {
          "id": "review",
          "title": "6. 注册后运行实际模型",
          "steps": [
            "点击检查注册内容 → 注册，在模型选择中指定新引擎/运行时及支持的模型文件或完整模型文件夹。",
            "通过模型兼容性检查后运行，确认能回答简短问题、取消生成后再次提问、停止及重启。"
          ],
          "image": "adapter-review",
          "caption": "最后确认通用注册内容。注册成功和推理成功是两项不同的检查。"
        },
        {
          "id": "trouble",
          "title": "连接失败时",
          "more": [
            {
              "title": "找不到Python或文件",
              "body": [
                "请选择安装引擎所用环境中的Python。保留包含配套文件的完整文件夹，不要只移动JSON。程序或适配器移动/更改后，请重新导入、检查帮助和兼容性并注册。"
              ]
            },
            {
              "title": "已注册但模型无法运行",
              "body": [
                "检查模型格式、完整文件、内存和引擎依赖，查看兼容性结果与服务器错误日志。注册不会自动增加未支持的图片、音频或工具能力。"
              ]
            },
            {
              "title": "移除注册会删除引擎或模型吗？",
              "body": [
                "不会删除外部程序或模型文件。密钥应通过提供方说明的环境变量传递。外部引擎的公开基准分享、深度验证和便携包需要单独支持。"
              ]
            }
          ]
        },
        {
          "id": "verified",
          "title": "实际验证范围",
          "body": [
            "2026-10-28：使用公开v0.3.2 CLI，将外部CPU llama-server b11669注册为custom.independent-cpu并运行固定的Qwen2.5-0.5B模型。验证了实际回答“5”、token用量、流式取消、重启、移除/重新注册，以及关闭后的端口释放。",
            "此结果仅覆盖该Linux CPU组合的CLI，不证明Strata/TensorFold已实际推理成功或所有外部引擎均兼容。截图使用示例数据，本次检查未完成原生应用UI、实际更新安装或Linux整体验收。"
          ],
          "more": [
            {
              "title": "复现信息",
              "report": {"href": "/verification/external-cpu-2026-10-28.json", "label": "查看运行验证结果 (JSON)"},
              "body": [
                "服务器：ggml-org/llama.cpp b11669。模型revision：9217f5db79a29953eb74d5343926648285ec7e67。检查了官方压缩包/模型SHA-256及41个模型/依赖文件，并确认外部原文件未变。在正常进程回收下A01–A09全部通过，首次容器回收失败单独保留记录。F09仍未解决。"
              ]
            }
          ]
        }
      ]
    },
    'external-engines': {
      "title": "各引擎的连接文件",
      "description": "以下16个引擎是要求的连接目标，不表示已经安装或全部验证。展开自己的引擎，查看需要的程序和模型文件。",
      "sections": [
        {
          "id": "choose",
          "title": "选择自己的引擎",
          "body": [
            "这不是安装菜单。包括Strata和TensorFold在内，所有外部引擎必须满足相同连接约定和实际运行检查。"
          ],
          "more": [
            {
              "title": "1. Halogen",
              "body": [
                "条件: Strix Halo · Linux · ROCm",
                "应选择的可执行文件: podman / docker + Halogen image",
                "模型准备: 模型专用权重、tokenizer及附加文件包，不能假设兼容普通GGUF",
                "普通主机文件选择器无法选择容器内的执行文件。需要管理镜像、GPU设备、模型挂载和容器关闭的适配器，目前尚未提供。",
                "当前验证状态: 此环境中实际推理未验证，支持尚未完成"
              ],
              "links": [
                {
                  "href": "https://github.com/peonist-ai/halogen-server",
                  "label": "官方项目 · peonist-ai/halogen-server"
                },
                {
                  "href": "https://github.com/peonist-ai/halogen-flash-server",
                  "label": "官方项目 · peonist-ai/halogen-flash-server"
                }
              ]
            },
            {
              "title": "2. Strixite",
              "body": [
                "条件: Strix Halo · Linux",
                "应选择的可执行文件: build/strix/strix_server",
                "模型准备: 模型专用权重、tokenizer及附加文件包，不能假设兼容普通GGUF",
                "需要启动/模型/端口连接及AioLM probe。参数仅示意位置，请将MODEL/HOST/PORT替换为实际值。",
                "当前验证状态: 此环境中实际推理未验证，支持尚未完成"
              ],
              "links": [
                {
                  "href": "https://github.com/shawnshekari/strixite",
                  "label": "官方项目 · shawnshekari/strixite"
                }
              ],
              "code": "启动方式示例: --config DEDICATED_CONFIG"
            },
            {
              "title": "3. MLX (mlx-lm / MLX-VLM)",
              "body": [
                "条件: Apple Silicon · macOS",
                "应选择的可执行文件: installed Python",
                "模型准备: 包含权重、配置和tokenizer的完整本地模型文件夹",
                "需要启动/模型/端口连接及AioLM probe。参数仅示意位置，请将MODEL/HOST/PORT替换为实际值。",
                "当前验证状态: 此环境中实际推理未验证，支持尚未完成",
                "mlx-lm与MLX-VLM使用不同服务器模块，文本/图片支持也须按模型与模块确认。"
              ],
              "links": [
                {
                  "href": "https://github.com/ml-explore/mlx-lm",
                  "label": "官方项目 · ml-explore/mlx-lm"
                },
                {
                  "href": "https://github.com/Blaizzy/mlx-vlm",
                  "label": "官方项目 · Blaizzy/mlx-vlm"
                }
              ],
              "code": "启动方式示例: -m mlx_lm.server / mlx_vlm.server"
            },
            {
              "title": "4. ExLlamaV3 (ExLlamaV2)",
              "body": [
                "条件: NVIDIA GPU · supported CUDA environment",
                "应选择的可执行文件: TabbyAPI environment Python + main.py",
                "模型准备: V3使用EXL3、V2使用EXL2等对应版本支持的完整模型文件夹",
                "使用服务器而非桌面应用或库，需要连接配置、模型/端口及进程生命周期的适配器，目前尚未提供通用连接包。",
                "当前验证状态: 此环境中实际推理未验证，支持尚未完成",
                "官方推荐服务器为TabbyAPI，请勿选择exllamav3/exllamav2库文件或CUDA DLL本身。"
              ],
              "links": [
                {
                  "href": "https://github.com/turboderp-org/exllamav3",
                  "label": "官方项目 · turboderp-org/exllamav3"
                },
                {
                  "href": "https://github.com/turboderp-org/exllamav2",
                  "label": "官方项目 · turboderp-org/exllamav2"
                },
                {
                  "href": "https://github.com/theroyallab/tabbyAPI",
                  "label": "官方项目 · theroyallab/tabbyAPI"
                }
              ],
              "code": "启动方式示例: main.py"
            },
            {
              "title": "5. Rulith Inference",
              "body": [
                "条件: Strix Halo · Windows 11; Linux build is separate",
                "应选择的可执行文件: bin/hip/llama-server.exe",
                "模型准备: 该引擎支持的GGUF及必要配套文件",
                "使用服务器而非桌面应用或库，需要连接配置、模型/端口及进程生命周期的适配器，目前尚未提供通用连接包。",
                "当前验证状态: 此环境中实际推理未验证，支持尚未完成",
                "目标是专用补丁服务器，不是Rulith桌面EXE；ROCm DLL、环境和模型布局也须匹配。"
              ],
              "links": [
                {
                  "href": "https://github.com/rulith-dev/rulith-inference",
                  "label": "官方项目 · rulith-dev/rulith-inference"
                }
              ]
            },
            {
              "title": "6. SGLang",
              "body": [
                "条件: supported SGLang device/build · Linux",
                "应选择的可执行文件: installed Python",
                "模型准备: 包含权重、配置和tokenizer的完整本地模型文件夹",
                "需要启动/模型/端口连接及AioLM probe。参数仅示意位置，请将MODEL/HOST/PORT替换为实际值。",
                "当前验证状态: 此环境中实际推理未验证，支持尚未完成"
              ],
              "links": [
                {
                  "href": "https://github.com/sgl-project/sglang",
                  "label": "官方项目 · sgl-project/sglang"
                }
              ],
              "code": "启动方式示例: -m sglang.launch_server"
            },
            {
              "title": "7. vLLM",
              "body": [
                "条件: supported vLLM device/build · Linux; vllm-metal is separate",
                "应选择的可执行文件: vllm / installed Python",
                "模型准备: 包含权重、配置和tokenizer的完整本地模型文件夹",
                "需要启动/模型/端口连接及AioLM probe。参数仅示意位置，请将MODEL/HOST/PORT替换为实际值。",
                "当前验证状态: 此环境中实际推理未验证，支持尚未完成"
              ],
              "links": [
                {
                  "href": "https://github.com/vllm-project/vllm",
                  "label": "官方项目 · vllm-project/vllm"
                }
              ],
              "code": "启动方式示例: serve MODEL"
            },
            {
              "title": "8. Strata",
              "body": [
                "条件: supported Windows/Linux engine build",
                "应选择的可执行文件: installed Python + matching adapter",
                "模型准备: 所检查revision对应的专用deployment JSON及所有引用文件",
                "使用服务器而非桌面应用或库，需要连接配置、模型/端口及进程生命周期的适配器，目前尚未提供通用连接包。",
                "当前验证状态: 此环境中实际推理未验证，支持尚未完成",
                "现有SDK示例仅适用于source 296b59d2f73c8f04a805df29c2fa97655adace78，不表示支持当前Strata launch命令。"
              ],
              "links": [
                {
                  "href": "https://github.com/Niko1221/Strata",
                  "label": "官方项目 · Niko1221/Strata"
                }
              ],
              "code": "启动方式示例: -m serve.server"
            },
            {
              "title": "9. TensorFold",
              "body": [
                "条件: supported Metal / CUDA / Vulkan build",
                "应选择的可执行文件: tensorfold",
                "模型准备: 包含权重、配置和tokenizer的完整本地模型文件夹",
                "需要启动/模型/端口连接及AioLM probe。参数仅示意位置，请将MODEL/HOST/PORT替换为实际值。",
                "当前验证状态: 此环境中实际推理未验证，支持尚未完成"
              ],
              "links": [
                {
                  "href": "https://github.com/ashhart/TensorFold",
                  "label": "官方项目 · ashhart/TensorFold"
                }
              ],
              "code": "启动方式示例: serve MODEL"
            },
            {
              "title": "10. vllm.cpp",
              "body": [
                "条件: matching CPU / CUDA / Metal / Vulkan / ROCm build",
                "应选择的可执行文件: bin/vllm-server",
                "模型准备: 支持的GGUF或完整模型文件夹，并确认量化和模型架构",
                "需要启动/模型/端口连接及AioLM probe。参数仅示意位置，请将MODEL/HOST/PORT替换为实际值。",
                "当前验证状态: 一个固定Linux CPU/模型的CLI检查通过，不等于发布通用适配器或完成所有设备验证",
                "v0.0.2 CPU在指定Qwen3.5-0.8B Q8_0及官方tokenizer_config.json（--tokenizer-config）后通过。Qwen2.5加载失败保持失败，无模板时错误重复的回答也未计为成功。"
              ],
              "links": [
                {
                  "href": "https://github.com/localai-org/vllm.cpp",
                  "label": "官方项目 · localai-org/vllm.cpp"
                },
                {
                  "href": "/verification/vllm-cpp-cpu-2026-10-28.json",
                  "label": "运行检查记录"
                }
              ],
              "code": "启动方式示例: --model MODEL"
            },
            {
              "title": "11. Mistral.rs",
              "body": [
                "条件: matching CPU / CUDA / Metal build",
                "应选择的可执行文件: mistralrs",
                "模型准备: 支持的GGUF或完整模型文件夹，并确认量化和模型架构",
                "需要启动/模型/端口连接及AioLM probe。参数仅示意位置，请将MODEL/HOST/PORT替换为实际值。",
                "当前验证状态: 一个固定Linux CPU/模型的CLI检查通过，不等于发布通用适配器或完成所有设备验证"
              ],
              "links": [
                {
                  "href": "https://github.com/EricLBuehler/mistral.rs",
                  "label": "官方项目 · EricLBuehler/mistral.rs"
                },
                {
                  "href": "/verification/mistralrs-cpu-2026-10-28.json",
                  "label": "运行检查记录"
                }
              ],
              "code": "启动方式示例: serve"
            },
            {
              "title": "12. KTransformers",
              "body": [
                "条件: supported CPU + accelerator combination",
                "应选择的可执行文件: installed Python + SGLang/kt-kernel",
                "模型准备: 完整SGLang模型及kt-kernel所需expert权重和配置",
                "需要启动/模型/端口连接及AioLM probe。参数仅示意位置，请将MODEL/HOST/PORT替换为实际值。",
                "当前验证状态: 此环境中实际推理未验证，支持尚未完成"
              ],
              "links": [
                {
                  "href": "https://github.com/kvcache-ai/ktransformers",
                  "label": "官方项目 · kvcache-ai/ktransformers"
                }
              ],
              "code": "启动方式示例: -m sglang.launch_server"
            },
            {
              "title": "13. ik_llama.cpp",
              "body": [
                "条件: matching CPU / CUDA / Vulkan build",
                "应选择的可执行文件: build/bin/llama-server",
                "模型准备: 该引擎支持的GGUF及必要配套文件",
                "需要启动/模型/端口连接及AioLM probe。参数仅示意位置，请将MODEL/HOST/PORT替换为实际值。",
                "当前验证状态: 此环境中实际推理未验证，支持尚未完成"
              ],
              "links": [
                {
                  "href": "https://github.com/ikawrakow/ik_llama.cpp",
                  "label": "官方项目 · ikawrakow/ik_llama.cpp"
                }
              ]
            },
            {
              "title": "14. Mullama",
              "body": [
                "条件: matching CPU / GPU build",
                "应选择的可执行文件: mullama",
                "模型准备: 该引擎支持的GGUF及必要配套文件",
                "需要启动/模型/端口连接及AioLM probe。参数仅示意位置，请将MODEL/HOST/PORT替换为实际值。",
                "当前验证状态: 此环境中实际推理未验证，支持尚未完成"
              ],
              "links": [
                {
                  "href": "https://github.com/cognisoc/mullama",
                  "label": "官方项目 · cognisoc/mullama"
                }
              ],
              "code": "启动方式示例: serve --model MODEL"
            },
            {
              "title": "15. llama.cpp",
              "body": [
                "条件: matching Windows / macOS / Linux build",
                "应选择的可执行文件: llama-server.exe / llama-server",
                "模型准备: 该引擎支持的GGUF及必要配套文件",
                "需要启动/模型/端口连接及AioLM probe。参数仅示意位置，请将MODEL/HOST/PORT替换为实际值。",
                "当前验证状态: 一个固定Linux CPU/模型的CLI检查通过，不等于发布通用适配器或完成所有设备验证"
              ],
              "links": [
                {
                  "href": "https://github.com/ggml-org/llama.cpp",
                  "label": "官方项目 · ggml-org/llama.cpp"
                },
                {
                  "href": "/verification/external-cpu-2026-10-28.json",
                  "label": "运行检查记录"
                }
              ]
            },
            {
              "title": "16. Gufo",
              "body": [
                "条件: Strix Halo · Linux x86_64",
                "应选择的可执行文件: gufo",
                "模型准备: 该引擎支持的GGUF及必要配套文件",
                "需要启动/模型/端口连接及AioLM probe。参数仅示意位置，请将MODEL/HOST/PORT替换为实际值。",
                "当前验证状态: 此环境中实际推理未验证，支持尚未完成",
                "host/port属于serve，model属于llm，需要保持此顺序的manifest或bridge。"
              ],
              "links": [
                {
                  "href": "https://github.com/gufo-org/gufo",
                  "label": "官方项目 · gufo-org/gufo"
                }
              ],
              "code": "启动方式示例: serve --host HOST --port PORT llm --model MODEL"
            }
          ]
        },
        {
          "id": "rules",
          "title": "列出不代表可直接运行",
          "body": [
            "可执行文件、配置和模型承担不同作用，请勿随意选择库文件或安装程序。没有兼容适配器的项目，须先实现并验证AioLM设置、probe及所需bridge。"
          ]
        },
        {
          "id": "verification",
          "title": "什么才算完成支持？",
          "body": [
            "检查注册、实际帮助和参数、模型probe、HTTP/SSE真实回答及token用量、取消后重新提问、停止/重启、移除/重新注册，以及进程和端口清理。未在专用GPU设备上执行的项目保持未验证。"
          ]
        }
      ]
    },
  },
};
export default content;
