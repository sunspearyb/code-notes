# Fadian Biji · Codex Notes

[中文](README.md) | **English**

**Fadian Biji (法典笔记, "Codex Notes") — a personal code notebook organised by the methods of legal interpretation.**

To read a provision, you first settle what its words mean (literal interpretation), then place it back in the whole code (systematic interpretation), see how it was enacted and amended (historical interpretation), ask what it is meant to achieve (teleological interpretation), compare foreign provisions (comparative interpretation), and finally write down your own judgment. The notebook currently contains five collections: the Constitution of the People's Republic of China (annual texts from 1982 to 2018), the Civil Code, Cyber Law (the Cybersecurity Law, Data Security Law and Personal Information Protection Law), the Legislation Law (2000, 2015 and 2023), and the Criminal Law (13 text snapshots from 1997 to 2023).

Interpretations written in the notebook are scholarly, not legally binding.

### What it does

All five collections share reading, note-taking, search and export features. Amendment comparisons, official English translations and constitutional review materials depend on the data pack.

- **Systematic reading** — read the whole code by chapter and section, divide it into parts yourself, and describe how the parts relate. Nested table of contents; find by article number or by heading.
- **Close reading of provisions** — read article by article; select words to write notes, build a glossary and links between provisions; compare amended texts and track each amendment; read the official English translation alongside; review with flashcards.
- **Linked reading** — link glossary entries to articles, import your own materials, and attach them to articles, chapters or the whole code; comparative reading against foreign constitutions; excerpts from the NPC Standing Committee's filing-review reports and cases that cite constitutional provisions.
- **Constitutional statutes (宪法相关法)** — the 56 statutes classified as constitutional statutes by the Legislative Affairs Commission, linked to the National Laws and Regulations Database; the words in the Constitution that leave a matter to law ("as provided by law") are underlined and clickable.
- **Faquan analysis (法权分析)** — an optional framework, offered as one school of thought rather than the mainstream, for analysing the rights and powers in a provision step by step.
- **My notes** — sort by article or by date; a list of items still to be checked; a review of which interpretation methods your notes use.
- **Export and sync** — export JSON and Markdown. The desktop folder edition can sync through a cloud folder. Conflicting edits to the same note keep the later version, with the earlier one in its history; deletions also take part in merging.
- **Optional tarot study cards** — enable them under Settings → Reading. Each card provides a study question and an explanation; answers become ordinary notes. Off by default.
- **Local assistant access** — choose vault (default), read-only or collaboration separately for each code, and hide individual notes. The desktop folder edition provides MCP access; proposed notes require review.
- **Links across codes** — in close reading, open “关联” → “建立关联”, choose a code, then find a provision by number or heading and optionally select words or concepts. Available in the native apps, web edition and desktop folder edition. For offline web use, download the other code’s page first. Browsers may block access when opening a single HTML file directly. The old tab in related reading has been removed; existing records remain available.
- **Criminal Law amendments and offence names** — amendment labels open the relevant source item. Official offence-name headings carry a source marker; other headings are drafts.

### Six principles

The software is built on six principles, which matter as much as the methods of interpretation:

| Principle | How the software reflects it |
| --- | --- |
| **Personal** | Headings (条旨), the user guide and interpretation tags can all be rewritten in your own words; earlier versions are kept |
| **Assisted** | The built-in assistant can sort materials and suggest leads; a coding assistant can change the software at your request. The judgment stays yours |
| **Malleable** | The source is plain HTML, CSS and JavaScript, shipped with the software and free to change |
| **Extensible** | The text, structure and code-specific features of each code live in a [data pack](demo/codes/README.md); further laws can be added through the `新法典/` input folder |
| **Decentralised** | No server and no account; notes travel between devices through cloud storage or files |
| **Local** | Notes stay on your own device and can be exported at any time as JSON and Markdown (see [数据格式](demo/数据格式.md)) |

### Choose an edition

