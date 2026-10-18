# 法典笔记

**法解释的方法，就是法律人的学习方法。**

法典笔记是一本按法解释方法组织的个人法典笔记。读一条条文，先弄清字句的意思（文义解释），再把它放回整部法典中看（体系解释），看它怎样制定和修改（历史解释），想它要实现什么目的（目的解释），参照外国的规定（比较法解释），最后写下自己的判断。现在收录《中华人民共和国宪法》1982—2018 年各年文本。

笔记中的解释是学理解释，不具有法律效力。

## 六个原则

法解释方法决定怎样读条文；软件本身，按六个原则构建，二者同样重要：

| 原则 | 在软件中的体现 |
| --- | --- |
| **个性化** | 条旨、使用说明、解释标签都可以按自己的理解改写，修改前的内容保留 |
| **智能化** | 智能辅助整理材料、提出线索；编程助手可以按你的要求修改软件。判断由自己作出 |
| **可塑性** | 源代码是普通的 HTML、CSS 和 JavaScript，随软件提供，可以增删、改变功能 |
| **可扩展** | 法典的正文、目录和专属功能放在[数据包](demo/codes/README.md)里，可以扩展到民法典、刑法等其他法典和立法 |
| **去中心化** | 不依赖服务器和账号，笔记经网盘或文件在设备之间传递 |
| **本地化** | 笔记存在自己的设备上，随时导出 JSON 和 Markdown，带到其他软件（见[数据格式](demo/数据格式.md)） |

## 功能

- **体系阅读**：按章、节读整部宪法，可以自己划分部分，写明部分之间的关系。目录分层折叠，可以按条号或条旨查找。
- **法条精读**：逐条阅读，选词写笔记、建立词条和关联；修正对照、历次修正；官方英文译本对照；记忆卡片。
- **关联阅读**：词条与条文关联、新知导入、材料关联，以及：
  - **比较阅读**：输入一个概念或外国宪法条文，或导入外国宪法、论文，与条文、章节或整部宪法建立关联。
  - **备案审查**：全国人大常委会法制工作委员会备案审查工作报告和审查案例中援引宪法条文的段落，按条文排列，可以据此写审查笔记。
- **我的笔记**：按条文或时间排序，待核清单，方法回顾。
- **导出同步**：导出 JSON 和 Markdown；把整个文件夹放进网盘即可在几台电脑之间同步。

## 下载和安装

| 设备 | 推荐 | 其他选择 |
| --- | --- | --- |
| Windows、Mac 电脑 | **PC&Mac 通用版**：解压后放进网盘的同步文件夹 | Windows 版应用（只用一台电脑时）；网页版 |
| 安卓手机、平板 | **安卓版** APK | 网页版：用 Chrome 打开后添加到主屏幕 |
| 苹果手机、iPad | **网页版**：用 Safari 打开后添加到主屏幕 | — |

各版本在 [Releases](../../releases) 中下载，网页版的网址见仓库主页右侧。安装方法见[各终端安装说明](各终端安装说明.md)。

四种版本是同一个网页，功能相同。只有 PC&Mac 通用版在用启动文件打开时连接本机服务，可以上传附件（PDF、Word）、使用智能辅助、定期备份到目录。

## PC&Mac 通用版

### 打开

