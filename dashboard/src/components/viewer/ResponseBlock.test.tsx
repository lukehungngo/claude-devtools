import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ResponseBlock } from "./ResponseBlock";

afterEach(cleanup);

describe("ResponseBlock", () => {
  it("returns null for empty text", () => {
    const { container } = render(<ResponseBlock text="" />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null for whitespace-only text", () => {
    const { container } = render(<ResponseBlock text="   " />);
    expect(container.innerHTML).toBe("");
  });

  it("renders markdown headings as heading elements", () => {
    const { container } = render(
      <ResponseBlock text={"# Heading 1\n\n## Heading 2\n\n### Heading 3"} />
    );
    expect(container.querySelector("h1")).not.toBeNull();
    expect(container.querySelector("h1")!.textContent).toBe("Heading 1");
    expect(container.querySelector("h2")).not.toBeNull();
    expect(container.querySelector("h2")!.textContent).toBe("Heading 2");
    expect(container.querySelector("h3")).not.toBeNull();
    expect(container.querySelector("h3")!.textContent).toBe("Heading 3");
  });

  it("renders bold text as strong elements", () => {
    const { container } = render(
      <ResponseBlock text="This is **bold** text" />
    );
    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe("bold");
  });

  it("renders italic text as em elements", () => {
    const { container } = render(
      <ResponseBlock text="This is *italic* text" />
    );
    const em = container.querySelector("em");
    expect(em).not.toBeNull();
    expect(em!.textContent).toBe("italic");
  });

  it("renders fenced code blocks with pre and code elements", () => {
    const { container } = render(
      <ResponseBlock text={"```js\nconst x = 1;\n```"} />
    );
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    const code = pre!.querySelector("code");
    expect(code).not.toBeNull();
    expect(code!.textContent).toContain("const x = 1;");
  });

  it("renders inline code with code element", () => {
    const { container } = render(
      <ResponseBlock text="Use `npm install` to install" />
    );
    const codes = container.querySelectorAll("code");
    // Should have at least one inline code
    const inlineCode = Array.from(codes).find(
      (c) => c.parentElement?.tagName !== "PRE"
    );
    expect(inlineCode).not.toBeUndefined();
    expect(inlineCode!.textContent).toBe("npm install");
  });

  it("renders unordered lists with ul and li elements", () => {
    const md = "- item one\n- item two\n- item three";
    const { container } = render(
      <ResponseBlock text={md} />
    );
    const ul = container.querySelector("ul");
    expect(ul).not.toBeNull();
    const items = ul!.querySelectorAll("li");
    expect(items.length).toBe(3);
    expect(items[0].textContent).toBe("item one");
  });

  it("renders links with anchor elements", () => {
    const { container } = render(
      <ResponseBlock text="Visit [example](https://example.com)" />
    );
    const a = container.querySelector("a");
    expect(a).not.toBeNull();
    expect(a!.getAttribute("href")).toBe("https://example.com");
    expect(a!.textContent).toBe("example");
  });

  it("renders GFM tables", () => {
    const md = "| Col A | Col B |\n| --- | --- |\n| 1 | 2 |";
    const { container } = render(<ResponseBlock text={md} />);
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    const cells = container.querySelectorAll("td");
    expect(cells.length).toBe(2);
  });

  it("shows success checkmark for text starting with Done", () => {
    const { container } = render(<ResponseBlock text="Done with the task" />);
    expect(container.textContent).toContain("\u2713");
  });

  it("shows success checkmark for text starting with Successfully", () => {
    const { container } = render(
      <ResponseBlock text="Successfully completed" />
    );
    expect(container.textContent).toContain("\u2713");
  });

  it("preserves the green left border container", () => {
    const { container } = render(<ResponseBlock text="Hello world" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.className).toContain("border-l-2");
    expect(wrapper.className).toContain("border-dt-green");
    expect(wrapper.className).toContain("pl-2");
  });
});
