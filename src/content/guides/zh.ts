import type { GuideContent } from './types';
const content: GuideContent = {
  title: 'AioLM 使用指南', description: '第一次使用？先安装应用，再对照图片逐个点击按钮，在自己的电脑上开始 AI 对话。',
  navigation: '使用指南', onPage: '本页目录', related: '接着看', download: '查看全部下载文件',
  screenshotNotice: "图片说明区分公开v0.3.2界面与尚未发布的预览。所有截图均使用示例数据，不是原生应用安装或模型推理的验证记录。",
  enlarge: '放大查看', close: '关闭',
  panHint: '左右滑动可查看图片其他部分。',
  guides: {
    install: { title: '安装应用', description: '先使用适合自己电脑的命令安装，或选择下方安装文件。只需按照对应的Windows、Mac或Linux部分操作。', sections: [
      { id: 'commands', title: '先用命令安装', body: ['在下方选择操作系统并复制命令。Windows在PowerShell中运行，Mac和Linux在终端中运行。如需通过文件手动安装，请使用下面对应系统的安装文件。Linux需要先下载DEB文件。'] },
      { id: 'windows', title: '在 Windows 上安装', downloads: 'windows', steps: ['手动安装时下载x64-setup.exe，个人电脑通常选择此文件。', '双击下载的文件，按安装窗口提示完成操作。', '完成后从开始菜单打开 AioLM。'], note: 'Windows安装程序没有发布者签名，可能会显示安全警告。安装前请确认来自AioLM官方发布，并核对文件校验和。', more: [{ title: '什么时候使用 MSI？', body: ['公司或学校的部署工具、Windows Installer 有要求时才使用 MSI。个人安装请选择上方 EXE。安装包适用于 Windows x64。'] }] },
      { id: 'macos', title: '在 Mac 上安装', downloads: 'macos', steps: ['打开 Apple 菜单 → 关于本机。芯片显示 Apple M1、M2 等时选择 aarch64.dmg；处理器显示 Intel 时选择 x64.dmg。', '打开 DMG，将 AioLM 拖到“应用程序”文件夹。', '打开AioLM。如果macOS阻止打开，请先核对官方发布和校验和。如需继续，前往系统设置 → 隐私与安全性 → 仍要打开。'], note: '需要macOS 13.3或更新版本。应用采用ad-hoc签名且未经Apple公证，可能会显示安全警告。安装前请核对官方发布和文件校验和。' },
      { id: 'linux', title: '在 Linux 上安装', downloads: 'linux', body: ['适用于 Ubuntu 24.04+ 的 x86_64 电脑。第一次使用建议选择 DEB。'], steps: ['双击下载的DEB打开软件包安装窗口，或在下载目录运行上方Linux命令。', '完成后从应用菜单打开 AioLM。'], more: [{ title: '点击 DEB 后没有安装窗口', body: ['下载目录中只保留要安装的那一个版本的DEB。在该目录打开终端，运行上方安装选项卡中的Linux命令。'] }, { title: '使用 AppImage，不安装软件包', body: ['将 AppImage 放在固定目录，运行下方命令。移动文件后需要重新注册菜单入口。', '如需菜单入口，从同一版本下载并验证 register-linux-desktop.py，然后运行 python3 register-linux-desktop.py --appimage <文件>。切换到 DEB 前用 --remove 移除入口。需要 Python 3。'], code: 'sudo apt install libgomp1 libfuse2t64\nchmod +x ./AioLM_*.AppImage\n./AioLM_*.AppImage' }] },
      { id: 'first-open', title: '应用打开后', body: ['看到下方语言选择界面就准备好了。选择简体中文并点击继续。已有设置的用户会直接进入工作区。'], image: 'language', caption: '首次打开默认是 English。选择语言后，接着阅读“开始第一次对话”。' },
      { id: 'verify', title: '检查下载文件', body: ['请使用官方下载文件。如需进一步确认文件没有损坏，可展开下面的方法。'], more: [{ title: '用校验和检查文件', body: ['从安装包所在的同一版本下载 checksums.txt。校验和是文件的识别值。将命令的完整结果与相同文件名的 SHA-256 比较；不一致就停止安装。校验和不能代替发布者签名。', 'Windows 请将下方文件名换成实际下载的名称。Mac 使用 shasum -a 256 加文件路径，Linux 使用 sha256sum。'], code: 'Get-FileHash -Algorithm SHA256 .\\AioLM_0.3.2_x64-setup.exe' }] },
      { id: 'updates', title: '以后如何更新', body: ['打开左侧设置 → 常规，点击检查更新。如有新版本，先保存工作，再选择下载并安装。完成系统安装程序后重新打开 AioLM。'], image: 'updates', caption: '设置中的应用更新区域。此示例已经在使用 v0.3.2。', more: [{ title: '备份、卸载和手动更新', body: ['Mac DMG 请替换原来的应用。AppImage 和手动安装请使用下载页面。替换应用会保留对话和设置。', '数据位于 Mac/Linux 的 ~/.aiolm、Windows 的 %USERPROFILE%\\.aiolm，或 AIOLM_HOME 指定的位置。请备份该目录及模型文件。', 'Windows EXE（NSIS）卸载程序可明确选择删除应用数据。MSI、DEB 卸载和将 Mac 应用移到废纸篓会保留数据。'] }, { title: '更新验证范围', body: ['v0.3.2 安装包检查已通过。真实的 v0.3.1 → v0.3.2 更新安装和设备 UI 验收尚未完成。'] }] },
    ] },
    'getting-started': { title: '开始第一次对话', description: "模型是AI数据，引擎负责运行模型。请选择适合设备和模型格式的引擎，再按以下步骤操作。", sections: [
      { id: 'language', title: '1. 选择语言', body: ['选择简体中文并点击继续。首次安装会从这里开始；已经完成设置的用户可跳到第 4 步。'], image: 'language', caption: '按钮和说明会随所选语言一起切换。' },
      { id: 'theme', title: '2. 选择界面颜色', body: ['选择浅色、深色或跟随系统，然后继续。以后可以在设置中更改。'], image: 'theme', caption: '选中主题后可立即预览。' },
      { id: 'folder', title: '3. 选择模型保存位置', body: ['保留默认目录，或点击选择文件夹换一个位置。点击开始使用 AioLM 进入工作区。现在还没有模型文件也没关系。'], image: 'folder', caption: '不要照抄示例路径，请选择自己电脑上的目录。' },
      {"id":"engine","title":"4. 准备运行 AI 的引擎","body":["打开左侧推理引擎，比较操作系统、设备和模型格式要求后选择引擎。需要时安装所选运行时；自行安装的引擎请按外部连接指南操作。"],"image":"llama-install","caption":"llama.cpp CPU界面仅用于展示安装按钮的位置，不代表优先推荐该引擎或已验证其他引擎。","note":"运行时是已安装的引擎程序。请先确认设备支持条件，并查看外部引擎连接指南。","links":[{"href":"/zh/guides/adapters#find","label":"查看外部引擎连接步骤"}]},
      {"id":"download","title":"5. 下载一个小模型","body":["在查找页面选择所选引擎支持的模型格式，再搜索模型。打开仓库查看所需文件，并确认需要单个文件还是完整模型文件夹。","先选择较小的文本模型，点击文件旁的下载并等待完成。同时检查模型的使用许可和内存要求。"],"image":"model-files","caption":"用于展示模型搜索和下载位置的GGUF示例。请下载所选引擎要求的格式和完整文件。"},
      { id: 'library', title: '6. 找到下载的文件', body: ['打开左侧模型运行页面，点击下载的文件名进入设置。找不到时，请确认模型目录是下载保存的位置，再重新扫描。'], image: 'model-library', caption: '在模型列表中点击自己下载的文件名，不要照抄示例名称。' },
      { id: 'model', title: '7. 选择下载的模型', body: ['在模型运行页面点击下载的文件。在模型选择与设置中选择已安装的引擎和运行时，再按选择预设、调整选项的顺序继续。预设是一组保存的设置，第一次选择默认即可。', '先保留默认值。检查必填项后点击运行。如果有尚未就绪的项目，请先按窗口显示的原因解决。'], image: 'model-settings', caption: '点击顶部第 1 步的运行时选择打开此窗口，在右侧选择已安装的项目。图中的安装状态仅供说明。', more: [{ title: '模型无法加载怎么办？', body: ['检查模型是否适合所选引擎、内存是否足够。先读就绪提示和引擎日志，不要随意更改不熟悉的选项。', '上下文是 AI 一次可以参考的对话量，设置过大会耗尽内存。更改上下文、并行数或启动选项后需要重启模型。'] }] },
      { id: 'chat', title: '8. 发送一句简短的话', body: ['模型加载后点击左侧聊天，在下方输入框写一个简短问题并发送。', '先确认文本对话正常。图片、音频、视频和工具必须同时得到模型和引擎的支持。'], image: 'chat', caption: '此图用于定位输入框。模型尚未加载，发送处于禁用状态；请先完成第 7 步。', more: [{ title: '想测量速度或分享结果', body: ['基准测试测的是处理速度，请比较相同测量方法和任务的结果。分数高不代表回答质量或所有设备功能已经验证。', '分享是可选操作，需要浏览器验证。先检查公开内容，私下保管恢复码或备份文件，以便不注册账户也能管理记录。从应用打开管理页面，或使用本站的管理页面。'] }] },
    ] },
    compatibility: { title: '选择适合电脑的引擎', description: "比较操作系统、设备、内存与模型格式后选择引擎，同时确认安装条件和实际验证状态。", sections: [
      { id: 'engines', title: '打开引擎列表', body: ['点击左侧推理引擎。标有“此设备不可用”的引擎不要选择。'], image: 'engines', caption: '内置引擎也需要先安装。出现在列表中并不表示已经安装。' },
      {"id":"choose","title":"应该选哪一个？","table":{"headers":["引擎","适用情况"],"rows":[["llama.cpp","在支持的Windows、Mac或Linux程序中使用GGUF时"],["vLLM","已经准备好受支持的 Linux 加速器环境"],["vLLM · vllm-metal","在 Apple 芯片 Mac、macOS 15+ 上使用 vLLM"],["MLX","在 Apple 芯片 Mac 上使用 MLX 模型"],["外部推理引擎","准备单独安装的引擎，并确认设备、模型和本地连接要求"]]},"note":"Intel Mac 无法使用 MLX 或 vllm-metal，请先检查安装界面的要求。"},
      { id: 'models', title: '下载匹配格式的模型', body: ['llama.cpp 使用 GGUF 文件。vLLM 和 MLX 通常需要包含模型、配置和 tokenizer 的完整目录。不要只复制一个文件，请在搜索页面选择正确格式。', '内存不足时尝试更小的模型。需要图片或音频时，同时检查模型说明和应用显示的支持情况。'], image: 'discover', caption: '先在搜索页面顶部选择引擎和模型格式。', more: [{ title: 'vLLM 和 MLX 的详细条件', body: ['Linux 托管 vLLM 安装 CUDA 依赖。AMD ROCm 需要另外准备与驱动匹配的 Python 环境并注册。AioLM 不安装系统显卡驱动。', 'vllm-metal 需要 Apple 芯片、macOS 15+ 和原生 arm64 Python 3.12，不支持 Intel 和 Rosetta Python。MLX 也需要 Apple 芯片及兼容 Python 环境。', '原生 Windows vLLM、WSL 和远程服务器不是此应用的本地运行目标。Python 模型需要完整 safetensors 或受支持的 MLX 快照。vllm-metal 只支持部分 GGUF，不能等同于普通 GGUF 支持。'] }] },
      { id: 'limits', title: '仍需确认的地方', body: ['图片、音频、视频和工具需要模型与引擎同时支持。注册引擎不会自动启用所有功能。'], more: [{ title: 'v0.3.2 验证范围与已知问题', body: ['SmolVLM 图片、视频内容质量问题（F09）尚未解决。', '安装包构建通过，不表示所有设备上的推理都已验证。Linux 整体验证及真实的 v0.3.1 → v0.3.2 更新安装、UI 验收也尚未完成。', '基准、深度验证和便携包因引擎而异。外部推理引擎（custom.*）目前不属于公开基准分享对象。'] }] },
    ] },
    adapters: {
      "title": "连接外部推理引擎",
      "description": "尚未发布的自动连接预览：自动查找 → 选择模型 → 连接。公开v0.3.2用户请参阅下方高级手动注册说明。",
      "sections": [
        {
          "id": "prepare",
          "title": "公开版本与下一次更新",
          "body": [
            "开发中的自动连接目前针对本机运行的OpenAI兼容v1服务器。不论开发语言，均使用相同约定，不会自动转换其他通信协议。",
            "基本三步无需创建连接设置文件或填写引擎ID，只有使用所选模型验证实际连接后才会保存。"
          ]
        },
        {
          "id": "find",
          "title": "1. 自动查找",
          "body": [
            "在推理引擎 → 添加推理引擎中点击自动查找，从找到的项目中选择连接对象。运行中的本地服务器仅在返回实际模型列表后显示为候选项。",
            "未找到时，点击选择安装文件夹，选择引擎所在的安装目录即可，无需选择可执行文件或配置文件。"
          ],
          "note": "出现在列表中不代表连接已验证。只有明确确认启动方式后，才能对安装目录中的项目继续检查。",
          "image": "auto-find",
          "caption": "开发中的自动查找界面，使用示例数据，并非实际引擎运行结果。"
        },
        {
          "id": "choose-model",
          "title": "2. 选择模型",
          "body": [
            "在要使用的模型中点击选择模型，选择所需模型。对于正在运行的服务器，从该服务器提供的模型列表中选择。",
            "没有可选模型时，请在服务器上准备模型，或向AioLM添加模型后重新检查。"
          ],
          "image": "auto-model",
          "caption": "在开发中的界面中，从示例服务器选择模型。"
        },
        {
          "id": "connect",
          "title": "3. 连接",
          "body": [
            "点击连接，AioLM会用所选模型检查实际文本响应和流式传输。只有检查通过后才在应用内保存连接信息，无需创建设置文件。验证后，请在执行配置中选择此引擎和模型并运行。",
            "连接已运行的服务器时，在AioLM中断开连接不会停止原服务器。由AioLM启动的引擎则由应用管理启动和停止。"
          ],
          "note": "文本连接检查不代表已验证图像、音频、视频、工具调用的支持情况或回答内容的质量。",
          "image": "auto-connect",
          "caption": "开发中的完成界面示例。显示的成功仅用于说明，并非实际引擎检查结果。"
        },
        {
          "id": "unconfirmed",
          "title": "无法验证连接时",
          "body": [
            "通信约定不同、启动命令或目标模型不明确、需要认证密钥时，不会标为自动连接成功。请查看显示原因，启动本地服务器，或在知道准确设置时使用高级方式。",
            "此流程不会安装引擎，也不保证所有引擎、设备和模型都能运行。未通过实际检查的项目会保持未验证状态。"
          ],
          "links": [
            {
              "href": "/zh/guides/adapters#files",
              "label": "高级手动注册文件说明"
            }
          ],
          "more": [
            {
              "title": "使用容器运行的引擎呢？",
              "body": [
                "已经运行的容器服务器如果提供相同的本地OpenAI兼容v1约定，就可以作为连接对象。",
                "自动创建和管理容器或守护进程尚未实现，找到容器并不代表可以管理它。"
              ]
            }
          ]
        },
        {
          "id": "files",
          "title": "高级：手动注册使用哪些文件？",
          "table": {
            "headers": [
              "已有内容",
              "选择文件与位置"
            ],
            "rows": [
              [
                "AioLM连接设置包",
                "由提供方预先编写的输入表单，例如*.setup.json。解压整个文件夹后导入设置，并保留配套的启动和检查程序。"
              ],
              [
                "完整的注册JSON",
                "仅在有提供方或开发者准备好的文件时，使用高级：导入注册文件（manifest）。*.engine.json只是文件名示例，手动注册不需要此文件。"
              ],
              [
                "服务器可执行程序",
                "在手动注册中选择真正的服务器，如engine-server.exe或engine-server。不要选择安装程序或应用快捷方式。"
              ],
              [
                "Python脚本或模块",
                "选择安装引擎所用环境中的python.exe（Windows）或bin/python（Mac/Linux），再在下方添加脚本或模块参数。"
              ],
              [
                "模型或普通配置",
                ".gguf、.safetensors模型在注册后的模型选择中指定。deployment.json等配置仅在适配器要求时选择；它们与AioLM的连接设置和注册JSON不同。"
              ]
            ]
          },
          "note": "手动注册无需自行创建*.engine.json。填写表单并注册成功后，AioLM会在内部保存注册信息，不会另行导出.engine.json。仅选择可执行文件不会生成这两种输入JSON，修改JSON文件名也不会改变其内容。",
          "body": [
            "此表用于公开v0.3.2的手动注册和高级设置。新的自动连接基本三步不需要准备这些设置文件。"
          ]
        },
        {
          "id": "advanced",
          "title": "高级：手动设置启动方式",
          "body": [
            "使用公开v0.3.2或明确知道启动方式时，可展开下列手动设置说明。下一次更新中，此功能位于自动连接下方的高级：手动设置启动方式。图片展示旧注册界面，不是新的自动连接界面。"
          ],
          "more": [
            {
              "title": "在公开v0.3.2中打开注册界面",
              "body": [
                "停止运行中的模型，点击推理引擎 → 添加推理引擎。有收到的设置文件时导入，否则填写手动注册表单。"
              ],
              "image": "adapter-add",
              "caption": "在此添加新的外部引擎，无需选择特定提供方。"
            },
            {
              "title": "导入已经收到的连接设置文件",
              "steps": [
                "公开v0.3.2中点击导入适配器设置，尚未发布的界面中点击导入AioLM连接设置 (.json)，然后选择解压文件夹中的AioLM专用*.setup.json。",
                "按提供方说明指定程序、目录和文件，检查命令后点击检查安装并继续，再确认帮助信息。"
              ],
              "code": "解压后的适配器文件夹/\n  engine.setup.json  ← 导入时选择\n  prepare.py        ← 一起保留\n  probe.py          ← 一起保留",
              "body": [
                "向提供方索取AioLM setup v1 JSON、配套设置/probe程序、支持的操作系统、所需运行环境和模型格式及应选择的可执行文件。没有适配器时，需要开发者按通用约定实现连接。"
              ]
            },
            {
              "title": "填写程序的启动方式",
              "body": [
                "在可执行文件或解释器 → 浏览中按上表选择程序。Python脚本使用添加文件参数；模块使用添加参数，将-m和实际模块名称分别填入两个参数栏。",
                "填写显示名称、引擎ID（custom.*格式，如custom.my-engine）和运行时ID（如local-1），然后点击下一步。不清楚模型/端口选项或probe时，请先向提供方确认。",
                "引擎提供OpenAI兼容HTTP/SSE时选择直接提供，否则需要转换格式的bridge。选择独立bridge，并按提供方说明设置程序、参数和引擎JSON argv环境变量。普通控制台输入输出不会自动变成HTTP服务器。",
                "若提供方命令为“python -m vendor_engine.serve”，选择对应Python，将参数分别填写。请将示例模块名替换为实际安装的模块。"
              ],
              "image": "adapter-setup",
              "caption": "尚未发布的源码更新中的手动注册界面预览。Example Engine和路径仅作示例，请选择实际文件。这不是推理成功的证据。",
              "code": "可执行文件：环境中的python.exe或bin/python\n参数1：-m\n参数2：vendor_engine.serve"
            },
            {
              "title": "查看程序帮助",
              "body": [
                "点击发现帮助以读取所选程序的选项。失败时检查文件、Python环境和必需依赖。帮助显示成功不等于模型推理成功。"
              ],
              "image": "adapter-help",
              "caption": "检查所选命令的帮助。此截图不是运行成功的证据。"
            },
            {
              "title": "设置模型连接和兼容性检查",
              "body": [
                "按提供方说明设置模型和端口选项，不要假设所有引擎都使用--model和--port。导入的值也应检查。",
                "兼容性检查程序请选择AioLM专用probe。Python probe应选择Python，再将probe.py路径、{model}等分别添加为参数。普通引擎可执行文件不能代替probe。",
                "probe以JSON返回schema_version: 1、已注册的engine_id/runtime_id、模型路径、支持状态与能力。不支持的模型必须保持失败状态。HTTP/SSE、健康检查路径及模型/端口/认证传递方法须匹配实际服务器，不能通过显示名称或修改扩展名代替。"
              ],
              "image": "adapter-check",
              "caption": "上方是模型/端口连接，下方是probe、健康检查和模型格式。示例probe.py不是应用附带文件。"
            },
            {
              "title": "检查、保存并运行实际模型",
              "steps": [
                "点击检查注册内容 → 注册。成功后，连接信息会自动保存在应用中。在模型选择中指定新引擎/运行时及支持的模型文件或完整模型文件夹。",
                "通过模型兼容性检查后运行，确认能回答简短问题、取消生成后再次提问、停止及重启。"
              ],
              "image": "adapter-review",
              "caption": "最后确认通用注册内容。注册成功和推理成功是两项不同的检查。",
              "body": []
            }
          ]
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
            "此结果仅覆盖该Linux CPU组合的CLI，不保证其他引擎、模型或设备组合的兼容性。截图使用示例数据，本次检查未完成原生应用UI、实际更新安装或Linux整体验收。"
          ],
          "more": [
            {
              "title": "复现信息",
              "report": {
                "href": "/verification/external-cpu-2026-10-28.json",
                "label": "查看运行验证结果 (JSON)"
              },
              "body": [
                "服务器：ggml-org/llama.cpp b11669。模型revision：9217f5db79a29953eb74d5343926648285ec7e67。检查了官方压缩包/模型SHA-256及41个模型/依赖文件，并确认外部原文件未变。在正常进程回收下A01–A09全部通过，首次容器回收失败单独保留记录。F09仍未解决。"
              ]
            },
            {
              "title": "另外两项固定CPU CLI验证记录",
              "body": [
                "Mistral.rs 0.9.5与Qwen2.5-0.5B、vllm.cpp 0.0.2与Qwen3.5-0.8B也通过了所记录的Linux CPU CLI检查。使用的是仅适用于该模型和程序组合的验证用probe，不是通用适配器或自动配置完成的证据。",
                "记录保留首次失败和更严格的复查结果，不代表GPU、原生UI或所有引擎均获支持。"
              ],
              "links": [
                {
                  "href": "/verification/mistralrs-cpu-2026-10-28.json",
                  "label": "Mistral.rs 0.9.5 · CPU CLI运行记录"
                },
                {
                  "href": "/verification/vllm-cpp-cpu-2026-10-28.json",
                  "label": "vllm.cpp 0.0.2 · CPU CLI运行记录"
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
