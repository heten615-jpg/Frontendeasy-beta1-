export const INTERFACE_LANGUAGE_STORAGE_KEY = 'frontendeasy_interface_language_v1';

export const INTERFACE_LANGUAGE_OPTIONS = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' },
] as const;

export type InterfaceLanguage = typeof INTERFACE_LANGUAGE_OPTIONS[number]['id'];

const TRANSLATABLE_ATTRIBUTES = ['aria-label', 'title', 'placeholder'] as const;
const QUICK_TOOLTIP_DELAY_MS = 180;
const SKIP_UI_LOCALE_SELECTOR = [
  '[data-ui-locale-skip]',
  '.canvas-world',
  '.frame',
  '.element',
  '.inline-text-editor',
  'script',
  'style',
  'svg',
  'canvas',
  'iframe',
  'textarea',
  '[contenteditable="true"]',
].join(',');

const RU_EXACT_TRANSLATIONS = new Map<string, string>([
  ['File ▾', 'Файл ▾'],
  ['View ▾', 'Вид ▾'],
  ['File', 'Файл'],
  ['View', 'Вид'],
  ['Project', 'Проект'],
  ['Pages', 'Страницы'],
  ['Loose layers', 'Свободные слои'],
  ['Resources', 'Ресурсы'],
  ['Local resources', 'Локальные ресурсы'],
  ['Rename project', 'Переименовать проект'],
  ['Version history', 'История версий'],
  ['Export current page', 'Экспорт текущей страницы'],
  ['Export all pages', 'Экспорт всех страниц'],
  ['Export JSON', 'Экспорт JSON'],
  ['Portable project backup', 'Переносимая резервная копия проекта'],
  ['Import JSON', 'Импорт JSON'],
  ['Replace from a backup file', 'Заменить из резервной копии'],
  ['Zoom', 'Масштаб'],
  ['Zoom to selection', 'Масштабировать к выделению'],
  ['Fit the current selection or selected frame', 'Показать выделение или выбранный фрейм целиком'],
  ['Pixel preview', 'Пиксельный предпросмотр'],
  ['Disabled', 'Выключено'],
  ['Rulers and grid', 'Линейки и сетка'],
  ['Layout guides', 'Направляющие макета'],
  ['Outline view', 'Контурный режим'],
  ['Tab-order overlay', 'Порядок табуляции'],
  ['Property labels', 'Подписи свойств'],
  ['Full labels', 'Полные подписи'],
  ['Compact labels', 'Компактные подписи'],
  ['Theme', 'Тема'],
  ['Dark', 'Темная'],
  ['Warm', 'Теплая'],
  ['High contrast', 'Высокий контраст'],
  ['Preferences', 'Настройки'],
  ['Keyboard layout', 'Раскладка клавиатуры'],
  ['Default', 'По умолчанию'],
  ['Figma-style', 'Как в Figma'],
  ['Color vision', 'Цветовое зрение'],
  ['Normal', 'Обычное'],
  ['Protanopia', 'Протанопия'],
  ['Deuteranopia', 'Дейтеранопия'],
  ['Tritanopia', 'Тританопия'],
  ['Achromatopsia', 'Ахроматопсия'],
  ['Reduce motion', 'Уменьшить анимацию'],
  ['Layer hover highlights', 'Подсветка слоев при наведении'],
  ['Multiplayer cursors', 'Мультиплеерные курсоры'],
  ['placeholder', 'заглушка'],
  ['Snapping', 'Привязка'],
  ['Snap to geometry', 'Привязка к геометрии'],
  ['Snap to objects', 'Привязка к объектам'],
  ['Snap to pixel grid', 'Привязка к пиксельной сетке'],
  ['Restart onboarding', 'Перезапустить обучение'],
  ['Review the current workspace tour', 'Посмотреть тур по текущему редактору'],
  ['Project update notes', 'Заметки об обновлении проекта'],
  ['Project updated', 'Проект обновлен'],
  ['Close update notes', 'Закрыть заметки об обновлении'],
  ['Your project can keep editing immediately. These notes summarize the large data-model and workspace changes that may affect imported or older projects.', 'Можно сразу продолжать редактирование. Эти заметки кратко описывают крупные изменения модели данных и рабочей области, которые могут повлиять на импортированные или старые проекты.'],
  ['Workspace navigation changes', 'Изменения навигации рабочей области'],
  ['File/View menus, Edit/Comment/View modes, command palette search, quick-open pages, left-panel Libraries, and inspector search are now the primary navigation surfaces.', 'Меню Файл/Вид, режимы Редактирование/Комментарии/Просмотр, поиск команд, быстрый переход по страницам, библиотеки в левой панели и поиск по инспектору теперь являются основными поверхностями навигации.'],
  ['Export and health checks', 'Экспорт и проверки проекта'],
  ['Project Health now checks contrast, missing alt text, unsafe embeds, broken links, and unavailable asset references before HTML export.', 'Проверка проекта теперь перед HTML-экспортом проверяет контраст, отсутствующий alt-текст, небезопасные вставки, битые ссылки и недоступные ссылки на ассеты.'],
  ['Safe recovery paths', 'Безопасное восстановление'],
  ['Local autosave, snapshots, cloud conflict recovery, and JSON export preserve migrated data so schema upgrades do not require manual project cleanup.', 'Локальное автосохранение, снимки, восстановление облачных конфликтов и JSON-экспорт сохраняют мигрированные данные, поэтому обновления схемы не требуют ручной чистки проекта.'],
  ['Open Health', 'Открыть проверку'],
  ['Got it', 'Понятно'],
  ['Untitled Project', 'Безымянный проект'],
  ['Untitled', 'Без названия'],
  ['Home', 'Главная'],
  ['About', 'О проекте'],
  ['Contact', 'Контакты'],
  ['Launch something strange and beautiful.', 'Запустите что-то странное и красивое.'],
  ['Built and exported locally from Frontendeasy.', 'Собрано и экспортировано локально из Frontendeasy.'],
  ['Learn More →', 'Подробнее →'],
  ['ABOUT THIS PROJECT', 'О ПРОЕКТЕ'],
  ['A personal local-first HTML studio.', 'Персональная HTML-студия с локальным хранением.'],
  ['A personal local-first HTML', 'Персональная HTML-студия'],
  ['No cloud. No auth. Just you and your HTML.', 'Без облака. Без авторизации. Только вы и ваш HTML.'],
  ['← Back', '← Назад'],
  ['Contact →', 'Контакты →'],
  ['Get in Touch', 'Связаться'],
  ['Local only', 'Только локально'],
  ['Local draft', 'Локальный черновик'],
  ['Демо-режим — изменения сохраняются только в этом браузере', 'Демо-режим — изменения сохраняются только в этом браузере'],
  ['Cloud project', 'Облачный проект'],
  ['Cloud paused', 'Облако на паузе'],
  ['Cloud attention', 'Проблема с облаком'],
  ['No selection', 'Нет выделения'],
  ['Edit', 'Редактировать'],
  ['Comment', 'Комментарии'],
  ['Edit mode', 'Режим редактирования'],
  ['Comment mode', 'Режим комментариев'],
  ['View mode', 'Режим просмотра'],
  ['Show UI', 'Показать UI'],
  ['Minimize', 'Свернуть'],
  ['Hide', 'Скрыть'],
  ['Show', 'Показать'],
  ['Tools', 'Инструменты'],
  ['Move', 'Перемещение'],
  ['Hand', 'Рука'],
  ['Scale', 'Масштабирование'],
  ['Frame', 'Фрейм'],
  ['Slice', 'Срез'],
  ['Pen', 'Перо'],
  ['Pencil', 'Карандаш'],
  ['Text', 'Текст'],
  ['Annotation', 'Аннотация'],
  ['Measure', 'Измерение'],
  ['Rectangle', 'Прямоугольник'],
  ['Line', 'Линия'],
  ['Arrow', 'Стрелка'],
  ['Ellipse', 'Эллипс'],
  ['Polygon', 'Многоугольник'],
  ['Star', 'Звезда'],
  ['Image/video', 'Изображение/видео'],
  ['Input', 'Поле ввода'],
  ['Textarea', 'Многострочное поле'],
  ['Iframe', 'Iframe'],
  ['Lasso selection', 'Выделение лассо'],
  ['Lasso tool', 'Инструмент лассо'],
  ['⊡ Fit', '⊡ По размеру'],
  ['⌗ Grid off', '⌗ Сетка выкл.'],
  ['📏 Ruler', '📏 Линейка'],
  ['◇ Outline', '◇ Контуры'],
  ['↹ Tab order', '↹ Табуляция'],
  ['Health ✓', 'Проверка ✓'],
  ['Vision', 'Зрение'],
  ['＋ New ▾', '＋ Создать ▾'],
  ['Minify', 'Минифицировать'],
  ['Dark export', 'Темная тема'],
  ['PWA', 'PWA'],
  ['CSP', 'CSP'],
  ['↓ Frame', '↓ Страница'],
  ['↓ All', '↓ Все'],
  ['⇥ JSON', '⇥ JSON'],
  ['⇤ Import', '⇤ Импорт'],
  ['✛ Snapshot', '✛ Снимок'],
  ['Local autosave', 'Локальное автосохранение'],
  ['⊕ Folder', '⊕ Папка'],
  ['Assets', 'Ресурсы'],
  ['Pages & Layers', 'Страницы и слои'],
  ['Components', 'Компоненты'],
  ['Variants live on component rows. Select an instance on canvas to expose properties in the Inspector.', 'Варианты живут в строках компонентов. Выберите экземпляр на холсте, чтобы открыть свойства в инспекторе.'],
  ['No components yet. Select layers and press Cmd+Alt+K, then drag a component to canvas to create instance properties.', 'Компонентов пока нет. Выберите слои и нажмите Cmd+Alt+K, затем перетащите компонент на холст, чтобы создать свойства экземпляра.'],
  ['Snippets', 'Фрагменты'],
  ['static', 'статично'],
  ['No snippets yet. Right-click a layer and choose Save as snippet.', 'Фрагментов пока нет. Нажмите правой кнопкой по слою и выберите «Сохранить как фрагмент».'],
  ['Libraries', 'Библиотеки'],
  ['Manage', 'Управлять'],
  ['Filter', 'Фильтр'],
  ['All', 'Все'],
  ['Styles', 'Стили'],
  ['Collections', 'Коллекции'],
  ['Variables', 'Переменные'],
  ['Styles & Variables', 'Стили и переменные'],
  ['Styles & variables', 'Стили и переменные'],
  ['Styles and variables manager', 'Менеджер стилей и переменных'],
  ['List', 'Список'],
  ['Grid', 'Сетка'],
  ['Group by path', 'Группировать по пути'],
  ['Configure libraries', 'Настроить библиотеки'],
  ['Local components', 'Локальные компоненты'],
  ['Project snippets', 'Фрагменты проекта'],
  ['Uploaded assets', 'Загруженные ресурсы'],
  ['Project styles', 'Стили проекта'],
  ['Project styles and variables', 'Стили и переменные проекта'],
  ['Reusable system', 'Переиспользуемая система'],
  ['Close project styles and variables', 'Закрыть стили и переменные проекта'],
  ['View/comment mode: management controls are read-only.', 'Режим просмотра/комментариев: управляющие контролы доступны только для чтения.'],
  ['Project style manager', 'Менеджер стилей проекта'],
  ['Rename styles, tune color/layout fallback metadata, and reset default styles when needed.', 'Переименовывайте стили, настраивайте резервные метаданные цвета/макета и сбрасывайте стандартные стили при необходимости.'],
  ['+ Layout', '+ Макет'],
  ['Project variable manager', 'Менеджер переменных проекта'],
  ['Manage collections, modes, groups, token paths, fallback values, and per-mode values.', 'Управляйте коллекциями, режимами, группами, путями токенов, резервными значениями и значениями по режимам.'],
  ['+ Collection', '+ Коллекция'],
  ['+ Mode', '+ Режим'],
  ['+ Group', '+ Группа'],
  ['Project style', 'Стиль проекта'],
  ['Style name', 'Имя стиля'],
  ['Style color', 'Цвет стиля'],
  ['Layout style variable', 'Переменная стиля макета'],
  ['Style variable id', 'ID переменной стиля'],
  ['Variable ref', 'Ссылка переменной'],
  ['Variable id', 'ID переменной'],
  ['Apply to selection', 'Применить к выделению'],
  ['Reset default', 'Сбросить стандартное'],
  ['Collection', 'Коллекция'],
  ['Collection name', 'Имя коллекции'],
  ['Active mode', 'Активный режим'],
  ['Modes', 'Режимы'],
  ['Groups', 'Группы'],
  ['No groups yet.', 'Групп пока нет.'],
  ['Variables in', 'Переменные в'],
  ['No variables in this collection.', 'В этой коллекции нет переменных.'],
  ['Path', 'Путь'],
  ['Group', 'Группа'],
  ['Fallback', 'Резервное значение'],
  ['Variable name', 'Имя переменной'],
  ['Variable path', 'Путь переменной'],
  ['Variable type', 'Тип переменной'],
  ['Variable group', 'Группа переменной'],
  ['Variable fallback', 'Резервное значение переменной'],
  ['Mode values', 'Значения режимов'],
  ['Delete variable', 'Удалить переменную'],
  ['New layout guide style', 'Новый стиль направляющих'],
  ['New effect style', 'Новый стиль эффекта'],
  ['New text style', 'Новый текстовый стиль'],
  ['New color style', 'Новый цветовой стиль'],
  ['New collection', 'Новая коллекция'],
  ['New mode', 'Новый режим'],
  ['New group', 'Новая группа'],
  ['New variable', 'Новая переменная'],
  ['number', 'число'],
  ['layout', 'макет'],
  ['Colors', 'Цвета'],
  ['Layout', 'Макет'],
  ['refs', 'ссылки'],
  ['variable-backed', 'на переменной'],
  ['text style', 'текстовый стиль'],
  ['color style', 'цветовой стиль'],
  ['effect style', 'стиль эффекта'],
  ['layout-guide style', 'стиль направляющих'],
  ['No uploaded assets yet. Add or paste images to populate this list.', 'Загруженных ресурсов пока нет. Добавьте или вставьте изображения, чтобы заполнить список.'],
  ['Search layers...', 'Поиск слоев...'],
  ['Search layers…', 'Поиск слоев…'],
  ['Search layers', 'Поиск слоев'],
  ['Search inspector properties', 'Поиск свойств инспектора'],
  ['Search properties...', 'Поиск свойств...'],
  ['Search properties…', 'Поиск свойств…'],
  ['Fallback: page name', 'По умолчанию: имя страницы'],
  ['Design', 'Дизайн'],
  ['Prototype', 'Прототип'],
  ['Parent', 'Родитель'],
  ['Main component', 'Основной компонент'],
  ['Mask', 'Маска'],
  ['Boolean', 'Булево'],
  ['More', 'Еще'],
  ['frame', 'фрейм'],
  ['Identity', 'Сведения'],
  ['Name', 'Имя'],
  ['Filename', 'Имя файла'],
  ['Description', 'Описание'],
  ['(meta tag)', '(meta-тег)'],
  ['Typography', 'Типографика'],
  ['Project font', 'Шрифт проекта'],
  ['(Google Fonts)', '(Google Fonts)'],
  ['Applied across exported pages and loose elements.', 'Применяется ко всем экспортируемым страницам и свободным элементам.'],
  ['SEO', 'SEO'],
  ['OG title', 'OG-заголовок'],
  ['(social previews)', '(превью в соцсетях)'],
  ['OG image URL', 'URL OG-изображения'],
  ['Twitter card', 'Карточка Twitter'],
  ['— None —', '— Нет —'],
  ['Summary', 'Краткая'],
  ['Large image', 'Большое изображение'],
  ['Theme color', 'Цвет темы'],
  ['Keywords', 'Ключевые слова'],
  ['(comma-separated)', '(через запятую)'],
  ['Export', 'Экспорт'],
  ['Select a page for page export settings, or use File → Export all pages.', 'Выберите страницу для настроек экспорта или используйте Файл → Экспорт всех страниц.'],
  ['Open the Assets tab for components, snippets, uploaded media, project styles, and variables.', 'Откройте вкладку Ресурсы для компонентов, фрагментов, загруженных медиа, стилей проекта и переменных.'],
  ['Dark-mode CSS', 'CSS темной темы'],
  ['Inherit project setting', 'Наследовать настройку проекта'],
  ['Force on for this page', 'Включить для этой страницы'],
  ['Force off for this page', 'Выключить для этой страницы'],
  ['Exclude from PWA cache', 'Исключить из PWA-кэша'],
  ['Strict CSP export', 'Строгий CSP-экспорт'],
  ['Default favicon', 'Favicon по умолчанию'],
  ['No project favicon', 'Нет favicon проекта'],
  ['Page favicon', 'Favicon страницы'],
  ['Inherit project favicon', 'Наследовать favicon проекта'],
  ['No favicon on this page', 'Нет favicon на этой странице'],
  ['Controls this page\'s dark CSS, PWA cache listing, strict CSP meta, and exported favicon link.', 'Управляет темной CSS-темой страницы, PWA-кэшем, строгим CSP meta и ссылкой favicon при экспорте.'],
  ['Position & Size', 'Позиция и размер'],
  ['Resize to fit', 'Подогнать размер'],
  ['Clip content', 'Обрезать содержимое'],
  ['Frame guides', 'Направляющие фрейма'],
  ['Guide styles', 'Стили направляющих'],
  ['+ Layout guide style', '+ Стиль направляющих'],
  ['Uniform grid', 'Равномерная сетка'],
  ['Columns', 'Колонки'],
  ['Rows', 'Строки'],
  ['Responsive variants', 'Адаптивные варианты'],
  ['Create linked layouts that export into this page through media queries.', 'Создайте связанные макеты, которые экспортируются в эту страницу через media queries.'],
  ['+ Tablet', '+ Планшет'],
  ['+ Mobile', '+ Мобильный'],
  ['Auto Layout', 'Автомакет'],
  ['Enable flex layout', 'Включить flex-макет'],
  ['Background', 'Фон'],
  ['＋ Convert to gradient', '＋ Преобразовать в градиент'],
  ['Background image URL', 'URL фонового изображения'],
  ['Image fit', 'Масштаб изображения'],
  ['Cover', 'Заполнить'],
  ['Contain', 'Вместить'],
  ['Original', 'Оригинал'],
  ['Repeat', 'Повтор'],
  ['No repeat', 'Без повтора'],
  ['Repeat X', 'Повтор X'],
  ['Repeat Y', 'Повтор Y'],
  ['Position', 'Позиция'],
  ['Center', 'Центр'],
  ['Top', 'Сверху'],
  ['Bottom', 'Снизу'],
  ['Left', 'Слева'],
  ['Right', 'Справа'],
  ['Preview', 'Предпросмотр'],
  ['Open preview ↗', 'Открыть предпросмотр ↗'],
  ['Info', 'Инфо'],
  ['Elements', 'Элементы'],
  ['Buttons', 'Кнопки'],
  ['Button', 'Кнопка'],
  ['Button state', 'Состояние: кнопка'],
  ['Links', 'Ссылки'],
  ['page', 'страница'],
  ['project', 'проект'],
  ['project export', 'экспорт проекта'],
  ['component instance', 'экземпляр компонента'],
  ['slice', 'срез'],
  ['group', 'группа'],
  ['section', 'секция'],
  ['layer', 'слой'],
  ['frames', 'фреймы'],
  ['pages', 'страницы'],
  ['Inspector export', 'Экспорт инспектора'],
  ['Current', 'Текущая'],
  ['Copy info', 'Копировать инфо'],
  ['+ Variable', '+ Переменная'],
  ['+ Color style', '+ Цветовой стиль'],
  ['Variable style', 'Стиль переменной'],
  ['Color style', 'Цветовой стиль'],
  ['Create default selection variable', 'Создать переменную из текущего выделения'],
  ['Create color style from project fallback', 'Создать цветовой стиль из резервного цвета проекта'],
  ['Manage project styles and variables', 'Управлять стилями и переменными проекта'],
  ['Variable collections include modes and groups; rendered output keeps fallback CSS values until a layer references a variable.', 'Коллекции переменных включают режимы и группы; итоговый вывод сохраняет резервные CSS-значения, пока слой не ссылается на переменную.'],
  ['Workspace profile', 'Профиль рабочей области'],
  ['Local workspace', 'Локальная рабочая область'],
  ['Profile', 'Профиль'],
  ['Account overview placeholder', 'Заглушка обзора аккаунта'],
  ['Settings', 'Настройки'],
  ['Workspace preferences placeholder', 'Заглушка настроек рабочей области'],
  ['Language', 'Язык'],
  ['English', 'Английский'],
  ['Русский', 'Русский'],
  ['Applies to the editor interface.', 'Применяется к интерфейсу редактора.'],
  ['Sign out', 'Выйти'],
  ['Leave this workspace session', 'Выйти из этой рабочей сессии'],
  ['Project health', 'Проверка проекта'],
  ['Ready to export', 'Готово к экспорту'],
  ['No contrast, alt text, iframe, link, or asset issues found in the current project.', 'В текущем проекте не найдено проблем с контрастом, alt-текстами, iframe, ссылками или ресурсами.'],
  ['Snapshots / Versions', 'Снимки / версии'],
  ['No snapshots yet. Use ✛ Snapshot to save a version of the current project.', 'Снимков пока нет. Используйте ✛ Снимок, чтобы сохранить версию текущего проекта.'],
  ['Restore', 'Восстановить'],
  ['Delete', 'Удалить'],
  ['Search commands', 'Поиск команд'],
  ['Keyboard shortcuts', 'Горячие клавиши'],
  ['Command palette', 'Палитра команд'],
  ['Profile menu', 'Меню профиля'],
  ['Interface language', 'Язык интерфейса'],
  ['Choose shape', 'Выбрать фигуру'],
  ['Project file actions', 'Действия с файлом проекта'],
  ['View and preferences', 'Вид и настройки'],
  ['File menu', 'Меню файла'],
  ['Project storage status', 'Статус хранения проекта'],
  ['Back to your projects', 'Назад к проектам'],
  ['← Projects', '← Проекты'],
  ['Cloud sync is not configured. Saved to this browser.', 'Облачная синхронизация не настроена. Сохранено в этом браузере.'],
  ['Editor permission mode', 'Режим доступа редактора'],
  ['Editable mode: full canvas and inspector editing.', 'Режим редактирования: полный доступ к холсту и инспектору.'],
  ['Comment mode: selection, navigation, properties, and comments only.', 'Режим комментариев: только выделение, навигация, свойства и комментарии.'],
  ['View mode: selection, navigation, properties, and export only.', 'Режим просмотра: только выделение, навигация, свойства и экспорт.'],
  ['UI visibility', 'Видимость интерфейса'],
  ['Show full editor UI', 'Показать полный интерфейс редактора'],
  ['Minimize side panels but keep tools visible', 'Свернуть боковые панели, оставив инструменты видимыми'],
  ['Hide editor side panels and tools', 'Скрыть боковые панели и инструменты редактора'],
  ['Show editor UI', 'Показать интерфейс редактора'],
  ['Fit all frames in view (⌘0)', 'Показать все фреймы (⌘0)'],
  ['Show rulers + grid overlay', 'Показать линейки и сетку'],
  ['Hide rulers + grid overlay', 'Скрыть линейки и сетку'],
  ['Show outline view', 'Показать контурный режим'],
  ['Hide outline view', 'Скрыть контурный режим'],
  ['Show tab-order overlay', 'Показать порядок табуляции'],
  ['Hide tab-order overlay', 'Скрыть порядок табуляции'],
  ['Add sticky comment', 'Добавить закрепленный комментарий'],
  ['Add a sticky comment to the selected frame or element', 'Добавить закрепленный комментарий к выбранному фрейму или элементу'],
  ['Select a frame or element to comment', 'Выберите фрейм или элемент для комментария'],
  ['Start a new project from a built-in template', 'Создать проект из встроенного шаблона'],
  ['Start a new project', 'Создать проект'],
  ['Minify export HTML', 'Минифицировать экспорт HTML'],
  ['Minify exported HTML files', 'Минифицировать экспортируемые HTML-файлы'],
  ['Dark-mode export CSS', 'CSS темной темы при экспорте'],
  ['Emit dark-mode CSS variables in exported HTML', 'Добавить CSS-переменные темной темы в экспортируемый HTML'],
  ['PWA-ready export', 'Экспорт с поддержкой PWA'],
  ['Generate manifest.json and service worker on export', 'Создать manifest.json и service worker при экспорте'],
  ['Add a restrictive Content-Security-Policy meta tag to exported HTML', 'Добавить строгий meta-тег Content-Security-Policy в экспортируемый HTML'],
  ['Download active frame as a standalone HTML file', 'Скачать активный фрейм как отдельный HTML-файл'],
  ['Download all frames as HTML files', 'Скачать все фреймы как HTML-файлы'],
  ['Export full project as JSON', 'Экспортировать весь проект как JSON'],
  ['Import project from a JSON file', 'Импортировать проект из JSON-файла'],
  ['Save current state as a named snapshot/version', 'Сохранить текущее состояние как именованный снимок/версию'],
  ['Show saved snapshots/versions', 'Показать сохраненные снимки/версии'],
  ['Save and sync status', 'Статус сохранения и синхронизации'],
  ['Recent edits were saved locally. Folder sync is optional. Connect a folder to auto-write HTML files on every change. Cloud sync is not configured for this build.', 'Последние правки сохранены локально. Синхронизация с папкой необязательна. Подключите папку, чтобы HTML-файлы записывались при каждом изменении. Облачная синхронизация в этой сборке не настроена.'],
  ['Recent edits were saved locally.', 'Последние правки сохранены локально.'],
  ['Folder sync is optional. Connect a folder to auto-write HTML files on every change.', 'Синхронизация с папкой необязательна. Подключите папку, чтобы HTML-файлы записывались при каждом изменении.'],
  ['Folder sync unavailable — File System Access API is not supported in this browser.', 'Синхронизация с папкой недоступна: File System Access API не поддерживается в этом браузере.'],
  ['Manual only', 'Только вручную'],
  ['Saved', 'Сохранено'],
  ['Saving…', 'Сохранение…'],
  ['Syncing…', 'Синхронизация…'],
  ['Synced', 'Синхронизировано'],
  ['Offline', 'Офлайн'],
  ['Reloaded', 'Перезагружено'],
  ['Error', 'Ошибка'],
  ['Retry', 'Повторить'],
  ['Permission lost', 'Доступ потерян'],
  ['Profile, settings, and language', 'Профиль, настройки и язык'],
  ['Left panel tabs', 'Вкладки левой панели'],
  ['File tab', 'Вкладка «Файл»'],
  ['Assets tab', 'Вкладка «Ресурсы»'],
  ['File tab (Alt+1)', 'Вкладка «Файл» (Alt+1)'],
  ['Assets tab (Alt+2)', 'Вкладка «Ресурсы» (Alt+2)'],
  ['Collapse layers except selected ancestry', 'Свернуть слои кроме ветки выделения'],
  ['Add page', 'Добавить страницу'],
  ['Assets and libraries', 'Ресурсы и библиотеки'],
  ['Open project styles and variables manager', 'Открыть менеджер стилей и переменных проекта'],
  ['Search libraries and assets', 'Поиск библиотек и ресурсов'],
  ['Search local components, snippets, assets…', 'Поиск локальных компонентов, фрагментов, ресурсов…'],
  ['Library browser controls', 'Управление браузером библиотек'],
  ['Library filter', 'Фильтр библиотеки'],
  ['Library view', 'Вид библиотеки'],
  ['Library items', 'Элементы библиотеки'],
  ['All library items', 'Все элементы библиотеки'],
  ['Collapse', 'Свернуть'],
  ['Delete page', 'Удалить страницу'],
  ['Button — links to a page', 'Кнопка — ведет на страницу'],
  ['Button state — links to a page', 'Состояние: кнопка — ссылка на страницу'],
  ['Frame background', 'Фон фрейма'],
  ['Rectangle layer', 'Слой-прямоугольник'],
  ['Line layer', 'Слой-линия'],
  ['Image/video layer', 'Слой изображения/видео'],
  ['Rename page', 'Переименовать страницу'],
  ['Rename layer', 'Переименовать слой'],
  ['Layer order controls', 'Управление порядком слоев'],
  ['Bring forward', 'На передний план'],
  ['Send backward', 'На задний план'],
  ['Hide element', 'Скрыть элемент'],
  ['Hide from canvas + export', 'Скрыть на холсте и в экспорте'],
  ['Lock element', 'Заблокировать элемент'],
  ['Lock element (no click/drag)', 'Заблокировать элемент (без клика/перетаскивания)'],
  ['Delete element', 'Удалить элемент'],
  ['Resize left panel', 'Изменить ширину левой панели'],
  ['Drag to resize left panel', 'Потяните, чтобы изменить ширину левой панели'],
  ['Design canvas', 'Холст дизайна'],
  ['Canvas overview. Drag or use arrow keys to pan.', 'Обзор холста. Перетаскивайте или используйте стрелки для перемещения.'],
  ['Zoom out (⌘−)', 'Уменьшить масштаб (⌘−)'],
  ['Zoom in (⌘+)', 'Увеличить масштаб (⌘+)'],
  ['Reset zoom to 100%', 'Сбросить масштаб до 100%'],
  ['Inspector tabs', 'Вкладки инспектора'],
  ['Selection quick actions', 'Быстрые действия выделения'],
  ['Properties are read-only. Selection, navigation, export, and allowed comments still work.', 'Свойства доступны только для чтения. Выделение, навигация, экспорт и разрешенные комментарии продолжают работать.'],
  ['Prototype inspector failed to load:', 'Инспектор прототипа не загрузился:'],
  ['Loading prototype inspector...', 'Загрузка инспектора прототипа...'],
  ['elements', 'элементы'],
  ['selected', 'выбрано'],
  ['Primary:', 'Основной:'],
  ['Align', 'Выравнивание'],
  ['Align left', 'Выровнять по левому краю'],
  ['Align horizontal center', 'Выровнять по горизонтальному центру'],
  ['Align right', 'Выровнять по правому краю'],
  ['Align top', 'Выровнять по верхнему краю'],
  ['Align vertical middle', 'Выровнять по вертикальному центру'],
  ['Align bottom', 'Выровнять по нижнему краю'],
  ['Distribute', 'Распределение'],
  ['Distribute horizontally (centers evenly between leftmost and rightmost)', 'Распределить по горизонтали между крайними центрами'],
  ['Distribute vertically (centers evenly between topmost and bottommost)', 'Распределить по вертикали между крайними центрами'],
  ['Tidy up selection into even left-to-right spacing', 'Упорядочить выделение с равными горизонтальными отступами'],
  ['Tidy up', 'Упорядочить'],
  ['Distribute needs 3+ elements selected.', 'Для распределения нужно выбрать 3+ элемента.'],
  ['Selection colors', 'Цвета выделения'],
  ['Selection color summary', 'Сводка цветов выделения'],
  ['Text:', 'Текст:'],
  ['Fill:', 'Заливка:'],
  ['Bulk text color', 'Цвет текста для выделения'],
  ['Bulk fill color', 'Цвет заливки для выделения'],
  ['Bulk styles', 'Массовые стили'],
  ['Enable stroke', 'Включить обводку'],
  ['Clear stroke', 'Очистить обводку'],
  ['Bulk stroke color', 'Цвет обводки для выделения'],
  ['Enable shadow', 'Включить тень'],
  ['Clear shadow', 'Очистить тень'],
  ['Bulk shadow color', 'Цвет тени для выделения'],
  ['Select matching', 'Выбрать похожие'],
  ['Same fill', 'Та же заливка'],
  ['Same stroke', 'Та же обводка'],
  ['Same effect', 'Тот же эффект'],
  ['Same font', 'Тот же шрифт'],
  ['Same instance', 'Тот же экземпляр'],
  ['text', 'текст'],
  ['image', 'изображение'],
  ['button', 'кнопка'],
  ['list', 'список'],
  ['iframe', 'iframe'],
  ['loose', 'свободный'],
  ['Component', 'Компонент'],
  ['Master', 'Мастер'],
  ['Variant', 'Вариант'],
  ['variants', 'варианты'],
  ['properties', 'свойства'],
  ['masters', 'мастеры'],
  ['Add Hover/Active variants from the Components panel. Create properties here on an instance; the controls then appear for every instance of this master.', 'Добавьте варианты Hover/Active из панели компонентов. Создайте свойства на экземпляре, и эти контролы появятся у каждого экземпляра этого мастера.'],
  ['Add Hover or Active variants from the Components panel.', 'Добавьте варианты Hover или Active из панели компонентов.'],
  ['Create component properties', 'Создать свойства компонента'],
  ['Expose Boolean', 'Открыть Boolean'],
  ['Expose Text', 'Открыть текст'],
  ['Expose Swap', 'Открыть замену'],
  ['Expose Variant', 'Открыть вариант'],
  ['Expose a checkbox property on this component', 'Открыть checkbox-свойство этого компонента'],
  ['Expose text content as an instance property', 'Открыть текст как свойство экземпляра'],
  ['Expose a component swap dropdown', 'Открыть выпадающий список замены компонента'],
  ['Expose the component variant selector as a named property', 'Открыть выбор варианта компонента как именованное свойство'],
  ['Component property controls', 'Контролы свойств компонента'],
  ['Create properties to expose text, visibility, swaps, or variants on this instance.', 'Создайте свойства, чтобы открыть текст, видимость, замены или варианты на этом экземпляре.'],
  ['Missing component master. This instance will export its last materialized layer data.', 'Мастер компонента отсутствует. Этот экземпляр экспортирует последние материализованные данные слоя.'],
  ['Alpha', 'Альфа'],
  ['Vector', 'Вектор'],
  ['Luminance', 'Яркость'],
  ['Mask creation controls', 'Контролы создания маски'],
  ['Kind', 'Тип'],
  ['Mask kind', 'Тип маски'],
  ['Enable mask', 'Включить маску'],
  ['Enabled', 'Включено'],
  ['Invert mask', 'Инвертировать маску'],
  ['Invert', 'Инвертировать'],
  ['Remove mask', 'Удалить маску'],
  ['Export maps Alpha to opacity, Vector to clip-path inset, and Luminance to grayscale mask intent metadata.', 'Экспорт преобразует Альфу в opacity, Вектор в clip-path inset, а Яркость в метаданные намерения grayscale-маски.'],
  ['Create a mask from the selected layer, or use More for a luminance mask shortcut.', 'Создайте маску из выбранного слоя или используйте «Еще» для быстрого создания маски яркости.'],
  ['Transform', 'Трансформация'],
  ['Rotation', 'Поворот'],
  ['Rotate selected element -90 degrees', 'Повернуть выбранный элемент на -90 градусов'],
  ['Rotate selected element 90 degrees', 'Повернуть выбранный элемент на 90 градусов'],
  ['Rotate selection -90 degrees', 'Повернуть выделение на -90 градусов'],
  ['Rotate selection 90 degrees', 'Повернуть выделение на 90 градусов'],
  ['Flip H', 'Отразить гориз.'],
  ['Flip V', 'Отразить верт.'],
  ['Flip selected element horizontally', 'Отразить выбранный элемент по горизонтали'],
  ['Flip selected element vertically', 'Отразить выбранный элемент по вертикали'],
  ['Flip selection horizontally', 'Отразить выделение по горизонтали'],
  ['Flip selection vertically', 'Отразить выделение по вертикали'],
  ['Rotation origin', 'Точка поворота'],
  ['Pin for export', 'Закрепить при экспорте'],
  ['Keep this layer absolutely positioned when exporting flow HTML', 'Оставить этот слой абсолютным при экспорте flow HTML'],
  ['Flow export keeps pinned layers absolute above the generated layout.', 'Flow-экспорт оставляет закрепленные слои абсолютными поверх сгенерированного макета.'],
  ['Top left', 'Сверху слева'],
  ['Top right', 'Сверху справа'],
  ['Bottom left', 'Снизу слева'],
  ['Bottom right', 'Снизу справа'],
  ['Constraints', 'Ограничения'],
  ['Constraints diagram', 'Схема ограничений'],
  ['Default: Left + Top', 'По умолчанию: слева + сверху'],
  ['Horizontal', 'Горизонтально'],
  ['Horizontal constraint', 'Горизонтальное ограничение'],
  ['Vertical', 'Вертикально'],
  ['Vertical constraint', 'Вертикальное ограничение'],
  ['Left & Right', 'Слева и справа'],
  ['Top & Bottom', 'Сверху и снизу'],
  ['Identity & Content', 'Сведения и контент'],
  ['Layer name', 'Имя слоя'],
  ['Auto: content or element type', 'Авто: контент или тип элемента'],
  ['Inline text formatting', 'Форматирование встроенного текста'],
  ['Bold selected text', 'Сделать выбранный текст жирным'],
  ['Italic selected text', 'Сделать выбранный текст курсивом'],
  ['Underline selected text', 'Подчеркнуть выбранный текст'],
  ['Select text above, then format.', 'Выделите текст выше, затем примените форматирование.'],
  ['Select text in Content, then format.', 'Выделите текст в поле контента, затем примените форматирование.'],
  ['Inline link URL', 'URL встроенной ссылки'],
  ['Apply URL to selected text', 'Применить URL к выбранному тексту'],
  ['Apply', 'Применить'],
  ['Clear selected text link', 'Очистить ссылку выбранного текста'],
  ['Clear', 'Очистить'],
  ['Link selected text to page', 'Связать выбранный текст со страницей'],
  ['Choose page...', 'Выберите страницу...'],
  ['Slice Export', 'Экспорт среза'],
  ['Export filename', 'Имя файла экспорта'],
  ['Slice export filename', 'Имя файла экспорта среза'],
  ['Slices do not render inside page HTML. Download All and folder export emit each slice as a cropped HTML region.', 'Срезы не рендерятся внутри HTML страницы. «Скачать все» и экспорт в папку создают каждый срез как обрезанную HTML-область.'],
  ['Text style preset', 'Пресет стиля текста'],
  ['Heading 1', 'Заголовок 1'],
  ['Heading 2', 'Заголовок 2'],
  ['Body', 'Основной текст'],
  ['Caption', 'Подпись'],
  ['Save current', 'Сохранить текущий'],
  ['Save current text style preset', 'Сохранить текущий пресет стиля текста'],
  ['Save current typography into the selected preset', 'Сохранить текущую типографику в выбранный пресет'],
  ['Presets are stored with this project and apply size, weight, tracking, line height, decoration, and transform.', 'Пресеты хранятся в этом проекте и применяют размер, насыщенность, трекинг, высоту строки, оформление и трансформацию.'],
  ['Mode', 'Режим'],
  ['Basics', 'Базовое'],
  ['Details', 'Детали'],
  ['Source', 'Источник'],
  ['Typography mode', 'Режим типографики'],
  ['Font source', 'Источник шрифта'],
  ['System stack', 'Системный набор'],
  ['Variable font', 'Вариативный шрифт'],
  ['Size', 'Размер'],
  ['Weight', 'Насыщенность'],
  ['Light', 'Легкий'],
  ['Regular', 'Обычный'],
  ['Medium', 'Средний'],
  ['Semibold', 'Полужирный'],
  ['Bold', 'Жирный'],
  ['Extrabold', 'Сверхжирный'],
  ['Black', 'Черный'],
  ['Align', 'Выравнивание'],
  ['Text alignment', 'Выравнивание текста'],
  ['Justify', 'По ширине'],
  ['Text vertical alignment', 'Вертикальное выравнивание текста'],
  ['Text box sizing', 'Размер текстового блока'],
  ['Auto width', 'Автоширина'],
  ['Auto height', 'Автовысота'],
  ['Fixed size', 'Фиксированный размер'],
  ['Auto-resize to fit width', 'Автоподгонка под ширину'],
  ['Size is the maximum; text shrinks to fit its box.', 'Размер максимальный; текст уменьшается, чтобы поместиться в блок.'],
  ['Overflow', 'Переполнение'],
  ['Text overflow behavior', 'Поведение переполнения текста'],
  ['Wrap', 'Переносить'],
  ['Clip', 'Обрезать'],
  ['Ellipsis', 'Многоточие'],
  ['None', 'Нет'],
  ['Tracking', 'Трекинг'],
  ['Line height', 'Высота строки'],
  ['auto', 'авто'],
  ['Case', 'Регистр'],
  ['Text case', 'Регистр текста'],
  ['Uppercase', 'Верхний регистр'],
  ['Lowercase', 'Нижний регистр'],
  ['Capitalize', 'С заглавных'],
  ['Small caps', 'Капитель'],
  ['UPPERCASE', 'ВЕРХНИЙ РЕГИСТР'],
  ['lowercase', 'нижний регистр'],
  ['Text trim', 'Обрезка текста'],
  ['Cap height', 'По высоте прописных'],
  ['Both edges', 'Оба края'],
  ['Max lines', 'Макс. строк'],
  ['Max text lines', 'Макс. строк текста'],
  ['Indent', 'Отступ'],
  ['Paragraph indent', 'Абзацный отступ'],
  ['Paragraph gap', 'Интервал абзаца'],
  ['Paragraph spacing', 'Интервал между абзацами'],
  ['List indent', 'Отступ списка'],
  ['Hanging punctuation', 'Висячая пунктуация'],
  ['OpenType settings', 'Настройки OpenType'],
  ['Decoration', 'Оформление'],
  ['Underline', 'Подчеркивание'],
  ['Strike', 'Зачеркивание'],
  ['Overline', 'Надчеркивание'],
  ['Text shadow', 'Тень текста'],
  ['Appearance', 'Внешний вид'],
  ['Appearance preset', 'Пресет внешнего вида'],
  ['Styles & presets', 'Стили и пресеты'],
  ['Card', 'Карточка'],
  ['CTA button', 'CTA-кнопка'],
  ['Subtle border', 'Мягкая обводка'],
  ['Apply appearance preset', 'Применить пресет внешнего вида'],
  ['Save current appearance preset', 'Сохранить текущий пресет внешнего вида'],
  ['Apply background, radius, border, shadow, and colour fields', 'Применить фон, радиус, обводку, тень и цветовые поля'],
  ['Save current appearance into the selected preset', 'Сохранить текущий внешний вид в выбранный пресет'],
  ['Appearance presets do not change typography or content.', 'Пресеты внешнего вида не меняют типографику или контент.'],
  ['Project style library', 'Библиотека стилей проекта'],
  ['Display text', 'Текст дисплея'],
  ['Brand orange', 'Фирменный оранжевый'],
  ['Soft shadow', 'Мягкая тень'],
  ['+ Text', '+ Текст'],
  ['+ Color', '+ Цвет'],
  ['+ Effect', '+ Эффект'],
  ['Create text style from selection', 'Создать текстовый стиль из выделения'],
  ['Create color style from selection', 'Создать цветовой стиль из выделения'],
  ['Create effect style from selection', 'Создать стиль эффекта из выделения'],
  ['Create variable from selection', 'Создать переменную из выделения'],
  ['Styles and variables keep concrete fallback values so export remains deterministic.', 'Стили и переменные сохраняют конкретные резервные значения, чтобы экспорт оставался детерминированным.'],
  ['Fill architecture', 'Архитектура заливки'],
  ['Type', 'Тип'],
  ['Fill type', 'Тип заливки'],
  ['Solid', 'Сплошная'],
  ['Gradient', 'Градиент'],
  ['Pattern', 'Паттерн'],
  ['Video', 'Видео'],
  ['Color model', 'Цветовая модель'],
  ['Fill color model', 'Цветовая модель заливки'],
  ['Variable', 'Переменная'],
  ['Fill source', 'Источник заливки'],
  ['Document colors', 'Цвета документа'],
  ['Library colors', 'Цвета библиотеки'],
  ['Local override', 'Локальное переопределение'],
  ['Variable reference', 'Ссылка на переменную'],
  ['Fill variable reference', 'Ссылка переменной заливки'],
  ['Gradient type', 'Тип градиента'],
  ['Linear', 'Линейный'],
  ['Radial', 'Радиальный'],
  ['Angular', 'Угловой'],
  ['Diamond', 'Ромб'],
  ['Gradient rotation', 'Поворот градиента'],
  ['Flip gradient horizontally', 'Отразить градиент по горизонтали'],
  ['Flip gradient vertically', 'Отразить градиент по вертикали'],
  ['Gradient stops', 'Точки градиента'],
  ['Add gradient stop', 'Добавить точку градиента'],
  ['＋ Add stop', '＋ Добавить точку'],
  ['Pattern style', 'Стиль паттерна'],
  ['Diagonal', 'Диагональный'],
  ['Dots', 'Точки'],
  ['Pattern size', 'Размер паттерна'],
  ['Pattern source', 'Источник паттерна'],
  ['Document', 'Документ'],
  ['Library', 'Библиотека'],
  ['Local', 'Локально'],
  ['Tiling', 'Повторение'],
  ['Pattern tiling', 'Повторение паттерна'],
  ['Pattern scale', 'Масштаб паттерна'],
  ['Spacing', 'Интервал'],
  ['Pattern spacing', 'Интервал паттерна'],
  ['Pattern alignment', 'Выравнивание паттерна'],
  ['Pattern opacity', 'Прозрачность паттерна'],
  ['Foreground', 'Передний план'],
  ['Pattern foreground', 'Передний план паттерна'],
  ['Pattern background', 'Фон паттерна'],
  ['Current export uses the concrete background/media fill while this metadata keeps the selected fill type, source, and variable intent portable.', 'Текущий экспорт использует конкретный фон/медиа-заливку, а эти метаданные сохраняют выбранный тип заливки, источник и намерение переменной переносимыми.'],
  ['Text color', 'Цвет текста'],
  ['Radius', 'Радиус'],
  ['Independent corners', 'Независимые углы'],
  ['Top left radius', 'Радиус сверху слева'],
  ['Top right radius', 'Радиус сверху справа'],
  ['Bottom right radius', 'Радиус снизу справа'],
  ['Bottom left radius', 'Радиус снизу слева'],
  ['Corner smoothing', 'Сглаживание углов'],
  ['Corner smoothing value', 'Значение сглаживания углов'],
  ['Use iOS corner smoothing preset', 'Использовать пресет сглаживания углов iOS'],
  ['Smoothing is persisted as design intent; current CSS export keeps the closest per-corner radius fallback.', 'Сглаживание сохраняется как дизайнерское намерение; текущий CSS-экспорт оставляет ближайший резервный радиус по углам.'],
  ['Opacity', 'Непрозрачность'],
  ['Opacity mode', 'Режим непрозрачности'],
  ['Fixed', 'Фиксировано'],
  ['Visibility mode', 'Режим видимости'],
  ['Visible', 'Видимый'],
  ['Blend mode', 'Режим наложения'],
  ['Pass through', 'Пропустить'],
  ['Darken', 'Затемнение'],
  ['Multiply', 'Умножение'],
  ['Color burn', 'Затемнение основы'],
  ['Lighten', 'Осветление'],
  ['Screen', 'Экран'],
  ['Color dodge', 'Осветление основы'],
  ['Overlay', 'Перекрытие'],
  ['Soft light', 'Мягкий свет'],
  ['Hard light', 'Жесткий свет'],
  ['Difference', 'Разница'],
  ['Exclusion', 'Исключение'],
  ['Hue', 'Тон'],
  ['Saturation', 'Насыщенность'],
  ['Color', 'Цвет'],
  ['Luminosity', 'Светимость'],
  ['Plus darker', 'Плюс темнее'],
  ['Plus lighter', 'Плюс светлее'],
  ['Variable modes are persisted as inspector intent; current exports keep concrete opacity and visibility values.', 'Режимы переменных сохраняются как намерение инспектора; текущий экспорт оставляет конкретные значения непрозрачности и видимости.'],
  ['Drop shadow', 'Тень'],
  ['Effects', 'Эффекты'],
  ['Effect stack exports CSS fallbacks for shadows, blur, glass, noise, and texture.', 'Стек эффектов экспортирует CSS-резервы для теней, размытия, стекла, шума и текстуры.'],
  ['Effects stack', 'Стек эффектов'],
  ['Inner shadow', 'Внутренняя тень'],
  ['Layer blur', 'Размытие слоя'],
  ['Background blur', 'Размытие фона'],
  ['Glass', 'Стекло'],
  ['Noise', 'Шум'],
  ['Texture', 'Текстура'],
  ['The legacy shadow control is preserved; the stack adds independent inner shadow, blur, glass, noise, and texture CSS fallbacks.', 'Старый контрол тени сохранен; стек добавляет независимые резервные CSS-значения для внутренней тени, размытия, стекла, шума и текстуры.'],
  ['Drop shadow settings', 'Настройки тени'],
  ['Inner shadow settings', 'Настройки внутренней тени'],
  ['Glass settings', 'Настройки стекла'],
  ['Noise settings', 'Настройки шума'],
  ['Texture settings', 'Настройки текстуры'],
  ['Spread', 'Разброс'],
  ['Colour', 'Цвет'],
  ['Tint', 'Оттенок'],
  ['Style', 'Стиль'],
  ['Border', 'Обводка'],
  ['Stroke', 'Обводка'],
  ['Enable border', 'Включить обводку'],
  ['Width', 'Ширина'],
  ['Dashed', 'Пунктир'],
  ['Dotted', 'Точки'],
  ['Placement', 'Расположение'],
  ['Stroke placement', 'Расположение обводки'],
  ['Inside', 'Внутри'],
  ['Outside', 'Снаружи'],
  ['Width profile', 'Профиль ширины'],
  ['Stroke width profile', 'Профиль ширины обводки'],
  ['Uniform', 'Равномерный'],
  ['Taper start', 'Сужение в начале'],
  ['Taper end', 'Сужение в конце'],
  ['Taper both', 'Сужение с обеих сторон'],
  ['Dash', 'Штрих'],
  ['Stroke dash length', 'Длина штриха обводки'],
  ['Gap', 'Промежуток'],
  ['Stroke gap length', 'Длина промежутка обводки'],
  ['Cap', 'Окончание'],
  ['Stroke cap', 'Окончание обводки'],
  ['Butt', 'Срез'],
  ['Round', 'Скругленное'],
  ['Square', 'Квадратное'],
  ['Brush direction', 'Направление кисти'],
  ['Stroke brush direction', 'Направление кисти обводки'],
  ['Forward', 'Вперед'],
  ['Reverse', 'Назад'],
  ['Start cap', 'Начальное окончание'],
  ['Open path start cap', 'Начальное окончание открытого контура'],
  ['End cap', 'Конечное окончание'],
  ['Open path end cap', 'Конечное окончание открытого контура'],
  ['Placement, profiles, caps, dash/gap, and side widths are persisted as stroke metadata. DOM export maps what CSS supports directly; vector paths use stroke-width, dasharray, and linecap fallbacks.', 'Расположение, профили, окончания, штрихи/промежутки и ширины сторон сохраняются как метаданные обводки. DOM-экспорт напрямую мапит то, что поддерживает CSS; векторные контуры используют резервные stroke-width, dasharray и linecap.'],
  ['Layout item', 'Элемент макета'],
  ['Auto Layout item', 'Элемент автомакета'],
  ['Ignore layout', 'Игнорировать макет'],
  ['Ignore auto layout', 'Игнорировать автомакет'],
  ['Horizontal sizing', 'Горизонтальный размер'],
  ['Horizontal layout sizing', 'Горизонтальный размер макета'],
  ['Vertical sizing', 'Вертикальный размер'],
  ['Vertical layout sizing', 'Вертикальный размер макета'],
  ['Hug', 'По содержимому'],
  ['Fill', 'Заполнить'],
  ['Min W', 'Мин. ширина'],
  ['Max W', 'Макс. ширина'],
  ['Min H', 'Мин. высота'],
  ['Max H', 'Макс. высота'],
  ['Layout min width', 'Минимальная ширина макета'],
  ['Layout max width', 'Максимальная ширина макета'],
  ['Layout min height', 'Минимальная высота макета'],
  ['Layout max height', 'Максимальная высота макета'],
  ['Infer', 'Определить'],
  ['Infer from children', 'Определить по дочерним'],
  ['Infer element auto layout', 'Определить автомакет элемента'],
  ['Direction', 'Направление'],
  ['→ Row', '→ Строка'],
  ['↓ Column', '↓ Колонка'],
  ['Align (cross)', 'Выравнивание (поперечное)'],
  ['Justify (main)', 'Распределение (главное)'],
  ['Start', 'Начало'],
  ['End', 'Конец'],
  ['Stretch', 'Растянуть'],
  ['Space between', 'Между'],
  ['Space around', 'Вокруг'],
  ['Grid', 'Сетка'],
  ['Column gap', 'Интервал колонок'],
  ['Row gap', 'Интервал строк'],
  ['Column tracks', 'Треки колонок'],
  ['Row tracks', 'Треки строк'],
  ['Padding', 'Внутренние отступы'],
  ['Link padding values', 'Связать значения отступов'],
  ['Unlink padding values', 'Развязать значения отступов'],
  ['List', 'Список'],
  ['Items are separated by newlines in the Content field above.', 'Элементы разделяются переносами строк в поле контента выше.'],
  ['Bulleted', 'Маркированный'],
  ['Numbered', 'Нумерованный'],
  ['Exported with sandbox=allow-scripts allow-same-origin allow-forms.', 'Экспортируется с sandbox=allow-scripts allow-same-origin allow-forms.'],
  ['Unsafe iframe URL will export as about:blank.', 'Небезопасный URL iframe будет экспортирован как about:blank.'],
  ['Image', 'Изображение'],
  ['No image selected', 'Изображение не выбрано'],
  ['Replace image', 'Заменить изображение'],
  ['Pick image', 'Выбрать изображение'],
  ['Alt text', 'Alt-текст'],
  ['Describe this image for accessibility', 'Опишите это изображение для доступности'],
  ['Object fit', 'Масштаб объекта'],
  ['Cover (crop to fill)', 'Заполнить (обрезать по размеру)'],
  ['Contain (letterbox)', 'Вместить (с полями)'],
  ['Fill (stretch)', 'Заполнить (растянуть)'],
  ['None (original size)', 'Нет (исходный размер)'],
  ['Crop image', 'Обрезать изображение'],
  ['Done cropping', 'Готово'],
  ['Exit image crop mode', 'Выйти из режима обрезки изображения'],
  ['Reset image crop', 'Сбросить обрезку изображения'],
  ['Reset crop', 'Сбросить обрезку'],
  ['Image crop aspect ratios', 'Соотношения сторон обрезки изображения'],
  ['Resize image media to fit', 'Подогнать медиа изображения по размеру'],
  ['X offset', 'Смещение X'],
  ['Y offset', 'Смещение Y'],
  ['Filters', 'Фильтры'],
  ['Reset image filters', 'Сбросить фильтры изображения'],
  ['Reset filters', 'Сбросить фильтры'],
  ['Brightness', 'Яркость'],
  ['Contrast', 'Контраст'],
  ['Media fill', 'Медиа-заливка'],
  ['No media selected', 'Медиа не выбрано'],
  ['Replace media fill', 'Заменить медиа-заливку'],
  ['Alt / note', 'Alt / заметка'],
  ['decorative by default', 'по умолчанию декоративно'],
  ['Optional description for meaningful media', 'Необязательное описание для значимого медиа'],
  ['Fill mode', 'Режим заливки'],
  ['Fill (crop to shape)', 'Заполнить (обрезать по форме)'],
  ['Fit (contain)', 'Вместить'],
  ['Stretch', 'Растянуть'],
  ['Original size', 'Исходный размер'],
  ['Tile', 'Плитка'],
  ['Crop media fill', 'Обрезать медиа-заливку'],
  ['Crop fill', 'Обрезать заливку'],
  ['Exit media fill crop mode', 'Выйти из режима обрезки медиа-заливки'],
  ['Reset media fill crop', 'Сбросить обрезку медиа-заливки'],
  ['Media fill crop aspect ratios', 'Соотношения сторон обрезки медиа-заливки'],
  ['Resize media fill to fit', 'Подогнать медиа-заливку по размеру'],
  ['Vector shapes keep their path silhouette by masking the media fill in canvas and export.', 'Векторные фигуры сохраняют силуэт контура, маскируя медиа-заливку на холсте и в экспорте.'],
  ['Media fill is stored on the shape; old image elements remain compatible.', 'Медиа-заливка хранится на фигуре; старые элементы изображений остаются совместимыми.'],
  ['Interaction', 'Взаимодействие'],
  ['Make this element a clickable link', 'Сделать этот элемент кликабельной ссылкой'],
  ['Each child element will link to the target', 'Каждый дочерний элемент будет ссылаться на цель'],
  ['Link target', 'Цель ссылки'],
  ['Target page', 'Целевая страница'],
  ['— No link —', '— Нет ссылки —'],
  ['Links to:', 'Ссылка на:'],
  ['Selection', 'Выделение'],
  ['Frame auto layout mode', 'Режим автомакета фрейма'],
  ['Infer frame auto layout', 'Определить автомакет фрейма'],
  ['Infer from layers', 'Определить по слоям'],
  ['Frame auto layout direction', 'Направление автомакета фрейма'],
  ['Frame auto layout gap', 'Интервал автомакета фрейма'],
  ['Frame auto layout align', 'Выравнивание автомакета фрейма'],
  ['Frame auto layout justify', 'Распределение автомакета фрейма'],
  ['Frame auto layout wrap', 'Перенос автомакета фрейма'],
  ['Frame auto layout grid columns', 'Колонки сетки автомакета фрейма'],
  ['Frame auto layout grid rows', 'Строки сетки автомакета фрейма'],
  ['Frame auto layout column gap', 'Интервал колонок автомакета фрейма'],
  ['Frame auto layout row gap', 'Интервал строк автомакета фрейма'],
  ['Frame auto layout column tracks', 'Треки колонок автомакета фрейма'],
  ['Frame auto layout row tracks', 'Треки строк автомакета фрейма'],
  ['Frame auto layout padding top', 'Верхний отступ автомакета фрейма'],
  ['Frame auto layout padding right', 'Правый отступ автомакета фрейма'],
  ['Frame auto layout padding bottom', 'Нижний отступ автомакета фрейма'],
  ['Frame auto layout padding left', 'Левый отступ автомакета фрейма'],
  ['Copy remains synced from the base page; layout/style edits are local overrides.', 'Текст остается синхронизированным с базовой страницей; правки макета/стиля являются локальными переопределениями.'],
  ['The page background remains fixed behind flowed content.', 'Фон страницы остается фиксированным за контентом в потоке.'],
  ['Recent', 'Недавние'],
  ['Presets', 'Пресеты'],
  ['Count', 'Количество'],
  ['Margin', 'Отступ'],
  ['Gutter', 'Межколонник'],
  ['Guide styles', 'Стили направляющих'],
  ['Uniform grid size', 'Размер равномерной сетки'],
  ['Uniform grid variable', 'Переменная равномерной сетки'],
  ['Column guide count', 'Количество направляющих колонок'],
  ['Column guide type', 'Тип направляющих колонок'],
  ['Column guide margin', 'Отступ направляющих колонок'],
  ['Column guide gutter', 'Межколонник направляющих колонок'],
  ['Column guide variable', 'Переменная направляющих колонок'],
  ['Row guide count', 'Количество направляющих строк'],
  ['Row guide type', 'Тип направляющих строк'],
  ['Row guide margin', 'Отступ направляющих строк'],
  ['Row guide gutter', 'Интервал направляющих строк'],
  ['Row guide variable', 'Переменная направляющих строк'],
  ['Create layout guide style from frame', 'Создать стиль направляющих из фрейма'],
  ['Apply layout guide style', 'Применить стиль направляющих'],
  ['Frame dark-mode export', 'Экспорт темной темы фрейма'],
  ['Exclude frame from PWA export', 'Исключить фрейм из PWA-экспорта'],
  ['Strict CSP export setting', 'Настройка строгого CSP-экспорта'],
  ['Project default favicon', 'Favicon проекта по умолчанию'],
  ['Frame favicon', 'Favicon фрейма'],
  ['Resize frame to fit content', 'Подогнать размер фрейма под контент'],
  ['Clip frame content', 'Обрезать содержимое фрейма'],
  ['Frame background image URL', 'URL фонового изображения фрейма'],
  ['Frame background image fit', 'Масштаб фонового изображения фрейма'],
  ['Frame background image repeat', 'Повтор фонового изображения фрейма'],
  ['Frame background image position', 'Позиция фонового изображения фрейма'],
  ['Variable width', 'Переменная ширина'],
  ['Shape builder', 'Сборщик фигур'],
  ['Cut', 'Разрез'],
  ['Bend', 'Изгиб'],
  ['Lasso', 'Лассо'],
  ['Paint', 'Краска'],
  ['Merge', 'Объединить'],
  ['Extract', 'Извлечь'],
  ['Subtract', 'Вычесть'],
  ['Free', 'Свободно'],
  ['Vector edit', 'Редактирование вектора'],
  ['Enter vector edit mode', 'Войти в режим редактирования вектора'],
  ['Exit vector edit mode', 'Выйти из режима редактирования вектора'],
  ['Enter edit mode', 'Войти в редактирование'],
  ['Exit edit mode', 'Выйти из редактирования'],
  ['Vector edit tools', 'Инструменты редактирования вектора'],
  ['Bezier points', 'Точки Безье'],
  ['Vector variable width', 'Переменная ширина вектора'],
  ['Paint colour', 'Цвет краски'],
  ['Vector boolean operations', 'Булевы операции вектора'],
  ['Active:', 'Активно:'],
  ['off', 'выкл.'],
  ['caps:', 'окончания:'],
  ['operations:', 'операции:'],
  ['Close', 'Закрыть'],
  ['No project health issues', 'Проблем проекта не найдено'],
  ['Color vision simulation', 'Симуляция цветового зрения'],
  ['Apply style', 'Применить стиль'],
  ['Open color picker', 'Открыть выбор цвета'],
  ['Layer visible', 'Слой видим'],
  ['Blend mode hover preview', 'Предпросмотр режима наложения при наведении'],
  ['Export current inspector page', 'Экспорт текущей страницы инспектора'],
  ['Export all inspector pages', 'Экспорт всех страниц инспектора'],
  ['Copy inspector export local file info', 'Копировать локальную информацию экспорта инспектора'],
  ['Selection utilities', 'Утилиты выделения'],
  ['Element X', 'X элемента'],
  ['Element Y', 'Y элемента'],
  ['Element width', 'Ширина элемента'],
  ['Element height', 'Высота элемента'],
  ['Resizing', 'Изменение размера'],
  ['Text resizing controls', 'Контролы размера текста'],
  ['Set text fixed size', 'Задать фиксированный размер текста'],
  ['Set text hug height', 'Задать высоту текста по содержимому'],
  ['Set text hug width', 'Задать ширину текста по содержимому'],
  ['Hug height', 'Высота по содержимому'],
  ['Hug width', 'Ширина по содержимому'],
  ['Fixed width + height', 'Фиксированная ширина + высота'],
  ['Fixed width + hug height', 'Фиксированная ширина + высота по содержимому'],
  ['Hug width + height', 'Ширина + высота по содержимому'],
  ['Use Hug height to keep wrapped text visible while width stays fixed.', 'Используйте высоту по содержимому, чтобы переносимый текст оставался видимым при фиксированной ширине.'],
  ['Move tool', 'Инструмент перемещения'],
  ['Hand tool', 'Инструмент руки'],
  ['Scale tool', 'Инструмент масштабирования'],
  ['Frame tool', 'Инструмент фрейма'],
  ['Slice tool', 'Инструмент среза'],
  ['Rectangle tool', 'Инструмент прямоугольника'],
  ['Pen tool', 'Инструмент пера'],
  ['Pencil tool', 'Инструмент карандаша'],
  ['Text tool', 'Инструмент текста'],
  ['Comment tool', 'Инструмент комментария'],
  ['Annotation tool', 'Инструмент аннотации'],
  ['Measure tool', 'Инструмент измерения'],
  ['color', 'цвет'],
  ['effect', 'эффект'],
  ['text', 'текст'],
  ['layout-guide', 'направляющие макета'],
  ['Local variables', 'Локальные переменные'],
  ['8pt layout grid', '8pt сетка макета'],
  ['8pt grid', '8pt сетка'],
]);

