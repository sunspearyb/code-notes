# 给编程助手的说明

你在修改“法典笔记”。动手之前读完本文件。使用者多是法学学生和教师，不一定懂编程：用中文向他们说明你改了什么、怎样检查。

## 这个软件是什么

一本按法解释方法组织的个人法典笔记。两条核心理念同样重要：

1. **法解释的方法，就是法律人的学习方法。** 文义解释、体系解释、历史解释、目的解释（以及比较法解释）决定了界面怎样组织阅读和笔记。
2. **六个原则：个性化、智能化、可塑性、可扩展、去中心化、本地化。** 笔记属于使用者，存在使用者的设备上；软件可以由使用者（和你）改造；不依赖服务器和账号。

新增功能时，两条都要顾及：功能应当服务于某种读法或解释方法；数据要留在本地、可以导出，不引入必须联网的服务或账号。

## 目录

| 位置 | 内容 |
| --- | --- |
| `demo/src/` | 各部法典通用的界面和数据模型（HTML、CSS、JavaScript，不用框架和构建工具） |
| `demo/codes/<名称>/` | 一部法典的数据包，格式见 `demo/codes/README.md` |
| `demo/data/content.json` | 用哪个数据包，以及首次打开时装入的笔记（分发版为空） |
| `demo/build.py` | 把以上内容合成为页面：默认数据包（宪法）生成 `demo/法典笔记.html`，其他数据包生成 `demo/法典笔记-<名称>.html` |
| `demo/local_service.py`、`demo/serve.py` | PC&Mac 通用版的本机服务（Python 标准库）：附件、智能辅助、目录备份 |
| `demo/数据格式.md` | 导出的 JSON 和 Markdown 的格式 |
| `维护工具/` | 制作网页版、安卓版、Windows 版、Mac 版（一个应用含全部法典，`windows-app` 同时用于 Windows 和 Mac）和应用图标的工具 |

`demo/src/` 中的脚本按 `build.py` 列出的顺序拼接：`model.js`、`notebook.js`、`learning-model.js` 是数据模型（不碰页面）；`app.js` 起是界面。后面的文件常常包装前面的函数（例如 `renderSearch=function(){…}`），新功能通常放进一个新文件，加到列表末尾之前，而不是改动已有函数的内部。

## 硬性规矩

1. **不能让已有笔记丢失或读不出来。** 改变数据结构时，在 `normalize`／`migrate` 中兼容旧数据，旧备份必须仍能导入。不要改浏览器记录名（`demo/edition.json` 的 `storageKey`）和数据目录。
2. **不要在代码里写死某一部法典。** 法典名称、年份、条号、目录结构、引用格式从数据包读取（`CODEX`、`M.years`、`FIRST`、`LATEST`、`M.tree()`）。只适用于宪法的内容放进 `demo/codes/constitution/`。
3. **条文和官方文本逐字照录，写明出处。** 不确定的标“待核”。不要从商业出版物复制条旨或注释。
4. **不加载外部脚本、字体或统计代码。** 页面必须离线可用。
5. **用语。** 用“条旨”“修正对照”“历次修正”“文义解释、体系解释、历史解释、目的解释”“智能辅助”。笔记中的解释是学理解释，不具有法律效力；不要在界面中替使用者作出法律判断。
6. **助手的建议必须经使用者核对后才能收入笔记。** 不要绕过审阅步骤。
7. **不提交个人数据。** `.fadian-clean-local/`、`法典笔记数据*.json`、`法典笔记.md` 和任何使用过的备份不得进入仓库。

## 改完之后

```sh
python3 demo/build.py                 # 生成页面
node demo/test-clean.cjs              # 分发版检查：空白书库、保存后重开、条文完整
node demo/test-learning.cjs           # 数据模型
node demo/test-reflection.cjs         # 助手建议的审阅流程
node demo/test-codex.cjs              # 其他数据包：几部法律合编、多层目录、千位条号
python3 demo/codes/check_pack.py <名称>   # 改动了某个数据包时
cd demo && python3 -m unittest test_service test_agent test_help
```

测试全部通过后，用浏览器打开 `demo/法典笔记.html`，在电脑宽度和手机宽度（约 390 像素）下检查改动的页面。新功能请补测试。

界面增加了字体子集中没有的汉字时，正文会退回系统宋体。需要时运行 `demo/build_font.py`（说明见文件开头）。

## 常见任务

- **新增一个功能页**：参考 `demo/src/readings.js`（比较阅读、备案审查、英文本）。
- **新增一类材料**（如司法解释、指导性案例）：在数据包的 `codex.json` 中声明 `relationCategories`，不必改代码。
- **扩展到其他法典**：按 `demo/codes/README.md` 新建数据包，未完成时文件夹名以 `_` 开头。正文取自国家法律法规数据库，逐条核对，用 `check_pack.py` 检查。用 `python3 demo/launch.py --open --codex <名称>` 连本机服务试用。每部法典的浏览器记录、端口和数据文件夹各自分开，不要合并。
- **设置页、外观和字号**：见 `demo/src/settings.js`。这些是设备设置，存在 localStorage 的 `fadian-settings` 中，不进笔记和备份。高亮标记见 `marks.js`，专注模式见 `focus.js`。
- **改变导出或同步**：见 `demo/src/storage.js` 和 `demo/数据格式.md`；两边内容不同时保留两个版本，不要覆盖。
