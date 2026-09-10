import {
  fromMarkdown,
  type CompileContext,
  type Extension as FromMarkdownExtension,
  type Handle,
} from "mdast-util-from-markdown";
import type { Extension, State, Tokenizer } from "micromark-util-types";
import { parseMarkdownIntoBlocks } from "streamdown";
import type { Plugin } from "unified";

declare module "micromark-util-types" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Module augmentation requires declaration merging.
  interface TokenTypeMap {
    assistantBackslashMath: "assistantBackslashMath";
    assistantBackslashMathFlow: "assistantBackslashMathFlow";
    assistantBackslashMathData: "assistantBackslashMathData";
  }
}

declare module "unified" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Module augmentation requires declaration merging.
  interface Data {
    micromarkExtensions?: Extension[];
    fromMarkdownExtensions?: FromMarkdownExtension[];
  }
}

const createTokenizer = (flow: boolean): Tokenizer =>
  function (effects, ok, nok) {
    let closing: number;
    let dataOpen = false;
    const tokenType = flow ? "assistantBackslashMathFlow" : "assistantBackslashMath";

    const start: State = (code) => {
      effects.enter(tokenType);
      effects.consume(code);
      return opening;
    };

    const opening: State = (code) => {
      if (code !== 91 && (flow || code !== 40)) return nok(code);
      closing = code === 40 ? 41 : 93;
      effects.consume(code);
      if (flow && this.interrupt) return ok;
      return lineStart;
    };

    const lineStart: State = (code) => {
      if (code === null) return nok(code);
      if (flow && (code === -3 || code === -4 || code === -5)) return body(code);
      effects.enter("assistantBackslashMathData");
      dataOpen = true;
      return body(code);
    };

    const body: State = (code) => {
      if (code === null) return nok(code);
      if (flow && (code === -3 || code === -4 || code === -5)) {
        if (dataOpen) effects.exit("assistantBackslashMathData");
        dataOpen = false;
        effects.enter("lineEnding");
        effects.consume(code);
        effects.exit("lineEnding");
        return lineStart;
      }
      effects.consume(code);
      return code === 92 ? afterBackslash : body;
    };

    const afterBackslash: State = (code) => {
      if (code === null) return nok(code);
      if (flow && (code === -3 || code === -4 || code === -5)) return body(code);
      effects.consume(code);
      if (code === closing) {
        effects.exit("assistantBackslashMathData");
        dataOpen = false;
        effects.exit(tokenType);
        return flow ? afterFlow : ok;
      }
      return body;
    };

    const afterFlow: State = (code) => {
      if (code === null || code === -3 || code === -4 || code === -5) return ok(code);
      if (code === 32 || code === -1 || code === -2) {
        effects.enter("lineSuffix");
        return trailingSpace(code);
      }
      effects.enter("paragraph");
      effects.enter("chunkText", { contentType: "text" });
      return tail(code);
    };

    const trailingSpace: State = (code) => {
      if (code === 32 || code === -1 || code === -2) {
        effects.consume(code);
        return trailingSpace;
      }
      effects.exit("lineSuffix");
      return afterFlow(code);
    };

    const tail: State = (code) => {
      if (code === null || code === -3 || code === -4 || code === -5) {
        effects.exit("chunkText");
        effects.exit("paragraph");
        return ok(code);
      }
      effects.consume(code);
      return tail;
    };

    return start;
  };

const syntax: Extension = {
  // String content (including link destinations) and code remain Markdown-owned.
  text: { 92: { name: "assistantBackslashMath", tokenize: createTokenizer(false) } },
  flow: {
    92: { name: "assistantBackslashMathFlow", concrete: true, tokenize: createTokenizer(true) },
  },
};

const enterMath: Handle = function (token) {
  const source = this.sliceSerialize(token);
  const value = source.slice(2, -2);
  const display = source[1] === "[";
  this.enter(
    {
      type: token.type === "assistantBackslashMathFlow" ? "code" : "inlineCode",
      value,
      // Use the same pre/code boundary as remark-math. Sanitization retains
      // language-math; rehype-katex owns both display mode and final markup.
      data: display
        ? {
            hName: "pre",
            hChildren: [
              {
                type: "element",
                tagName: "code",
                properties: { className: ["language-math"] },
                children: [{ type: "text", value }],
              },
            ],
          }
        : { hProperties: { className: ["language-math"] } },
    },
    token,
  );
  this.buffer();
};

const exitMath: Handle = function (token) {
  this.resume();
  this.exit(token);
};

const mathFromMarkdown: FromMarkdownExtension = {
  enter: { assistantBackslashMath: enterMath, assistantBackslashMathFlow: enterMath },
  exit: { assistantBackslashMath: exitMath, assistantBackslashMathFlow: exitMath },
};

export const remarkBackslashMath: Plugin = function () {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(syntax);
  (data.fromMarkdownExtensions ??= []).push(mathFromMarkdown);
};

type MarkdownNode = Parameters<CompileContext["enter"]>[0];

export const parseAssistantMarkdownIntoBlocks = (source: string): string[] => {
  const blocks = parseMarkdownIntoBlocks(source);
  if (blocks.length < 2 || !source.includes("\\[")) return blocks;
  const ranges: { start: number; end: number }[] = [];
  const collect = (node: MarkdownNode) => {
    if ((node.type === "code" || node.type === "inlineCode") && node.data?.hName === "pre") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) ranges.push({ start, end });
    }
    if ("children" in node) node.children.forEach(collect);
  };
  // Streamdown normalizes line endings while splitting. Positions must refer to
  // those exact strings, rather than the original CRLF-bearing message.
  collect(
    fromMarkdown(blocks.join(""), { extensions: [syntax], mdastExtensions: [mathFromMarkdown] }),
  );
  const merged: string[] = [];
  let offset = 0;
  let rangeIndex = 0;
  let currentBlock = "";
  for (const block of blocks) {
    currentBlock += block;
    offset += block.length;
    let range = ranges[rangeIndex];
    while (range && range.end <= offset) {
      rangeIndex += 1;
      range = ranges[rangeIndex];
    }
    if (!range || range.start >= offset) {
      merged.push(currentBlock);
      currentBlock = "";
    }
  }
  return merged;
};