const RU_PATTERNS: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^Schema v(\d+) migration and UI changes$/, match => `Миграция схемы v${match[1]} и изменения UI`],
  [/^Schema v(\d+) update notes$/, match => `Заметки об обновлении схемы v${match[1]}`],
  [/^Schema v(\d+) project data$/, match => `Данные проекта схемы v${match[1]}`],
  [/^Older projects are normalized on load so component masters, snippets, comments, review overlays, guides, styles, variables, export settings, and assets stay portable\.$/, () => 'Старые проекты нормализуются при загрузке, чтобы мастера компонентов, фрагменты, комментарии, ревью-оверлеи, направляющие, стили, переменные, настройки экспорта и ассеты оставались переносимыми.'],
  [/^(\d+) saved snapshots?$/, match => `${match[1]} сохраненных снимков`],
  [/^(\d+) frames as HTML$/, match => `${match[1]} фрейма как HTML`],
  [/^⌚ Versions \((\d+)\)$/, match => `⌚ Версии (${match[1]})`],
  [/^Health \((\d+)\)$/, match => `Проверка (${match[1]})`],
  [/^Comment \((\d+)\)$/, match => `Комментарии (${match[1]})`],
  [/^● (.+)$/, match => `● ${translateCoreToRussian(match[1])}`],
  [/^☁ (.+)$/, match => `☁ ${translateCoreToRussian(match[1])}`],
  [/^⬆ (.+)$/, match => `⬆ ${translateCoreToRussian(match[1])}`],
  [/^⚠ (.+)$/, match => `⚠ ${translateCoreToRussian(match[1])}`],
  [/^Current: (.+)\. Applies to the editor interface\.$/, match => `Текущий язык: ${translateCoreToRussian(match[1])}. Применяется к интерфейсу редактора.`],
  [/^Profile menu, current language (.+)$/, match => `Меню профиля, текущий язык: ${translateCoreToRussian(match[1])}`],
  [/^Project health preflight: (.+)$/, match => `Проверка проекта: ${translateCoreToRussian(match[1])}`],
  [/^(\d+) pages$/, match => `${match[1]} страницы`],
  [/^(\d+) frames$/, match => `${match[1]} фрейма`],
  [/^(\d+) layers$/, match => `${match[1]} слоев`],
  [/^(\d+) selected$/, match => `${match[1]} выбрано`],
  [/^(\d+) variants$/, match => `${match[1]} вариантов`],
  [/^(\d+) properties$/, match => `${match[1]} свойств`],
  [/^(\d+) masters$/, match => `${match[1]} мастеров`],
  [/^(\d+) styles, (\d+) collections, (\d+) variables\.$/, match => {
    const styleCount = Number(match[1]);
    const collectionCount = Number(match[2]);
    const variableCount = Number(match[3]);
    return `${styleCount} ${pluralRu(styleCount, ['стиль', 'стиля', 'стилей'])}, ${collectionCount} ${pluralRu(collectionCount, ['коллекция', 'коллекции', 'коллекций'])}, ${variableCount} ${pluralRu(variableCount, ['переменная', 'переменные', 'переменных'])}.`;
  }],
  [/^Saved snapshot$/, () => 'Снимок сохранен'],
  [/^(\d+) frame(?:s)? as HTML$/, match => `${match[1]} фреймов как HTML`],
  [/^(\d+) saved snapshots?$/, match => `${match[1]} сохраненных снимков`],
  [/^Rename page (.+)$/, match => `Переименовать страницу ${match[1]}`],
  [/^Rename layer (.+)$/, match => `Переименовать слой ${match[1]}`],
  [/^Collapse (.+)$/, match => `Свернуть ${translateCoreToRussian(match[1])}`],
  [/^Expand (.+)$/, match => `Развернуть ${translateCoreToRussian(match[1])}`],
  [/^Apply style (.+)$/, match => `Применить стиль ${translateCoreToRussian(match[1])}`],
  [/^Apply project style (.+)$/, match => `Применить стиль проекта ${translateCoreToRussian(match[1])}`],
  [/^Project styles\/(.+)$/, match => `Стили проекта/${translateCoreToRussian(match[1])}`],
  [/^Variables\/(.+)$/, match => `Переменные/${translateCoreToRussian(match[1])}`],
  [/^Project style (.+)$/, match => `Стиль проекта ${translateCoreToRussian(match[1])}`],
  [/^Style name (.+)$/, match => `Имя стиля ${translateCoreToRussian(match[1])}`],
  [/^Style color (.+)$/, match => `Цвет стиля ${translateCoreToRussian(match[1])}`],
  [/^Layout style variable (.+)$/, match => `Переменная стиля макета ${translateCoreToRussian(match[1])}`],
  [/^Style variable id (.+)$/, match => `ID переменной стиля ${translateCoreToRussian(match[1])}`],
  [/^Variable collection (.+)$/, match => `Коллекция переменных ${translateCoreToRussian(match[1])}`],
  [/^Collection name (.+)$/, match => `Имя коллекции ${translateCoreToRussian(match[1])}`],
  [/^Active mode (.+)$/, match => `Активный режим ${translateCoreToRussian(match[1])}`],
  [/^Modes for (.+)$/, match => `Режимы для ${translateCoreToRussian(match[1])}`],
  [/^Groups for (.+)$/, match => `Группы для ${translateCoreToRussian(match[1])}`],
  [/^Variables in (.+)$/, match => `Переменные в ${translateCoreToRussian(match[1])}`],
  [/^Mode name (.+)$/, match => `Имя режима ${translateCoreToRussian(match[1])}`],
  [/^Group name (.+)$/, match => `Имя группы ${translateCoreToRussian(match[1])}`],
  [/^Variable name (.+)$/, match => `Имя переменной ${translateCoreToRussian(match[1])}`],
  [/^Variable path (.+)$/, match => `Путь переменной ${translateCoreToRussian(match[1])}`],
  [/^Variable type (.+)$/, match => `Тип переменной ${translateCoreToRussian(match[1])}`],
  [/^Variable group (.+)$/, match => `Группа переменной ${translateCoreToRussian(match[1])}`],
  [/^Variable fallback (.+)$/, match => `Резервное значение переменной ${translateCoreToRussian(match[1])}`],
  [/^Mode values for (.+)$/, match => `Значения режимов для ${translateCoreToRussian(match[1])}`],
  [/^Variable (.+)$/, match => `Переменная ${translateCoreToRussian(match[1])}`],
  [/^(.+) value for (.+)$/, match => `Значение ${translateCoreToRussian(match[1])} для ${translateCoreToRussian(match[2])}`],
  [/^Library group (.+)$/, match => `Группа библиотеки ${translateCoreToRussian(match[1])}`],
  [/^style (.+)$/, match => `стиль ${translateCoreToRussian(match[1])}`],
  [/^variable (.+)$/, match => `переменная ${translateCoreToRussian(match[1])}`],
  [/^Create (Alpha|Vector|Luminance) mask$/, match => `Создать маску: ${translateCoreToRussian(match[1])}`],
  [/^Vector (.+) tool$/, match => `Инструмент вектора: ${translateCoreToRussian(match[1])}`],
  [/^Vector (.+) operation$/, match => `Операция вектора: ${translateCoreToRussian(match[1])}`],
  [/^Enable (.+)$/, match => `Включить ${translateCoreToRussian(match[1]).toLowerCase()}`],
  [/^Preview blend mode (.+)$/, match => `Предпросмотр режима наложения: ${translateCoreToRussian(match[1])}`],
  [/^Hover to preview (.+); click to apply$/, match => `Наведите для предпросмотра ${translateCoreToRussian(match[1]).toLowerCase()}; нажмите, чтобы применить`],
  [/^Gradient stop (\d+) position$/, match => `Позиция точки градиента ${match[1]}`],
  [/^Gradient stop (\d+) variable$/, match => `Переменная точки градиента ${match[1]}`],
  [/^Remove gradient stop (\d+)$/, match => `Удалить точку градиента ${match[1]}`],
  [/^Stop (\d+)$/, match => `Точка ${match[1]}`],
  [/^Stroke (top|right|bottom|left) width$/, match => `Ширина обводки: ${translateCoreToRussian(match[1])}`],
  [/^Image crop aspect (.+)$/, match => `Соотношение обрезки изображения: ${match[1]}`],
  [/^Media fill crop aspect (.+)$/, match => `Соотношение обрезки медиа-заливки: ${match[1]}`],
  [/^Object position: (.+)$/, match => `Позиция объекта: ${match[1]}`],
  [/^Links to: (.+)$/, match => `Ссылка на: ${match[1]}`],
  [/^(.+) · (.+)$/, match => `${translateCoreToRussian(match[1])} · ${translateCoreToRussian(match[2])}`],
  [/^Grid snap ON \((.+)\)\. Click to cycle .+$/, match => `Привязка к сетке включена (${match[1]}). Нажмите, чтобы переключить размер или выключить.`],
  [/^Grid snap OFF\. Click to enable\.$/, () => 'Привязка к сетке выключена. Нажмите, чтобы включить.'],
  [/^⌗ Grid (.+)$/, match => `⌗ Сетка ${match[1] === 'off' ? 'выкл.' : match[1]}`],
  [/^Highlighted (\d+) loose asset references?$/, match => `Подсвечено ссылок на свободные ресурсы: ${match[1]}`],
  [/^(.+) \(coming soon\)$/, match => {
    const translated = RU_EXACT_TRANSLATIONS.get(match[1]);
    return translated ? `${translated} (скоро)` : match[0];
  }],
  [/^(.+) \(([^)]+)\)$/, match => {
    const translated = RU_EXACT_TRANSLATIONS.get(match[1]);
    return translated ? `${translated} (${match[2]})` : match[0];
  }],
];

