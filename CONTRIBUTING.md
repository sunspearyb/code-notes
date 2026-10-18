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
   node demo/test-clean.cjs && node demo/test-learning.cjs && node demo/test-reflection.cjs && node demo/test-codex.cjs
   cd demo && python3 -m unittest test_service test_agent test_help
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

见[数据包说明](demo/codes/README.md)。欢迎先开一个“功能建议”说明打算做哪一部，避免重复劳动。

## 许可

提交的代码按 [MIT 许可](LICENSE) 发布，提交的文字内容按 [CC BY 4.0](LICENSE-内容.md) 发布。
