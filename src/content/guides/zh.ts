import type { GuideContent } from './types';
import { DESKTOP_RELEASE_VERSION, SCREENSHOT_SOURCE_VERSION } from '@/lib/desktop-release';

const content: GuideContent = {
  title: 'AioLM 使用指南',
  description: '精简说明：快速完成安装、引擎准备、模型下载与本地对话。',
  navigation: '使用指南',
  onPage: '本页目录',
  related: '接着看',
  download: '查看全部下载文件',
  screenshotNotice: `说明基于 v${DESKTOP_RELEASE_VERSION}。截图来自 v${SCREENSHOT_SOURCE_VERSION} macOS 版本，部分标签和布局有所不同。`,
  enlarge: '放大查看',
  close: '关闭',
  panHint: '左右滑动可查看图片其他部分。',
  guides: {
    install: {
      title: '安装应用',
      description: '校验文件哈希后在 Windows、Mac 或 Linux 上安装 AioLM。',
      sections: [
        {
          id: 'commands',
          title: '安装流程概览',
          diagram: 'install-flow',
          body: ['在下方按操作系统选择快捷命令或核验后的安装包进行安装。'],
          points: [
            'Windows/Mac 快捷命令会校验下载到的安装程序 SHA-256，但脚本本身未提前核验即运行。',
            '如需先完全手动校验，请在下方对应系统部分下载安装文件与 checksums.txt。',
            'Linux 需先下载 DEB 包，再在所在目录执行安装命令。',
          ],
        },
        {
          id: 'windows',
          title: '在 Windows 上安装',
          downloads: 'windows',
          steps: [
            '从同一版本下载 x64-setup.exe（或 MSI）和 checksums.txt。',
            '比对 SHA-256 一致后再运行安装程序。',
            '安装完成后从开始菜单打开 AioLM。',
          ],
          note: '安装包未签名，可能显示安全提醒。运行前请确认来自官方发布并核对 SHA-256。',
          more: [{
            title: 'MSI 与静默安装说明',
            body: ['企业分发适用 Windows x64 MSI，个人电脑建议 EXE。install.ps1 将 MSI 退出码 3010（需重启）和 1641（已触发重启）视为安装成功。'],
          }],
        },
        {
          id: 'macos',
          title: '在 Mac 上安装',
          downloads: 'macos',
          steps: [
            '打开 Apple 菜单 → 关于本机：Apple 芯片选 aarch64.dmg，Intel 选 x64.dmg。',
            '下载 DMG 与 checksums.txt，核对 shasum -a 256 后将 AioLM 拖入“应用程序”。',
            '若首次打开被阻止，请在系统设置 → 隐私与安全性 → 仍要打开（macOS 13–14 可 Control-点击 → 打开）。',
          ],
          note: '需要 macOS 13.3+。应用未经 Apple 公证，打开前请先核对 SHA-256。',
        },
        {
          id: 'linux',
          title: '在 Linux 上安装',
          downloads: 'linux',
          body: ['适用于 Ubuntu 24.04+ x86_64，推荐优先选用 DEB 包。'],
          steps: [
            '下载 DEB 与 checksums.txt，核对 sha256sum 后双击或运行 sudo apt install ./AioLM_*_amd64.deb。',
            '从应用菜单启动 AioLM。',
          ],
          more: [
            {
              title: '双击 DEB 未弹出安装窗口',
              body: ['目录中只保留目标版本的 DEB，在终端执行上方 apt 命令。'],
            },
            {
              title: '使用便携 AppImage',
              body: [
                '将 AppImage 放入固定目录并校验后，安装 libgomp1、libfuse2t64 与 zenity（用于 MCP 工具审批弹窗）。',
                '如需菜单入口，下载并校验 register-linux-desktop.py，运行 python3 register-linux-desktop.py --appimage <文件>（改用 DEB 前加 --remove）。',
              ],
              code: 'sudo apt install libgomp1 libfuse2t64 zenity\nchmod +x ./AioLM_*.AppImage\n./AioLM_*.AppImage',
            },
          ],
        },
        {
          id: 'first-open',
          title: '首次启动',
          body: ['首次打开需选择语言、主题和模型目录；已有配置会直接进入工作区。'],
          image: 'language',
          caption: '首次启动语言选择界面。',
        },
        {
          id: 'verify',
          title: '核对文件校验和',
          body: ['运行安装程序前，请与同一发布版本中的 checksums.txt 比对 SHA-256。'],
          more: [{
            title: '各平台 SHA-256 校验命令',
            body: ['Windows 用下方 PowerShell 命令，Mac 用 shasum -a 256，Linux 用 sha256sum。若不一致请勿运行。'],
            code: `Get-FileHash -Algorithm SHA256 .\\AioLM_${DESKTOP_RELEASE_VERSION}_x64-setup.exe`,
          }],
        },
        {
          id: 'updates',
          title: '应用更新与托盘驻留',
          points: [
            '启动时检查一次 GitHub 发布并通知，不会自动安装（手动检查位于设置 → 常规 → 应用更新）。',
            '下载并安装前先核对发布 SHA-256，再停止任务并打开安装包（AppImage 需手动更新）。',
            '关闭窗口默认隐藏到系统托盘，点击退出才会停止托管进程。数据保存在 ~/.aiolm（Windows 为 %USERPROFILE%\\.aiolm）或 AIOLM_HOME。',
          ],
          image: 'updates',
          caption: '设置中的应用更新界面。',
          more: [{
            title: '卸载与数据保留说明',
            body: ['仅 NSIS 卸载提供清除数据选项；MSI、DEB 与 Mac 移入废纸篓均保留会话与设置。Mac 更新后可能需重新授权 Keychain。'],
          }],
        },
      ],
    },
    'getting-started': {
      title: '开始第一次对话',
      description: '按序完成初始设置、引擎准备、模型下载并开始本地聊天。',
      sections: [
        {
          id: 'language',
          title: '1. 选择语言与初始设置',
          diagram: 'setup-flow',
          body: ['选择简体中文并点击继续；已完成设置的用户可直接跳到第 4 步。'],
          image: 'language',
          caption: '界面文案会立即切换为所选语言。',
        },
        {
          id: 'theme',
          title: '2. 选择界面主题',
          body: ['选择浅色、深色或跟随系统，后续可在设置中修改。'],
          image: 'theme',
          caption: '初始主题预览。',
        },
        {
          id: 'folder',
          title: '3. 选择模型目录',
          body: ['保留默认路径或选择本地文件夹，点击开始使用 AioLM。'],
          image: 'folder',
          caption: '请选择本机实际存在的目录。',
        },
        {
          id: 'engine',
          title: '4. 准备推理引擎',
          body: ['在左侧推理引擎查看系统与硬件条件，安装或连接所需运行时。'],
          points: [
            '列表显示实际安装或注册的版本，并在安装、注册、检查与启动时自动校验可执行文件（无手动检查按钮）。',
            '若当前环境不支持自动安装 vLLM 或 mlx-vlm，请自行准备 Python 环境并注册。',
            '桌面端执行 help 需要对确切程序、参数、目录和环境进行原生 OS 批准；PR 源码构建会以当前用户权限编译。',
          ],
          image: 'llama-install',
          caption: '原生 macOS llama.cpp Metal 运行时界面。',
          links: [{ href: '/zh/guides/adapters#find', label: '查看外部引擎连接步骤' }],
        },
        {
          id: 'download',
          title: '5. 搜索并下载模型',
          body: ['“发现”独立于当前所选引擎，按 Trending 等排序搜索全格式 Hugging Face 仓库。'],
          points: [
            '选择 HF/MLX Safetensors 权重时只拉取所需配置、分词器和分片；GGUF 分片也会自动成组下载。',
            '支持实时速度与剩余时间、暂停/继续（已暂停的下载）、完整文件摘要校验，以及单条仓库文件读取重试。',
            '下载模型期间可并行安装推理引擎。',
          ],
          image: 'model-files',
          caption: '下载前可查看模型说明与文件大小。',
          more: [{
            title: '下载与重定向安全限制',
            body: ['不会自动下载并执行远程 Python 代码。GitHub 与 Hugging Face 传输要求所有重定向（最多 10 跳）均使用 HTTPS 和受信任主机；无摘要文件续传时将重新下载。'],
          }],
        },
        {
          id: 'library',
          title: '6. 在库中管理会话与文件',
          body: ['默认会话由标题栏与聊天控制，命名会话与本地文件在库 → 已保存的会话管理。'],
          points: [
            '点击模型或模型设置可预览配置，路径、复制、删除和更新操作在独立文件操作行。',
            '若搜索仅命中隐藏的辅助文件，可点击显示模型辅助文件查看而不丢失当前筛选。',
            '上游更新会复用未变更文件（需先停止所有会话；单文件 GGUF 变更需完整重下）。',
          ],
          image: 'model-library',
          caption: '已保存会话与本地模型库视图。',
        },
        {
          id: 'model',
          title: '7. 配置、保存并启动',
          diagram: 'memory-pools',
          body: ['按选择运行时 → 选择预设 → 调整选项配置；若未选运行时，将自动选用首个可用项。'],
          points: [
            '保存配置并启动后设置窗口会自动关闭，并在后台执行检查与加载（支持取消及失败后的检查已保存模型设置）。',
            '选项标题为主 CLI 参数或 JSON 键（悬停看完整签名）；简单控件自动分栏，复杂编辑器保持全宽。',
            '请分开查看显存、运行内存、内存卸载与 SSD 卸载；共享内存设备不会重复叠加总和。',
          ],
          image: 'model-settings',
          caption: `历史 v${SCREENSHOT_SOURCE_VERSION} 设置截图；v${DESKTOP_RELEASE_VERSION} 会充分利用宽窗口分栏。`,
          more: [{
            title: '内存估算、过期帮助与超时说明',
            body: [
              'llama.cpp 估算覆盖受支持架构（含部分 Qwen 混合架构），不支持时显示无法估算而非零。可回收的系统文件缓存不计入常驻内存。',
              '非 llama.cpp 引擎帮助过期时提供重新检查选项（及详情加载失败重试）。启动与预热上限为 10 分钟；Windows 提前退出时会提示缺失或损坏的 DLL。',
            ],
          }],
        },
        {
          id: 'chat',
          title: '8. 在已加载会话中聊天',
          body: ['打开聊天，在顶部会话选择器指定回答会话即可发送消息（无需启动 API 服务器）。'],
          points: [
            '工具审批、进度与错误严格限定在发起对话中，查看其他对话时会提示返回原对话以防误操作。',
            '对话设置支持文档检索与本地 ffmpeg 音视频预处理；项目文档绑定需经原生文件权限确认。',
            'MCP 服务器首次启动需原生 OS 批准（编辑命令保留空格并在丢弃未保存修改前提示确认）。',
          ],
          image: 'chat',
          caption: '本地模型聊天界面。',
        },
        {
          id: 'api',
          title: '本地 API 服务器',
          body: ['在外部集成 → API 服务器独立启停。OpenAI（含 Responses 工具）与 Anthropic Messages 共用 127.0.0.1:8080。'],
          points: [
            '强制校验回环 Host 头（否则返回 421）与 64 个连接上限；未加载模型时返回 HTTP 503。',
            '当引擎支持函数调用时，自动将 Responses 与 Anthropic 函数工具转换到 Chat Completions。',
          ],
          more: [{
            title: 'API 密钥周期与 macOS Dock PATH',
            body: ['密钥在应用退出前持续有效；停止 API 不影响内部聊天。Mac 从 Finder/Dock 启动不会读取 Shell 配置，nvm 等工具请填写绝对路径。'],
          }],
        },
        {
          id: 'personalization',
          title: '个性化指令与技能',
          body: ['在设置 → 个性化管理 ~/.agents/AGENTS.md 与 ~/.aiolm/AGENTS.md 指令及本地技能。'],
          points: [
            '同名冲突时以 AioLM 文件和技能为准；$skill-name 显式调用兼容所有引擎。',
            '仅当引擎声明支持工具调用时，才会向模型暴露 aiolm_read_skill 自动读取工具。',
          ],
          more: [{
            title: '大小限制与编辑保护',
            body: ['单文件上限 64 KiB，有效技能最多 128 个（超 1,024 字符的描述会截短）。指令和技能仅发送给对话端点，不写入偏好导出。'],
          }],
        },
        {
          id: 'benchmarks',
          title: '基准测试与公开分享',
          body: ['新基准在支持输出长度控制的引擎（原生 llama.cpp、受支持非 Metal vLLM）上运行固定输出 API 测试。'],
          points: [
            'vllm-metal、MLX 与自动外部连接不可运行固定输出基准；历史上限与旧版词元结果分开保留。',
            '开始前需停止活动会话；接受刷新的关键设置仅重跑目标支持检查，不会自动启动测试。',
            '通过“在网站上管理”编辑说明或删除；复制的恢复码未变时 60 秒后从剪贴板自动清除。',
          ],
          more: [{
            title: '测量说明与配置导入',
            body: ['耗时与输出字节由客户端观测，每次请求都必须精确输出目标词元数。从结果创建预设仅导入兼容启动设置，不下载模型。'],
          }],
        },
        {
          id: 'cli',
          title: 'CLI 与便携运行时',
          body: ['aiolm-cli 随安装包附带（Mac 位于 AioLM.app/Contents/MacOS/aiolm-cli）。'],
          code: 'aiolm-cli runtime list\naiolm-cli runtime select <backend> <build>\naiolm-cli server start|status|logs|stop\naiolm-cli runtime discover [folder]\naiolm-cli runtime connect <candidate-id> <model-id> [folder]',
          more: [{
            title: 'CLI 配置、日志与便携包',
            body: [
              '无头服务器默认无密钥绑定回环地址，请仅在可信电脑使用。server logs 仅保留最新日志末尾。',
              'config set 会在保存前校验配置。托管 Python 仅使用预构建安装包；runtime export/import 仅打包依赖而不含模型。',
            ],
          }],
        },
      ],
    },
    compatibility: {
      title: '选择适合电脑的引擎',
      description: '通过对比表快速查看各引擎的系统支持、模型格式与基准能力。',
      sections: [
        {
          id: 'engines',
          title: '查看引擎列表',
          body: ['打开左侧推理引擎，跳过标有“此设备不可用”的条目。'],
          image: 'engines',
          caption: '推理引擎列表及设备兼容性状态。',
        },
        {
          id: 'choose',
          title: '引擎兼容性对比表',
          table: {
            headers: ['引擎', '适用平台 · 模型格式 · 固定输出基准'],
            rows: [
              ['llama.cpp', 'Windows · macOS · Linux · GGUF · 支持固定输出'],
              ['vLLM', '受支持 Linux CUDA/ROCm · Safetensors · 支持固定输出（非 Metal）'],
              ['vLLM · vllm-metal', 'Apple 芯片 macOS 15+ · Safetensors / 窄范围 GGUF · 不支持'],
              ['MLX', 'Apple 芯片 macOS · MLX Safetensors · 不支持'],
              ['外部推理引擎', '本地 OpenAI v1 服务或安装目录 · 聊天/流式验证 · 不支持'],
            ],
          },
          note: 'Intel Mac 仅支持 CPU 版 llama.cpp，无法使用 MLX 或 vllm-metal。',
        },
        {
          id: 'models',
          title: '模型格式与 Python 环境',
          points: [
            'llama.cpp 使用 GGUF；vLLM 与 MLX 需要完整 config、tokenizer、processor 与 safetensors 文件。',
            '自动安装 vLLM 与 mlx-vlm 仅使用预构建安装包；若无匹配包，请自行准备并注册外部 Python 环境。',
            '嵌入模型使用嵌入会话，Whisper 与 Qwen3-ASR 使用语音会话（非 WAV 音频需本地 ffmpeg）。',
          ],
          image: 'discover',
          caption: '模型发现独立于所选执行引擎。',
        },
        {
          id: 'limits',
          title: '验证范围与已知问题',
          body: ['多模态与工具调用需模型和引擎同时支持。'],
          more: [{
            title: `v${DESKTOP_RELEASE_VERSION} 验证范围与已知问题`,
            body: [
              '固定输出基准仅支持声明输出长度控制的原生 llama.cpp 与受支持非 Metal vLLM。',
              'v0.3.2 报告的 SmolVLM 图像/视频质量问题（F09）尚未确认修复。',
              '桌面端与公开 CLI 均不提供基于 CPU 参考的数值对比验证。',
            ],
          }],
        },
      ],
    },
    adapters: {
      title: '连接外部推理引擎',
      description: '自动查找 → 检查项目 → 选择模型 → 连接，四步接入本地引擎。',
      sections: [
        {
          id: 'prepare',
          title: '连接流程概览',
          diagram: 'adapter-flow',
          body: ['无需手写配置文件，即可连接本机 OpenAI 兼容 v1 服务或安装目录。'],
        },
        {
          id: 'find',
          title: '1. 查找与原生批准',
          body: ['打开推理引擎 → 添加推理引擎 → 自动查找，或点击选择安装文件夹。'],
          points: [
            '文件夹扫描仅识别可直接启动的程序（自动排除 DLL 等库文件），不偏袒特定引擎名称。',
            '唯一的运行中服务可自动检查；安装文件夹候选项则必须手动点击检查所选项目。',
            '桌面端执行 help 需针对确切命令、参数、目录和环境进行原生 OS 批准（取消操作会同步撤回待处理弹窗）。',
          ],
          note: '有模型会话运行或存在其他运行时任务时，发现与注册会被锁定。',
          image: 'auto-find',
          caption: '自动查找界面。',
        },
        {
          id: 'choose-model',
          title: '2. 选择模型',
          body: ['从运行中服务返回的模型列表或文件夹模式下的本地模型库中选择。'],
          points: ['若程序通过子命令提供服务，请在启动命令中选择一项并点击检查所选命令。'],
          image: 'auto-model',
          caption: '外部引擎模型选择界面。',
        },
        {
          id: 'connect',
          title: '3. 连接与实时验证',
          body: ['点击连接，验证真实聊天回复与流式传输通过后再保存到应用内。'],
          points: [
            '连接运行中服务使用 AioLM 本地代理；停止连接只关闭代理，不会关闭原服务。',
            '自动连接不会声明固定输出基准控制，也不代表已验证多模态或工具支持。',
          ],
          image: 'auto-connect',
          caption: '连接验证完成界面。',
        },
        {
          id: 'launch-options',
          title: '选项配置与 Help 重检',
          body: ['托管连接根据所选命令的实际帮助生成分组选项编辑器。'],
          points: [
            '简单控件采用响应式多栏，JSON、词元列表、路径与重复编辑器保持全宽，并提供命令与帮助工具。',
            '若已审核的 help 与运行时标识不再一致（PATH 等未变的继承环境变量不计入标识），启动时会再次运行一次已审核的 help 命令，若解析结果完全一致则沿用审核。仅当准确的可执行文件路径、参数、实际工作目录和环境均与此前已批准的记录一致时，help 执行才会跳过原生确认提示；只要其中任一执行输入发生变化，都需要重新进行原生批准。',
            '若 help 已变更或存在仅针对旧构建的选项确认，则会停止启动并要求重新检查选项。保存配置并启动会自动关闭弹窗并在后台运行检查与加载。',
          ],
          more: [{
            title: '附加启动参数与外部托管服务',
            body: ['附加启动参数按字面量传递且不执行 Shell，拒绝重复或应用保留标志。已在运行的服务不在 AioLM 内修改启动参数。'],
          }],
        },
        {
          id: 'unconfirmed',
          title: '无法验证连接时',
          body: ['协议不兼容、缺少认证密钥或启动命令不明确时，将显示原因并保持未确认状态。'],
          links: [{ href: '/zh/guides/adapters#files', label: '高级手动注册文件说明' }],
          more: [{
            title: '容器引擎',
            body: ['已在运行的容器只要暴露本地 OpenAI v1 接口即可连接；应用不负责创建或管理容器。'],
          }],
        },
        {
          id: 'files',
          title: '高级：手动注册文件说明',
          body: ['仅当自动查找无法覆盖、需手动绑定程序时参考下表。'],
          table: {
            headers: ['文件类型', '用途说明'],
            rows: [
              ['*.setup.json', '提供方编写的输入配方（需与配套脚本放在同一目录）'],
              ['注册清单 (*.engine.json)', '仅在导入现成完整注册 JSON 时使用'],
              ['服务器可执行文件', '真正的服务端程序（切勿选择安装器或快捷方式）'],
              ['Python 解释器', '引擎所在环境中的 python.exe 或 bin/python'],
              ['模型与引擎配置', '注册后选择（如 .gguf、.safetensors、deployment.json）'],
            ],
          },
          note: '手动填写表单并注册成功后会保存在应用内部，无需自行创建 .engine.json。',
        },
        {
          id: 'advanced',
          title: '高级：手动注册步骤',
          body: ['仅在需要手动配置可执行程序、桥接器或探针脚本时展开查看。'],
          more: [
            {
              title: '1. 打开手动注册与路径授权',
              body: ['停止模型 → 添加推理引擎 → 展开高级配置。通过原生文件选择器选取的清单会获得当前会话授权；手动输入路径则需确认弹窗展示 probe 与启动命令。'],
              image: 'adapter-add',
              caption: '高级手动注册入口。',
            },
            {
              title: '2. 导入连接配方 (*.setup.json)',
              steps: ['选择导入 AioLM 连接设置 (.json)（与当前会话选择器令牌绑定）。', '填好路径后点击检查安装并继续。'],
              code: '解压目录/\n  engine.setup.json\n  prepare.py\n  probe.py',
              body: ['请保留同一目录下的所有配套脚本。'],
            },
            {
              title: '3. 填写执行程序与参数',
              body: ['选择程序或 Python 解释器，填好 custom.<引擎>、运行时 ID，并选择直连 HTTP 或独立桥接。'],
              image: 'adapter-setup',
              caption: '手动程序与参数表单。',
              code: '可执行文件: bin/python\n参数 1: -m\n参数 2: vendor_engine.serve',
            },
            {
              title: '4. 发现帮助与探针',
              body: ['运行发现帮助，绑定模型/端口参数及 AioLM JSON 探针（schema_version: 1）。'],
              image: 'adapter-help',
              caption: '帮助发现步骤。',
            },
            {
              title: '5. 检查绑定与兼容性',
              body: ['确认探针 JSON、健康检查路径与 HTTP/SSE 支持后保存注册。'],
              image: 'adapter-check',
              caption: '绑定与探针兼容性检查。',
            },
            {
              title: '6. 保存并测试运行',
              steps: ['点击检查注册内容 → 注册。', '选中新引擎并运行模型，验证对话、取消和重启。'],
              image: 'adapter-review',
              caption: '最终注册确认界面。',
              body: [],
            },
          ],
        },
        {
          id: 'trouble',
          title: '常见问题排查',
          more: [
            { title: '找不到 Python 或文件', body: ['请选择引擎虚拟环境中的 Python，并保留完整目录结构。'] },
            { title: '已注册但无法启动', body: ['核对模型格式、完整权重文件、内存占用及服务端日志。'] },
            { title: '移除注册的影响', body: ['删除外部注册仅移除 AioLM 内部记录，不会删除原引擎或模型文件。'] },
          ],
        },
      ],
    },
  },
};

export default content;