let currentLanguage: InterfaceLanguage = 'en';
let observer: MutationObserver | null = null;
let quickTooltipTimer: number | null = null;
let quickTooltipNode: HTMLElement | null = null;
let quickTooltipTarget: HTMLElement | null = null;
let quickTooltipPointer = { x: 0, y: 0 };
const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();

export function installInterfaceLocalization(language: InterfaceLanguage, root: ParentNode = document.body): () => void {
  currentLanguage = language;
  applyInterfaceLocalization(root);
  observer?.disconnect();
  observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        processTextNode(mutation.target as Text);
      } else if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        processElementAttributes(mutation.target);
      } else {
        mutation.addedNodes.forEach(node => processNode(node));
      }
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
  });
  installQuickTooltipListeners(root);
  return () => {
    observer?.disconnect();
    observer = null;
    removeQuickTooltip();
    uninstallQuickTooltipListeners(root);
  };
}

export function setInterfaceLocalizationLanguage(language: InterfaceLanguage): void {
  currentLanguage = language;
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  applyInterfaceLocalization(document.body);
}

function applyInterfaceLocalization(root: ParentNode): void {
  processNode(root as Node);
}

function processNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    processTextNode(node as Text);
    return;
  }
  if (!(node instanceof Element || node instanceof Document || node instanceof DocumentFragment)) return;
  if (node instanceof Element && shouldSkipElement(node)) return;

  if (node instanceof Element) processElementAttributes(node);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(candidate) {
      if (candidate instanceof Element) {
        return shouldSkipElement(candidate) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
      const parent = candidate.parentElement;
      if (!parent || shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current: Node | null = walker.currentNode;
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      processTextNode(current as Text);
    } else if (current instanceof Element) {
      processElementAttributes(current);
    }
    current = walker.nextNode();
  }
}

