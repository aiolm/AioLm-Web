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
      { id: 'choose', title: '应该选哪一个？', table: { headers: ['引擎', '适用情况'], rows: [['llama.cpp', '在 Windows、Mac 或 Linux 上从 GGUF 开始'], ['vLLM', '已经准备好受支持的 Linux 加速器环境'], ['vLLM · vllm-metal', '在 Apple 芯片 Mac、macOS 15+ 上使用 vLLM'], ['MLX', '在 Apple 芯片 Mac 上使用 MLX 模型'], ["自定义引擎", '已有单独安装的引擎和适配器']] }, note: 'Intel Mac 无法使用 MLX 或 vllm-metal，请先检查安装界面的要求。' },
      { id: 'models', title: '下载匹配格式的模型', body: ['llama.cpp 使用 GGUF 文件。vLLM 和 MLX 通常需要包含模型、配置和 tokenizer 的完整目录。不要只复制一个文件，请在搜索页面选择正确格式。', '内存不足时尝试更小的模型。需要图片或音频时，同时检查模型说明和应用显示的支持情况。'], image: 'discover', caption: '先在搜索页面顶部选择引擎和模型格式。', more: [{ title: 'vLLM 和 MLX 的详细条件', body: ['Linux 托管 vLLM 安装 CUDA 依赖。AMD ROCm 需要另外准备与驱动匹配的 Python 环境并注册。AioLM 不安装系统显卡驱动。', 'vllm-metal 需要 Apple 芯片、macOS 15+ 和原生 arm64 Python 3.12，不支持 Intel 和 Rosetta Python。MLX 也需要 Apple 芯片及兼容 Python 环境。', '原生 Windows vLLM、WSL 和远程服务器不是此应用的本地运行目标。Python 模型需要完整 safetensors 或受支持的 MLX 快照。vllm-metal 只支持部分 GGUF，不能等同于普通 GGUF 支持。'] }] },
      { id: 'limits', title: '仍需确认的地方', body: ['图片、音频、视频和工具需要模型与引擎同时支持。注册引擎不会自动启用所有功能。'], more: [{ title: 'v0.3.2 验证范围与已知问题', body: ['SmolVLM 图片、视频内容质量问题（F09）尚未解决。', '安装包构建通过，不表示所有设备上的推理都已验证。Linux 整体验证及真实的 v0.3.1 → v0.3.2 更新安装、UI 验收也尚未完成。', '基准、深度验证和便携包因引擎而异。独自 custom.* 引擎目前不属于公开基准分享对象。'] }] },
    ] },
    adapters: { title: "连接自定义引擎", description: "将已安装的自定义引擎连接到 AioLM。第一次使用建议先用内置引擎开始对话。", sections: [
      { id: 'prepare', title: '开始前准备好', body: ['需要引擎程序和针对该引擎的连接设置。适配器是让 AioLM 能启动并与其他引擎交流的连接工具。', '先按照引擎提供方的说明完成安装。如果只有可执行文件，请向提供方获取 AioLM 兼容的适配器或设置文件。这些引擎并非全部内置。'], note: '只使用可信的程序和设置文件。检查连接信息的过程也会运行所选程序。' },
      { id: 'add', title: '1. 添加推理引擎', body: ['停止正在运行的模型和任务。点击左侧推理引擎 → 添加推理引擎。'], image: 'adapter-add', caption: '在内置引擎所在的同一个列表中添加新引擎。' },
      {"id": "setup", "title": "2. 加载提供的连接设置", "body": ["点击查看随附适配器，或选择导入适配器设置打开收到的文件。选择适合自己自定义引擎的设置。", "按提供方说明填写程序、安装目录和配置文件，再点击检查安装并继续。不要照抄示例路径。"], "caption": "此处仅用Strata设置演示一种自定义引擎连接方式。其他引擎请使用对应提供方的设置。", "more": [{"title": "查看连接示例", "body": ["例如，Strata可从随附列表选择。Installed Python executable选择Python程序，Installed SDK folder选择引擎目录，Dedicated deployment JSON选择提供的配置文件。Runtime ID填一个名称，如local-engine；其他提供的值保持不变。", "TensorFold也是自定义引擎的一个示例。准备对应提供方的兼容适配器和设置文件，再按相同的连接步骤操作。不同引擎的安装要求和支持功能可能不同。"]}], "image": "adapter-setup"},
      { id: 'help', title: '3. 点击发现帮助', body: ['应用会读取引擎可用的设置。如果失败，请检查文件和安装状态，不要跳过。完成后点击下一步。'], image: 'adapter-help', caption: '读取帮助前的界面。这些指南示例没有实际运行自定义引擎。' },
      { id: 'check', title: '4. 检查连接信息', body: ['将模型、端口和兼容性检查字段与提供方说明对照。保留设置自动填入的值，不要猜测空白或不认识的字段。', '准备好后点击检查注册内容。若必须手动输入而你不确定，请向提供方确认。'], image: 'adapter-check', caption: '示例用于说明输入框位置，实际值因引擎和适配器而异。' },
      { id: 'review', title: '5. 注册后再选择模型', body: ['检查内容后点击注册。然后在模型选择与设置中选择新引擎、运行时和模型。', '通过应用的兼容性检查后再运行，并试试简短问题、取消、停止和重启。注册成功并不保证模型能运行。'], image: 'adapter-review', caption: '这是注册前的检查示例，不是注册完成或推理成功的结果。', more: [{ title: '手动连接需要哪些信息？', body: ['手动设置适合提供方和开发者。需要执行程序与启动参数、custom.* 引擎 ID、运行时 ID、模型和端口对应方式，以及兼容性 probe 程序。', '引擎若不提供 OpenAI 兼容 HTTP/SSE，需要 bridge 提供。凭据通过提供方指定的环境变量传递，不要用额外参数覆盖模型、主机、端口和认证。', '程序、启动方式或适配器改变后，请重新检查帮助和模型兼容性。移除注册不会删除外部文件。公开基准分享、深度验证和便携包需要单独支持。'] }] },
    ] },
  },
};
export default content;
