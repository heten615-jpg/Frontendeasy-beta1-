# Frontendeasy — Стратегический roadmap и план реализации (для исполнителя GPT 5.5)

Дата: 2026-06-11. Статус: канонический плановый документ pivot-этапа.
Автор постановки: Hermes/Codex automation; документ подготовлен Claude Code.

Этот документ — самодостаточный план. Он написан так, чтобы исполнитель (GPT 5.5)
мог закодить каждую фазу **без повторного чтения всего репозитория**: все ключевые
файлы, контракты, схемы данных, команды проверки и риски перечислены прямо здесь.

---

## 0. Как пользоваться этим документом

1. Работай по фазам в порядке из раздела «Рекомендуемый порядок исполнения» (§14).
2. Перед началом задачи прочитай только файлы, перечисленные в её блоке «Файлы-кандидаты».
3. После каждого изменения продуктового кода запускай минимум: `npm run check && npm run build`.
   Полный гейт перед сдачей задачи: см. §13 «Тестовая стратегия и acceptance gates».
4. Все мутации состояния редактора обязаны идти по каноническим путям из
   `docs/MUTATION_UPDATE_RULES.md` и `AGENT_AUTONOMY/MUTATION_PATH_CONTRACT.md`.
5. Любое изменение схемы `ProjectPayload`/`StudioState` — только по процессу
   `docs/SCHEMA_MIGRATION_PROCESS.md` (bump `SCHEMA_VERSION`, миграционный блок, тесты).
6. Очередь атомарных задач — `AGENT_AUTONOMY/TASK_QUEUE.md`, секция
   «Strategic pivot queue» (items 265+). Этот roadmap — «почему и как», очередь — «что по порядку».
7. Не удаляй существующие задачи/доки — только дополняй и помечай superseded.

### 0.1 Ключевые команды

```bash
npm run dev                # дев-сервер
npm run check              # svelte-check + tsc — обязательный минимум
npm test                   # Vitest (≈306 тестов: storage, контроллеры, экспорт-снапшоты)
npm run test:e2e           # Playwright (≈121 тест: desktop Chromium + mobile Chromium/WebKit smoke)
npm run test:e2e:smoke     # быстрый smoke (onboarding, update-notes, mobile)
npm run test:e2e:perf      # опциональный перф-смоук большого проекта
npm run build              # строгий билд (fail на любой Vite warning)
npm run build:budget       # билд + бюджеты JS/CSS чанков
npm run lint:types         # noUnusedLocals/Parameters + dead-export scan (baseline в scripts/dead-export-baseline.json)
npm run validate:handoff   # валидация autonomy-файлов
```

### 0.2 Карта репозитория (минимум, который нужно знать)

| Зона | Путь | Что там |
|---|---|---|
| Оболочка приложения | `src/App.svelte` (~8 900 строк) | topbar, меню, маршрутизация действий, история, автосейв, snapshot-панель, cloud-sync UI. **Монолит №1** |
| Канвас | `src/lib/Canvas.svelte` (~5 800 строк) | рендер фреймов/элементов, hit-test, drag/resize/marquee, smart guides, rulers. **Монолит №2** |
| Правый инспектор | `src/lib/RightPanel.svelte` (~6 900 строк) | Design/Prototype табы, все секции свойств, export dock. **Монолит №3** |
| Левая панель | `src/lib/LeftPanel.svelte` (~2 800 строк) | дерево pages+layers, rename/lock/hide/reorder. **Монолит №4** |
| Состояние и экспорт | `src/storage.ts` (~2 600 строк) | `SCHEMA_VERSION = 22`, `migrateState`, `generateFrameHTML` (строка ~1351), `elementToCSS` (~858), `generateOrphanHTML` (~1955), `consolidateCSSRules` (~1256), PWA/sitemap/robots, FSA/Electron запись |
| Типы | `src/types.ts` (~850 строк) | `StudioState`, `Frame`, `FrameElement`, `Project`, `ProjectPayload`, `AutoLayout` и т.д. |
| Контроллеры редактора | `src/lib/editor/*` | `actionRegistry.ts` (`EditorActionId`, `ACTIONS`), `actionExecution.ts` (`executeEditorAction`), `selectionController.ts`, `primarySelection.ts`, `elementContext.ts`, `elementTree.ts`, `historyController.ts`, `snapshotService.ts`, `permissions.ts`, `groupController.ts`, `clipboardOps.ts`, `keyboardCommands.ts` |
| Персистентность | `src/lib/persistence/*` | `localStore.ts` (IndexedDB), `storageMigrations.ts`, worker-сериализация |
| Облако | `src/lib/projects/*` | `cloudProjects.ts`, `projectSync.ts` (debounce 2.5 c, LWW), `cloudSnapshots.ts`, `cloudConflictRecovery.ts`, `projectEnvelope.ts`, `importValidation.ts`, `multiTabGuard.ts` |
| Безопасность | `src/lib/security/*` | `urls.ts` (валидация iframe/asset/href URL), `svgSanitizer.ts` |
| Экспорт-хелперы | `src/lib/export/*` | `exportSettings.ts`, `filenameDedupe.ts`, `htmlSanitizers.ts` |
| Auth | `src/lib/auth/*` | `authStore.ts`, `LoginPage.svelte`, `AuthGate.svelte` |
| Канвас-математика | `src/lib/canvas/*` | `hitTest.ts`, `selectionGeometry.ts`, `smartGuides.ts`, `renderStyles.ts`, `shapeSvg.ts`, `vectorPath.ts` |
| Инспектор-модули | `src/lib/inspector/*` | `PrototypeInspector.svelte` (lazy), `InspectorExportDock.svelte`, `inspectorExport.ts` |
| i18n | `src/lib/i18n/uiRuntimeLocale.ts` | runtime RU-локализация хрома |
| Тесты e2e | `e2e/*.spec.ts`, `e2e/*.mobile.ts`, перф `e2e/*.perf.ts` | canvas-regressions — основной регрессионный файл |
| Доки-контракты | `docs/ARCHITECTURE_BOUNDARIES.md`, `docs/MUTATION_UPDATE_RULES.md`, `docs/SCHEMA_MIGRATION_PROCESS.md`, `docs/QA.md`, `docs/DEPLOY.md` | обязательны к соблюдению |
| Supabase | `supabase/migrations/*` | схема, RLS, Storage bucket |
| Деплой | `public/_headers`, `public/_redirects`, `docs/DEPLOY.md` | Cloudflare Pages, CSP без `unsafe-eval` |

Electron (`electron/`) — заморожен, не трогать и не развивать.

---

## 1. Стратегия pivot: меньше Figma parity — больше ценности

### Было
До июня 2026 очередь (items 136–175 и далее) гналась за UI3-паритетом с Figma:
vector edit, masks, crop, variants, variables — всё это реализовано и работает,
но **не отличает продукт от Figma**, а догнать Figma по полировке невозможно.

### Стало — три столпа дифференциации

1. **Clean semantic HTML export / no lock-in.** Главное обещание продукта:
   каждый фрейм — настоящая HTML-страница; экспорт — чистый семантический
   HTML+CSS, который можно хостить где угодно, читать руками и дорабатывать без
   Frontendeasy. Это анти-Figma и анти-Webflow позиционирование. Сейчас обещание
   нарушено: экспорт по умолчанию `position:absolute` (§5).
2. **AI/MCP-first workflow.** Frontendeasy — первый HTML-редактор, где AI-агент —
   полноценный соавтор: видит документ и выделение, правит выбранный узел,
   собирает страницы и экспортирует. Подробно — §7 и §8.
3. **Живой публичный продукт.** Демо без регистрации, лендинг, 5–10 реальных
   пользователей и петля обратной связи (§6).

### Следствия для приоритезации
- Любая задача оценивается вопросом: «приближает ли она clean export, AI-workflow
  или живых пользователей?» Если нет — в конец очереди.
- Figma-parity фичи (новые типы фигур, эффекты, паритет панелей) — замораживаются.
- Стабилизация/распил монолитов делается **по мере необходимости** для трёх столпов,
  а не как самоцель (но RightPanel/App придётся пилить под AI-панель — §9).

---

## 2. Сводная карта фаз