function processTextNode(node: Text): void {
  const parent = node.parentElement;
  if (!parent || shouldSkipElement(parent)) return;
  const current = node.nodeValue ?? '';
  if (!current.trim()) return;
  const original = resolveOriginalText(node, current);
  const translated = currentLanguage === 'ru' ? translateToRussian(original) : original;
  if (current !== translated) node.nodeValue = translated;
}

function processElementAttributes(element: Element): void {
  if (shouldSkipElement(element)) return;
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current?.trim()) continue;
    const original = resolveOriginalAttribute(element, attribute, current);
    const translated = currentLanguage === 'ru' ? translateToRussian(original) : original;
    if (current !== translated) element.setAttribute(attribute, translated);
  }
}

function resolveOriginalText(node: Text, current: string): string {
  const previous = originalText.get(node);
  if (!previous) {
    originalText.set(node, current);
    return current;
  }
  const previousTranslation = translateToRussian(previous);
  if (current !== previous && current !== previousTranslation) {
    originalText.set(node, current);
    return current;
  }
  return previous;
}

function resolveOriginalAttribute(element: Element, attribute: string, current: string): string {
  let attributes = originalAttributes.get(element);
  if (!attributes) {
    attributes = new Map();
    originalAttributes.set(element, attributes);
  }
  const previous = attributes.get(attribute);
  if (!previous) {
    attributes.set(attribute, current);
    return current;
  }
  const previousTranslation = translateToRussian(previous);
  if (current !== previous && current !== previousTranslation) {
    attributes.set(attribute, current);
    return current;
  }
  return previous;
}

