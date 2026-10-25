// English keys match the Kommo wrapper and view copy; shared i18n merges this map.
export const KOMMO_HELP_RU: Record<string, string> = {
  "Browser storage could not be restored. Files can still be uploaded for this session.":
    "Не удалось восстановить данные из хранилища браузера. Файлы можно загрузить для текущего сеанса.",
  "A saved file could not be parsed. Upload it again.":
    "Не удалось прочитать сохраненный файл. Загрузите его повторно.",
  "The Kommo export has headers but contains no leads. The previous dataset has been retained.":
    "В выгрузке Kommo есть заголовки, но нет лидов. Предыдущие данные сохранены.",
  "The report is updated for this session. Browser storage is unavailable, so this file will need to be uploaded after reopening.":
    "Отчет обновлен для текущего сеанса. Хранилище браузера недоступно, поэтому после повторного открытия файл потребуется загрузить заново.",
  "Could not import the selected file.":
    "Не удалось импортировать выбранный файл.",
  "Missing required Kommo column:":
    "Отсутствует обязательный столбец Kommo:",
  "Could not export the dashboard PDF:":
    "Не удалось экспортировать отчет в PDF:",
  "The export view has not mounted yet.":
    "Представление для экспорта еще не готово.",
  "Could not export the report.":
    "Не удалось экспортировать отчет.",
  "Latest valid Date Created or Last Modified in the uploaded file. Timestamps have no timezone offset; calendar/time values are preserved exactly as exported. The dashboard is a file snapshot, not live CRM.":
    "Последняя корректная дата Date Created или Last Modified в загруженном файле. Временные метки не содержат часовой пояс; дата и время сохраняются как в выгрузке. Отчет показывает срез из файла, а не текущее состояние CRM.",
  "The finance workbook is shared by PlanFix and Kommo in this browser. Uploading another finance file replaces that shared saved workbook, not either CRM export.":
    "В этом браузере PlanFix и Kommo используют общий финансовый файл. Загрузка другого финансового файла заменяет его сохраненную копию, но не выгрузки CRM.",
  "Upload your Kommo leads export and the monthly finance workbook.":
    "Загрузите выгрузку лидов Kommo и файл ежемесячных финансовых данных.",
  "Files stay in this browser. PlanFix and Kommo exports are stored separately.":
    "Файлы остаются в этом браузере. Выгрузки PlanFix и Kommo хранятся отдельно.",
  "Migrated means Old Lead ID or the original PlanFix creation field was filled. Native means no migration flag was recorded; it is not independent proof of acquisition in Kommo.":
    "Перенесенным считается лид с заполненным Old Lead ID или полем исходной даты создания в PlanFix. Отметка Native означает отсутствие признака переноса, но сама по себе не доказывает, что лид впервые привлечен в Kommo.",
  "Date filters use original lead creation, not import date. Clean leads consolidate matching email (or phone when email is absent), same service, within 30 days. Names alone never merge people. Duplicate markers never delete the only available lead. PlanFix records and Kommo records are never combined across report modes.":
    "Фильтры дат используют исходную дату создания лида, а не дату импорта. Очистка объединяет записи одной услуги с одинаковым email либо телефоном при отсутствии email в пределах 30 дней. Совпадения имени недостаточно. Метка дубля не удаляет единственную доступную запись. Данные PlanFix и Kommo из разных отчетов не объединяются.",
  "CSV contains the selected CRM records and contact details in their original language. Share it only with authorized recipients.":
    "CSV содержит выбранные записи CRM и контактные данные на исходном языке. Передавайте файл только получателям с соответствующим доступом.",
  "Open-stage snapshot: closed-won / closed-lost leads are absent. Conversion and CAC describe the exported population; full historical performance requires an export including closed leads.":
    "Выгрузка содержит только открытые этапы: закрытых успешных и проигранных лидов нет. Конверсия и CAC относятся к выгруженным записям. Для полной исторической оценки нужна выгрузка с закрытыми лидами.",
  "These thresholds control the action queue and SLA comparisons. They are management settings, not targets contained in the export. Elapsed time is in calendar hours, not working hours.":
    "Эти пороги управляют очередью действий и сравнением с SLA. Это пользовательские настройки, а не нормативы из выгрузки. Время считается в календарных, а не рабочих часах.",
  "Open-stage snapshot. Closed-won/lost history is absent; conversions and CAC cover this export only.":
    "Срез открытых этапов. История закрытых успешных и проигранных лидов отсутствует; конверсии и CAC относятся только к этой выгрузке.",

  "Relevant strict = leads whose Relevancy is exactly Relevant / all selected leads. Blank Relevancy remains in the denominator. After consolidation, the latest filled assessment on a working record is used.":
    "Строгая доля целевых лидов: число лидов со значением Relevant в поле Relevancy, деленное на всех выбранных лидов. Пустые оценки остаются в знаменателе. После объединения дублей используется последняя заполненная оценка рабочей записи.",
  "Client = validated first/full/instalment payment date, positive recorded payment, paid Payment status or an explicit paid pipeline stage. Current client status without a valid first-payment date is excluded from timed cohorts.":
    "Клиент определяется по корректной дате первой, полной или частичной оплаты, положительной сумме платежа, оплаченному Payment status либо явно оплаченному этапу. Текущий статус клиента без корректной даты первой оплаты не включается в датированные когорты оплаты.",
  "First-touch source, then UTM source (* field before regular field), then parsed UTM, then gclid, then Marketing Source. Calendly and website form are capture methods when an original acquisition source exists.":
    "Приоритет источника: первое касание, затем UTM-источник (поле со звездочкой раньше обычного), UTM из строки параметров, gclid и Marketing Source. Если исходный канал привлечения известен, Calendly и форма сайта обозначают способ поступления заявки.",
  "Finance is monthly, company-wide data. It is not automatically attributed to a manager, country or CRM sale. CRM counts use original creation dates; finance leads can reflect different historical inclusion rules.":
    "Финансы содержат месячные данные всей компании. Они не относятся автоматически к менеджеру, стране или сделке CRM. Лиды CRM считаются по исходной дате создания; в финансовом учете могли действовать другие правила включения лидов.",
  "Each milestone is measured against all selected leads. Relevant and Qualified are independent definitions, so the chart is not a stage-to-stage transition funnel. Agreement includes later paid stages. Signed contracts require a separate timestamp.":
    "Каждый показатель рассчитан от всех выбранных лидов. Целевой и квалифицированный лид определяются независимо, поэтому график не показывает переходы между этапами. Отправка договора включает последующие оплаченные этапы. Для подтверждения подписи нужна отдельная дата.",
  "Selected CRM rows or consolidated leads after original creation-date, service, channel, manager and origin filters.":
    "Строки CRM или объединенные лиды после фильтров исходной даты создания, услуги, канала, менеджера и происхождения.",
  "Leads explicitly marked Relevant or Not Relevant divided by all selected leads. This separates pending sales assessment from lead quality.":
    "Лиды с явной оценкой Relevant или Not Relevant, деленные на всех выбранных лидов. Показатель отделяет незавершенную оценку отдела продаж от качества лидов.",
  "Relevant / (Relevant + Not Relevant). Pending assessments are excluded from this metric only. Do not confuse it with Relevant strict.":
    "Relevant / (Relevant + Not Relevant). Неоцененные лиды исключены только из этого показателя. Не путайте его со строгой долей целевых лидов от всей выборки.",
  "In work timestamp, an In work/Retainer/later pipeline stage, agreement date or client evidence. Not inferred from Relevant alone.":
    "Учитываются дата начала работы, этап In work, Retainer или последующий этап, дата договора либо признаки клиента. Одной оценки Relevant недостаточно.",
  "Agreement sent timestamp or current Retainer/later stage. Stage evidence is a proxy and cannot provide a historic date.":
    "Дата отправки договора либо текущий этап Retainer или последующий. Этап является косвенным признаком и не восстанавливает историческую дату события.",
  "Validated Full payment at date, explicitly full-paid payment status or a full-payment stage divided by selected leads. Lawyer handover or completion alone is not proof of full payment.":
    "Лиды с корректной датой Full payment at, явным статусом или этапом полной оплаты, деленные на всех выбранных лидов. Передача юристу или завершение работы сами по себе не доказывают полную оплату.",
  "This export contains no closed-won / closed-lost stages. Historical win rate and rejection rate are unavailable from this snapshot.":
    "В выгрузке нет закрытых успешных или проигранных этапов. По этому срезу нельзя определить историческую долю выигранных сделок и отказов.",
  "date values in this selection failed validation and are excluded from time-based calculations. Details are in Quality.":
    "значений дат в выбранном срезе не прошли проверку и исключены из временных расчетов. Подробности в разделе качества данных.",
  "Creation cohorts use the original PlanFix date for migrated leads. Response-time comparisons use native Kommo leads only. Owner means the currently recorded responsible user.":
    "Для перенесенных лидов когорты используют исходную дату создания в PlanFix. Скорость контакта сравнивается только для лидов без признака переноса в Kommo. Менеджер означает текущего ответственного в записи.",

  "Finance channel spend is matched to CRM leads by acquisition channel and original creation month. Only fully selected, completed months with an explicit channel cost are included. CPL, CPQL and CAC use those matched leads only, not all selected leads. Service, manager and origin slices use estimated shares of monthly channel spend. Closed leads missing from an export and incomplete source attribution can overstate or understate CAC. Company overhead is not assigned to channels.":
    "Расходы из финансов сопоставляются с лидами CRM по каналу и исходному месяцу создания. Учитываются только завершенные месяцы, выбранные целиком, с указанными расходами канала. CPL, CPQL и CAC используют только сопоставленных лидов, а не всю выборку. Расходы для срезов по услуге, менеджеру и происхождению распределяются оценочно. Отсутствие закрытых лидов и неполная атрибуция могут как завышать, так и занижать CAC. Накладные расходы компании не распределяются по каналам.",
  "Sum of finance channel costs allocated to the matched CRM population. Excludes overhead, missing channel costs, incomplete months and partial-month date selections.":
    "Сумма расходов каналов из финансов, отнесенная к сопоставленным лидам CRM. Не включает накладные расходы, отсутствующие расходы каналов, незавершенные месяцы и месяцы, выбранные не целиком.",
  "Matched finance media spend / matched CRM leads. Unmatched selected leads do not enter the denominator.":
    "Сопоставленные рекламные расходы из финансов / сопоставленные лиды CRM. Остальные выбранные лиды не входят в знаменатель.",
  "Matched finance media spend / qualified or active CRM leads from exactly the same matched creation months and channels.":
    "Сопоставленные рекламные расходы / квалифицированные или находящиеся в работе лиды CRM из тех же сопоставленных месяцев создания и каналов.",
  "Matched media spend / current clients among matched creation cohorts. This is a preliminary cohort acquisition cost, not the cost of clients paying during this calendar period. Missing closed leads or source mapping can distort it.":
    "Сопоставленные рекламные расходы / текущие клиенты из сопоставленных когорт создания. Это предварительная когортная стоимость привлечения, а не стоимость клиентов, оплативших в данном календарном периоде. Отсутствие закрытых лидов или сопоставления источников может исказить показатель.",
  "Service / manager allocations are estimates based on each channel's monthly lead share.":
    "Распределение по услугам и менеджерам оценочное: по доле лидов внутри каждого канала и месяца.",
  "Costs cover the matched subset only.":
    "Расходы относятся только к сопоставленной части выборки.",
  "Daily CRM filters remain exact; monthly finance costs are never prorated to days. Revenue and company overhead remain in Finance & reconciliation.":
    "Дневные фильтры CRM применяются точно; месячные финансовые расходы не распределяются пропорционально дням. Поступления и накладные расходы компании остаются в разделе финансов и сверки.",
  "Rules use this selection only: unassessed leads, actionable open leads, unknown attribution and missing payment dates. Counts reflect the uploaded snapshot, not live CRM activity.":
    "Правила применяются только к текущей выборке: неоцененные лиды, открытые лиды для дальнейших действий, неизвестная атрибуция и отсутствующие даты оплаты. Числа отражают загруженный срез, а не текущую активность CRM.",
  "Complete Relevancy before concluding that channel quality has declined.":
    "Заполните Relevancy, прежде чем делать вывод о снижении качества канала.",
  "Review overdue first contact, tasks and retainer follow-ups in Sales Report.":
    "Проверьте просроченные первые контакты, задачи и дальнейшую работу по договорам в отчете продаж.",
  "Capture method alone does not establish the advertising source.":
    "Один лишь способ поступления заявки не определяет рекламный источник.",
  "Fill or correct First payment at to make timed payment cohorts complete.":
    "Заполните или исправьте First payment at, чтобы датированные когорты оплаты были полными.",
  "Native leads use Date Created. Migrated leads use valid Date Created(from Planfix). Counts are cohort creation volumes, not Kommo import batches.":
    "Для лидов без признака переноса используется Date Created, для перенесенных: корректная Date Created(from Planfix). Числа показывают объем когорт создания, а не партии импорта в Kommo.",
  "Bar length shows selected leads on a common scale. Green is explicitly Relevant, rose is Not Relevant and grey is unassessed. Client counts show the current outcome of those same creation cohorts.":
    "Длина полосы показывает выбранных лидов в едином масштабе. Зеленым отмечены Relevant, розовым Not Relevant, серым неоцененные. Число клиентов отражает текущий результат тех же когорт создания.",
  "Each service has its own denominator. Eligibility assessment and unknown service are visible independently; no service is silently discarded.":
    "У каждой услуги свой знаменатель. Проверка права на гражданство и неизвестная услуга показаны отдельно; услуги не исключаются без отображения.",
  "Country names and two-letter country codes are normalized. Rates use all selected leads within each country.":
    "Названия стран и двухбуквенные коды приведены к единому виду. Доли рассчитаны от всех выбранных лидов соответствующей страны.",
  "Bar lengths show CRM lead volumes. Colors separate Relevant, Not Relevant and pending assessments. Clients are current outcomes for the same selected creation cohorts. This chart includes all selected leads, regardless of finance coverage.":
    "Длина полос показывает число лидов CRM. Цвета разделяют Relevant, Not Relevant и ожидающих оценки. Клиенты отражают текущий результат тех же выбранных когорт. График включает всех выбранных лидов независимо от покрытия финансовыми данными.",
  "Compare services on the same 0-100% scale. Relevant strict, Qualified / active and Client are independent milestones, each divided by all leads in that service. Grey assessment gaps are visible in the acquisition charts.":
    "Услуги сравниваются в единой шкале от 0 до 100%. Строгая релевантность, квалификация и статус клиента являются независимыми показателями; каждый рассчитан от всех лидов услуги. Неоцененные лиды показаны серым на графиках привлечения.",
  "Each product is evaluated independently. Relevance uses the strict CRM field; Qualified uses In work or later evidence. Eligibility assessment and Partnership remain separate.":
    "Каждый продукт оценивается отдельно. Релевантность определяется строго по полю CRM; квалификация: по началу работы или более поздним признакам. Проверка права на гражданство и партнерство остаются отдельными услугами.",
  "Channel mix within this service only. Bar length is lead count; colors show strict relevance and pending assessment. Counts include all CRM leads in the global selection, including months without finance costs.":
    "Состав каналов только для этой услуги. Длина полосы показывает число лидов, цвета: строгую релевантность и незавершенную оценку. Учитываются все лиды глобальной выборки, включая месяцы без финансовых расходов.",
  "Campaign uses first_touch_campaign, UTM campaign (* before regular), then parsed UTM. Estimated CAC uses only finance-matched creation months and the campaign's share of monthly channel leads. Counts outside coverage are excluded from its cost denominator, not from the all-lead columns.":
    "Кампания определяется по first_touch_campaign, затем UTM campaign (поле со звездочкой раньше обычного) и UTM из строки параметров. Оценочный CAC использует только месяцы создания, сопоставленные с финансами, и долю кампании в месячных лидах канала. Лиды вне покрытия исключаются из знаменателя стоимости, но остаются в столбцах общего числа лидов.",

  "This export has no Agreement signed at column. Retainer sent is not a signed contract. Paid evidence is shown as client conversion, not a confirmed signed timestamp.":
    "В выгрузке нет столбца Agreement signed at. Отправленный договор не является подписанным. Признаки оплаты учитываются в конверсии в клиента, но не подтверждают дату подписи.",
  "Rates follow creation cohorts and their current outcome at the export snapshot. They are not events that occurred during the displayed month.":
    "Доли относятся к когортам создания и их текущим результатам на дату выгрузки. Это не события, произошедшие в отображаемом месяце.",
  "This selector affects only the monthly channel trend below. The global Channels selector applies to all metrics on the page.":
    "Этот фильтр влияет только на месячную динамику канала ниже. Глобальный фильтр каналов применяется ко всем показателям страницы.",
  "Same creation-cohort conversion formula, for the selected channel. Pending relevance assessments remain in the strict denominator.":
    "Та же формула конверсии когорт создания для выбранного канала. Лиды, ожидающие оценки, остаются в знаменателе строгой релевантности.",
  "Independent milestones divided by that service's selected leads. A 0-100% common scale prevents products with different lead volumes from appearing artificially comparable by absolute counts.":
    "Независимые показатели делятся на число выбранных лидов услуги. Общая шкала от 0 до 100% позволяет сравнивать услуги с разным объемом лидов без искажения абсолютными числами.",
  "All rates use that row's lead count. Assessment coverage explains the difference between strict relevance and relevance among assessed leads.":
    "Знаменатель всех долей: число лидов в строке. Покрытие оценкой объясняет различие между строгой релевантностью и долей целевых среди оцененных.",
  "Only validated timestamps are counted here; no stage-date proxy is inserted. Meeting-held rate uses booked leads with a valid held timestamp.":
    "Здесь учитываются только корректные временные метки; этап не подставляется вместо даты. Для доли состоявшихся встреч используются записи о бронировании с корректной датой проведения.",

  "finance months overlap the selected creation period.":
    "месяцев финансовых данных пересекаются с выбранным периодом создания лидов.",
  "No finance months match this period. Upload a finance workbook or change the dates.":
    "Для этого периода нет финансовых данных. Загрузите финансовый файл или измените даты.",
  "The following company totals include full overlapping calendar months; they are not revenue or costs attributed to the filtered CRM cohort.":
    "Следующие итоги компании включают целые пересекающиеся календарные месяцы. Это не поступления и расходы, отнесенные к отфильтрованной когорте CRM.",
  "Service, channel, manager or origin filters affect CRM counts only in the reconciliation below.":
    "В сверке ниже фильтры услуги, канала, менеджера и происхождения влияют только на показатели CRM.",
  "Cash received in calendar months according to finance, not the contract value of created CRM leads.":
    "Денежные поступления по календарным месяцам из финансового учета, а не стоимость договоров созданных лидов CRM.",
  "Contract value signed in each month according to finance. CRM Sale is separate and its currency is not exported.":
    "Стоимость договоров, подписанных в каждом месяце, по финансовому учету. Поле Sale в CRM учитывается отдельно; его валюта в выгрузке не указана.",
  "Actual signed contract count from Finance, not inferred from Retainer sent.":
    "Фактическое число подписанных договоров из финансов. Оно не выводится из этапа отправки договора.",
  "Company finance revenue divided by all marketing expenditure. A blended revenue-to-marketing ratio, not paid-ad attributed ROAS.":
    "Поступления компании по финансовому учету, деленные на все расходы на маркетинг. Это общий коэффициент поступлений к маркетингу, а не ROAS с атрибуцией платной рекламе.",
  "Total marketing spend / finance-reported leads for the same finance months. Not the CPL of a filtered CRM cohort.":
    "Все расходы на маркетинг / лиды по финансовому учету за те же месяцы. Это не CPL отфильтрованной когорты CRM.",
  "Marketing expenditure divided by finance signed contracts in the same calendar months.":
    "Расходы на маркетинг, деленные на число подписанных договоров из финансов за те же календарные месяцы.",
  "Workbook Paid traffic all / workbook total clicks. The supplied workbook total excludes Facebook; its rows are reconciled below.":
    "Paid traffic all из финансового файла / общее число кликов из того же файла. В предоставленном файле итог не включает Facebook; соответствующие строки сверяются ниже.",
  "CRM leads are creation-cohort counts. Payment events are filtered independently by payment month across all creation cohorts, preserving service/channel/manager/origin selection. Finance is calendar-period data. Open-only exports cannot establish complete historic acquisition or loss counts.":
    "Лиды CRM считаются по когортам создания. События оплаты фильтруются отдельно по месяцу платежа среди всех когорт с сохранением фильтров услуги, канала, менеджера и происхождения. Финансы относятся к календарным периодам. Выгрузка только открытых лидов не дает полного исторического числа привлечений и отказов.",
  "All series come from finance calendar months. CRM dimension filters do not allocate these company totals.":
    "Все ряды получены из календарных месяцев финансового учета. Фильтры CRM не распределяют эти общие итоги компании.",
  "Actual, monthly plan and three-month average are read from separate labeled rows in the workbook. Empty cells remain n/a in this report. Stored workbook averages are displayed as supplied, including any incomplete historical basis.":
    "Факт, месячный план и среднее за три месяца читаются из отдельных подписанных строк файла. Пустые ячейки отображаются как н/д. Сохраненные средние показаны как в файле, даже если их историческая база неполна.",
  "Sessions, clicks, leads, contracts and their averages are imported independently. Paid traffic all in this workbook currently includes Google + Bing, while Facebook is a separate line item. Empty source cells display n/a.":
    "Сессии, клики, лиды, договоры и их средние импортируются отдельно. В этом файле Paid traffic all включает Google и Bing, а Facebook указан отдельной строкой. Пустые исходные ячейки отображаются как н/д.",
  "Channel amounts are only explicitly mapped categories. The residual is overhead or unallocated spend, not an invented acquisition channel. Positive residual can explain why company fully loaded CAC differs from ad-only channel CAC.":
    "Суммы каналов включают только явно сопоставленные категории. Остаток является накладными или нераспределенными расходами, а не вымышленным каналом привлечения. Положительный остаток может объяснять отличие CAC компании со всеми расходами от рекламного CAC канала.",
  "Only matching finance category rows are shown. No channel spend is invented for unfilled historical months. Agency fees and other overhead are part of company marketing cost, not silently added to paid-media channel spend.":
    "Показаны только сопоставленные категории финансовых расходов. Расходы каналов за незаполненные исторические месяцы не выдумываются. Оплата агентств и другие накладные расходы входят в маркетинговые расходы компании, но не добавляются скрыто к рекламным расходам каналов.",

  "Selected leads assigned to the currently recorded owners. Creation dates and the other global filters apply.":
    "Выбранные лиды, закрепленные за текущими ответственными из выгрузки. Применяются даты создания и остальные глобальные фильтры.",
  "Median of First contact at - Date Created for native Kommo leads with valid nonnegative timestamps. Measures recorded first contact, not necessarily first human reply.":
    "Медиана разницы First contact at и Date Created для лидов Kommo без признака переноса с корректным неотрицательным интервалом. Измеряется записанный первый контакт, не обязательно первый ответ человека.",
  "90% of measured native contacts were recorded within this time. Missing timestamps and migrated lead history are excluded.":
    "90% измеренных контактов по лидам без переноса были записаны в пределах этого времени. Записи без дат и история перенесенных лидов исключены.",
  "Measured native first contacts at or below the chosen SLA divided by all measured native first contacts. Uncontacted leads are shown separately, not counted as SLA passes.":
    "Первые контакты по лидам без переноса, уложившиеся в выбранный SLA, деленные на все измеренные первые контакты этих лидов. Лиды без контакта показаны отдельно и не считаются выполнившими SLA.",
  "Open native leads with neither a valid first-contact date nor a contacted/qualified current stage.":
    "Открытые лиды без признака переноса, у которых нет ни корректной даты первого контакта, ни текущего этапа контакта или квалификации.",
  "Open leads with Next Task earlier than the export snapshot. Only the next task is exported, not the complete task history.":
    "Открытые лиды с Next Task раньше даты среза выгрузки. Выгружается только следующая задача, а не вся история задач.",
  "Open selected leads with no Next Task value. This is a task-planning gap, not proof that no communication occurred.":
    "Выбранные открытые лиды без значения Next Task. Это пробел в планировании задач, а не доказательство отсутствия общения.",
  "Sale summed only for client, dated-signed or won records. Currency is not in this export; do not compare directly with finance EUR or assume this is audited revenue.":
    "Sale суммируется только для клиентов, записей с датой подписи или выигранных сделок. Валюта в выгрузке не указана; сумму нельзя напрямую сравнивать с финансовыми EUR или считать подтвержденной выручкой.",
  "Explicit payment amounts from selected CRM records. Incomplete amount fields are not replaced by Sale. Currency is not specified by the export.":
    "Явно указанные суммы платежей выбранных записей CRM. Недостающие суммы не заменяются полем Sale. Валюта в выгрузке не указана.",
  "Explicit Agreement sent at or Retainer/later stage. Not equivalent to signed contracts.":
    "Явная дата Agreement sent at либо этап Retainer или последующий. Это не равнозначно подписанному договору.",
  "Median of the exported Touches made counter. Blank counters are excluded; this is not a count of replies or call outcomes.":
    "Медиана выгруженного счетчика Touches made. Пустые значения исключены; это не число ответов или результатов звонков.",
  "Current responsible user, not historical assignment. Response-time metrics exclude migrated leads. Counts and sales follow the global creation-date selection.":
    "Текущий ответственный, а не историческое назначение. Показатели скорости контакта исключают перенесенных лидов. Число лидов и суммы сделок подчиняются глобальному фильтру даты создания.",
  "Creation cohorts show current outcomes at the snapshot. Owner filters select the current responsible user.":
    "Когорты создания показывают текущие результаты на дату среза. Фильтр менеджера выбирает текущего ответственного.",
  "These are counts for the selected creation cohorts and current owner. Full-paid and client counts use actual dates or explicit paid evidence. Reassignment history is not exported.":
    "Числа относятся к выбранным когортам создания и текущему ответственному. Клиенты и полностью оплатившие определяются по реальным датам или явным признакам оплаты. История переназначений не выгружается.",
  "Calendar elapsed time, not business hours. Native Kommo leads only. A stage of First contact without a valid timestamp cannot contribute to timing. SLA % is conditional on a measured contact.":
    "Прошедшее календарное время, а не рабочие часы. Только лиды Kommo без признака переноса. Этап First contact без корректной даты не участвует в измерении времени. Доля выполнения SLA рассчитывается только среди измеренных контактов.",
  "Next Task and Last Modified describe the export snapshot, not all historical activity. Review missing tasks and stale opportunities before attributing a conversion gap to a manager.":
    "Next Task и Last Modified описывают срез выгрузки, а не всю историю действий. Прежде чем связывать низкую конверсию с менеджером, проверьте отсутствующие задачи и давно не обновлявшиеся сделки.",
  "Compare managers within one service to avoid distortion from a different product mix. Rates are not adjusted for source, cohort age or reassignment.":
    "Сравнивайте менеджеров внутри одной услуги, чтобы разный набор продуктов не искажал результат. Доли не скорректированы по источнику, возрасту когорты или переназначениям.",
  "Each lead appears once under its current stage. Age is from original creation, not time in current stage. Stage-entry history is not present for every stage.":
    "Каждый лид показан один раз на текущем этапе. Возраст считается от исходного создания, а не от входа в этап. История входа доступна не для всех этапов.",
  "Only native leads with a valid first-contact timestamp are included. The bins do not overlap at their boundaries. This measures recorded contact time, not the first message response.":
    "Учитываются только лиды без переноса с корректной датой первого контакта. Интервалы не пересекаются на границах. Измеряется записанное время контакта, а не ответ на первое сообщение.",
  "Open lead age uses original creation date and the export snapshot. This is not stage duration. Old migrated opportunities can legitimately have a long age.":
    "Возраст открытого лида рассчитывается от исходной даты создания до среза выгрузки. Это не длительность этапа. Старые перенесенные сделки могут обоснованно иметь большой возраст.",
  "Reason for Rejection may exist even while the current stage remains active. Counts here are recorded reasons, not confirmed lost deals. A missing closed-lost history prevents a complete rejection-rate analysis.":
    "Reason for Rejection может быть заполнено и у лида на активном этапе. Здесь подсчитываются записанные причины, а не подтвержденные проигранные сделки. Без истории закрытых проигранных сделок нельзя полноценно оценить долю отказов.",
  "Rules prioritize first contact beyond SLA, overdue Next Task, retainer follow-up and stale opportunities. Timings are relative to the export snapshot. No CRM updates are performed.":
    "Правила отдают приоритет первому контакту сверх SLA, просроченной Next Task, дальнейшей работе по договорам и давно не обновлявшимся сделкам. Время считается относительно среза выгрузки. Изменения в CRM не вносятся.",
  "CSV contains every matching queue lead, not only the current page. Original CRM fields and action values are preserved.":
    "CSV содержит всех лидов, подходящих под фильтры очереди, а не только текущую страницу. Исходные поля CRM и значения действий сохраняются.",
  "Sorted by action urgency, then lead age. Current contact and manager are from the snapshot. The PDF contains the currently visible queue page; CSV exports every matching queue lead.":
    "Сортировка: сначала по срочности действия, затем по возрасту лида. Контакт и менеджер взяты из текущего среза. PDF содержит видимую страницу очереди; CSV выгружает всех лидов, подходящих под фильтры.",
};