| Фаза | Эпик | Срок-оценка | Зависимости |
|---|---|---|---|
| 0 | Quick wins (§4) | дни | нет |
| 1 | Clean semantic HTML export (§5) | 2–3 недели | нет |
| 2 | Демо, лендинг, первые пользователи (§6) | 1–2 недели | частично Фаза 1 |
| 3 | Editor Command API + контекст-протокол (§7.2–7.3) | 2 недели | нет (параллельно Фазе 1) |
| 4 | MCP server + bridge + read-only tools (§7.4–7.5) | 1–2 недели | Фаза 3 |
| 5 | Selection-aware AI (Pencil-UX) (§8) | 2 недели | Фаза 4 |
| 6 | AI-панель + мутации + публикация (§7.6–7.9) | 2–3 недели | Фаза 5 |
| 7 | Распил монолитов (§9) | фоново, слайсами | нет |
| 8 | Миграции/данные/snapshots (§10) | 1 неделя | нет |
| 9 | UI/UX polish, разгрузка инспектора (§11) | фоново | частично §9 |

---

## 3. Блокеры (что мешает прямо сейчас)

1. **Экспорт ломает обещание clean HTML.** `src/storage.ts:858` `elementToCSS()`:
   `positionRule = participatesInAutoLayout ? 'position:relative' : 'position:absolute'`.
   Всё, что не внутри auto-layout группы, экспортируется абсолютом с фиксированными
   px-координатами. Это блокер для позиционирования «semantic, responsive, no lock-in».
2. **Нет публичного деплоя.** `docs/DEPLOY.md` и `public/_headers|_redirects` готовы,
   но продукт не выложен; нет домена, нет демо-ссылки. Блокирует пользователей и фидбек.
3. **Нет программного API редактора.** Все операции размазаны по `App.svelte`
   (8 900 строк) и завязаны на UI-события. AI-агенту не к чему подключиться.
   Блокирует MCP/AI-фазы. Решение — §7.2 Editor Command API.
4. **Монолиты тормозят любые изменения.** Изменение инспектора = правка файла на
   6 900 строк; высокий риск регрессий и конфликтов. Решение — §9, слайсами.
5. **Supabase-проект и SMTP не подняты** (есть только миграции и доки). Не блокер
   для демо (офлайн-режим работает), но блокер для cloud-аккаунтов первых пользователей.

---

## 4. Фаза 0 — Quick wins (быстрые победы, до недели суммарно)

Каждый пункт самостоятелен, можно делать в любом порядке.

### QW-1. Демо-режим без регистрации
- **Цель:** по URL `/?demo=1` (или кнопка «Try demo» на будущем лендинге) открывается
  редактор в офлайн-режиме с заранее наполненным проектом-витриной.
- **Почему важно:** конверсия посетитель→пользователь без барьера sign-up; это и есть
  публичное демо из стратегии.
- **Файлы:** `src/Root.svelte` (роутинг AuthGate → ProjectListPage | App; офлайн-режим
  уже минует список проектов), `src/storage.ts` (`PROJECT_TEMPLATES`, `loadProjectFromTemplate`),
  новый шаблон в `PROJECT_TEMPLATES` («Showcase»).
- **Шаги:** (1) распарсить query-параметр в `Root.svelte`; (2) при `demo=1` создать
  in-memory проект из шаблона Showcase, не трогая IndexedDB текущего пользователя
  (использовать отдельный id `demo-…`, сохранять в IDB можно — это локальные данные);
  (3) баннер «Демо-режим — изменения сохраняются только в этом браузере».
- **Acceptance:** открытие `/?demo=1` без env-переменных Supabase показывает редактор
  с контентом; экспорт HTML работает; обычный запуск не изменился.
- **Тесты:** e2e-спека `e2e/demo-mode.spec.ts` (открытие, наличие фреймов, экспорт-кнопка);
  `npm run check`, `npm run build:budget`.
- **Риски:** не подмешать демо-проект в реальный список проектов залогиненного юзера.

### QW-2. Золотой фикстур-снапшот «чистоты» экспорта
- **Цель:** зафиксировать текущий экспортный HTML на эталонном проекте, чтобы Фаза 1
  имела измеримую базу «до/после».
- **Файлы:** `src/storage.test.ts`, `src/__snapshots__/storage.test.ts.snap` (паттерн
  снапшота уже есть — item 217), при необходимости фикстура через
  `scripts/largeProjectFixture.mjs`.
- **Шаги:** добавить тест, который прогоняет `generateFrameHTML` на фрейме с
  «лендинговой» структурой (hero/секции/текст/кнопки, частично в auto-layout) и
  снапшотит результат + отдельные ассерты-счётчики: количество `position:absolute`,
  количество семантических тегов (`header|main|section|footer|h1|p|a|button`).
- **Acceptance:** тест зелёный; счётчики «absolute» зафиксированы числом — Фаза 1
  будет их снижать осознанно.

### QW-3. Чистка дешёвых unicode-иконок
- **Цель:** убрать оставшиеся эмодзи/unicode-глифы (`✛`, `⌚`, `◉/◇`, `⊡/⊠`, `⌗`, `📏`
  и т.п.) из topbar/панелей, заменив на SVG-иконки в стиле существующего
  `src/lib/ToolbarIcon.svelte`.
- **Почему важно:** дешёвые глифы — главный визуальный маркер «прототипа»; для демо
  и лендинга нужен продуктовый вид.
- **Файлы:** `grep -rn '[✛⌚◉◇⊡⊠⌗📏☁＋▾]' src/` — App.svelte, LeftPanel.svelte,
  RightPanel.svelte; `ToolbarIcon.svelte` как реестр иконок.
- **Шаги:** инвентаризация grep'ом → добавить недостающие id в `ToolbarIcon` →
  заменить текстовые глифы на компонент. Сохранить `title`/aria-label (на них
  завязаны e2e и RU-локализация `uiRuntimeLocale.ts` — проверить ключи!).
- **Acceptance:** grep по списку глифов в `src/` пуст (кроме комментариев/тестов);
  e2e зелёные; RU-локализация не потеряла строки.
- **Риски:** `uiRuntimeLocale.ts` матчится по текстам — при замене текста кнопки
  обновить словарь синхронно.

### QW-4. Док с лендинг-копирайтом (без кода)
- **Цель:** `docs/LANDING_BRIEF.md` — оффер, три столпа, секции лендинга, CTA
  («Try demo» → QW-1). Готовится заранее, чтобы Фаза 2 не упёрлась в тексты.
- **Acceptance:** документ покрывает hero/проблему/решение/демо/FAQ/CTA, RU+EN версии.

---

## 5. Фаза 1 — Clean semantic HTML export (Эпик E1, ключевой)

### 5.1 Цель и почему важно
Экспорт — главный продуктовый артефакт. Сегодня `elementToCSS()` эмитит
`position:absolute` + фиксированные `left/top/width/height` для всего, что не
лежит во flex-группе. Полученный HTML не responsive, плохо читается и противоречит
обещанию «no lock-in». Цель фазы: **поток (flow) по умолчанию, абсолют — осознанное
исключение**, плюс семантические теги.

### 5.2 Архитектурное решение: режим экспорта на уровне модели
Вводим понятие **export layout mode**:

- `flow` (новый дефолт для новых проектов): корень фрейма экспортируется как
  вертикальный flex/grid-поток; дети упорядочиваются по Y-координате (затем X);
  размеры конвертируются в `max-width` + проценты/`auto`; абсолют остаётся только
  для элементов с явным флагом (декор, оверлеи).
- `absolute` (legacy, текущее поведение): пиксельная точность, как сейчас.

Режим хранится в `ProjectExportSettings` (см. `src/lib/export/exportSettings.ts`
и `AGENT_AUTONOMY/EXPORT_SETTINGS_MODEL.md`) + переопределение на фрейме.
Элемент получает опциональный флаг `exportPinned?: boolean` («экспортировать
абсолютом поверх потока»).

Это **изменение схемы**: `SCHEMA_VERSION` 22 → 23 по процессу
`docs/SCHEMA_MIGRATION_PROCESS.md`. Дефолт миграции для старых проектов —
`absolute` (ничего не ломаем), для новых проектов — `flow`.

### 5.3 Задачи эпика

#### E1-1. Схема: `exportLayoutMode` + `exportPinned` (v23)
- **Файлы:** `src/types.ts` (`ProjectExportSettings`, `Frame`, `FrameElement`),
  `src/storage.ts` (`SCHEMA_VERSION`, блок миграции v22→v23),
  `src/lib/persistence/storageMigrations.ts`, `src/lib/export/exportSettings.ts`,
  тесты `src/storage.test.ts`, `src/lib/persistence/storageMigrations.test.ts`.
- **Шаги:** добавить поля → миграция с дефолтами (`absolute` для существующих) →
  нормализатор невалидных значений → тесты preserve/normalize по образцу item 216.
