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
    labels: {
      copyCode: "Copy Code",
      copyTable: "Copy table",
      downloadFile: "Download file",
      downloadTable: "Download table",
    },
  },
  {
    locale: "zh-CN",
    labels: {
      copyCode: "复制代码",
      copyTable: "复制表格",
      downloadFile: "下载文件",
      downloadTable: "下载表格",
    },
  },
] as const;
