# 参与法典笔记

欢迎提出建议、报告错误、指出条文勘误，或者直接改进代码。不会编程也可以参与。

## 不写代码

在 [Issues](../../issues) 中点“New issue”，选一个模板：

- **问题反馈**：用的时候出了错。写明设备、版本和步骤，最好附截图。
- **功能建议**：希望增加或改变的功能。说明想解决什么学习上的问题。
- **条文勘误**：条文、修正对照、英文本或官方资料的文字错误。请附官方原文的出处。

用中文写即可。

## 修改代码

代码是普通的网页文件，不需要复杂的开发环境，有 Python 3 和浏览器即可；运行测试另需 Node.js。

1. 在 GitHub 上点“Fork”，把仓库复制到自己的账号。
2. 修改。可以请 Claude Code、Codex 等编程助手完成，先让它读 [AGENTS.md](AGENTS.md)。
3. 运行检查：

   ```sh
   python3 demo/build.py
   node demo/test-clean.cjs
   node demo/test-learning.cjs
   node demo/test-marks.cjs
   node demo/test-reflection.cjs
   node demo/test-codex.cjs
   node demo/test-games.cjs
   node demo/test-modules.cjs
   node demo/codes/civil-code/test_pack.cjs
   node demo/codes/cyber-law/test_pack.cjs
   for pack in $(python3 -c "import sys; sys.path.insert(0, 'demo'); from edition import pack_names; print(' '.join(pack_names()))"); do
     python3 demo/codes/check_pack.py "$pack"
   done
   (cd demo && PYTHONDONTWRITEBYTECODE=1 python3 -m unittest test_service test_agent test_help test_compose)
   ```

4. 在浏览器中打开 `demo/法典笔记.html`，看改动是否如愿，电脑和手机宽度都看一下。
5. 提交，并在 GitHub 上发起 Pull Request（改进请求）：写明改了什么、为什么改、怎样检查过。仓库会自动运行上面的测试。

### 几条约定

- 一次改进请求只做一件事。
- 不要让已有笔记读不出来；数据结构有变化时，要能读入旧的备份。
- 法典专有的内容放进数据包 `demo/codes/`，通用代码中不写死某一部法典。
- 条文和官方资料逐字照录并写明出处；没有核实的标“待核”。
- 不要提交自己的笔记数据（`.fadian-clean-local/`、`法典笔记数据.json`、`法典笔记.md`）。

### 新增一部法典

先读[新法典操作说明](新法典/给助手的说明.md)，将官方文本放进 `新法典/<简称>/`，运行 `python3 demo/add_code.py 新法典/<简称>`。格式见[数据包说明](demo/codes/README.md)。欢迎先开一个“功能建议”说明打算做哪一部，避免重复劳动。

## 许可

提交的代码按 [MIT 许可](LICENSE) 发布，提交的文字内容按 [CC BY 4.0](LICENSE-内容.md) 发布。

## 条旨、罪名与发布边界

不得自行编写罪名。官方条旨和罪名必须回到依据文件核对，并注明出处；没有核对的不得写入。拟定条旨须经使用者同意，不得冒充罪名。刑法条旨应修改 `新法典/刑法及历次修正案/` 中的输入文件，再重新生成，不直接改生成的 `subtitles.json`。

默认助手权限为保险箱；不得绕过权限、单则笔记隐藏或候选审阅。不要启用合并、拆分法典。本次重新制作前，已按使用者确认运行自动测试并通过；尚未做人工功能试用和真机测试。