- **Acceptance:** старые проекты загружаются без визуальных изменений экспорта;
  поле сериализуется в envelope и переживает JSON import/export
  (`src/lib/projects/projectEnvelope.ts`, `importValidation.ts`).
- **Зависимости:** нет. **Риски:** забыть envelope/import — тогда поле молча
  теряется при облачном цикле; тест на roundtrip обязателен.

#### E1-2. Поток-экспорт: сортировка и конвертация координат
- **Цель:** в режиме `flow` `generateFrameHTML` строит дерево потока.
- **Файлы:** `src/storage.ts` — `generateFrameHTML` (~1351), `elementToCSS` (~858),
  `generateOrphanHTML` (~1955); новый чистый модуль
  `src/lib/export/flowLayout.ts` (+ тесты) с функциями:
  - `inferFlowOrder(elements): FrameElement[]` — сортировка по Y, кластеризация
    в «ряды» (элементы с пересечением по Y > 50% считаются одним рядом → ряд
    экспортируется как горизонтальный flex);
  - `inferFlowSizing(el, frameWidth): { widthRule, marginRule }` — ширина ≥ 95%
    ширины фрейма → `width:100%; max-width:<frameWidth>px`; центрированный
    элемент → `margin-inline:auto`; иначе фиксированная ширина с `max-width:100%`;
  - вертикальные зазоры между соседями → `gap`/`margin-top`.
- **Шаги:** (1) написать чистые функции + unit-тесты на синтетических наборах;
  (2) в `elementToCSS` добавить ветку `flow` (по сигнатуре передавать режим сверху,
  как сейчас передаётся `inAutoLayout`); (3) `exportPinned` элементы — старый
  абсолютный путь с `position:absolute` относительно фрейм-обёртки.
- **Acceptance:** на фикстуре QW-2 в режиме flow: 0 `position:absolute` кроме
  pinned; страница читаема при ширине окна 1440/768/390 без горизонтального скролла;
  снапшот-тест нового вывода.
- **Риски/питфоллы:** перекрывающиеся элементы (z-наложения) — детектировать
  пересечение > 30% площади и автоматически считать верхний элемент pinned с
  предупреждением; auto-layout группы уже flow — не конвертировать дважды;
  `consolidateCSSRules` (~1256) должен переварить новые правила.

#### E1-3. Семантические теги
- **Цель:** вместо `<div class="el-…">` эмитить осмысленные теги.
- **Файлы:** `src/storage.ts` (точки эмиссии тегов в `generateFrameHTML`),
  новый `src/lib/export/semanticTags.ts` (+ тесты), `src/types.ts`
  (опционально `semanticTag?: string` на `FrameElement` для ручного override),
  `src/lib/RightPanel.svelte` (селектор тега в инспекторе — можно отложить в E6).
- **Эвристики (порядок приоритета):** ручной `semanticTag` → `isButton` с link →
  `<a>`; `isButton` без link → `<button>`; текст с fontSize ≥ 28 или первый текст
  фрейма → `<h1>`/`<h2>` (по рангу размеров внутри фрейма); обычный текст → `<p>`;
  группа в верхней зоне фрейма (top < 120) с кнопками/ссылками → `<header>` + `<nav>`;
  группа в нижней зоне → `<footer>`; прочие группы/секции → `<section>`;
  list → уже `<ul>/<ol>`; image → уже `<img>` (проверить `alt`).
- **Acceptance:** фикстура QW-2 содержит `header/main/section/footer/h1/p`;
  экспорт проходит валидацию (E1-5); канвас-рендер не изменился (теги — только экспорт).
- **Риски:** дубли `<h1>` (ограничить одним на страницу, остальные `<h2>`);
  вложенность `<a>` внутрь `<button>` запрещена — учесть в группах-кнопках
  (см. item «Buttons → flag»: группы-кнопки оборачивают детей в `<a>`).

#### E1-4. Responsive-поведение из breakpoint-вариантов
- **Цель:** существующие breakpoint-варианты (linked tablet propagation, item 180)
  превращать в `@media` правила, а не в отдельные страницы.
- **Файлы:** `src/storage.ts` (генерация CSS), данные вариантов — см.
  `AGENT_AUTONOMY/MUTATION_PATH_CONTRACT.md` (variant update rules) и `src/types.ts`.
- **Шаги:** собрать переопределения варианта → эмитить `@media (max-width: 768px)`
  блок с дельтами (typography/fills/视ibility); в режиме flow этого часто хватает,
  т.к. поток сам адаптивен.
- **Acceptance:** фрейм с tablet-вариантом экспортируется одним HTML с media query;
  снапшот-тест.
- **Зависимости:** E1-2. **Риски:** не раздуть CSS — только дельты, и через
  `consolidateCSSRules`.

#### E1-5. Гейт качества экспорта в CI
- **Цель:** «clean export» — это контракт, который охраняют тесты.
- **Файлы:** новый `scripts/check-export-quality.mjs` + npm-скрипт
  `lint:export`; CI `.github/workflows/ci.yml` (smoke job).
- **Шаги:** скрипт генерирует HTML фикстуры (реюз `scripts/largeProjectFixture.mjs`
  + showcase-шаблона), прогоняет: (1) парс HTML (можно `parse5` — лёгкая dev-зависимость,
  согласовать; либо собственные ассерты-регэкспы без новых зависимостей);
  (2) счётчик `position:absolute` ≤ порога; (3) наличие `<main>`/landmark-тегов;
  (4) отсутствие inline `style=` в body (всё в `<style>`); (5) валидные `alt` у img.
- **Acceptance:** `npm run lint:export` падает при деградации; включён в CI smoke.
- **Риски:** новые dev-зависимости увеличивают surface — предпочесть zero-dep ассерты.

#### E1-6. UI-подсказки «чистоты» (перенесено в Фазу 9/E6, см. §11)
Индикатор в инспекторе: «этот элемент экспортируется абсолютом — закрепи или
переведи в поток». Не блокирует фазу.

### 5.4 Definition of Done эпика E1
- Новые проекты экспортируются в режиме flow с семантическими тегами.
- Эталонная страница (QW-2) проходит `lint:export`, читаема на 390–1440 px.
- Старые проекты не изменили вывод (режим absolute по умолчанию после миграции).
- Все гейты §13 зелёные, экспортные снапшоты пересняты осознанно (в diff видно что).

---

## 6. Фаза 2 — Публичное демо, лендинг, первые 5–10 пользователей (Эпик E2)

### E2-1. Деплой на Cloudflare Pages + домен
- **Цель:** продукт доступен по публичному URL.
- **Файлы:** `docs/DEPLOY.md` (готовая инструкция: build `npm run build:budget`,
  Node 22, SPA `_redirects`, security `_headers` с CSP без `unsafe-eval`).
- **Шаги:** (1) создать проект Cloudflare Pages из репо; (2) подключить .com домен;
  (3) прогнать чеклист `docs/QA.md` на проде; (4) если включается Supabase —
  выполнить `supabase/README.md` (миграции, bucket, Auth URLs) и прописать
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` в Pages env, затем SMTP по
  `docs/SMTP_SETUP.md` (Resend предпочтителен).
- **Acceptance:** прод-URL открывает редактор; `/?demo=1` работает; заголовки CSP
  на месте (curl -I); офлайн-режим работает без env.
- **Риски:** CSP может зарезать будущий WebSocket AI-bridge — сразу заложить
  `connect-src` `ws://127.0.0.1:*` ТОЛЬКО для dev-сборки, в прод не включать (§7.7).

### E2-2. Лендинг
- **Цель:** одна страница: оффер → gif/видео демо → «Try demo» → email-форма.
- **Где:** рекомендация — отдельная статическая страница в этом же деплое
  (`public/landing/index.html` или прероутинг `/` → лендинг, `/app` → редактор).
  Решение зафиксировать в начале задачи; редактор не должен потерять прямые URL.
- **Контент:** из `docs/LANDING_BRIEF.md` (QW-4). Лендинг сам обязан быть
  «дог-фудом»: собрать его в Frontendeasy и экспортировать — это и тест Фазы 1,
  и честная демонстрация.
- **Acceptance:** лендинг в проде, Lighthouse perf/a11y ≥ 90, CTA ведёт в демо.

### E2-3. Петля обратной связи
- **Цель:** канал фидбека + минимальная аналитика без слежки.
- **Шаги:** кнопка «Feedback» в topbar (mailto или ссылка на форму/Telegram);
  privacy-light счётчик (Cloudflare Web Analytics — без cookie) только на лендинге;
  док `docs/USER_FEEDBACK_LOG.md` для записи сессий с первыми пользователями.
