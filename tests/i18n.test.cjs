/* eslint-disable @typescript-eslint/no-require-imports -- Existing CJS tests load TypeScript in memory. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
require.extensions[".ts"] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { translateReportText, translateReportNode } = require("../lib/report-i18n.ts");
const t = (text) => translateReportText(text, "ru");

test("English is unchanged and unknown CRM values are preserved", () => {
  for (const text of ["Overview", "  Leads \n", "Date Created(from Planfix)", "utm_source*", "Jane Example", "custom-id-123"]) {
    assert.equal(translateReportText(text, "en"), text);
  }
  for (const text of ["Date Created(from Planfix)", "utm_source*", "Jane Example", "custom-id-123"]) assert.equal(t(text), text);
});
test("Russian labels, services, login and exact export wording", () => {
  assert.equal(t("Overview"), "Обзор");
  assert.equal(t("Cohorts"), "Когорты");
  assert.equal(t("Export this page to PDF"), "Экспорт страницы в PDF");
  assert.equal(t("Lithuanian citizenship by descent"), "Гражданство Литвы по происхождению");
  assert.equal(t("Incorrect login or password."), "Неверный логин или пароль.");
});
test("translation preserves surrounding spaces, newlines and Russian text", () => {
  assert.equal(t(" \n Leads \t"), " \n Лиды \t");
  assert.equal(t("   "), "   ");
  assert.equal(t("Когорты"), "Когорты");
});
test("presentation traversal preserves identifiers, input values, handlers, and custom props", () => {
  const onChange = () => {};
  function Custom() { return null; }
  const original = React.createElement("div", { id: "Overview", title: "Overview", "data-key": "Leads" },
    React.createElement("input", { name: "Leads", value: "Overview", placeholder: "Leads", "aria-label": "From date", onChange }),
    React.createElement(Custom, { title: "Overview", dataKey: "Leads" }, "Leads"),
    React.createElement("span", { translate: "no" }, "Leads"));
  const result = translateReportNode(original, t);
  assert.equal(result.props.id, "Overview");
  assert.equal(result.props.title, "Обзор");
  assert.equal(result.props["data-key"], "Leads");
  const [input, custom, raw] = result.props.children;
  assert.equal(input.props.value, "Overview");
  assert.equal(input.props.name, "Leads");
  assert.equal(input.props.placeholder, "Лиды");
  assert.equal(input.props["aria-label"], "Начальная дата");
  assert.equal(input.props.onChange, onChange);
  assert.equal(custom.props.title, "Overview");
  assert.equal(custom.props.dataKey, "Leads");
  assert.equal(custom.props.children, "Лиды");
  assert.deepEqual(raw.props, original.props.children[2].props);
  assert.equal(original.props.title, "Overview");
});

test("dynamic counts, table pagination, Quality evidence and durations translate", () => {
  assert.equal(t("7 days"), "7 дней");
  assert.equal(t("21 days"), "21 день");
  assert.equal(t("22 days"), "22 дня");
  assert.equal(t("14 days"), "14 дней");
  assert.equal(t("1.5 h"), "1.5 ч");
  assert.equal(t("Selected (125) accepted dates"), "Корректные даты в выборке (125)");
  assert.equal(t("Channel performance (1/3)"), "Результаты каналов (1/3)");
  assert.equal(t("All actions (12)"), "Все действия (12)");
  assert.match(t("3 / 120 monitored exact critical headers are absent. Absent columns cannot be evaluated as empty cells."), /Отсутствуют ключевые столбцы: 3 \/ 120/);
});
test("fragments, arrays, primitive nodes, refs and keys survive traversal", () => {
  const ref = React.createRef();
  const node = React.createElement(React.Fragment, null, React.createElement("span", { ref, key: "stable" }, "Clients"), 7, null, false);
  const translated = translateReportNode(node, t);
  assert.match(translated.props.children[0].key, /stable$/);
  assert.equal(translated.props.children[0].props.ref, ref);
  assert.equal(translated.props.children[0].props.children, "Клиенты");
  assert.deepEqual(translated.props.children.slice(1), [7]);
});
