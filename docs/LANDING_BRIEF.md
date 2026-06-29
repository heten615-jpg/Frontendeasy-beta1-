# Frontendeasy landing brief

Purpose: reusable copy and structure for the first public/demo landing page. This is a pre-launch brief, not proof that a public deployment is already live.

## Audience

- Solo founders, designers, indie hackers, and product teams who want to sketch web pages visually but still leave with real HTML.
- Users who currently jump between Figma, screenshots, no-code builders, and hand-written HTML/CSS.
- Early testers who can tolerate a beta editor if the exported output is portable and understandable.

## Positioning

Frontendeasy is a visual HTML studio: a Figma-like canvas where every frame is a real page, and export produces standalone HTML/CSS assets instead of a locked design file.

## Hero copy — English

**Headline:** Design pages visually. Export real HTML.

**Subheadline:** Frontendeasy gives you a Figma-like editor for multi-page sites, local-first projects, and standalone HTML exports you can inspect, host, and keep.

**Primary CTA:** Try the demo

**Secondary CTA:** Read the export guide

**Trust note:** Browser-first, local-first, and cloud sync only when configured.

## Hero copy — Russian

**Заголовок:** Собирай страницы визуально. Экспортируй настоящий HTML.

**Подзаголовок:** Frontendeasy — Figma-похожий редактор для многостраничных сайтов: локальные проекты, понятная структура страниц и самостоятельный HTML/CSS-экспорт без привязки к закрытой платформе.

**Основной CTA:** Открыть демо

**Второй CTA:** Посмотреть экспорт

**Trust note:** Сначала браузер и локальное хранение; облачная синхронизация включается только при настройке.

## Problem

Design tools are great for visual exploration but usually stop at static mockups. No-code builders can publish quickly but often lock content, styling, and hosting into one platform. Developers can hand-code clean pages, but early layout iteration is slower than dragging real objects on a canvas.

## Problem — RU

Дизайн-инструменты удобны для макетов, но часто не дают готовый переносимый сайт. No-code быстро публикует, но привязывает проект к платформе. Ручной HTML/CSS даёт контроль, но замедляет первые визуальные итерации.

## Solution

Frontendeasy keeps the visual canvas while treating pages as real export targets:

- Each frame is an HTML page/file.
- Canvas elements become generated HTML/CSS.
- Buttons link between frames.
- Local IndexedDB drafts work without a mandatory backend.
- Optional Supabase sync supports signed-in cloud projects.
- Export can include pages, loose elements, sitemap/robots, and PWA files depending on settings.

## Solution — RU

Frontendeasy оставляет скорость визуального редактора, но проектирует страницы как реальные файлы:

- Каждый frame — отдельная HTML-страница.
- Элементы canvas превращаются в HTML/CSS.
- Кнопки связывают страницы между собой.
- Локальные черновики хранятся в IndexedDB и работают без обязательного backend.
- Опциональная Supabase-синхронизация доступна для облачных проектов.
- Экспорт может включать страницы, loose-элементы, sitemap/robots и PWA-файлы согласно настройкам.

## Demo flow

Use this as the first demo script:

1. Open a blank or landing template.
2. Create two frames: `index.html` and `about.html`.
3. Add hero text, a section card, and an image/video placeholder.
4. Turn a section/text element into a button and link it to the second frame.
5. Run Project Health and show any preflight warnings.
6. Export HTML and point out page files, sitemap/robots, and portable assets.
7. Reopen the project locally or show cloud sync if Supabase is configured.

## Demo notes

- Do not claim production hosting is complete unless a real production URL has been validated separately.
- If cloud env vars are absent, present offline/local-first mode as intentional and supported.
- If a feature is release-gated or hidden, do not mention it as available.

## Feature blocks

### Visual canvas, real pages

Frames behave like pages, not just artboards. Name a frame `index.html`, link buttons to other frames, and export a small multi-page site.

### Local-first by default

Projects save in browser storage and continue to work offline. Cloud sync is optional and configuration-dependent.

### Export you can inspect

Generated HTML/CSS is standalone and testable. The export pipeline includes quality checks for semantics, unsafe links, image alt text, and inline-style regressions.

### Built for iteration

Templates, snapshots, undo/redo, inspector controls, accessibility preflight, tab-order overlay, and project health checks help catch issues before export.

## FAQ

### Is Frontendeasy a Figma replacement?

No. It borrows familiar canvas and inspector patterns, but its goal is HTML-page production and export, not collaborative design-file management.

### Does it require Supabase?

No. The editor can run local-first with IndexedDB. Supabase enables auth, project list sync, cloud snapshots, comments, and asset storage when configured.

### Can I host exported files anywhere?

The intended output is standalone HTML/CSS/assets. Validate each export with the project QA checklist before publishing.

### Is there a public hosted version?

This brief does not claim one. Treat the landing as pre-launch copy until a production deploy is validated.

### Does AI edit the project today?

Release builds should not promise public AI editing unless the feature is enabled and QA-approved. Current architecture docs prepare safe AI/MCP command paths, but public UI exposure is a separate decision.

## FAQ — RU

### Это замена Figma?

Нет. Frontendeasy использует знакомую модель canvas/inspector, но цель другая: быстро собрать HTML-страницы и получить переносимый экспорт.

### Supabase обязателен?

Нет. Редактор может работать локально через IndexedDB. Supabase нужен для auth, облачного списка проектов, cloud snapshots, комментариев и хранения ассетов.

### Можно хостить экспорт где угодно?

Цель экспорта — самостоятельные HTML/CSS/assets. Перед публикацией нужно прогнать QA-чеклист проекта.

### Публичная версия уже запущена?

Этот brief этого не утверждает. Считай текст pre-launch материалом, пока production deploy не проверен отдельно.

### AI уже редактирует проект публично?

Не обещать AI-редактирование в релизных материалах, пока функция не включена и не прошла QA. Архитектура готовит безопасные AI/MCP контуры, но публичное включение — отдельное решение.

## CTA variants

- Try the demo
- Open local demo
- Export your first page
- Inspect the HTML
- Join beta feedback

## CTA variants — RU

- Открыть демо
- Запустить локальное демо
- Экспортировать первую страницу
- Посмотреть HTML
- Оставить beta feedback

## Proof points to collect before launch

- Validated production URL.
- Short screen recording of the demo flow.
- Example exported folder with no secrets and no private assets.
- Project Health screenshot or checklist result.
- Browser matrix result from QA.

## Non-claims

Do not claim these until separately verified:

- Public deployment is live.
- Multi-user real-time collaboration is shipped.
- AI can safely edit live user projects in release builds.
- Export output is production-perfect for every possible layout.
- Supabase/SMTP is configured in every environment.