function shouldSkipElement(element: Element): boolean {
  return Boolean(element.closest(SKIP_UI_LOCALE_SELECTOR));
}

function translateToRussian(value: string): string {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const core = value.trim().replace(/\s+/g, ' ');
  if (!core) return value;
  return `${leading}${translateCoreToRussian(core)}${trailing}`;
}

function translateCoreToRussian(core: string): string {
  const exact = RU_EXACT_TRANSLATIONS.get(core);
  if (exact) return exact;
  for (const [pattern, replacer] of RU_PATTERNS) {
    const match = core.match(pattern);
    if (match) return replacer(match);
  }
  return core;
}

function pluralRu(count: number, forms: [string, string, string]): string {
  const absolute = Math.abs(count) % 100;
  const last = absolute % 10;
  if (absolute > 10 && absolute < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

function installQuickTooltipListeners(root: ParentNode): void {
  root.addEventListener('pointerover', handleQuickTooltipPointerOver, true);
  root.addEventListener('pointermove', handleQuickTooltipPointerMove, true);
  root.addEventListener('pointerout', handleQuickTooltipPointerOut, true);
  root.addEventListener('focusin', handleQuickTooltipFocusIn, true);
  root.addEventListener('focusout', handleQuickTooltipFocusOut, true);
  root.addEventListener('click', removeQuickTooltip, true);
  window.addEventListener('scroll', removeQuickTooltip, true);
  window.addEventListener('resize', removeQuickTooltip);
  window.addEventListener('keydown', handleQuickTooltipKeydown);
}

function uninstallQuickTooltipListeners(root: ParentNode): void {
  root.removeEventListener('pointerover', handleQuickTooltipPointerOver, true);
  root.removeEventListener('pointermove', handleQuickTooltipPointerMove, true);
  root.removeEventListener('pointerout', handleQuickTooltipPointerOut, true);
  root.removeEventListener('focusin', handleQuickTooltipFocusIn, true);
  root.removeEventListener('focusout', handleQuickTooltipFocusOut, true);
  root.removeEventListener('click', removeQuickTooltip, true);
  window.removeEventListener('scroll', removeQuickTooltip, true);
  window.removeEventListener('resize', removeQuickTooltip);
  window.removeEventListener('keydown', handleQuickTooltipKeydown);
}

function handleQuickTooltipPointerOver(event: Event): void {
  if (!(event instanceof PointerEvent)) return;
  const target = findQuickTooltipTarget(event.target);
  if (!target) return;
  const related = event.relatedTarget;
  if (related instanceof Node && target.contains(related)) return;
  quickTooltipPointer = { x: event.clientX, y: event.clientY };
  scheduleQuickTooltip(target, 'pointer');
}

function handleQuickTooltipPointerMove(event: Event): void {
  if (!(event instanceof PointerEvent)) return;
  quickTooltipPointer = { x: event.clientX, y: event.clientY };
  if (quickTooltipNode) positionQuickTooltip(quickTooltipNode, quickTooltipPointer);
}

function handleQuickTooltipPointerOut(event: Event): void {
  if (!(event instanceof PointerEvent)) return;
  const target = findQuickTooltipTarget(event.target);
  if (!target || target !== quickTooltipTarget) return;
  const related = event.relatedTarget;
  if (related instanceof Node && target.contains(related)) return;
  removeQuickTooltip();
}

function handleQuickTooltipFocusIn(event: Event): void {
  const target = findQuickTooltipTarget(event.target);
  if (!target) return;
  scheduleQuickTooltip(target, 'focus');
}

function handleQuickTooltipFocusOut(event: Event): void {
  const target = findQuickTooltipTarget(event.target);
  if (!target || target !== quickTooltipTarget) return;
  removeQuickTooltip();
}

function handleQuickTooltipKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') removeQuickTooltip();
}

function findQuickTooltipTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const candidate = target.closest<HTMLElement>('[data-ui-tooltip], [title]');
  if (!candidate || shouldSkipQuickTooltip(candidate)) return null;
  suppressNativeTitleTooltip(candidate);
  return quickTooltipText(candidate) ? candidate : null;
}

