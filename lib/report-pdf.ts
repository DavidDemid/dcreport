import { renderPdfHeading } from "./pdf-heading";

const PDF_ROOT_CLASS = "kommo-pdf-root";
const activeExports = new WeakSet<HTMLElement>();

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

export async function exportDashboardPdf(root: HTMLElement, filename: string): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Dashboard PDF export is only available in the browser.");
  }
  if (!(root instanceof HTMLElement) || !root.isConnected) {
    throw new Error("The report export root must be mounted before exporting a PDF.");
  }
  if (!filename.trim()) throw new Error("A PDF download filename is required.");
  if (activeExports.has(root)) throw new Error("This report is already being exported.");

  const hadExportClass = root.classList.contains(PDF_ROOT_CLASS);
  const exportStyle = document.createElement("style");
  exportStyle.textContent = `
    .kommo-pdf-root {
      box-sizing: border-box !important;
      width: 1280px !important;
      min-width: 1280px !important;
      max-width: 1280px !important;
    }
    .kommo-pdf-root, .kommo-pdf-root *,
    .kommo-pdf-root *::before, .kommo-pdf-root *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }
    .kommo-pdf-root .pdf-ignore { display: none !important; }
    .kommo-pdf-root .overflow-x-auto { overflow: visible !important; }
  `;

  activeExports.add(root);
  try {
    // The caller owns the offscreen root. Do not clone it or modify the visible dashboard.
    root.classList.add(PDF_ROOT_CLASS);
    root.prepend(exportStyle);
    const [{ toPng, getFontEmbedCSS }, { jsPDF }] = await Promise.all([
      import("html-to-image"),
      import("jspdf"),
    ]);

    await document.fonts?.ready;
    await nextFrame();
    // Recharts also animates in JavaScript; its default delayed animations take up to 1.9s.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 2000));
    await nextFrame();

    const sections = Array.from(root.querySelectorAll<HTMLElement>("section[data-report-section]"));
    const fontEmbedCSS = await getFontEmbedCSS(root);
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    const margin = 10;
    const blockGap = 4;
    const contentWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    const bottom = pdf.internal.pageSize.getHeight() - margin;
    const title = root.getAttribute("data-report-title")?.trim() ?? "";

    function heading(text: string, size: number, lineHeight: number, gap: number) {
      const rendered = renderPdfHeading(text, contentWidth, size, lineHeight);
      return { ...rendered, height: rendered.height ? rendered.height + gap : 0, imageHeight: rendered.height };
    }

    const reportHeading = heading(title, 14, 6, 4);
    let cursorY = margin;
    let pageHasBlocks = false;
    let blockCount = 0;

    function drawHeading(value: ReturnType<typeof heading>) {
      if (!value.dataUrl) return;
      pdf.addImage(value.dataUrl, "PNG", margin, cursorY, contentWidth, value.imageHeight);
      cursorY += value.height;
    }

    for (const section of sections) {
      const sectionTitle = section.querySelector<HTMLElement>("h2")?.textContent?.trim() ?? "";
      const sectionHeading = heading(sectionTitle, 12, 5, 3);
      const freshBlockHeight = bottom - margin - reportHeading.height - sectionHeading.height;
      const blocks = Array.from(section.querySelectorAll<HTMLElement>("[data-report-block]")).filter((block) => {
        const parentBlock = block.parentElement?.closest("[data-report-block]");
        return (
          block.closest("section[data-report-section]") === section &&
          parentBlock?.closest("section[data-report-section]") !== section &&
          !block.closest(".pdf-ignore") &&
          block.getClientRects().length > 0 &&
          window.getComputedStyle(block).visibility !== "hidden"
        );
      });
      if (!blocks.length) continue;
      if (freshBlockHeight <= 0) throw new Error("The report headings are too long to fit with content on a PDF page.");
      let needsSectionHeading = true;

      for (const [blockIndex, block] of blocks.entries()) {
        const bounds = block.getBoundingClientRect();
        const width = Math.ceil(Math.max(block.scrollWidth, block.offsetWidth, bounds.width));
        const height = Math.ceil(Math.max(block.scrollHeight, block.offsetHeight, bounds.height));
        if (width <= 0 || height <= 0) continue;

        let dataUrl: string;
        try {
          dataUrl = await toPng(block, {
            backgroundColor: "#ffffff",
            width,
            height,
            pixelRatio: 2,
            fontEmbedCSS,
            style: { transform: "none", transformOrigin: "top left", position: "static", margin: "0" },
            filter: (node) => !(node instanceof Element && node.classList.contains("pdf-ignore")),
          });
        } catch (error) {
          throw new Error(`Could not render report block ${blockCount + 1} for PDF export.`, { cause: error });
        }

        const image = pdf.getImageProperties(dataUrl);
        if (!(image.width > 0 && image.height > 0)) throw new Error("A report block rendered an empty PDF image.");
        // Scale a tall block once to fit a fresh page, never slice its chart or table.
        const scale = Math.min(contentWidth / image.width, freshBlockHeight / image.height);
        const imageWidth = image.width * scale;
        const imageHeight = image.height * scale;
        const sectionSpace = needsSectionHeading ? sectionHeading.height : 0;
        let firstContentHeight = 0;
        if (block.hasAttribute("data-report-context") && blocks[blockIndex + 1]) {
          const next = blocks[blockIndex + 1];
          const nextBounds = next.getBoundingClientRect();
          const nextWidth = Math.max(next.scrollWidth, nextBounds.width);
          const nextHeight = Math.max(next.scrollHeight, nextBounds.height);
          firstContentHeight = Math.min(nextHeight * contentWidth / nextWidth, freshBlockHeight) + blockGap;
        }

        if (pageHasBlocks && cursorY + sectionSpace + imageHeight + firstContentHeight > bottom + 0.01) {
          pdf.addPage();
          cursorY = margin;
          pageHasBlocks = false;
          needsSectionHeading = true;
        }

        // Defer headings until a real block is ready, so no page contains only a title.
        if (!pageHasBlocks) drawHeading(reportHeading);
        if (needsSectionHeading) {
          drawHeading(sectionHeading);
          needsSectionHeading = false;
        }
        pdf.addImage(dataUrl, "PNG", margin + (contentWidth - imageWidth) / 2, cursorY, imageWidth, imageHeight);
        cursorY += imageHeight + blockGap;
        pageHasBlocks = true;
        blockCount += 1;
      }
    }

    if (!blockCount) throw new Error("There are no visible report blocks to export.");
    const downloadName = filename.trim();
    await pdf.save(/\.pdf$/i.test(downloadName) ? downloadName : `${downloadName}.pdf`, { returnPromise: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Rendering or downloading failed.";
    throw new Error(`Could not export the dashboard PDF: ${detail}`, { cause: error });
  } finally {
    exportStyle.remove();
    if (!hadExportClass) root.classList.remove(PDF_ROOT_CLASS);
    activeExports.delete(root);
  }
}
