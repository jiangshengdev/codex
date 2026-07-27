import type { Messages } from "@lingui/core";

export const streamdownControlMarkdown = [
  "```ts",
  'const value: string = "streamdown controls";',
  "```",
  "",
  "| Name | Value |",
  "| --- | --- |",
  "| Control | Visible |",
].join("\n");

export const streamdownControlLocales = [
  {
    locale: "en",
    messages: undefined,
    labels: {
      copyCode: "Copy Code",
      copyTable: "Copy table",
      downloadFile: "Download file",
      downloadTable: "Download table",
    },
  },
  {
    locale: "zh-CN",
    messages: {
      "iVm46-": "复制代码",
      "Q-T9qu": "复制表格",
      WcWS__: "下载文件",
      EHm9Jo: "下载表格",
    } satisfies Messages,
    labels: {
      copyCode: "复制代码",
      copyTable: "复制表格",
      downloadFile: "下载文件",
      downloadTable: "下载表格",
    },
  },
] as const;