function shouldSkipQuickTooltip(element: Element): boolean {
  return Boolean(element.closest('.property-doc-tooltip, .quick-ui-tooltip, [data-ui-tooltip-skip]'));
}

function suppressNativeTitleTooltip(element: HTMLElement): void {
  const title = element.getAttribute('title');
  if (!title?.trim()) return;
  if (!element.getAttribute('data-ui-tooltip')?.trim()) {
    const original = resolveOriginalAttribute(element, 'title', title);
    const tooltipText = original.replace(/\s+/g, ' ').trim();
    element.setAttribute('data-ui-tooltip', tooltipText);
    let attributes = originalAttributes.get(element);
    if (!attributes) {
      attributes = new Map();
      originalAttributes.set(element, attributes);
    }
    if (!attributes.has('data-ui-tooltip')) attributes.set('data-ui-tooltip', tooltipText);
  }
  element.removeAttribute('title');
}

function quickTooltipText(element: HTMLElement): string {
  const raw = element.getAttribute('data-ui-tooltip') || element.getAttribute('title') || '';
  return raw.replace(/\s+/g, ' ').trim();
}

function scheduleQuickTooltip(target: HTMLElement, source: 'pointer' | 'focus'): void {
  clearQuickTooltipTimer();
  removeQuickTooltipNode();
  quickTooltipTarget = target;
  quickTooltipTimer = window.setTimeout(() => {
    const text = quickTooltipText(target);
    if (!text) return;
    renderQuickTooltip(target, text, source);
  }, QUICK_TOOLTIP_DELAY_MS);
}

