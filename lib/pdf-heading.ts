export function renderPdfHeading(text: string, widthMm: number, fontSizePt: number, lineHeightMm: number) {
  const pixelsPerMm = 96 / 25.4;
  const width = widthMm * pixelsPerMm;
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) throw new Error("Could not prepare PDF heading.");
  const font = `600 ${fontSizePt * 96 / 72}px Arial, sans-serif`;
  measure.font = font;
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure.measureText(candidate).width <= width) { current = candidate; continue; }
      if (current) { lines.push(current); current = ""; }
      for (const character of word) {
        if (current && measure.measureText(current + character).width > width) { lines.push(current); current = ""; }
        current += character;
      }
    }
    if (current) lines.push(current);
  }
  const height = lines.length * lineHeightMm;
  if (!lines.length) return { dataUrl: "", height: 0 };
  canvas.width = Math.ceil(width * 2);
  canvas.height = Math.ceil(height * pixelsPerMm * 2);
  const context = canvas.getContext("2d")!;
  context.scale(2, 2);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height * pixelsPerMm);
  context.font = font;
  context.fillStyle = "#0f172a";
  context.textBaseline = "top";
  lines.forEach((line, index) => context.fillText(line, 0, index * lineHeightMm * pixelsPerMm));
  // Built-in jsPDF fonts do not include Cyrillic; browser fonts preserve all UI languages.
  return { dataUrl: canvas.toDataURL("image/png"), height };
}
