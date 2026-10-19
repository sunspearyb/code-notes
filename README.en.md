# Fadian Biji · Codex Notes

[中文](README.md) | **English**

**Fadian Biji (法典笔记, "Codex Notes") — a personal code notebook organised by the methods of legal interpretation.**

To read a provision, you first settle what its words mean (literal interpretation), then place it back in the whole code (systematic interpretation), see how it was enacted and amended (historical interpretation), ask what it is meant to achieve (teleological interpretation), compare foreign provisions (comparative interpretation), and finally write down your own judgment. The notebook currently contains three collections: the Constitution of the People's Republic of China (annual texts from 1982 to 2018), the Civil Code, and Cyber Law, a collection of the Cybersecurity Law, Data Security Law and Personal Information Protection Law.

Interpretations written in the notebook are scholarly, not legally binding.

### What it does

All three collections share reading, note-taking, search and export features. Amendment comparisons, official English translations and constitutional review materials depend on the data pack.

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
| **Extensible** | The text, structure and code-specific features of each code live in a [data pack](demo/codes/README.md); further codes, such as criminal law, can be added |
| **Decentralised** | No server and no account; notes travel between devices through cloud storage or files |
| **Local** | Notes stay on your own device and can be exported at any time as JSON and Markdown (see [数据格式](demo/数据格式.md)) |

### Download and install

| Device | Recommended | Also available |
| --- | --- | --- |
| Windows or Mac computer | **PC & Mac edition**: unzip into a cloud-sync folder | Windows app (single computer) |
| Android phone or tablet | **Android edition** (APK) | Web preview only |
| iPhone or iPad | **Web preview**: open in Safari; do not add information | — |

Download from [Releases](../../releases); links to all three web previews appear below. Installation details (in Chinese) are in [各终端安装说明](各终端安装说明.md).

The PC & Mac package contains all three collections. The Windows apps, Android APK and web deployment ZIP in the current Release contain the Constitution. The editions share the same web application; content varies by data pack. Only the PC & Mac edition, when opened with its launcher, starts a local service for attachments (PDF, Word), the built-in assistant and scheduled backups to the folder.

### Online preview

These web editions are for preview only. Please do not add any information. Download the appropriate edition for regular use.

- [Constitution](https://sunspearyb.github.io/code-notes/)
- [Civil Code](https://sunspearyb.github.io/code-notes/civil-code/)
- [Cyber Law](https://sunspearyb.github.io/code-notes/cyber-law/)

### Around the Constitution

- The official English translation reproduced in the app is the one published by the NPC; the Chinese text governs.
- Source, provenance and licensing of the constitutional text, amendments and filing-review documents are set out in [LICENSE-内容.md](LICENSE-内容.md) (Chinese).
- The four methods of interpretation are the ones commonly listed in Chinese legal scholarship; comparative interpretation and 法权分析 are optional, each with its own sources and its own critics. Which to use is the reader's decision.

### Licence

- Code: [MIT](LICENSE).
- Text written for this project (headings, user guide, and similar): [CC BY 4.0](LICENSE-内容.md).
- The body type is a subset of Noto Serif SC, used under the SIL Open Font License 1.1; see `demo/src/OFL.txt`.

The distributed packages contain no personal notes. A folder you have used does contain your notes (`.fadian-clean-local/`, `法典笔记数据.json`, `法典笔记.md`); do not upload it anywhere public. `.gitignore` already excludes these files.
