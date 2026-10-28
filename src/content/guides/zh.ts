import type { GuideContent } from './types';
const content: GuideContent = {
  title: 'AioLM 使用指南', description: '从安装应用、选择引擎到运行第一个本地模型。用简短步骤说明开始使用所需的内容。',
  navigation: '使用指南', onPage: '本页内容', related: '继续阅读', download: '下载最新版本',
  screenshotAlt: '显示公开演示 GGUF 文件的 AioLM 模型库',
  screenshotCaption: '早期桌面 UI（v0.1.18）的模型库，使用公开演示文件，与当前引擎设置界面不同。点击图片可查看原始尺寸。',
  guides: {
    install: { title: '安装指南', description: '选择适合电脑的安装包，核对下载文件，然后安装并打开 AioLM。', sections: [
      { id: 'windows', title: 'Windows', body: ['Windows x64 请下载并运行 x64-setup.exe。需要 Windows Installer 部署时可选择 MSI。也可使用首页的 PowerShell 安装命令。', '发布的安装程序未签名。出现发布者警告时，请先确认发布来源和校验和，再决定继续。'] },
      { id: 'macos', title: 'macOS', body: ['需要 macOS 13.3 或更新版本。Apple 芯片请选择 aarch64.dmg，Intel 请选择 x64.dmg。打开 DMG，将 AioLM 拖到“应用程序”。', '应用采用 ad-hoc 签名，未经 Apple 公证。先尝试打开一次，然后在系统设置 → 隐私与安全性中选择“仍要打开”。macOS 13–14 也可按住 Control 点按应用并选择“打开”。'], code: 'shasum -a 256 ./AioLM_*.dmg' },
      { id: 'linux', title: 'Linux', body: ['适用于 Ubuntu 24.04+ 的 x86_64 电脑。DEB 包含应用菜单入口及依赖项。工作目录中只保留要安装的版本，核对校验和后安装：'], code: 'sha256sum ./AioLM_*_amd64.deb\nsudo apt install ./AioLM_*_amd64.deb', note: '使用 AppImage 时，先安装 libgomp1 和 libfuse2t64，再用 chmod +x 添加执行权限并运行。从同一版本下载 register-linux-desktop.py 并核对校验和，然后运行 python3 register-linux-desktop.py --appimage <文件> 添加菜单入口。请保持文件路径不变；切换到 DEB 前用 --remove 移除该入口。' },
      { id: 'verify', title: '核对下载文件', body: ['从安装包所在的同一版本下载 checksums.txt。按完全相同的文件名比较完整 SHA-256 值，不一致就停止安装。Windows 可在下方命令中填入实际文件名。校验和用于确认完整性，不能代替发布者签名。'], code: 'Get-FileHash -Algorithm SHA256 .\\AioLM_0.3.2_x64-setup.exe' },
      { id: 'updates', title: '更新与数据', body: ['先保存工作，在设置 → 常规 → 应用更新中检查更新并确认下载和安装。完成系统安装程序后重新打开应用；DMG 请替换原应用。AppImage 和手动安装请使用发布页面。', '数据保存在 macOS/Linux 的 ~/.aiolm、Windows 的 %USERPROFILE%\\.aiolm，或 AIOLM_HOME 指定的目录。请备份该目录和模型。替换应用会保留数据；Windows NSIS 卸载程序可明确选择删除应用数据。MSI、DEB 卸载及将 Mac 应用移到废纸篓会保留数据。'], note: 'v0.3.2 安装包检查已通过。真实的 v0.3.1 → v0.3.2 更新安装和设备 UI 验收尚未完成。' },
    ] },
    compatibility: { title: '引擎与模型兼容性', description: '桌面应用与推理引擎的运行条件不同。下载模型前，请同时确认引擎、硬件和模型格式。', sections: [
      { id: 'engines', title: '引擎快速对照', table: { headers: ['引擎', '运行环境', '模型文件'], rows: [
        ['llama.cpp', 'Windows / macOS / Linux，配合兼容的 CPU 或 GPU 运行时', 'GGUF；受支持的多模态模型还需匹配的 projector'],
        ['vLLM', '受支持的 Linux 加速器环境', '受支持的完整 Hugging Face safetensors 快照'],
        ['vLLM · vllm-metal', 'Apple 芯片、macOS 15+、原生 arm64 Python 3.12', '受支持的 HF/MLX 快照；有限的 GGUF 子集'],
        ['MLX · mlx-vlm', 'Apple 芯片 Mac 及兼容 Python 环境', '受支持的完整 MLX 或 HF safetensors 快照'],
        ['外部适配器', '引擎自身要求的系统、加速器和依赖项', '由适配器与模型 probe 确认的格式'],
      ] } },
      { id: 'hardware', title: '安装运行时前', steps: ['检查模型和上下文大小所需的 RAM/显存。下载成功并不表示模型能装入内存。', '安装托管环境或注册现有的兼容 Python。Linux 托管 vLLM 使用 CUDA 依赖；ROCm 需另行准备与驱动匹配的环境再注册。', 'Apple 芯片上选择 vLLM 即使用 vllm-metal。Intel Mac 无法使用 MLX 或 vllm-metal。原生 Windows vLLM、WSL 和远程执行不属于此应用的本地运行目标。'] },
      { id: 'models', title: '模型与功能支持', body: ['Python 引擎需要包含 config、tokenizer/processor 和全部权重分片的完整快照，而不只是一个 safetensors 文件。普通 GGUF 支持不代表 vllm-metal GGUF 兼容。', '图片、音频、视频、工具和嵌入需同时得到模型、已安装运行时和请求协议的支持。禁用功能会显示原因。注册引擎不会自动启用基准测试、深度验证或便携包。'] },
      { id: 'limits', title: '当前验证范围', body: ['请检查所选安装环境的就绪状态，并在实际设备上运行模型。安装包或 Windows CI 通过不能证明 Linux vLLM 或 Mac 推理在你的硬件上可用。'], note: 'SmolVLM 图片/视频内容质量失败 F09 尚未解决。Linux 整体验证及真实更新安装、UI 验收尚未完成。' },
    ] },
    adapters: { title: '连接外部推理引擎', description: '通过兼容的本地适配器连接 Strata、TensorFold 或自定义构建。适配器定义执行方式，AioLM 提供统一工作区。', sections: [
      { id: 'prepare', title: '准备引擎和适配器', body: ['先安装适合电脑的引擎及依赖项。需要经过检查的可执行文件或入口、模型兼容性 probe，以及 OpenAI 兼容的本地 HTTP/SSE 服务或实现该协议的 bridge。', '只有引擎可执行文件可能还不够。Strata、TensorFold 和私有构建需要适配其版本和模型格式的适配器，并非全部内置的运行时。'] },
      { id: 'register', title: '四步完成注册', steps: ['在运行时设置中选择注册可执行文件或入口。先停止运行中的模型和任务，填写 custom.* 引擎 ID、运行时 ID、执行程序及按顺序排列的入口参数。', '探测实际提供 HTTP 服务的命令帮助并检查选项。若提供了选项 metadata，也可输入。使用 bridge 时，其帮助必须说明会转发的选项。', '配置模型与端口绑定、直接 HTTP 或 bridge、兼容性 probe 命令、模型格式和健康检查路径。凭据通过声明的环境变量绑定传递。', '检查并注册。在执行配置中选择该运行时和模型，确认兼容性后，实际测试响应、取消、停止和重启。'] },
      { id: 'changes', title: '引擎发生变化时', body: ['可执行文件、入口或适配器文件变化后，请重新检查帮助并运行模型 probe。模型、主机、端口和认证由应用管理，额外参数不能覆盖。', '注册不会消除引擎自身的运行要求。移除注册会保留外部文件。帮助和 probe 命令也会执行本地代码，请只注册可信程序。'], note: '当前公开基准共享协议不接受外部 custom.* 引擎。注册支持与基准、深度验证、便携运行时支持是不同能力。' },
    ] },
    'getting-started': { title: '运行第一个模型', description: '从首次配置到本地对话，同时确认引擎和模型是否匹配。', sections: [
      { id: 'setup', title: '1. 配置工作区', body: ['在欢迎界面选择语言、主题和模型目录，然后开始使用 AioLM。可使用现有模型目录，也可稍后下载。已有配置的用户会跳过此界面。'] },
      { id: 'runtime', title: '2. 选择引擎与模型', body: ['在运行时设置中安装或注册兼容环境。在模型设置中先选择引擎、已安装运行时及配置，再选择该组合支持的模型。llama.cpp 准备 GGUF，Python 引擎准备完整快照。'], screenshot: true },
      { id: 'chat', title: '3. 加载并开始对话', body: ['检查兼容性和启动选项后加载模型，先试一条简短文本。只有所选模型和运行时支持时，才添加图片、音频、视频或工具。', '选项来自所选运行时的帮助和 metadata。上下文、并行数和启动参数更改需要重启；采样可在下一请求生效。启动失败时，请先查看就绪提示和引擎日志。'] },
      { id: 'benchmarks', title: '4. 在支持的组合上测量与分享', body: ['使用受支持的引擎和模型运行性能基准，只比较相同测量方法与工作负载的结果。性能分数不等于模型质量或完整设备验收。', '分享是可选操作，需要浏览器验证。请先检查公开数据。妥善私下保管恢复码或备份文件，以便在没有账户的情况下管理记录。从应用打开管理页面，或在本站使用恢复文件/恢复码。'] },
    ] },
  },
};
export default content;