function renderQuickTooltip(target: HTMLElement, text: string, source: 'pointer' | 'focus'): void {
  removeQuickTooltipNode();
  const tooltip = document.createElement('div');
  tooltip.className = 'quick-ui-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.textContent = currentLanguage === 'ru' ? translateToRussian(text) : text;
  document.body.append(tooltip);
  quickTooltipNode = tooltip;
  if (source === 'focus') {
    const rect = target.getBoundingClientRect();
    positionQuickTooltip(tooltip, { x: rect.left + rect.width / 2, y: rect.bottom });
  } else {
    positionQuickTooltip(tooltip, quickTooltipPointer);
  }
}

function positionQuickTooltip(tooltip: HTMLElement, point: { x: number; y: number }): void {
  const margin = 8;
  const offset = 12;
  const rect = tooltip.getBoundingClientRect();
  let left = point.x + offset;
  let top = point.y + offset;
  if (left + rect.width > window.innerWidth - margin) left = Math.max(margin, point.x - rect.width - offset);
  if (top + rect.height > window.innerHeight - margin) top = Math.max(margin, point.y - rect.height - offset);
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function clearQuickTooltipTimer(): void {
  if (quickTooltipTimer !== null) {
    window.clearTimeout(quickTooltipTimer);
    quickTooltipTimer = null;
  }
}

function removeQuickTooltipNode(): void {
  quickTooltipNode?.remove();
  quickTooltipNode = null;
}

function removeQuickTooltip(): void {
  clearQuickTooltipTimer();
  removeQuickTooltipNode();
  quickTooltipTarget = null;
}
