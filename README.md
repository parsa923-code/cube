# CubeTimer — Speedcubing Timer Platform

Two main parts:

## 1. Pro Timer (`index.html`)
- Events: 2×2, 3×3, 4×4, 5×5, 6×6, 7×7, Pyraminx, Skewb
- Puzzle-specific scramble generation + "Show more" for long scrambles
- Spacebar / touch timer with 15s inspection, 0.5s hold-to-ready, anti-accidental-start
- Full session system (create, rename, switch, delete)
- Saved to `localStorage` — persists after refresh
- Stats: Best / Worst / Mean / Ao5 / Ao12 / Ao25 / Ao50 / Ao100 + best averages
- Normal / +2 / DNF penalties
- JSON import/export for sessions, plus CSV export
- Dark / light theme
- Automatic personal-best detection with an in-app toast and highlighted row

## 2. Online Battle — CubeDuel (`duel/`)
Real-time multiplayer racing powered by Supabase Realtime:
- Create / join a room with a 6-character code (**up to 5 players**)
- Shared 3×3 and 2×2 scrambles
- Live timer, battle table, stats, room chat
- Online presence
- Note: The current room UI focuses on two main seats (P1/P2). Players 3–5 can join and submit solves; expand the table/columns later for full multi-view.

### Running it
The files are static. Serve them with any simple server:

```bash
cd cubetimer
python3 -m http.server 8080
```

Then open:
- Timer: http://localhost:8080/
- Duel: http://localhost:8080/duel/

For the online part, Anonymous Auth must be enabled on the Supabase project (as configured in the original project).

### Structure
```
artifacts/
  index.html          # timer
  css/timer.css
  js/                 # timer modules
  shared/
    utils.js          # helpers shared by Timer + Duel (fmtMs, toast, theme, csv export...)
  supabase-schema.sql  # RLS policies for the Supabase project (run once in SQL Editor)
  duel/
    index.html        # duel lobby
    room.html          # battle room
    demo.html          # offline practice mode, no Supabase required
    css/style.css
    js/               # CubeDuel core code
```

### به‌روزرسانی برای ۵ نفر (اصلاحات اخیر)
- جدول Battle Log و بخش آمار/چارت حالا برای هر ۵ بازیکن (P1–P5) نمایش داده می‌شود، نه فقط دو نفر.
- چت به بالای صفحه منتقل شد: زیر بخش اسکرمبل/تایمر (Display) و بالای جدول تایم‌های ۵ نفر.
- هر بازیکن یک رنگ ثابت دارد (بر اساس شماره صندلی ۱ تا ۵) که همان رنگ در چت، جدول، کارت‌های آمار و چارت Ao5 استفاده می‌شود.
- هیچ Interval/Polling جدیدی به سمت Supabase اضافه نشده؛ فقط از همان کانال‌های Realtime قبلی (postgres_changes + presence) استفاده می‌شود، پس مصرف پلن رایگان تغییری نمی‌کند.

---

## Bug fix pass (این نسخه)

تمام موارد فهرست‌شده در سند باگ رفع شدند. خلاصه مهم‌ترین‌ها:

**بحرانی**
- رنگ ثابت `#fff` تایمر در هر دو `css/timer.css` و `duel/css/style.css` به `var(--tx)` تغییر کرد → Light Mode دیگر تایمر را نامرئی نمی‌کند.
- هشدار بصری Inspection: از ثانیه ۱۵ تا ۱۷ رنگ اعداد قرمز می‌شود (`var(--bad)`) و بعد از پایان Solve به حالت عادی برمی‌گردد؛ در `js/cube-timer.js` و `duel/js/timer.js`.
- **Force Next Round** (فقط برای Host): در صورتی که بازیکنی Round را برای همیشه گیر بیندازد (Late Join / Disconnect / ترک بدون اطلاع)، Host می‌تواند دستی Round بعدی را بسازد. دکمه در Battle Log ظاهر می‌شود.
- **Re-solve this round**: اگر Scramble اشتباه خوانده شود یا Solve اشتباه ثبت شود، دکمه «Re-solve this round» کنار تایمر ظاهر می‌شود، Solve قبلی حذف و Round دوباره باز می‌شود.
- بررسی مرحله‌ای پیش از ورود به Battle: `Checking connection… → Checking authentication… → Checking database…` با پیام خطای مشخص برای هر مرحله (`duel/js/room.js`).
- **Demo Battle** (`duel/demo.html`): حالت کاملاً محلی و مستقل از Supabase برای تست/دمو بدون نیاز به اتصال یا حساب کاربری.
- `supabase-schema.sql` اضافه شد: RLS روی تمام جدول‌های حساس فعال و Policyها بر اساس `auth.uid()` محدود شدند (به‌جای `USING (true)` باز).
- Memory leak تایمر دمو در لابی Duel رفع شد: Interval حالا با `visibilitychange` / `pagehide` / `beforeunload` پاک می‌شود.

**مهم**
- `seatOf()` حالا در نبود بازیکن `null` برمی‌گرداند (نه `0`)، که باعث محاسبه اشتباه در جدول/آمار می‌شد.
- خطای `localStorage` (پر شدن حافظه) دیگر باعث Crash تایمر نمی‌شود؛ toast مناسب نمایش داده می‌شود.
- Light Mode حالا بین Timer و Duel هماهنگ است: متغیرهای تم مشترک، و هر دو صفحه دکمه Theme دارند که در `localStorage` ذخیره می‌شود (`shared/utils.js`).
- تشخیص PB دیگر به `indexOf` وابسته نیست (که بعد از حذف/تغییر ترتیب Solve اشتباه می‌شد).

**UX / جزئی**
- دکمه حذف پیام در چت روی موبایل/لمسی همیشه قابل مشاهده است (`@media (hover: none)`).
- سرعت Pulse وضعیت Online از ۲ ثانیه به ۴ ثانیه کاهش یافت.
- موقعیت و رنگ Toastها بین Timer و Duel یکسان شد (پایین-راست صفحه).

**کیفیت کد**
- توابع تکراری (`fmtMs`, `uuid`, `toast`, `copyText`, `downloadCSV`, ...) در `shared/utils.js` یکپارچه شدند و `js/util.js` و `duel/js/util.js` حذف شدند.
- Error Handling در بسیاری از `catch`ها حالا هم `console.error` با Context و هم toast دارد.
- `_isInteractiveTarget` در برابر Targetهای غیر-Element ایمن شد.
- BOM ابتدای CSV برای سازگاری با Excel قدیمی حفظ شد (در `shared/utils.js`).

> نکته درباره RLS: چون این یک پروژه Frontend است و به دیتابیس واقعی دسترسی نداریم، `supabase-schema.sql` را باید یک‌بار در SQL Editor پروژه Supabase خودتان اجرا کنید تا Policyها واقعاً اعمال شوند.