- **Acceptance:** фидбек достижим в 1 клик из редактора; лог-файл заведён.
- **Что НЕ делать:** не встраивать тяжёлые трекеры в редактор.

### E2-4. Первые 5–10 пользователей
- **Процесс:** личные приглашения (дизайнеры/инди-разработчики, которым нужен
  быстрый HTML); каждому — задание «собери и экспортируй страницу»; наблюдение,
  запись в `docs/USER_FEEDBACK_LOG.md`; еженедельная сортировка находок в TASK_QUEUE.
- **Acceptance:** ≥ 5 завершённых сессий, ≥ 10 конкретных находок в очереди.

---

## 7. Фаза 3–4, 6 — КЛЮЧЕВАЯ ФИЧА №1: AI/MCP-first workflow (Эпик E3)

### 7.1 Видение и почему это столп
AI-агент (Claude/GPT через MCP-клиент, или встроенный чат) работает с документом
Frontendeasy как полноправный редактор: читает структуру, видит выделение пользователя,
создаёт/правит элементы, применяет стили, собирает страницы по текстовому брифу и
экспортирует/публикует результат. Frontendeasy при этом остаётся «источником правды»
с undo, snapshot'ами и правами доступа.

Почему мы можем это сделать лучше других: документ Frontendeasy — это **уже почти HTML**.
Контекст для LLM компактен и натурален (семантические теги из E1-3), мутации
дискретны и уже канонизированы (`MUTATION_PATH_CONTRACT.md`), история и snapshot'ы
есть. Ориентир UX — редактор Pencil (MCP-сервер с инструментами уровня
`get_editor_state`, `batch_design`, `get_screenshot`, `set_variables`).

### 7.2 Слой 1 — Editor Command API (внутренний headless-API)

Это фундамент. Без него AI некуда подключить, а с ним выигрывают и команды-палитра,
и тесты, и будущий скриптинг.

- **Цель:** типизированный модуль `src/lib/ai/commandApi.ts` (+ `commandSchema.ts`,
  `commandApi.test.ts`), который исполняет **команды-объекты** над текущим
  состоянием редактора без участия DOM/UI.
- **Почему важно:** сейчас операции живут в обработчиках `App.svelte`; AI, MCP,
  и e2e-тестам нужен один программный вход.
- **На чём строить (всё уже существует):**
  - реестр действий: `src/lib/editor/actionRegistry.ts` (`EditorActionId`, `ACTIONS`)
    и раннер `src/lib/editor/actionExecution.ts` (`executeEditorAction`) — паттерн
    «handler map» уже применён для палитры/контекст-меню/хоткеев (item 197);
  - выделение: `selectionController.ts`, `primarySelection.ts` (`derivePrimarySelection`);
  - адресация узлов: `elementContext.ts` (`ElementContextRef`,
    `FramedElementContext | OrphanElementContext`), рекурсивные хелперы `elementTree.ts`;
  - мутации: канонические `updateElement`/`updateOrphan` пути (контракт
    `MUTATION_PATH_CONTRACT.md`) с breakpoint-propagation;
  - история: `historyController.ts` (`beginInteraction`/`endInteraction`, pushHistory);
  - права: `permissions.ts` (режимы editable/comment/view, item 210);
  - снапшоты: `snapshotService.ts` (kind `manual`/`auto`, item 247).
- **Схема команды (commandSchema.ts):**

```ts
interface EditorCommand {
  id: string;                 // uuid вызова — для идемпотентности и логов
  name: EditorCommandName;    // см. реестр ниже
  params: Record<string, unknown>; // валидируется per-command схемой
  scope: 'selection' | 'node' | 'page' | 'project';
  dryRun?: boolean;           // только рассчитать diff, не применять
}
interface EditorCommandResult {
  ok: boolean;
  error?: { code: 'not-found'|'invalid-params'|'permission-denied'|'no-op'|'internal'; message: string };
  changes: Array<{ ref: NodeRef; before: unknown; after: unknown; path: string }>;
  warnings: string[];
  selection?: SelectionSummary; // выделение после команды
}
type NodeRef =
  | { kind: 'frame'; frameId: string }
  | { kind: 'element'; frameId: string; elementId: string } // elementId уникален и в глубину (elementTree)
  | { kind: 'orphan'; orphanId: string };
```

- **Минимальный реестр команд v1 (read):** `getDocumentOutline`, `getNode`,
  `getSelection`, `getFrame`, `getStylesAndVariables`, `getExportSettings`,
  `renderFrameHtml` (вызывает `generateFrameHTML`).
- **Реестр v1 (write):** `updateNodeProps` (безопасное подмножество полей
  `FrameElement`: геометрия, typography, fills, border, effects, autoLayout,
  content, name, isButton/link), `setText`, `createElement`, `createFrame`,
  `deleteNode`, `moveNode` (reparent/координаты), `groupNodes`, `ungroupNode`,
  `applyAutoLayout`, `setVariables`, `createSnapshot`, `undo`, `redo`,
  плюс прокси на готовые экшены: `runEditorAction { actionId: EditorActionId }`.
- **Валидация params:** без новых зависимостей — ручные валидаторы per-command в
  `commandSchema.ts` (паттерн как в `importValidation.ts`); невалидное →
  `invalid-params` без частичного применения.
- **Контракт мутаций:** каждая write-команда обязана (1) пройти проверку
  `permissions.ts`; (2) выполняться через канонические пути; (3) быть обёрнута в
  ровно одну history-запись; (4) быть no-op-guarded (см. item 181) — неизменённое
  состояние не пишет историю и возвращает `error.code = 'no-op'` с `ok:true`-семантикой
  предупреждения (решить однозначно в коде: рекомендация — `ok:true, warnings:['no-op']`).
- **Подключение к App:** App.svelte при mount регистрирует
  `commandApiHost` — объект с доступом к `state`, мутаторам и history (тот же
  паттерн, что `CanvasApi` из item 198). Command API — отдельный модуль, App лишь
  внедряет зависимости. Это первый шаг распила App (§9.1).
- **Acceptance criteria:**
  - unit-тесты: каждая команда — happy path + invalid params + permission denied +
    no-op; ≥ 95% покрытие модуля;
  - один programmatic сценарий «собрать мини-страницу командами → renderFrameHtml
    содержит ожидаемые узлы» как интеграционный тест;
  - команды не импортируют Svelte-компоненты (чистый TS) — проверяется `lint:types`
    и ревью.
- **Риски:** дрейф от UI-поведения (одна и та же операция через UI и API должна
  давать одинаковый state) — для критичных команд написать парные тесты;
  утечка «широких» мутаций мимо контракта — ревью по `MUTATION_UPDATE_RULES.md`.
- **Зависимости:** нет. Можно делать параллельно Фазе 1.

### 7.3 Слой 2 — Протокол контекста документа (что видит модель)

- **Цель:** компактные, стабильные JSON-представления документа для LLM.
  Модель не должна получать весь `state_json` (большой, с шумом).
- **Файлы:** новый `src/lib/ai/contextProtocol.ts` (+ тесты).
- **Форматы (все — чистые функции от `StudioState`):**
  - `documentOutline(state)` — проект: список фреймов (id, name, filename, размер,
    breakpoint-варианты, счётчик детей), список orphans, активная страница,
    styles/variables каталог (имена+типы, без значений-простыней). Бюджет ≤ ~2 КБ
    на 20 фреймов.
  - `frameContext(state, frameId, { depth })` — дерево узлов фрейма с урезанными
    полями: id, type, name, role (semanticTag/isButton), геометрия (округлённая),
    autoLayout-сводка, текст (обрезка до 200 симв.), счётчики глубже depth.
  - `nodeContext(state, ref)` — полный паспорт одного узла: все визуальные свойства
    в нормализованном виде + цепочка родителей (id+name+type) + соседи (id+name) +
    применённые styles/variables + variant overrides.
  - `selectionContext(state)` — см. §8.2 (selection packet).
- **Правила:** ключи стабильны и документированы в `docs/AI_CONTEXT_PROTOCOL.md`
  (создать); числа округляются до целых px; цвета — hex/rgba строки; никакого
  base64 (ассеты — как `{assetId, mime, width, height}`).
- **Acceptance:** snapshot-тесты форматов; тест бюджета размера (JSON.stringify
  length < порога на эталонной фикстуре); roundtrip-стабильность (повторный вызов
  на том же state даёт идентичный JSON — важно для кэша промпта).
- **Риски:** раздувание контекста — держать счётчики и «срезание» глубины;
  рассинхрон с типами при будущих схемах — тесты на новые поля при каждом bump.

