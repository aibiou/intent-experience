# 规划归档参考资料

本目录保存用户提供的规划归档中的 36 份唯一 Markdown 源文档。源文件名和内容保持原样；它们是参考来源，不因导入而自动成为已批准或冻结的产品契约。

## 来源与校验

- 来源：`archive_unencrypted/` 中顶层 Markdown 文件。
- `SHA256SUMS`：记录 36 份导入文件的 SHA-256；校验命令为 `shasum -a 256 -c SHA256SUMS`。
- 导入时逐份与来源文件进行字节比较，均一致。
- `__MACOSX/` 下的 AppleDouble 元数据文件不属于产品文档，未导入。

## 排除的重复文件

下列五份带“(1)”后缀的文件与对应规范文件逐字节重复，仅保留规范文件：

- `17｜Event & Analytics Contract V1（事件与数据分析契约 V1） (1).md`
- `18｜Evaluation System V1（评测与验收体系 V1） (1).md`
- `P2-EVIDENCE-8.0 — Closure Evidence Execution Register（P2 关闭证据执行登记表） (1).md`
- `Screen 06｜Experience Policy Engine 规格 (1).md`
- `V1 第一条完整 Experience｜从好奇到创造的可运行垂直切片 (1).md`