- **不装任何软件**：用 Chrome 或 Edge 打开 `demo/法典笔记.html`。可以阅读和写笔记；在“导出同步”中选择本文件夹，笔记会自动写入文件夹中的 `法典笔记数据.json` 和 `法典笔记.md`。
- **完整功能**：需要 Python 3.9 或以上版本。
  - Mac：双击「打开法典笔记.command」。第一次运行时，系统如果提示安装“命令行开发者工具”，按提示安装即可，它包含 Python 3。
  - Windows：先从 [python.org](https://www.python.org/downloads/) 安装 Python，安装时勾选“Add python.exe to PATH”；再双击「打开法典笔记.bat」。
  - 浏览器会打开 `http://127.0.0.1:8766/`。使用期间保持启动窗口打开，关闭窗口即停止。这个网址只在本机使用。

Mac 第一次双击 .command 文件时，系统可能提示“无法打开，因为它来自身份不明的开发者”：请在 Finder 中右键点它，选“打开”，再点“打开”。

### 在几台电脑之间同步

把整个法典笔记文件夹放进 Dropbox、百度网盘或阿里云盘的同步文件夹。用启动文件打开时，笔记保存在文件夹中的 `.fadian-clean-local/`，并写出 `法典笔记数据.json` 和 `法典笔记.md`；网盘把它们同步到另一台电脑。

- **不要在两台电脑上同时打开。** 在一台上写完、关闭，等网盘同步好，再到另一台打开。
- 两台电脑都改过时，有差异的记录都会保留，不会互相覆盖；网盘生成的冲突副本会自动合并。

升级到新版本：解压新版本，把旧文件夹中的 `.fadian-clean-local` 文件夹和 `法典笔记数据.json` 复制到新文件夹，再用新文件夹替换旧文件夹。也可以先导出 JSON，在新版本中导入。

### 资料与智能辅助

在「关联阅读 → 新知导入」上传资料，选择关联范围，自己写关联理由，或请智能辅助先提建议。在「智能辅助」中可以接入能运行本机命令的助手（Claude Code、Codex 等），也可以填写自己的模型接口和密钥；密钥只保存在本次运行的内存中，不写入文件。

TXT、Markdown、DOCX 可以直接提取文字。PDF 需要可选组件 pypdf：`python3 -m pip install -r requirements-optional.txt`（Windows 把 `python3` 换为 `py -3`）。扫描件需要另行识别文字。

## 修改和扩展

- 请编程助手修改：先让它读 [AGENTS.md](AGENTS.md)。
- 自己修改：界面在 `demo/src/`，法典数据在 `demo/codes/`。改完运行 `python3 demo/build.py` 生成页面，`node demo/test-clean.cjs` 等测试检查。
- 扩展到其他法典：见[数据包说明](demo/codes/README.md)。
- 提建议、报告错误、指出条文勘误：在 [Issues](../../issues) 中选择对应的模板。参与修改见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 来源与许可

- 程序代码按 [MIT 许可](LICENSE) 发布。
- 条旨、使用说明等文字按 [CC BY 4.0](LICENSE-内容.md) 发布。
- 宪法条文、修正案、官方英文译本、修正案草案说明和备案审查文件，来源和许可说明见 [LICENSE-内容.md](LICENSE-内容.md)。
- 正文宋体是思源宋体（Noto Serif SC）子集，依 SIL Open Font License 1.1 使用，见 `demo/src/OFL.txt`。

分发包不含任何个人笔记。使用过的文件夹包含你的笔记（`.fadian-clean-local/`、`法典笔记数据.json`、`法典笔记.md`），不要上传到公开的地方；`.gitignore` 已排除这些文件。

---

## English

**Fadian Biji (法典笔记, "Codex Notes") — a personal code notebook organised by the methods of legal interpretation.**

To read a provision, you first settle what its words mean (literal interpretation), then place it back in the whole code (systematic interpretation), see how it was enacted and amended (historical interpretation), ask what it is meant to achieve (teleological interpretation), compare foreign provisions (comparative interpretation), and finally write down your own judgment. The notebook currently contains the Constitution of the People's Republic of China, with the text of every year from 1982 to 2018.

Interpretations written in the notebook are scholarly, not legally binding.

### What it does

- **Systematic reading** — read the whole code by chapter and section, divide it into parts yourself, and describe how the parts relate. Nested table of contents; find by article number or by heading.
- **Close reading of provisions** — read article by article; select words to write notes, build a glossary and links between provisions; compare amended texts and track each amendment; read the official English translation alongside; review with flashcards.
- **Linked reading** — link glossary entries to articles, import your own materials, and attach them to articles, chapters or the whole code; comparative reading against foreign constitutions; excerpts from the NPC Standing Committee's filing-review reports and cases that cite constitutional provisions.
- **Constitutional statutes (宪法相关法)** — the 56 statutes classified as constitutional statutes by the Legislative Affairs Commission, linked to the National Laws and Regulations Database; the words in the Constitution that leave a matter to law ("as provided by law") are underlined and clickable.
- **Faquan analysis (法权分析)** — an optional framework, offered as one school of thought rather than the mainstream, for analysing the rights and powers in a provision step by step.
- **My notes** — sort by article or by date; a list of items still to be checked; a review of which interpretation methods your notes use.
- **Export and sync** — export JSON and Markdown; put the whole folder in a cloud-sync folder to move notes between computers.

### Six principles

The software is built on six principles, which matter as much as the methods of interpretation:

| Principle | How the software reflects it |
| --- | --- |
| **Personal** | Headings (条旨), the user guide and interpretation tags can all be rewritten in your own words; earlier versions are kept |
| **Assisted** | The built-in assistant can sort materials and suggest leads; a coding assistant can change the software at your request. The judgment stays yours |
| **Malleable** | The source is plain HTML, CSS and JavaScript, shipped with the software and free to change |
| **Extensible** | The text, structure and code-specific features of each code live in a [data pack](demo/codes/README.md); further codes (civil code, criminal law, …) can be added |
| **Decentralised** | No server and no account; notes travel between devices through cloud storage or files |
| **Local** | Notes stay on your own device and can be exported at any time as JSON and Markdown (see [数据格式](demo/数据格式.md)) |

### Download and install

| Device | Recommended | Also available |
| --- | --- | --- |
| Windows or Mac computer | **PC & Mac edition**: unzip into a cloud-sync folder | Windows app (single computer); web edition |
| Android phone or tablet | **Android edition** (APK) | Web edition: open in Chrome and add to home screen |
| iPhone or iPad | **Web edition**: open in Safari and add to home screen | — |

Download from [Releases](../../releases); the web edition is linked on the repository's home page. Installation details (in Chinese) are in [各终端安装说明](各终端安装说明.md).

All editions run the same page and have the same features. Only the PC & Mac edition, when opened with its launcher, starts a local service for attachments (PDF, Word), the built-in assistant and scheduled backups to the folder.

### Around the Constitution

- The official English translation reproduced in the app is the one published by the NPC; the Chinese text governs.
- Source, provenance and licensing of the constitutional text, amendments and filing-review documents are set out in [LICENSE-内容.md](LICENSE-内容.md) (Chinese).
- The four methods of interpretation are the ones commonly listed in Chinese legal scholarship; comparative interpretation and 法权分析 are optional, each with its own sources and its own critics. Which to use is the reader's decision.

### Licence

- Code: [MIT](LICENSE).
- Text written for this project (headings, user guide, and similar): [CC BY 4.0](LICENSE-内容.md).
- The body type is a subset of Noto Serif SC, used under the SIL Open Font License 1.1; see `demo/src/OFL.txt`.

The distributed packages contain no personal notes. A folder you have used does contain your notes (`.fadian-clean-local/`, `法典笔记数据.json`, `法典笔记.md`); do not upload it anywhere public. `.gitignore` already excludes these files.