The editions built for 1.0.0 hold the Constitution, Civil Code, Cyber Law, Legislation Law and Criminal Law; notes stay on your own device. Download from the [latest release](https://github.com/sunspearyb/code-notes/releases/latest) (Assets). Step-by-step instructions in Chinese: [各终端安装说明](各终端安装说明.md).

| Device | Recommended | File |
|---|---|---|
| Mac | Mac app | `fadian-notes-mac-TAG.dmg` |
| Windows | Windows app | `fadian-notes-windows-setup-TAG.exe` (no install: `-portable-`) |
| Android | Android app (built by the maintainer), or mobile web | `fadian-notes-android-TAG.apk` |
| iPhone, iPad, HarmonyOS 5+ | Mobile web edition | links below |
| Uploading sources, local AI assistants | Desktop folder edition | `fadian-notes-pc-mac-TAG.zip` |

The Mac and Windows apps are one app for all five codes: switch with the ▾ beside the code's name at the top left. Each code keeps its own notes. The apps are not signed with paid certificates, so macOS and Windows ask once before the first launch.

#### Mobile web edition

- [Constitution](https://sunspearyb.github.io/code-notes/) · [Civil Code](https://sunspearyb.github.io/code-notes/civil-code/) · [Cyber-law code](https://sunspearyb.github.io/code-notes/cyber-law/) · [Legislation Law](https://sunspearyb.github.io/code-notes/legislation-law/) · [Criminal Law](https://sunspearyb.github.io/code-notes/criminal-law/)

Open in Safari (iPhone, iPad) or Chrome (Android) and add to the home screen. Works offline after the first full load. Export a JSON backup of each code every week.

#### Read-only preview

[Preview index](https://sunspearyb.github.io/code-notes/preview/): [Constitution](https://sunspearyb.github.io/code-notes/preview/constitution/), [Civil Code](https://sunspearyb.github.io/code-notes/preview/civil-code/), [Cyber Law](https://sunspearyb.github.io/code-notes/preview/cyber-law/), [Legislation Law](https://sunspearyb.github.io/code-notes/preview/legislation-law/), [Criminal Law](https://sunspearyb.github.io/code-notes/preview/criminal-law/). These separate reading pages do not load the notebook application and have no input, upload, import or save controls.

#### Self-hosting

The web deployment ZIP in each release (`fadian-notes-web-TAG.zip`) is for website maintainers deploying to their own HTTPS site. It includes HTML, icons, an app manifest and an offline service worker. It is not a mobile installer and ordinary users do not need it. To deploy all five collections, follow the repository's Pages workflow to build each data pack.

### Around the Constitution

- The official English translation reproduced in the app is the one published by the NPC; the Chinese text governs.
- Source, provenance and licensing of the constitutional text, amendments and filing-review documents are set out in [LICENSE-内容.md](LICENSE-内容.md) (Chinese).
- The four methods of interpretation are the ones commonly listed in Chinese legal scholarship; comparative interpretation and 法权分析 are optional, each with its own sources and its own critics. Which to use is the reader's decision.

### Version 1.0.0

This release starts the `MAJOR.MINOR.PATCH` numbering convention; its GitHub tag is `v1.0.0`. Previous date-based releases remain available. Each self-contained page is about 4–8 MB, including fonts, card images and historical text.

Back up each code before upgrading. The maintainer builds the Android APK with the original signing key. Export a JSON backup before installing the update over the existing app; do not uninstall, as that removes notes. Update all devices used for syncing: 20261030-r4 and older versions do not understand deletion records and may show deleted notes again.

The 140 draft Criminal Law headings have not been individually approved. Some offence-name sources remain government/database reprints; 36 reconstructed intermediate texts lack an independent comparison. Five unmatched older Legislation Law provisions need manual review. Source records are included in `新法典/`. The application does not check for newer legislation automatically.

Automated tests passed for this rebuild; manual functional and device testing have not been performed. Flashcards may still include annexes and deleted provisions. Switching codes does not jump to the linked article. MCP setup in Codex and WorkBuddy remains untested.

### Licence

- Code: [MIT](LICENSE).
- Text written for this project (headings, user guide, and similar): [CC BY 4.0](LICENSE-内容.md).
- Card images and their public-domain attribution: [source note](demo/games/tarot/来源.md).
- The body type is a subset of Noto Serif SC, used under the SIL Open Font License 1.1; see `demo/src/OFL.txt`.

The distributed packages contain no personal notes. A folder you have used does contain your notes (`.fadian-clean-local/`, `法典笔记数据.json`, `法典笔记.md`); do not upload it anywhere public. `.gitignore` already excludes these files.
