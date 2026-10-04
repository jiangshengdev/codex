import { expect, test } from "vitest";
import { resolveThreadHistoryPresentation } from "../threadHistoryPresentation";

test.each([
  { name: "  Task  ", preview: "  Summary  ", title: "Task", summary: "Summary" },
  { name: null, preview: "  Preview  ", title: "Preview", summary: null },
  { name: "", preview: "Preview", title: "Preview", summary: null },
  { name: " \t\n ", preview: "  Preview  ", title: "Preview", summary: null },
  { name: null, preview: "", title: "Default title", summary: null },
  { name: " \t ", preview: " \n ", title: "Default title", summary: null },
  { name: "Task", preview: " \t ", title: "Task", summary: null },
  { name: "  Task ", preview: " Task  ", title: "Task", summary: null },
  { name: "Task", preview: "Task details", title: "Task", summary: "Task details" },
  { name: "Task", preview: "task", title: "Task", summary: "task" },
  {
    name: "  Task  name  ",
    preview: " Task name ",
    title: "Task  name",
    summary: "Task name",
  },
  {
    name: null,
    preview: "  First\nsecond  line  ",
    title: "First\nsecond  line",
    summary: null,
  },
])(
  "resolves history presentation for name=$name and preview=$preview",
  ({ name, preview, title, summary }) => {
    expect(resolveThreadHistoryPresentation({ name, preview }, "Default title")).toEqual({
      title,
      summary,
    });
  },
);