### 7.4 Слой 3 — MCP-сервер и мост к браузеру

- **Цель:** внешние агенты (Claude Code, Cursor, любой MCP-клиент) управляют
  редактором через стандартный MCP.
- **Архитектура:**
  - Новая папка `mcp/` в корне: `mcp/server.mjs` — Node-процесс, MCP по stdio
    (официальный `@modelcontextprotocol/sdk`, dev-зависимость в отдельном
    `mcp/package.json`, НЕ в бандле приложения).
  - Браузерный редактор — **WebSocket-клиент**: модуль `src/lib/ai/bridgeClient.ts`
    подключается к `ws://127.0.0.1:7177` ТОЛЬКО когда пользователь включил
    «AI bridge» в UI (toggle в профиль-меню). Сервер MCP поднимает WS-сервер и
    транслирует tool-вызовы в команды Editor Command API (§7.2), ответы — обратно.
  - Протокол моста: `{ requestId, command: EditorCommand }` →
    `{ requestId, result: EditorCommandResult }` + события
    `selection-changed`, `document-changed` (push от редактора, см. §8.5).
  - Пейринг: сервер при старте генерирует токен и печатает его; редактор требует
    ввод токена при включении bridge (или читает из `localStorage` dev-настройки).
    Все сообщения без валидного токена отбрасываются.
- **Dev-only ограничение v1:** мост работает только на `npm run dev`/localhost.
  В прод-CSP `connect-src` для ws отсутствует (см. E2-1). Прод-вариант AI — §7.6.
- **MCP tools v1 (read-only, безопасный старт):**
  - `get_document_outline`, `get_frame`, `get_node`, `get_current_selection`,
    `get_selection_context`, `get_styles_and_variables`, `get_exported_html { frameId }`,
    `get_screenshot { ref?, scale? }` (рендер канвас-области через существующий
    DOM → `html2canvas` не тащить; использовать Playwright-стиль `captureStream`?
    Решение: v1 — отдать exported HTML вместо скриншота, скриншот пометить v2).
- **MCP tools v2 (write):** `update_selected_node`, `apply_to_selection`,
  `update_node`, `create_element`, `create_frame`, `set_text`, `move_node`,
  `delete_node` (требует подтверждения, §7.7), `apply_auto_layout`, `group_selection`,
  `set_variables`, `create_snapshot`, `begin_batch`/`end_batch` (батч = одна
  history-запись + один `document-changed`), `preview_changes` (dryRun-диффы),
  `export_html { frameId?, download?: false }` (возвращает файлы строками),
  `run_editor_action { actionId }`.
- **Acceptance:**
  - интеграционный тест `mcp/server.test.mjs`: поднять server + фейковый WS-редактор
    (нодовый стаб, отвечающий фикстурами) → MCP-клиент вызывает каждый tool →
    схемы ответов валидны;
  - e2e: Playwright запускает dev-приложение, включает bridge с токеном, нодовый
    скрипт вызывает `get_current_selection` и `update_selected_node`, ассерт —
    канвас обновился и undo работает одним шагом;
  - ручной сценарий с реальным Claude Code задокументирован в `docs/AI_MCP_GUIDE.md`.
- **Риски:** версия протокола моста — добавить `bridgeVersion` в hello-сообщение;
  два окна редактора — мост принимает только одно активное подключение
  (использовать паттерн `multiTabGuard.ts`); зависание WS — таймаут запроса 10 с
  и `error.code='internal'`.
- **Зависимости:** §7.2, §7.3.

### 7.5 Сценарии пользователя (зафиксировать в `docs/AI_MCP_GUIDE.md`)
1. «Собери лендинг по брифу» — агент: outline → create_frame → батч create/update →
   preview → export_html.
2. «Сделай выбранную секцию компактнее» — selection-aware (§8).
3. «Перепиши все тексты страницы в другом тоне» — get_frame → батч set_text.
4. «Приведи цвета к палитре» — get_styles_and_variables → set_variables/apply.
5. «Экспортируй и отдай файлы» — export_html → файлы в ответе агенту.
6. «Что не так с адаптивностью?» — get_exported_html → анализ → точечные правки.

### 7.6 AI-панель / чат-ассистент в самом редакторе (прод-путь)
- **Цель:** пользователю без MCP-клиента доступен встроенный ассистент.
- **Архитектура:** новый lazy-компонент `src/lib/ai/AiPanel.svelte` (правый док
  рядом/вместо инспектора по toggle, или нижняя панель — решить по месту; lazy по
  паттерну item 199/200). Вызовы LLM — через **прокси-эндпоинт** (Cloudflare Pages
  Functions / Worker, ключ Anthropic на сервере, НИКОГДА в клиенте — правило
  Safety из CLAUDE.md). Tool-use цикл LLM ↔ те же команды §7.2 напрямую
  (in-process, без WS).
- **UX панели:** поле промпта; чипы быстрых действий по текущему выделению (§8.4);
  лента сообщений с картами изменений «N изменений в M узлах — [Undo] [Показать]»;
  переключатель прав `Selection / Page / Project` (§7.7); индикатор «AI работает…»
  с кнопкой Stop.
- **v1 без бекенда допустим:** поле «свой API-ключ» в настройках (хранить только
  в памяти вкладки, предупреждение) — позволяет catнуть фичу до поднятия прокси.
  Решение зафиксировать при старте задачи.
- **Acceptance:** e2e со замоканным LLM-ответом (фикстурный tool-use сценарий):
  промпт → команды применились → карта изменений → Undo откатывает всё одним шагом.
- **Зависимости:** §7.2, §7.3, §8 (для чипов); прокси — отдельная инфра-задача.

### 7.7 Безопасность и permissions (контракт)
- **Уровни доступа AI-сессии:** `read-only` → `edit-selection` → `edit-page` →
  `edit-project`. Дефолт — `edit-selection`. Хранится в state AI-сессии,
  проверяется в Command API ДО мутации (расширить `permissions.ts` новым
  measурением «actor: user|agent» или отдельной функцией `agentCommandAllowed()`).
- **Подтверждаемые операции (modal через существующий `DialogModal.svelte`):**
  `deleteNode` больше N=5 узлов, `restore snapshot`, смена шаблона, массовые батчи
  > 50 изменений, любые операции `project`-scope при правах ниже.
- **Жёсткие запреты для агента:** запись в localStorage/IndexedDB напрямую, доступ
  к Supabase-ключам, исполнение произвольного JS, сетевые запросы из команд,
  вставка неэкранированного HTML (контент проходит `htmlSanitizers.ts`,
  URL — `security/urls.ts`, SVG — `svgSanitizer.ts`).
- **Аудит:** каждый принятый command логируется в ring-buffer AI-сессии
  (последние 200), доступен в панели «AI activity».
- **Сетевая поверхность:** WS-мост — только 127.0.0.1 + токен + dev-only;
  прокси LLM — только из прод-домена, rate limit на стороне Worker.
- **Acceptance:** unit-матрица прав (по образцу item 210): каждая write-команда ×
  каждый уровень доступа; e2e — попытка `delete` в `read-only` даёт
  `permission-denied` и ничего не меняет.

### 7.8 Undo, snapshots и agent-safe mutations (контракт)
- При старте каждой AI-«транзакции» (один промпт пользователя или один
  `begin_batch`) автоматически создаётся snapshot kind `auto` с именем
  `AI checkpoint: <краткий промпт>` через `snapshotService.ts` (паттерн item 247).
- Весь батч — ровно одна запись undo-истории (`beginInteraction`/`endInteraction`).
  Пользовательский Cmd+Z откатывает целиком ответ агента.
- `dryRun`/`preview_changes` обязателен для батчей > 20 изменений: панель
  показывает дифф (счётчики + список «узел → свойство: before → after»),
  пользователь жмёт Apply/Discard.
