import { describe, expect, it } from "vitest";
import { renderMarkdown } from ".";

describe("PDF embeds", () => {
  it("renders a standalone PDF embed as an inert mount point", () => {
    expect(renderMarkdown("![[Guide.pdf#page=3]]")).toContain(
      'data-pdf-embed="Guide.pdf#page=3"',
    );
  });

  it("keeps ordinary PDF links as links", () => {
    expect(renderMarkdown("[Guide](attachments/Guide.pdf)")).toContain(
      '<a href="attachments/Guide.pdf">Guide</a>',
    );
  });
});

describe("task lists", () => {
  it("marks task items without affecting ordinary list items", () => {
    const html = renderMarkdown("- [ ] Task\n- Ordinary item");
    expect(html).toContain('<li class="task-list-item">');
    expect(html).toContain('class="reading-task-checkbox"');
    expect(html).toContain("<li>Ordinary item</li>");
  });

  it("does not turn checkbox-like prose into a task", () => {
    expect(renderMarkdown("Use [ ] to show an empty box.")).toContain(
      "Use [ ] to show an empty box.",
    );
  });
});