- Конфликт с пользователем: если пользователь начал drag во время AI-батча —
  батч отклоняется с `error.code='internal'` и сообщением «editor busy»
  (проверять `interactionActive` historyController'а).
- Cloud-sync: AI-мутации идут тем же `scheduleCloudSync` путём — ничего нового.

### 7.9 Экспорт/публикация через AI
- v1: `export_html` возвращает файлы (имена через `filenameDedupe.ts` и санитайзер
  item 245) агенту; `download_export` инициирует обычный браузерный экспорт.
- v2 (после E2-1): `publish_preview` — выгрузка экспорта в Supabase Storage
  `public/`-папку проекта с подписанной ссылкой «поделиться превью». Требует
  отдельного RLS-аудита (по образцу `AGENT_AUTONOMY/RLS_MIGRATION_AUDIT.md`).
- **Acceptance:** агент через MCP получает HTML всех фреймов строками; имена
  файлов идентичны обычному экспорту.

### 7.10 Тестовая матрица AI/MCP (минимум)
| Слой | Тип | Что проверяем |
|---|---|---|
| commandApi | unit | каждая команда: happy/invalid/denied/no-op; undo-границы |
| contextProtocol | unit+snapshot | формат, бюджет размера, стабильность |
| bridge | integration (node) | пейринг, таймаут, один клиент, schema ответов |
| MCP tools | integration | tool-list, каждый tool на фикстурном редакторе |
| AI panel | e2e (мок LLM) | промпт→изменения→карта→undo; права; confirm-модалки |
| Selection-aware | e2e | §8.8 |
| Security | unit+e2e | матрица прав, санитайзеры на AI-контенте |

### 7.11 Фазировка эпика E3
1. **E3-P1 (Фаза 3):** Command API (read+write ядро) + contextProtocol + тесты.
2. **E3-P2 (Фаза 4):** MCP server + bridge + read-only tools + гайд.
3. **E3-P3 (Фаза 5):** Selection-aware слой (§8) + write-tools по выделению.
4. **E3-P4 (Фаза 6):** полный write-набор + батчи/preview + AI-панель + публикация.

---

## 8. КЛЮЧЕВАЯ ФИЧА №2: Selection-aware AI (UX как в Pencil) — Эпик E4

### 8.1 Видение
Пользователь кликает фрейм/блок/текст — AI мгновенно «видит» именно этот объект.
Промпт «сделай это синим» или чип «Переписать текст» работает без объяснений, что
такое «это». Это главный UX-мост между ручным редактированием и AI.

### 8.2 Active selection context и compact context packet
- **Источник истины выделения** уже есть в `StudioState`:
  `activeFrameId`, `selectedFrameIds`, `selectedElementId`, `selectedElementIds`
  (+ `derivePrimarySelection()` из `primarySelection.ts`,
  модель — `AGENT_AUTONOMY/PRIMARY_SELECTION_MODEL.md`).
- **Новый модуль** `src/lib/ai/selectionContext.ts`:

```ts
interface SelectionPacket {
  kind: 'none' | 'frame' | 'element' | 'orphan' | 'multi';
  primary: NodeRef | null;          // §7.2 NodeRef
  refs: NodeRef[];                  // все выбранные (multi)
  page: { frameId: string; name: string; filename: string } | null;
  node?: {                          // для primary, компактно (≤ ~1.5 КБ)
    id: string; type: ElementType | 'frame'; name: string;
    role: { isButton: boolean; linkTarget?: string; semanticTag?: string };
    geometry: { x: number; y: number; w: number; h: number; rotation?: number };
    layout?: AutoLayoutSummary;     // если группа с auto layout
    text?: string;                  // первые 300 символов
    typography?: { fontSize; fontWeight; color; align; … };
    appearance?: { background; opacity; border; effectsCount };
    parentChain: Array<{ id; name; type }>;   // от корня к узлу
    childrenSummary?: { count: number; types: Record<string, number>; firstNames: string[] };
    componentRef?: { masterId; overridesCount };   // для инстансов (§8.7)
    variantOverrides?: string[];    // какие breakpoint-поля переопределены
  };
  multiSummary?: { count: number; types: Record<string, number>; sameParent: boolean };
}
```

- `buildSelectionPacket(state): SelectionPacket` — чистая функция, snapshot-тесты.
- Бюджет: один узел ≤ ~1.5 КБ; multi — только сводка + refs (модель дозапросит
  `get_node` по конкретному ref).

### 8.3 Live sync выделения editor ↔ AI
- **В редакторе:** derived-подписка на изменения четырёх selection-полей state →
  debounce 150 мс → `selectionPacket` пересобирается и (а) кладётся в Svelte store
  `aiSelectionStore` (для AI-панели), (б) пушится событием `selection-changed`
  в WS-мост, если он включён (§7.4).
- **В MCP-сервере:** хранит последний пакет; tool `get_current_selection` отвечает
  мгновенно из кэша (без round-trip к браузеру), `get_selection_context` делает
  живой запрос (для гарантии свежести помечать пакеты `seq`-номером).
- **Риски:** шторм событий при drag — debounce + не пушить во время
  `interactionActive`; пуш только дельты `kind/refs`, полный пакет — по запросу
  (решить в коде; v1 допустимо пушить полный пакет, замерить).

### 8.4 Инструменты по выделению (MCP + внутренние команды)
- `get_current_selection` → SelectionPacket (из кэша).
- `get_selection_context { depth? }` → расширенный пакет + frameContext страницы.
- `update_selected_node { props }` → `updateNodeProps` на primary; multi → ошибка
  с подсказкой использовать `apply_to_selection`.
- `apply_to_selection { props | textTransform | styleRef }` → батч по всем `refs`
  (одна undo-запись); поэлементные fail'ы собираются в `warnings`, не валят батч.
- `set_selected_text { text }` / `rewrite_selected_text { instruction }` (второе —
  составной: AI-панель сама вызывает LLM и затем `set_text`).
- `select_node { ref }` / `select_nodes { refs }` — агент может менять выделение
  (подсветка в канвасе обязательна — пользователь видит, что выберет агент).
- **Быстрые действия (чипы в AI-панели, контекстные по `kind`/`type`):**
  - текст: «Переписать», «Короче», «Тон: …», «Исправить язык»;
  - фрейм/секция: «Сделать адаптивной» (перевод в auto layout/flow),
    «Выровнять отступы», «Сгенерировать вариант»;
  - изображение: «Подобрать alt», «Заменить на placeholder нужного размера»;
  - multi: «Выровнять как сетку», «Унифицировать стили».
  Каждый чип = заранее заготовленный промпт + ограничение прав `edit-selection`.

### 8.5 Права: Edit selected vs Edit page
- Переключатель в AI-панели: `Selection only` (дефолт) / `Page` / `Project`.
- В режиме `Selection only` Command API отклоняет мутации узлов вне
  `selectionPacket.refs` (и их потомков) с `permission-denied`; создание новых
  узлов разрешено только внутри primary-контейнера.
- Эскалация: если агент хочет шире — возвращаем структурированную ошибку, панель
  показывает «AI просит доступ к странице — [Разрешить] [Отказать]».
- **Acceptance:** unit: мутация чужого узла в selection-режиме → denied; e2e: чип
  на выделении меняет только выделенное.

### 8.6 Preview / diff / undo для selection-операций
- Всё по контракту §7.8: чип/промпт = транзакция = 1 undo + auto-snapshot.
- Для текстовых правок — инлайн-превью: панель показывает before/after текста до
  Apply (использовать `dryRun`).
- Канвас-подсветка изменённых узлов на 2 сек после Apply (оранжевый outline по
  паттерну Cmd-hover подсветки).

### 8.7 Сложные случаи
- **Multi-select:** пакет — сводка (§8.2); `apply_to_selection` — побатчево.
- **Вложенные узлы/глубокий выбор:** `elementId` разрешается рекурсивно через
  `elementTree.ts` (поддержка глубины уже есть — item 184); parentChain в пакете
  даёт модели понимание вложенности; Cmd-deep-select пользователя обновляет пакет
  как обычное выделение.
- **Инстансы компонентов:** в пакете `componentRef` (master id + счётчик overrides,
  контракт — `AGENT_AUTONOMY/COMPONENT_INSTANCE_OVERRIDE_CONTRACT.md`). v1: правки
  инстанса = override (канонический путь это уже делает); правка мастера агентом —
  только в `edit-project` + confirm. Тест: правка инстанса не мутирует мастера.
- **Breakpoint-варианты:** мутации через канонический путь наследуют linked
  propagation (item 179/180); в пакете `variantOverrides` предупреждает модель,
  какие поля уже переопределены на других брейкпоинтах.
- **Locked/hidden:** locked-узлы — мутация отклоняется (`permission-denied`,
  предложение разблокировать); hidden — мутировать можно, но в `warnings` пометка.

### 8.8 Тесты эпика E4
- unit: `buildSelectionPacket` на фикстурах (none/frame/element/orphan/multi/
  deep-nested/instance/locked); размер-бюджет; матрица прав selection-scope.
- integration: мост пушит `selection-changed` при кликах (стаб-редактор).
- e2e: пользователь кликает текст → панель показывает имя узла → чип «Короче»
  (мок LLM) → текст изменился → Cmd+Z вернул; multi-select → батч-чип; попытка
  агента изменить узел вне выделения → denied-баннер.

### 8.9 Фазировка эпика E4
1. `selectionContext.ts` + store + тесты (можно сразу после E3-P1).
2. Push `selection-changed` в мост + кэш в MCP (после E3-P2).
3. Read-tools (`get_current_selection`/`get_selection_context`).
4. `update_selected_node`/`apply_to_selection` + selection-права.
5. Чипы быстрых действий + preview/undo UX в AI-панели (вместе с E3-P4).

---

## 9. Эпик E5 — Архитектурный распил монолитов

Принцип: **пилим слайсами под текущие нужды**, не «большим взрывом». Каждый слайс —
отдельная задача с зелёными гейтами. Контракт границ — `docs/ARCHITECTURE_BOUNDARIES.md`
(обновлять при каждом переносе!).

### 9.1 App.svelte (~8 900 строк) — приоритет 1 (нужен для AI)
- **Цель:** App = композиция + wiring; логика — в `src/lib/editor/*` контроллерах.
- **Порядок извлечения (каждый пункт — атомарная задача):**
  1. `commandApiHost` (§7.2) — формализует доступ к state/мутаторам;
  2. snapshot-панель → `src/lib/editor/SnapshotsPanel.svelte` + уже существующий
     `snapshotService.ts`;
  3. topbar + меню File/View/Profile → `src/lib/shell/Topbar.svelte` (новая папка
     `src/lib/shell/`);
  4. cloud-sync статус/баннеры (конфликт, multi-tab) → `src/lib/shell/StatusBanners.svelte`;
  5. autosave/folder-sync оркестрация → расширить `src/lib/editor/folderSync.ts`;
  6. глобальные хоткеи → уже в `keyboardCommands.ts`, убрать остатки из App.
- **Правила:** перенос без изменения поведения (чистый move + props/events);
  один слайс — один PR-объём; после каждого — полный e2e.
- **Acceptance (финал):** App.svelte < 2 500 строк; ни одной функции > 80 строк;
  `docs/ARCHITECTURE_BOUNDARIES.md` обновлён.
- **Риски:** реактивные `$:` цепочки App ломаются при переносе — переносить вместе
  с их состоянием; bind-цепочки в Svelte 5 — проверять руками drag/undo/save.

### 9.2 RightPanel.svelte (~6 900 строк) — приоритет 2 (нужен для AI-панели и E6)
- **Слайсы:** секции инспектора → `src/lib/inspector/sections/`:
  `TransformSection.svelte`, `AutoLayoutSection.svelte`, `AppearanceSection.svelte`,
  `FillStrokeSection.svelte`, `EffectsSection.svelte`, `TypographySection.svelte`,
  `FramePresetsSection.svelte`, `ExportSection.svelte` (паттерн уже задан lazy
  `PrototypeInspector.svelte` и `InspectorExportDock.svelte`).
- **Контракт пропсов секции:** `{ context: FramedElementContext | OrphanElementContext |
  FrameContext, onPatch(patch), onBeginEdit() }` — единый, чтобы секции были
  переиспользуемы AI-превью.
- **Acceptance:** RightPanel < 1 500 строк (роутер секций + поиск + табы);
  состояние collapse/search сохранено (items 108–113); inspector e2e зелёные;
  RU-локализация работает (тексты переехали — обновить `uiRuntimeLocale.ts`).
- **Риски:** инспектор завязан на сотни точечных обработчиков — переносить секцию
  целиком с её хендлерами; следить за `INSPECTOR_STATE_MATRIX.md`.

### 9.3 Canvas.svelte (~5 800 строк) — приоритет 3
- **Слайсы:** (1) overlay-слои (smart guides, rulers, marquee box, rotate/resize
  handles, connectors) → `src/lib/canvas/overlays/*.svelte`; (2) mouse
  state-machine (DragMode-ветки) → `src/lib/canvas/interactionMachine.ts` (чистые
  функции переходов + тонкий компонент); (3) рендер элемента →
  `src/lib/canvas/ElementNode.svelte` (рекурсивный).
- **Acceptance:** Canvas < 2 000 строк; перф-смоук `test:e2e:perf` не хуже базовой
  линии (маркер: marquee p95 ≈ 50 мс на 36×60 — item 258);
  `canvas-regressions.spec.ts` зелёный.
- **Риски:** самый регрессионно-опасный файл — пилить в последнюю очередь и только
  со свежим перф-замером до/после.

### 9.4 LeftPanel.svelte (~2 800 строк) — приоритет 4
- **Слайсы:** `TreeRow.svelte` (рекурсивная строка), `PagesSection.svelte`,
  drag-reorder логика → `src/lib/editor/treeReorder.ts`.
- **Acceptance:** LeftPanel < 1 200 строк; chevron/rename/lock/hide e2e зелёные.

### 9.5 storage.ts (~2 600 строк) — фоновый слайс
- Экспортную генерацию (`generateFrameHTML`/`elementToCSS`/`generateOrphanHTML`/
  PWA/sitemap) вынести в `src/lib/export/htmlGenerator.ts` — это всё равно
  понадобится в E1. `storage.ts` оставить как фасад-реэкспорт, чтобы не трогать
  десятки импортов сразу.
- **Acceptance:** экспортные снапшоты не изменились (бинарно идентичный вывод).

---

## 10. Эпик E6 — Миграции, данные, snapshots (стабилизация)

### E6-1. Корпус золотых фикстур миграций
- **Цель:** один тестовый корпус `src/lib/persistence/__fixtures__/projects/`
  с реальными payload'ами v2…v22 (по одному на версию) + тест «каждый мигрирует
  до текущей версии и проходит нормализацию без потерь ключевых коллекций».
- **Почему:** сейчас миграции тестируются точечно (item 216); корпус защищает от
  регрессий при v23+ (E1-1) и AI-полях.
- **Файлы:** `storageMigrations.ts`, `storage.test.ts`, `migrateState` в `storage.ts`.
- **Acceptance:** тест-матрица versions × collections (frames, orphans, comments,
  reviewOverlays, guides, projectStyles, variableCollections, exportSettings,
  componentMasters, snippets) зелёная; добавление v23 требует одной фикстуры.

### E6-2. Политика хранения snapshots
- **Цель:** авто-snapshot'ы (recovery + будущие AI checkpoints §7.8) не должны
  раздувать IndexedDB/облако.
- **Решение:** retention в `snapshotService.ts`: хранить максимум N=20 `auto`
  снапшотов (старые удалять FIFO), `manual` — не трогать; для cloud — то же на
  уровне `cloudSnapshots.ts` (list+delete уже есть).
- **Acceptance:** unit: 25 auto-снапшотов → старшие 5 удалены, manual целы;
  настройка N в одном месте.

### E6-3. Аудит конфликт-сценариев перед AI-эпохой
- **Цель:** AI-мутации увеличат частоту записей — перепроверить LWW/конфликты.
- **Шаги:** прогнать `docs/QA.md` сценарии конфликтов; убедиться, что
  `cloudConflictRecovery` создаёт backup-снапшот и баннер (item 246) при гонке
  «AI пишет + второй девайс пишет»; задокументировать вывод в QA.md.
- **Acceptance:** чеклист пройден, найденные дыры — задачами в очередь.

---

## 11. Эпик E7 — UI/UX polish и разгрузка инспектора

- **Принцип:** прогрессивное раскрытие. Дефолт-видимые секции: Position, Layout,
  Fill, Text (для текста). Остальное — collapsed (state уже персистится,
  items 108–113) + появляется контекстно по типу узла (матрица —
  `AGENT_AUTONOMY/INSPECTOR_STATE_MATRIX.md`).
- **Задачи:**
  1. аудит «всегда видимого» в RightPanel: цель ≤ 8 секций для текста, ≤ 7 для
     секции/группы (merge редких контролов в Advanced-подблоки);
  2. иконки QW-3 закончить по всем панелям;
  3. индикатор clean-export (E1-6): значок у элементов, экспортируемых абсолютом
     в flow-режиме, + действие «Перевести в поток»;
  4. пустые состояния: no-selection панель показывает подсказки + кнопку AI
     («Опиши, что добавить») вместо простыни Resources;
  5. тултипы/онбординг обновить под новые столпы (export-first + AI).
- **Acceptance:** скриншот-сравнение до/после; счётчик DOM-узлов панели не вырос
  (база — `AGENT_AUTONOMY/INSPECTOR_DOM_COST_AUDIT.md`: ~226 узлов); e2e инспектора
  зелёные; ревью по `agency-design-critic`-чеклисту (визуальная иерархия).
- **Зависимости:** удобнее после §9.2, но аудит (п.1) можно раньше.

---

## 12. Что НЕ делать (анти-скоуп)

1. **Не продолжать Figma-parity** (новые фигуры, паритет панелей, плагины Figma,
   импорт .fig). Items в старой очереди, попадающие под это, — пометить superseded.
2. **Не делать real-time collaboration / CRDT / multi-cursor** — после first users.
3. **Не развивать Electron** — заморожен.
4. **Не переписывать на другой фреймворк/стейт-менеджер** — Svelte 5 + текущая
   модель состояния остаются.
5. **Не строить свой бекенд** — Supabase + Cloudflare покрывают всё.
6. **Не делать публичный AI-bridge в проде v1** — WS-мост только dev/localhost;
   прод-AI — через панель и серверный прокси.
7. **Не класть секреты в клиент/репо** — ключ LLM только в Worker/прокси.
8. **Не добавлять тяжёлые зависимости в бандл приложения** (бюджеты `build:budget`
   обязательны; MCP-SDK живёт в `mcp/`, не в `src/`).
9. **Не ломать схему без миграции** и не записывать base64 в `state_json`.
10. **Не пилить все монолиты разом** — только слайсами с гейтами.

---

## 13. Тестовая стратегия и acceptance gates

### Гейты по типам изменений (расширение правил TASK_QUEUE)
| Изменение | Обязательные гейты |
|---|---|
| Любой продуктовый код | `npm run check` + `npm run build` |
| Чистая логика/экспорт | + focused vitest + полный `npm test -- --run` |
| Видимое поведение UI | + focused e2e + полный `npm run test:e2e` |
| Схема/миграции | + storage/migration тесты + roundtrip envelope/import |
| Бандл (новые чанки/зависимости) | + `npm run build:budget` + `npm run lint:types` |
| Canvas-перф зоны | + `npm run test:e2e:perf` (не хуже базы item 258) |
| Экспорт HTML | + `lint:export` (E1-5) + осознанные снапшот-диффы |
| AI/MCP | + матрица §7.10 |
| Деплой | + чеклист `docs/QA.md` на прод-URL |

### Definition of Done (любой задачи roadmap)
1. Код по контрактам (`MUTATION_UPDATE_RULES`, `ARCHITECTURE_BOUNDARIES`,
   `SCHEMA_MIGRATION_PROCESS`).
2. Все гейты из таблицы выше зелёные локально.
3. Новое поведение покрыто тестом, который падал бы без изменения.
4. RU-локализация обновлена для новых UI-строк (`uiRuntimeLocale.ts`).
5. Доки обновлены: README (если команды/фичи), соответствующий контракт-док,
   запись в `TASK_QUEUE.md` (отметка `[x]` + дата + verification-список, как в
   items 245–264).
6. Нет новых dead-exports (baseline не расширять без причины).
7. Git-коммиты — только по явной просьбе пользователя (правило CLAUDE.md).

### Регрессионные зоны (где чаще всего ломается — проверять руками/фокус-e2e)
1. **Undo-границы** — одна операция = одна запись; no-op не ест undo (item 181).
2. **Selection-консистентность** — delete/cut/reorder чистят
   `selectedElementIds` (item 182); AI-мутации обязаны вести себя так же.
3. **Breakpoint propagation** — патчи через канонические пути (items 179–180).
4. **Экспортные снапшоты** — любой CSS-рефактор задевает `storage.test.ts.snap`;
   диффы пересматривать построчно.
5. **Async-гонки изображений** — токен-гейтинг `applyImageBlob` (item 186);
   AI-замена изображений должна использовать тот же путь.
6. **Lazy-чанки** — RightPanel/Canvas/модалки/AI-панель грузятся динамически;
   fallback-UI обязателен (паттерн item 212).
7. **Перф большого канваса** — marquee/рендер (items 205/258).
8. **RU-локализация** — текстовые замены в UI рвут словарь runtime-локали.
9. **Cloud LWW/конфликты** — debounce sync + конфликт-баннер (items 34, 246).
10. **CSP/безопасность** — без `unsafe-eval`; URL/SVG/HTML только через
    `src/lib/security/*` и `htmlSanitizers`.

---

## 14. Рекомендуемый порядок исполнения (сводный)

```text
Неделя 1:   QW-1 demo, QW-2 export-фикстура, QW-4 landing brief   [параллельно]
Неделя 1-2: E3-P1 Command API + contextProtocol                    [ключевой путь AI]
Неделя 2-4: E1-1..E1-5 clean export                                [ключевой путь продукта]
Неделя 3:   QW-3 иконки; 9.1 слайсы App (commandApiHost, snapshots)
Неделя 4:   E2-1 деплой + E2-2 лендинг (собранный в Frontendeasy!) + E2-3
Неделя 5:   E3-P2 MCP server + bridge + read-only tools
Неделя 5-6: E4 (1-3) selection packet + live sync + read tools
Неделя 6-7: E4 (4-5) selection write-tools + чипы; E3-P4 AI-панель
Неделя 7:   E3-P4 батчи/preview/публикация; E2-4 первые пользователи
Фоново:     9.2 RightPanel слайсы (до AI-панели), E6 миграции/snapshots,
            E7 инспектор-polish, 9.3/9.4 Canvas/LeftPanel слайсы
```

Правило при конфликте приоритетов: **clean export > AI workflow > пользователи >
распил > polish** — но деплой демо (E2-1) не задерживать ради полного E1: можно
выкатить демо с absolute-экспортом и пометкой «responsive export — beta».

---

## 15. Приложение A — Сводный реестр MCP tools (целевой)

| Tool | Тип | Scope | Фаза |
|---|---|---|---|
| `get_document_outline` | read | project | E3-P2 |
| `get_frame { frameId, depth? }` | read | page | E3-P2 |
| `get_node { ref }` | read | node | E3-P2 |
| `get_current_selection` | read | selection | E4 |
| `get_selection_context { depth? }` | read | selection | E4 |
| `get_styles_and_variables` | read | project | E3-P2 |
| `get_exported_html { frameId? }` | read | page/project | E3-P2 |
| `select_node / select_nodes` | write-light | selection | E4 |
| `update_selected_node { props }` | write | selection | E4 |
| `apply_to_selection { … }` | write | selection | E4 |
| `set_selected_text { text }` | write | selection | E4 |
| `update_node { ref, props }` | write | node | E3-P4 |
| `set_text { ref, text }` | write | node | E3-P4 |
| `create_element { parentRef, spec }` | write | page | E3-P4 |
| `create_frame { spec }` | write | project | E3-P4 |
| `move_node { ref, target }` | write | page | E3-P4 |
| `delete_node { refs }` | write+confirm | page | E3-P4 |
| `group_selection / apply_auto_layout` | write | selection | E3-P4 |
| `set_variables { patch }` | write | project | E3-P4 |
| `begin_batch / end_batch` | meta | — | E3-P4 |
| `preview_changes { commands }` | meta (dryRun) | — | E3-P4 |
| `create_snapshot { name? }` | write | project | E3-P4 |
| `run_editor_action { actionId }` | write | по action | E3-P4 |
| `export_html { frameId?, download? }` | read/write | project | E3-P4 |
| `publish_preview` | write+confirm | project | v2 |
| `get_screenshot { ref?, scale? }` | read | node/page | v2 |

## 16. Приложение B — Чеклист безопасности AI (повторить перед каждым AI-релизом)
- [ ] Все write-команды проходят `agentCommandAllowed()` + scope-проверку.
- [ ] Контент агента проходит `htmlSanitizers` / `security/urls` / `svgSanitizer`.
- [ ] WS-мост: localhost-only, токен, одна сессия, dev-only CSP.
- [ ] LLM-ключи отсутствуют в клиентском бандле (`grep` по dist).
- [ ] Деструктивные операции — confirm-модалка.
- [ ] Каждая AI-транзакция: auto-snapshot + единая undo-запись.
- [ ] Аудит-лог команд доступен пользователю.
- [ ] Rate limit на прокси; таймауты моста.

---

*Связанные документы: `AGENT_AUTONOMY/TASK_QUEUE.md` (items 265+),
`docs/ARCHITECTURE_BOUNDARIES.md`, `docs/MUTATION_UPDATE_RULES.md`,
`docs/SCHEMA_MIGRATION_PROCESS.md`, `AGENT_AUTONOMY/CLOUD_MIGRATION_PLAN.md` (исторический).*
